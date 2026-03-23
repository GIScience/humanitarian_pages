import * as duckdb from "@duckdb/duckdb-wasm";

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

export async function initDuckDB() {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
    const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);
    
    const worker_url = URL.createObjectURL(
      new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" })
    );
    
    const worker = new Worker(worker_url);
    const silentLogger = { log: () => {}, info: () => {}, warn: () => {}, error: () => {} };
    
    const db = new duckdb.AsyncDuckDB(silentLogger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    URL.revokeObjectURL(worker_url);
    
    return db;
  })();

  return dbPromise;
}

export async function loadParquetData(parquetUrl: string) {
  try {
    const database = await initDuckDB();
    const conn = await database.connect();
    
    const resp = await fetch(parquetUrl);
    if (!resp.ok) throw new Error(`Failed to fetch parquet: ${resp.statusText}`);
    
    const parquetData = await resp.arrayBuffer();
    const fileName = `data_${Date.now()}.parquet`;
    await database.registerFileBuffer(fileName, new Uint8Array(parquetData));
    
    // Use read_parquet with the registered file
    const result = await conn.query(`SELECT * FROM read_parquet('${fileName}')`);
    await conn.close();
    return result.toArray();
  } catch (err) {
    console.error("DuckDB load error:", err);
    throw err;
  }
}

