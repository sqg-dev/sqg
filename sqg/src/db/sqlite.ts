import BetterSqlite3, { type Database } from "better-sqlite3";
import consola from "consola";
import { isNotNil } from "es-toolkit";
import { DatabaseError, SqlExecutionError, SqgError } from "../errors.js";
import type { SQLQuery, TableInfo } from "../sql-query.js";
import { type DatabaseEngine, initializeDatabase } from "./types.js";

export const sqlite = new (class implements DatabaseEngine {
  db!: Database;

  async initializeDatabase(queries: SQLQuery[]) {
    const db = new BetterSqlite3(":memory:");

    await initializeDatabase(queries, (query) => {
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
    });

    this.db = db;
  }

  executeQueries(queries: SQLQuery[]) {
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
        consola.info(`Executing query: ${query.id}`);
        //consola.info("Variables:", Object.fromEntries(query.variables));

        this.executeQuery(db, query);

        if (query.isQuery) {
          //consola.info("Query results:", result);
        }
        consola.success(`Query ${query.id} executed successfully`);
      }
    } catch (error) {
      consola.error("Error executing queries:", (error as Error).message);
      throw error;
    }
  }

  introspectTables(tables: TableInfo[]) {
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
      consola.info(`Introspecting table schema: ${table.tableName}`);
      const info = this.getTableInfo(db, table.tableName);
      table.columns = Array.from(info.values()).map((col) => ({
        name: col.name,
        type: col.type || "TEXT",
        nullable: col.notnull === 0 && col.pk === 0,
      }));
      consola.success(`Introspected table: ${table.tableName} (${table.columns.length} columns)`);
    }
  }

  close() {
    this.db.close();
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
      //consola.info("Parameters:", query.parameters);
      //consola.info("Parameter names:", query.parameterNames);

      const stmt = db.prepare(statement.sql);

      // Get column information for queries
      if (query.isQuery) {
        const info = stmt.columns();

        const tables = new Set(info.map((col) => col.table).filter(isNotNil));

        const data = new Map(
          Array.from(tables).map((table) => [table, this.getTableInfo(db, table)]),
        );

        query.columns = info.map((col) => {
          const colInfo = col.table ? data.get(col.table)?.get(col.name) : null;
          return {
            name: col.name,
            type: col.type || "unknown",
            // make primary key always non nullable (even though in SQlite it can be nullable)
            nullable: colInfo?.pk === 0 && colInfo?.notnull === 0,
          };
        });
      }

      if (query.isQuery) {
        if (query.isOne) {
          return stmt.get(...statement.parameters.map((p) => p.value));
        }
        return stmt.all(...statement.parameters.map((p) => p.value));
      }
      return stmt.run(...statement.parameters.map((p) => p.value));
    } catch (error) {
      consola.error(
        `Failed to execute query '${query.id}' in ${query.filename}:\n ${statement.sql} \n ${statement.parameters.map((p) => p.value).join(", ")}`,
        error,
      );
      throw error;
    }
  }
})();
