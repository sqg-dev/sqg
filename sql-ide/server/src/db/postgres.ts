import pg from 'pg';
import type { QueryResult, Column, DatabaseAdapter, CTEPreviewResult, SchemaTable } from './types';
import { executeCTEHelper, previewAllCTEsHelper } from './cte-helpers';

const MAX_ROWS = 1000;

export function createPostgresAdapter(connectionString: string): DatabaseAdapter {
  let pool: pg.Pool | null = null;

  function getPool(): pg.Pool {
    if (!pool) {
      pool = new pg.Pool({ connectionString });
    }
    return pool;
  }

  const adapter: DatabaseAdapter = {
    async executeSQL(sql: string, applyLimit = true): Promise<QueryResult> {
      const p = getPool();
      const startTime = performance.now();

      const trimmedSql = sql.trim().replace(/;$/, '');
      const isSelect = /^\s*(SELECT|WITH|VALUES)/i.test(trimmedSql);

      if (!isSelect) {
        await p.query(trimmedSql);
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

      const result = await p.query(limitedSql);

      const columns: Column[] = result.fields.map((f) => ({
        name: f.name,
        type: pgTypeToString(f.dataTypeID),
      }));

      const rows = result.rows as Record<string, unknown>[];

      return {
        columns,
        rows,
        rowCount: rows.length,
        executionTimeMs: Math.round(performance.now() - startTime),
        truncated: applyLimit && rows.length >= MAX_ROWS,
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
      const p = getPool();
      const result = await p.query(
        `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public'
         ORDER BY table_name, ordinal_position`
      );

      const tables = new Map<string, SchemaTable>();
      for (const row of result.rows) {
        const tableName = row.table_name as string;
        if (!tables.has(tableName)) {
          tables.set(tableName, { name: tableName, columns: [] });
        }
        tables.get(tableName)!.columns.push({
          name: row.column_name as string,
          type: row.data_type as string,
          nullable: row.is_nullable === 'YES',
        });
      }
      return Array.from(tables.values());
    },

    async close(): Promise<void> {
      if (pool) {
        await pool.end();
        pool = null;
      }
    },
  };

  return adapter;
}

/** Map common PostgreSQL OID type IDs to human-readable names */
function pgTypeToString(oid: number): string {
  const types: Record<number, string> = {
    16: 'BOOLEAN', 20: 'BIGINT', 21: 'SMALLINT', 23: 'INTEGER',
    25: 'TEXT', 700: 'REAL', 701: 'DOUBLE PRECISION', 1043: 'VARCHAR',
    1082: 'DATE', 1114: 'TIMESTAMP', 1184: 'TIMESTAMPTZ', 1700: 'NUMERIC',
    2950: 'UUID', 3802: 'JSONB', 114: 'JSON',
  };
  return types[oid] || `OID(${oid})`;
}
