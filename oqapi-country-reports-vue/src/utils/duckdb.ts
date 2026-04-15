import * as duckdb from "@duckdb/duckdb-wasm";
import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

let dbInstance: AsyncDuckDB | null = null;
let dbConnection: AsyncDuckDBConnection | null = null;

export async function initDuckDB(): Promise<{ db: AsyncDuckDB; conn: AsyncDuckDBConnection }> {
  if (dbInstance && dbConnection) {
    return { db: dbInstance, conn: dbConnection };
  }

  const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
  const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

  const worker_url = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" })
  );

  const worker = new Worker(worker_url);
  const silentLogger = { log: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  dbInstance = new duckdb.AsyncDuckDB(silentLogger, worker);
  await dbInstance.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(worker_url);

  dbConnection = await dbInstance.connect();

  return { db: dbInstance, conn: dbConnection };
}

let fileCounter = 0;

export async function registerParquetFile(parquetUrl: string, db: AsyncDuckDB): Promise<string> {
  const resp = await fetch(parquetUrl);
  const parquetData = await resp.arrayBuffer();
  
  fileCounter++;
  const fileName = `data_${fileCounter}.parquet`;
  await db.registerFileBuffer(fileName, new Uint8Array(parquetData));
  
  return fileName;
}

export async function queryParquet(query: string, _db: AsyncDuckDB, conn: AsyncDuckDBConnection, tableName: string = 'data.parquet') {
  const result = await conn.query(query.replace('data.parquet', tableName));
  return result;
}
