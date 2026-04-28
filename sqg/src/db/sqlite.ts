import BetterSqlite3, { type Database } from "better-sqlite3";
import consola from "consola";
import { isNotNil } from "es-toolkit";
import { DatabaseError, SqlExecutionError } from "../errors.js";
import type { SQLQuery, TableInfo } from "../sql-query.js";
import type { ProgressReporter } from "../ui.js";
import { type DatabaseEngine, initializeDatabase } from "./types.js";

export const sqlite = new (class implements DatabaseEngine {
  db!: Database;

  async initializeDatabase(queries: SQLQuery[], reporter?: ProgressReporter) {
    const db = new BetterSqlite3(":memory:");

    await initializeDatabase(
      queries,
      (query) => {
        try {
          db.exec(query.rawQuery);
        } catch (e) {
          throw new SqlExecutionError(
            (e as Error).message,
            query.id,
            query.filename,
            query.rawQuery,
            e as Error,
          );
        }
        return Promise.resolve();
      },
      reporter,
    );

    this.db = db;
  }

  executeQueries(queries: SQLQuery[], reporter?: ProgressReporter) {
    const db = this.db;
    if (!db) {
      throw new DatabaseError(
        "SQLite database not initialized",
        "sqlite",
        "This is an internal error. Migrations may have failed silently.",
      );
    }
    try {
      // Skip the setup query as it's already executed
      const executableQueries = queries.filter((q) => !q.skipGenerateFunction);

      for (const query of executableQueries) {
        reporter?.onQueryStart?.(query.id);

        this.executeQuery(db, query);

        reporter?.onQueryComplete?.(query.id);
      }
    } catch (error) {
      consola.error("Error executing queries:", (error as Error).message);
      throw error;
    }
  }

  introspectTables(tables: TableInfo[], reporter?: ProgressReporter) {
    // SQLite doesn't have an appender API, so we just introspect for documentation
    const db = this.db;
    if (!db) {
      throw new DatabaseError(
        "SQLite database not initialized",
        "sqlite",
        "This is an internal error. Migrations may have failed silently.",
      );
    }

    for (const table of tables) {
      reporter?.onTableStart?.(table.tableName);
      const info = this.getTableInfo(db, table.tableName);
      table.columns = Array.from(info.values()).map((col) => ({
        name: col.name,
        type: col.type || "TEXT",
        nullable: col.notnull === 0 && col.pk === 0,
      }));
      reporter?.onTableComplete?.(table.tableName, table.columns.length);
    }
  }

  close() {
    this.db.close();
  }

  /**
   * For columns where SQLite's columns() returned no type (any expression),
   * probe the storage class via typeof() against a single row of the query.
   * Returns the SQL type and observed nullability per column (in the same
   * order as `info`). When the type cannot be inferred (no rows, or the
   * sampled value was NULL), `type` is "" and the caller should fall back
   * to "unknown" + nullable.
   */
  private probeExpressionTypes(
    db: Database,
    sql: string,
    params: unknown[],
    info: { name: string; type: string | null }[],
  ): { type: string; nullable: boolean }[] {
    const result = info.map(() => ({ type: "", nullable: true }));
    if (!info.some((c) => !c.type)) return result;

    // SQLite typeof() values: 'integer', 'real', 'text', 'blob', 'null'.
    const typeofMap: Record<string, string> = {
      integer: "INTEGER",
      real: "REAL",
      text: "TEXT",
      blob: "BLOB",
    };

    // Wrap the original query in a subquery and ask for the storage class of
    // each output column by ordinal. Aliasing to sqg_c<i> first sidesteps
    // having to escape arbitrary expression-derived column names like
    // `EXISTS(...)` or `COUNT(*)`.
    const aliased = info
      .map((c, i) => `"${c.name.replace(/"/g, '""')}" AS sqg_c${i}`)
      .join(", ");
    const typeofExprs = info.map((_, i) => `typeof(sqg_c${i}) AS sqg_t${i}`).join(", ");
    // Strip trailing semicolon(s)/whitespace — they're not allowed inside a
    // subquery and would make the probe fail silently.
    const inner = sql.replace(/[\s;]+$/, "");
    const probeSql = `SELECT ${typeofExprs} FROM (SELECT ${aliased} FROM (${inner})) LIMIT 1`;

    try {
      const row = db.prepare(probeSql).get(...params) as Record<string, string> | undefined;
      if (!row) return result;
      for (let i = 0; i < info.length; i++) {
        const t = row[`sqg_t${i}`];
        if (!t) continue;
        if (t === "null") {
          // Sampled value is NULL — keep nullable, leave type unknown.
          continue;
        }
        if (typeofMap[t]) {
          result[i] = { type: typeofMap[t], nullable: false };
        }
      }
    } catch (e) {
      consola.debug(`typeof() probe failed; falling back to 'unknown': ${(e as Error).message}`);
    }
    return result;
  }

  private getTableInfo(db: Database, table: string) {
    const info = db.pragma(`table_info('${table}')`) as {
      cid: number;
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }[];
    return new Map(info.map((col) => [col.name, col]));
  }

  // Execute a query with parameters
  private executeQuery(db: Database, query: SQLQuery) {
    const statement = query.queryAnonymous;
    try {
      consola.debug("Query:", statement.sql);

      const stmt = db.prepare(statement.sql);
      const params = statement.parameters.map((p) => p.value);

      // Get column information for queries
      if (query.isQuery) {
        const info = stmt.columns();

        const tables = new Set(info.map((col) => col.table).filter(isNotNil));

        const data = new Map(
          Array.from(tables).map((table) => [table, this.getTableInfo(db, table)]),
        );

        // SQLite's columns() returns type=null for any expression (EXISTS(),
        // COUNT(*), CAST, literals, arithmetic). For those, fall back to
        // probing storage class with the typeof() SQL function so we don't
        // emit `unknown` when a clear answer is available.
        const probedTypes = this.probeExpressionTypes(db, statement.sql, params, info);

        query.columns = info.map((col, i) => {
          const colInfo = col.table ? data.get(col.table)?.get(col.name) : null;
          const probed = probedTypes[i];
          return {
            name: col.name,
            type: col.type || probed.type || "unknown",
            // For real table columns, use schema info (PK is treated as non-null
            // even though SQLite technically allows it). For expression columns,
            // use the probe's observation: a non-null sample means non-null
            // (e.g. COUNT/EXISTS), a null sample or no rows means nullable.
            nullable: col.table
              ? colInfo?.pk === 0 && colInfo?.notnull === 0
              : probed.nullable,
          };
        });
      }

      if (query.isQuery) {
        if (query.isOne) {
          return stmt.get(...params);
        }
        return stmt.all(...params);
      }
      return stmt.run(...params);
    } catch (error) {
      consola.error(
        `Failed to execute query '${query.id}' in ${query.filename}:\n ${statement.sql} \n ${statement.parameters.map((p) => p.value).join(", ")}`,
        error,
      );
      throw error;
    }
  }
})();
