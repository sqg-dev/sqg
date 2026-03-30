// Shared types between frontend and server

// Re-export parser functions
export { extractCTEs, detectDependencies, debugTree } from './parser/cte-extractor';

// SQG Project types
export interface SqgProject {
  name: string;
  version: number;
  sqlFiles: string[];
  queries: SqgQuery[];
  migrations: SqgMigration[];
  testdata: string[];
  tables: SqgTable[];
  engine?: string;
  initError?: string;
}

export interface SqgQuery {
  id: string;
  type: 'QUERY' | 'EXEC';
  sql: string;
  rawSql: string;
  modifiers: { one: boolean; pluck: boolean };
  variables: Record<string, string>;
  file: string;
  line: number;
}

export interface SqgMigration {
  id: string;
  order: number;
  sql: string;
  file: string;
  line: number;
}

export interface SqgTable {
  id: string;
  tableName: string;
  hasAppender: boolean;
  file: string;
  line: number;
}

export interface Column {
  name: string;
  type: string;
}

export interface QueryResult {
  columns: Column[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  truncated?: boolean;
  maxRows?: number;
}

export interface CTE {
  name: string;
  body: string;
  start: number;
  end: number;
}

export interface ParsedQuery {
  recursive: boolean;
  ctes: CTE[];
  mainQuery: string;
  mainQueryStart: number;
}

export interface CTEDependency {
  name: string;
  dependsOn: string[];
}

export interface CTEPreview {
  columns: Column[];
  rows: Record<string, unknown>[];
}

export interface CTENode {
  id: string;
  name: string;
  rowCount?: number;
  error?: string;
  status: 'pending' | 'running' | 'success' | 'error';
  preview?: CTEPreview;
}

export interface ExecuteCTEInput {
  /** The full original SQL (needed for context) */
  fullSql: string;
  /** Name of the CTE to execute */
  cteName: string;
}

export interface TableInfo {
  name: string;
  columns: Column[];
}
