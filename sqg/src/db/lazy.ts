import type { DatabaseEngine } from "./types.js";

/**
 * Load a database engine on demand.
 *
 * The drivers (duckdb, pg + testcontainers, better-sqlite3) dominate startup —
 * importing all three costs more than everything else the CLI does before it
 * reaches a database. Loading only the engine a project actually uses keeps a
 * `--if-stale` run that generates nothing down to a few tens of milliseconds.
 */
export async function loadDatabaseEngine(engine: string): Promise<DatabaseEngine> {
  const loaded = await importEngine(engine);
  loadedEngines.add(loaded);
  return loaded;
}

const loadedEngines = new Set<DatabaseEngine>();

async function importEngine(engine: string): Promise<DatabaseEngine> {
  switch (engine) {
    case "sqlite":
      return (await import("./sqlite.js")).sqlite;
    case "duckdb":
      return (await import("./duckdb.js")).duckdb;
    case "postgres":
      return (await import("./postgres.js")).postgres;
    default:
      throw new Error(`Unsupported database engine: ${engine}`);
  }
}

/** Shut down every engine loaded so far (stops the shared postgres container). */
export async function shutdownDatabaseEngines(): Promise<void> {
  for (const engine of loadedEngines) {
    await engine.shutdown?.();
  }
}
