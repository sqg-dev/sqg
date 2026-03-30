import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import type { QueryResult, Column, DatabaseAdapter, CTEPreviewResult, SchemaTable } from './types';
import { executeCTEHelper, previewAllCTEsHelper, stripAnnotations } from './cte-helpers';

const MAX_ROWS = 1000;

/**
 * Convert DuckDB values to JSON-serializable format.
 * Handles BigInt, Date, Buffer, and complex types like STRUCT, LIST, MAP.
 */
function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') {
    return (value >= Number.MIN_SAFE_INTEGER && value <= Number.MAX_SAFE_INTEGER)
      ? Number(value) : value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array || Buffer.isBuffer(value)) return `<binary ${value.length} bytes>`;
  if (Array.isArray(value)) return value.map(serializeValue);
  if (typeof value === 'object') {
    if (value instanceof Map) {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of value) obj[String(k)] = serializeValue(v);
      return obj;
    }
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) result[k] = serializeValue(v);
    return result;
  }
  return value;
}

export function createDuckDBAdapter(): DatabaseAdapter {
  let instance: DuckDBInstance | null = null;
  let connection: DuckDBConnection | null = null;

  async function getConnection(): Promise<DuckDBConnection> {
    if (!connection) {
      instance = await DuckDBInstance.create(':memory:');
      connection = await instance.connect();
    }
    return connection;
  }

  const adapter: DatabaseAdapter = {
    async executeSQL(sql: string, applyLimit = true): Promise<QueryResult> {
      const conn = await getConnection();
      const startTime = performance.now();

      const trimmedSql = sql.trim().replace(/;$/, '');
      const isSelect = /^\s*(SELECT|WITH|VALUES|PRAGMA|DESCRIBE|SHOW)/i.test(trimmedSql);
      const limitedSql = (applyLimit && isSelect)
        ? `SELECT * FROM (${trimmedSql}) AS _limited_query LIMIT ${MAX_ROWS}`
        : sql;

      if (!isSelect && applyLimit) {
        // Non-SELECT: just execute, don't try to read results
        await Promise.race([
          conn.run(limitedSql),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Query timed out after 30 seconds')), 30_000)
          ),
        ]);
        return {
          columns: [],
          rows: [],
          rowCount: 0,
          executionTimeMs: Math.round(performance.now() - startTime),
        };
      }

      const result = await Promise.race([
        conn.runAndReadAll(limitedSql),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Query timed out after 30 seconds')), 30_000)
        ),
      ]);
      const columnNames = result.columnNames();
      const columnTypes = result.columnTypes();

      const columns: Column[] = columnNames.map((name: string, i: number) => ({
        name,
        type: columnTypes[i]?.toString() || 'unknown',
      }));

      const rawRows = result.getRows();
      const rows: Record<string, unknown>[] = rawRows.map((row) => {
        const obj: Record<string, unknown> = {};
        for (let j = 0; j < columns.length; j++) {
          obj[columns[j].name] = serializeValue(row[j]);
        }
        return obj;
      });

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

    async executeSQLReadOnly(sql: string, applyLimit = true): Promise<QueryResult> {
      const cleanSql = stripAnnotations(sql);
      const conn = await getConnection();
      await conn.run('BEGIN TRANSACTION');
      try {
        const result = await adapter.executeSQL(cleanSql, applyLimit);
        return result;
      } finally {
        await conn.run('ROLLBACK');
      }
    },

    async initialize(migrations: string[], testdata: string[]): Promise<{ migrationsRun: number; testdataRun: number }> {
      let migrationsRun = 0;
      let testdataRun = 0;
      for (const sql of migrations) {
        const cleanSql = stripAnnotations(sql);
        if (cleanSql) await adapter.executeSQL(cleanSql, false);
        migrationsRun++;
      }
      for (const sql of testdata) {
        const cleanSql = stripAnnotations(sql);
        if (cleanSql) await adapter.executeSQL(cleanSql, false);
        testdataRun++;
      }
      return { migrationsRun, testdataRun };
    },

    async getSchema(): Promise<SchemaTable[]> {
      const result = await adapter.executeSQL(
        `SELECT table_name, column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'main'
         ORDER BY table_name, ordinal_position`,
        false
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
      if (connection) {
        connection.closeSync();
        connection = null;
      }
      instance = null;
    },
  };

  return adapter;
}
