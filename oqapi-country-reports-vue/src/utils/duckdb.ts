import * as duckdb from "@duckdb/duckdb-wasm";
import type { AsyncDuckDB, AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";

let dbInstance: AsyncDuckDB | null = null;
let dbConnection: AsyncDuckDBConnection | null = null;
let initPromise: Promise<{ db: AsyncDuckDB; conn: AsyncDuckDBConnection }> | null = null;

export async function initDuckDB(): Promise<{ db: AsyncDuckDB; conn: AsyncDuckDBConnection }> {
  if (dbInstance && dbConnection) {
    return { db: dbInstance, conn: dbConnection };
  }

  if (initPromise) {
    return initPromise;
  }

  initPromise = initDuckDBInternal();

  try {
    const result = await initPromise;
    return result;
  } catch (e) {
    initPromise = null;
    dbInstance = null;
    dbConnection = null;
    throw e;
  }
}

async function initDuckDBInternal(): Promise<{ db: AsyncDuckDB; conn: AsyncDuckDBConnection }> {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let worker: Worker | null = null;
    let workerUrl: string | null = null;

    try {
      const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();
      const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

      workerUrl = URL.createObjectURL(
        new Blob([`importScripts("${bundle.mainWorker}");`], { type: "text/javascript" })
      );

      worker = new Worker(workerUrl);
      const logger = new duckdb.ConsoleLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

      const conn = await db.connect();

      dbInstance = db;
      dbConnection = conn;

      return { db, conn };
    } catch (e) {
      console.warn(`DuckDB init attempt ${attempt + 1}/${MAX_RETRIES} failed:`, e);
      worker?.terminate();
      if (workerUrl) URL.revokeObjectURL(workerUrl);

      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }

  throw new Error("DuckDB initialization failed after multiple retries");
}

// DuckDB-WASM's worker does not tolerate overlapping operations dispatched
// concurrently against it - confirmed concurrent conn.query() calls on the
// one shared connection corrupt each other ("No magic bytes found" on a file
// that was actually fine). Funnel every operation through one at-a-time
// queue rather than try to reason about which specific ops are safe to
// overlap.
let operationQueue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(fn);
  // Swallow so one failed operation doesn't permanently wedge the queue.
  operationQueue = result.then(() => undefined, () => undefined);
  return result;
}

export function runQuery(conn: AsyncDuckDBConnection, sql: string) {
  return enqueue(() => conn.query(sql));
}

let fileCounter = 0;
const parquetFileCache = new Map<string, string>();
// Concurrent callers for the same URL (e.g. the 3 maps' lookups + the
// descriptions call, all hitting the same layer's parquet at once) must
// share one in-flight fetch+register, not race independently - two
// concurrent registrations under different generated file names both
// reading the same underlying bytes corrupt DuckDB-WASM's view of one of
// them ("No magic bytes found").
const pendingRegistrations = new Map<string, Promise<string>>();

export async function registerParquetFile(parquetUrl: string, db: AsyncDuckDB): Promise<string> {
  const cached = parquetFileCache.get(parquetUrl);
  if (cached) return cached;

  const pending = pendingRegistrations.get(parquetUrl);
  if (pending) return pending;

  const registration = (async () => {
    const resp = await fetch(parquetUrl);
    if (!resp.ok) {
      // Otherwise a missing/broken file's error-page body gets registered
      // as if it were parquet data, and - since that "succeeds" here - the
      // corrupted registration is cached under this URL for the rest of the
      // session, so every future query against it fails too ("No magic
      // bytes found") instead of this one call failing cleanly.
      throw new Error(`Failed to fetch parquet file (${resp.status}): ${parquetUrl}`);
    }
    const parquetData = await resp.arrayBuffer();

    fileCounter++;
    const fileName = `data_${fileCounter}.parquet`;
    await enqueue(() => db.registerFileBuffer(fileName, new Uint8Array(parquetData)));

    parquetFileCache.set(parquetUrl, fileName);
    return fileName;
  })();

  pendingRegistrations.set(parquetUrl, registration);
  try {
    return await registration;
  } finally {
    pendingRegistrations.delete(parquetUrl);
  }
}

export function clearParquetCache() {
  parquetFileCache.clear();
}


