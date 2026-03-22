import Database from 'better-sqlite3';
import type { QueryResult, Column, DatabaseAdapter, CTEPreviewResult, SchemaTable } from './types';
import { executeCTEHelper, previewAllCTEsHelper } from './cte-helpers';

const MAX_ROWS = 1000;

export function createSQLiteAdapter(): DatabaseAdapter {
  let db: Database.Database | null = null;

  function getDb(): Database.Database {
    if (!db) {
      db = new Database(':memory:');
    }
    return db;
  }

  const adapter: DatabaseAdapter = {
    async executeSQL(sql: string, applyLimit = true): Promise<QueryResult> {
      const database = getDb();
      const startTime = performance.now();

      const trimmedSql = sql.trim().replace(/;$/, '');

      // Check if this is a statement that returns rows
      const isSelect = /^\s*(SELECT|WITH|VALUES|PRAGMA)/i.test(trimmedSql);

      if (!isSelect) {
        database.exec(trimmedSql);
        return {
          columns: [],
          rows: [],
          rowCount: 0,
          executionTimeMs: Math.round(performance.now() - startTime),
        };
      }

      const limitedSql = applyLimit
        ? `SELECT * FROM (${trimmedSql}) AS _limited_query LIMIT ${MAX_ROWS}`
        : trimmedSql;

      const stmt = database.prepare(limitedSql);
      const rawRows = stmt.all() as Record<string, unknown>[];

      const columns: Column[] = rawRows.length > 0
        ? Object.keys(rawRows[0]).map((name) => ({
            name,
            type: typeof rawRows[0][name] === 'number' ? 'NUMBER'
              : typeof rawRows[0][name] === 'string' ? 'TEXT'
              : rawRows[0][name] === null ? 'NULL'
              : 'BLOB',
          }))
        : stmt.columns().map((col) => ({ name: col.name, type: col.type || 'unknown' }));

      return {
        columns,
        rows: rawRows,
        rowCount: rawRows.length,
        executionTimeMs: Math.round(performance.now() - startTime),
        truncated: applyLimit && rawRows.length >= MAX_ROWS,
        maxRows: applyLimit ? MAX_ROWS : undefined,
      };
    },

    async executeCTE(fullSql: string, cteName: string): Promise<QueryResult> {
      return executeCTEHelper(adapter, fullSql, cteName);
    },

    async previewAllCTEs(fullSql: string): Promise<Record<string, CTEPreviewResult>> {
      return previewAllCTEsHelper(adapter, fullSql);
    },

    async getSchema(): Promise<SchemaTable[]> {
      const database = getDb();
      const tableRows = database.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      ).all() as Array<{ name: string }>;

      const tables: SchemaTable[] = [];
      for (const { name } of tableRows) {
        const columns = database.prepare(`PRAGMA table_info('${name}')`).all() as Array<{
          name: string; type: string; notnull: number;
        }>;
        tables.push({
          name,
          columns: columns.map((c) => ({
            name: c.name,
            type: c.type || 'TEXT',
            nullable: c.notnull === 0,
          })),
        });
      }
      return tables;
    },

    async close(): Promise<void> {
      if (db) {
        db.close();
        db = null;
      }
    },
  };

  return adapter;
}
