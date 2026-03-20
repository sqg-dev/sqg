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
import type { ProgressReporter } from "../ui.js";
import { type DatabaseEngine, initializeDatabase } from "./types.js";

/** Cache of enum type names, keyed by stringified sorted values for lookup */
let enumNameCache = new Map<string, string>();

function enumCacheKey(values: readonly string[]): string {
  return values.join("\0");
}

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
    const name = type.alias ?? enumNameCache.get(enumCacheKey(type.values));
    return new EnumType(type.values, name);
  }

  return type.toString();
}

export const duckdb = new (class implements DatabaseEngine {
  db!: DuckDBInstance;
  connection!: DuckDBConnection;

  async initializeDatabase(queries: SQLQuery[], reporter?: ProgressReporter) {
    this.db = await DuckDBInstance.create(":memory:");
    this.connection = await this.db.connect();

    await initializeDatabase(
      queries,
      async (query) => {
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
      },
      reporter,
    );

    // Load enum type cache (so user-defined ENUMs get proper names)
    await this.loadEnumCache();
  }

  private async loadEnumCache() {
    enumNameCache = new Map();
    try {
      const result = await this.connection.runAndReadAll(
        "SELECT type_name, labels FROM duckdb_types() WHERE logical_type = 'ENUM' AND internal = false",
      );
      for (const row of result.getRows()) {
        const typeName = row[0] as string;
        const labels = row[1] as { items: string[] };
        if (typeName && labels?.items) {
          enumNameCache.set(enumCacheKey(labels.items), typeName);
        }
      }
      consola.debug("DuckDB enum types:", Object.fromEntries(enumNameCache));
    } catch (e) {
      consola.debug("Failed to load DuckDB enum types:", (e as Error).message);
    }
  }

  async executeQueries(queries: SQLQuery[], reporter?: ProgressReporter) {
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
        reporter?.onQueryStart?.(query.id);

        await this.executeQuery(connection, query);

        reporter?.onQueryComplete?.(query.id);
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

      const sql = statement.sqlParts
        .map((part) => {
          if (typeof part === "string") {
            return part;
          }
          return ` ${part.value} `;
        })
        .join("");

      const stmt = await connection.prepare(sql);

      // Infer parameter types from the prepared statement
      if (stmt.parameterCount > 0) {
        const paramTypes = new Map<string, ColumnType>();
        for (let i = 0; i < stmt.parameterCount; i++) {
          const paramType = stmt.parameterType(i + 1);
          paramTypes.set(statement.parameters[i].name, convertType(paramType));
        }
        query.parameterTypes = paramTypes;
        consola.debug("Parameter types:", Object.fromEntries(paramTypes));
      }

      for (let i = 0; i < stmt.parameterCount; i++) {
        let value: string | number = statement.parameters[i].value;
        // Strip surrounding quotes from string values (same as PostgreSQL adapter)
        if (
          (value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"'))
        ) {
          value = value.slice(1, -1);
        }
        stmt.bindValue(i + 1, value);
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

  async introspectTables(tables: TableInfo[], reporter?: ProgressReporter) {
    const connection = this.connection;
    if (!connection) {
      throw new DatabaseError(
        "DuckDB connection not initialized",
        "duckdb",
        "This is an internal error. Check that migrations completed successfully.",
      );
    }

    for (const table of tables) {
      reporter?.onTableStart?.(table.tableName);

      try {
        // Use DESCRIBE to get nullability information
        const descResult = await connection.runAndReadAll(`DESCRIBE ${table.tableName}`);
        const descRows = descResult.getRows();
        const nullabilityMap = new Map<string, boolean>();
        for (const row of descRows) {
          nullabilityMap.set(row[0] as string, row[2] !== "NO");
        }

        // Use SELECT to get proper DuckDBType objects for columns (handles complex types like lists, structs, maps)
        const result = await connection.prepare(`SELECT * FROM ${table.tableName} LIMIT 0`);
        const stream = await result.stream();
        const columnNames = stream.columnNames();
        const columnTypes = stream.columnTypes();

        table.columns = columnNames.map((name, index) => ({
          name,
          type: convertType(columnTypes[index]),
          nullable: nullabilityMap.get(name) ?? true,
        }));

        consola.debug(`Table ${table.tableName} columns:`, table.columns);
        reporter?.onTableComplete?.(table.tableName, table.columns.length);
      } catch (error) {
        consola.error(`Failed to introspect table '${table.tableName}':`, error);
        throw error;
      }
    }
  }

  close() {
    this.connection.closeSync();
    enumNameCache = new Map();
  }
})();
