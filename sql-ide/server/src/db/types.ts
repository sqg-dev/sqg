import type { QueryResult, Column } from '@sql-ide/shared';

export { type QueryResult, type Column };

export interface CTEPreviewResult {
  columns: Column[];
  rows: Record<string, unknown>[];
  rowCount: number;
}

export interface SchemaTable {
  name: string;
  columns: Array<{ name: string; type: string; nullable: boolean }>;
}

/**
 * Database adapter interface for the SQL IDE.
 * Each engine (DuckDB, SQLite, PostgreSQL) implements this interface.
 */
export interface DatabaseAdapter {
  /** Execute a SQL query and return results (with optional row limit) */
  executeSQL(sql: string, applyLimit?: boolean): Promise<QueryResult>;

  /** Execute a specific CTE from a query */
  executeCTE(fullSql: string, cteName: string): Promise<QueryResult>;

  /** Preview all CTEs in a query (first few rows + full count) */
  previewAllCTEs(fullSql: string): Promise<Record<string, CTEPreviewResult>>;

  /** Introspect database schema — list all tables and their columns */
  getSchema(): Promise<SchemaTable[]>;

  /** Close the database connection */
  close(): Promise<void>;
}
