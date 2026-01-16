import {
  type DuckDBConnection,
  DuckDBEnumType,
  DuckDBInstance,
  DuckDBListType,
  DuckDBMapType,
  DuckDBStructType,
  type DuckDBType,
} from "@duckdb/node-api";
import consola from "consola";
import { DatabaseError, SqlExecutionError } from "../errors.js";
import type { SQLQuery, TableInfo } from "../sql-query.js";
import { type ColumnType, EnumType, ListType, MapType, StructType } from "../sql-query.js";
import { type DatabaseEngine, initializeDatabase } from "./types.js";

export const duckdb = new (class implements DatabaseEngine {
  db!: DuckDBInstance;
  connection!: DuckDBConnection;

  async initializeDatabase(queries: SQLQuery[]) {
    this.db = await DuckDBInstance.create(":memory:");
    this.connection = await this.db.connect();

    await initializeDatabase(queries, async (query) => {
      try {
        await this.connection.run(query.rawQuery);
      } catch (e) {
        throw new SqlExecutionError(
          (e as Error).message,
          query.id,
          query.filename,
          query.rawQuery,
          e as Error,
        );
      }
    });
  }

  async executeQueries(queries: SQLQuery[]) {
    const connection = this.connection;
    if (!connection) {
      throw new DatabaseError(
        "DuckDB connection not initialized",
        "duckdb",
        "This is an internal error. Check that migrations completed successfully.",
      );
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
      consola.debug("Query:", statement.sql, statement.sqlParts);
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
        consola.debug("Columns:", columnNames);
        consola.debug(
          "Types:",
          columnTypes.map((t) => `${t.toString()} / ${t.constructor.name}`),
        );

        function convertType(type: DuckDBType): ColumnType {
          if (type instanceof DuckDBListType) {
            return new ListType(convertType(type.valueType));
          }
          if (type instanceof DuckDBStructType) {
            return new StructType(
              type.entryTypes.map((t, index) => ({
                name: type.entryNames[index],
                type: convertType(t),
                nullable: true,
              })),
            );
          }
          if (type instanceof DuckDBMapType) {
            return new MapType(
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
          if (type instanceof DuckDBEnumType) {
            return new EnumType(type.values);
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

  async introspectTables(tables: TableInfo[]) {
    const connection = this.connection;
    if (!connection) {
      throw new DatabaseError(
        "DuckDB connection not initialized",
        "duckdb",
        "This is an internal error. Check that migrations completed successfully.",
      );
    }

    for (const table of tables) {
      consola.info(`Introspecting table schema: ${table.tableName}`);

      try {
        // Use DESCRIBE to get column information
        const result = await connection.runAndReadAll(`DESCRIBE ${table.tableName}`);
        const rows = result.getRows();

        function convertType(type: DuckDBType): ColumnType {
          if (type instanceof DuckDBListType) {
            return new ListType(convertType(type.valueType));
          }
          if (type instanceof DuckDBStructType) {
            return new StructType(
              type.entryTypes.map((t, index) => ({
                name: type.entryNames[index],
                type: convertType(t),
                nullable: true,
              })),
            );
          }
          if (type instanceof DuckDBMapType) {
            return new MapType(
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
          if (type instanceof DuckDBEnumType) {
            return new EnumType(type.values);
          }
          return type.toString();
        }

        // DESCRIBE returns: column_name, column_type, null, key, default, extra
        table.columns = rows.map((row) => {
          const columnName = row[0] as string;
          const columnType = row[1] as string;
          const isNullable = row[2] !== "NO";
          return {
            name: columnName,
            type: columnType,
            nullable: isNullable,
          };
        });

        consola.debug(`Table ${table.tableName} columns:`, table.columns);
        consola.success(`Introspected table: ${table.tableName} (${table.columns.length} columns)`);
      } catch (error) {
        consola.error(`Failed to introspect table '${table.tableName}':`, error);
        throw error;
      }
    }
  }

  close() {
    this.connection.closeSync();
  }
})();
