import type { DatabaseAdapter } from './types';
import { createDuckDBAdapter } from './duckdb';
import { createSQLiteAdapter } from './sqlite';
import { createPostgresAdapter } from './postgres';

export type { DatabaseAdapter, QueryResult, CTEPreviewResult, Column, SchemaTable } from './types';

let currentAdapter: DatabaseAdapter | null = null;
let currentEngine: string | null = null;

/**
 * Get or create a database adapter for the given engine.
 * Closes the previous adapter if switching engines.
 */
export async function getAdapter(engine = 'duckdb'): Promise<DatabaseAdapter> {
  if (currentAdapter && currentEngine === engine) {
    return currentAdapter;
  }

  // Close previous adapter if switching
  if (currentAdapter) {
    await currentAdapter.close();
    currentAdapter = null;
    currentEngine = null;
  }

  switch (engine) {
    case 'duckdb':
      currentAdapter = createDuckDBAdapter();
      break;
    case 'sqlite':
      currentAdapter = createSQLiteAdapter();
      break;
    case 'postgres': {
      const url = process.env.SQG_POSTGRES_URL || 'postgresql://localhost:5432/sqg';
      currentAdapter = createPostgresAdapter(url);
      break;
    }
    default:
      throw new Error(`Unsupported database engine: ${engine}`);
  }

  currentEngine = engine;
  return currentAdapter;
}

/**
 * Close the current adapter and reset. Call when switching projects.
 */
export async function resetAdapter(): Promise<void> {
  if (currentAdapter) {
    await currentAdapter.close();
    currentAdapter = null;
    currentEngine = null;
  }
}

/**
 * Get the current engine name.
 */
export function getCurrentEngine(): string {
  return currentEngine || 'duckdb';
}
