import {
  type DuckDBConnection,
  DuckDBInstance,
  DuckDBListType,
  DuckDBMapType,
  DuckDBStructType,
  type DuckDBType,
} from "@duckdb/node-api";
import BetterSqlite3, { type Database } from "better-sqlite3";
import consola from "consola";
import { isNotNil, sortBy } from "es-toolkit";
import { postgres } from "./db/postgres";
import type { SQLQuery } from "./sql-query.js";
import { ColumnMapType, type ColumnType, ColumnTypeList, ColumnTypeStruct } from "./sql-query.js";

export interface DatabaseEngine {
  executeQueries(queries: SQLQuery[]): Promise<void> | void;
  initializeDatabase(queries: SQLQuery[]): Promise<void> | void;

  close(): Promise<void> | void;
}

export async function initializeDatabase(
  queries: SQLQuery[],
  execQueries: (query: SQLQuery) => Promise<void>,
) {
  // Find and run the setup query
  const migrationQueries = queries.filter((q) => q.isMigrate);

  sortBy(migrationQueries, [(q) => Number(q.id.split("_")[1])]);
  for (const query of migrationQueries) {
    try {
      await execQueries(query);
    } catch (error) {
      consola.error(
        "Failed to initialize database:" +
          (error as Error).message +
          " when running query:\n\n " +
          query.rawQuery,
      );
      throw error;
    }
  }

  const testdataQueries = queries.filter((q) => q.isTestdata);

  for (const query of testdataQueries) {
    try {
      await execQueries(query);
    } catch (error) {
      consola.error(
        "Failed to initialize testdata:" +
          (error as Error).message +
          " when running query:\n\n " +
          query.rawQuery,
      );
      throw error;
    }
  }

  if (migrationQueries.length + testdataQueries.length === 0) {
    consola.warn("No migration or testdata queries found");
  }

  consola.success("Database initialized successfully");
}

const sqlite = new (class implements DatabaseEngine {
  db!: Database;

  async initializeDatabase(queries: SQLQuery[]) {
    const db = new BetterSqlite3(":memory:");

    await initializeDatabase(queries, (query) => {
      db.exec(query.rawQuery);
      return Promise.resolve();
    });

    this.db = db;
  }

  executeQueries(queries: SQLQuery[]) {
    const db = this.db;
    if (!db) {
      throw new Error("Database not initialized");
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
      consola.info("Query:", statement.sql);
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

const duckdb = new (class implements DatabaseEngine {
  db!: DuckDBInstance;
  connection!: DuckDBConnection;

  async initializeDatabase(queries: SQLQuery[]) {
    this.db = await DuckDBInstance.create(":memory:");
    this.connection = await this.db.connect();

    await initializeDatabase(queries, (query) => {
      this.connection.run(query.rawQuery);
      return Promise.resolve();
    });
  }

  async executeQueries(queries: SQLQuery[]) {
    const connection = this.connection;
    if (!connection) {
      throw new Error("Database not initialized");
    }
    try {
      // Skip the setup query as it's already executed
      const executableQueries = queries.filter((q) => !q.skipGenerateFunction);

      for (const query of executableQueries) {
        consola.info(`Executing query: ${query.id}`);
        //consola.info("Variables:", Object.fromEntries(query.variables));

        await this.executeQuery(connection, query);

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

  // Execute a query with parameters
  private async executeQuery(connection: DuckDBConnection, query: SQLQuery) {
    const statement = query.queryAnonymous;
    try {
      consola.info("Query:", statement.sql, statement.sqlParts);
      //consola.info("Parameters:", query.parameters);
      //consola.info("Parameter names:", query.parameterNames);

      const sql = statement.sqlParts
        .map((part) => {
          if (typeof part === "string") {
            return part;
          }
          return ` ${part.value} `;
        })
        .join("");

      const stmt = await connection.prepare(sql);
      for (let i = 0; i < stmt.parameterCount; i++) {
        stmt.bindValue(i + 1, statement.parameters[i].value);
      }

      // Get column information for queries
      if (query.isQuery) {
        const result = await stmt.stream();
        const columnNames = result.columnNames();
        const columnTypes = result.columnTypes();
        consola.info("Columns:", columnNames);
        consola.info(
          "Types:",
          columnTypes.map((t) => `${t.toString()} / ${t.constructor.name}`),
        );

        function convertType(type: DuckDBType): ColumnType {
          if (type instanceof DuckDBListType) {
            return new ColumnTypeList(convertType(type.valueType));
          }
          if (type instanceof DuckDBStructType) {
            return new ColumnTypeStruct(
              type.entryTypes.map((t, index) => ({
                name: type.entryNames[index],
                type: convertType(t),
                nullable: true,
              })),
            );
          }
          if (type instanceof DuckDBMapType) {
            return new ColumnMapType(
              {
                name: "key",
                type: convertType(type.keyType),
                nullable: true,
              },
              {
                name: "value",
                type: convertType(type.valueType),
                nullable: true,
              },
            );
          }

          return type.toString();
        }

        query.columns = columnNames.map((name, index) => ({
          name,
          type: convertType(columnTypes[index]),
          nullable: true,
        }));
      }

      if (query.isQuery) {
        if (query.isOne) {
          return await stmt.runAndRead();
        }
        return await stmt.runAndReadAll();
      }
      return await stmt.run();
    } catch (error) {
      consola.error(`Failed to execute query '${query.id}':`, error);
      throw error;
    }
  }

  close() {
    this.connection.closeSync();
  }
})();

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
