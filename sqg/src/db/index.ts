import { duckdb } from "./duckdb.js";
import { postgres } from "./postgres.js";
import { sqlite } from "./sqlite.js";
import type { DatabaseEngine } from "./types.js";

export { duckdb } from "./duckdb.js";
export { postgres } from "./postgres.js";
export { sqlite } from "./sqlite.js";
export { type DatabaseEngine, initializeDatabase } from "./types.js";

export function getDatabaseEngine(engine: string): DatabaseEngine {
  switch (engine) {
    case "sqlite":
      return sqlite;
    case "duckdb":
      return duckdb;
    case "postgres":
      return postgres;
    default:
      throw new Error(`Unsupported database engine: ${engine}`);
  }
}
