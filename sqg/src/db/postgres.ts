import consola from "consola";
import { Client, type QueryResult } from "pg";
import types from "pg-types";
import { DatabaseError, SqlExecutionError } from "../errors.js";
import type { SQLQuery, TableInfo } from "../sql-query.js";
import { type DatabaseEngine, initializeDatabase } from "./types.js";

const databaseName = "sqg-db-temp";

// Testcontainers instance (lazy loaded)
let containerInstance: any = null;

async function startTestContainer(): Promise<string> {
  if (containerInstance) {
    return containerInstance.getConnectionUri();
  }

  consola.info("Starting PostgreSQL container via testcontainers...");
  const { PostgreSqlContainer } = await import("@testcontainers/postgresql");

  containerInstance = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("sqg-db")
    .withUsername("sqg")
    .withPassword("secret")
    .start();

  const connectionUri = containerInstance.getConnectionUri();
  consola.success(`PostgreSQL container started at: ${connectionUri}`);
  return connectionUri;
}

async function stopTestContainer(): Promise<void> {
  if (containerInstance) {
    consola.info("Stopping PostgreSQL container...");
    await containerInstance.stop();
    containerInstance = null;
  }
}

// PostgreSQL connection configuration
async function getConnectionString(): Promise<string> {
  if (process.env.SQG_POSTGRES_URL) {
    return process.env.SQG_POSTGRES_URL;
  }
  // No URL provided, start a testcontainer
  return await startTestContainer();
}

function getTempConnectionString(baseUrl: string): string {
  // Replace the database name (last path segment) in the connection URL with the temp database name
  // e.g. "postgres://user:pass@host:5432/mydb" -> "postgres://user:pass@host:5432/sqg-db-temp"
  return baseUrl.replace(/\/[^/]+$/, `/${databaseName}`);
}

// Static mapping from pg-types builtins
const typeIdToName = new Map<number, string>();
for (const [name, id] of Object.entries(types.builtins)) {
  typeIdToName.set(Number(id), name);
}

// Dynamic type cache populated from pg_type for each connection
// This maps OIDs to type names including array types and user-defined types
let dynamicTypeCache = new Map<number, string>();

async function loadTypeCache(db: Client): Promise<void> {
  // Query pg_type to get all type OIDs and their names, including array types
  const result = await db.query(`
    SELECT t.oid, t.typname, t.typtype, t.typelem, et.typname AS elemtype
    FROM pg_type t
    LEFT JOIN pg_type et ON t.typelem = et.oid
    WHERE t.typtype IN ('b', 'e', 'r', 'c') -- base, enum, range, composite
       OR t.typelem != 0 -- array types
  `);

  dynamicTypeCache = new Map();
  for (const row of result.rows) {
    const oid = row.oid;
    let typeName = row.typname;

    // If this is an array type (starts with _), use the element type name with [] suffix
    if (typeName.startsWith("_") && row.elemtype) {
      typeName = `_${row.elemtype.toUpperCase()}`;
    } else {
      typeName = typeName.toUpperCase();
    }

    dynamicTypeCache.set(oid, typeName);
  }
}

function getTypeName(dataTypeID: number): string {
  // First check dynamic cache (has array types and user-defined types)
  const cached = dynamicTypeCache.get(dataTypeID);
  if (cached) {
    return cached;
  }

  // Fall back to static pg-types mapping
  return typeIdToName.get(dataTypeID) || `type_${dataTypeID}`;
}

export const postgres = new (class implements DatabaseEngine {
  dbInitial!: Client;
  db!: Client;
  private usingTestContainer = false;

  async initializeDatabase(queries: SQLQuery[]) {
    const connectionString = await getConnectionString();
    const connectionStringTemp = getTempConnectionString(connectionString);

    // Track if we started a testcontainer
    this.usingTestContainer = containerInstance !== null;

    this.dbInitial = new Client({
      connectionString: connectionString,
    });
    this.db = new Client({
      connectionString: connectionStringTemp,
    });

    try {
      await this.dbInitial.connect();
    } catch (e) {
      throw new DatabaseError(
        `Failed to connect to PostgreSQL: ${(e as Error).message}`,
        "postgres",
        `Check that PostgreSQL is running and accessible at ${connectionString}. ` +
          "Set SQG_POSTGRES_URL environment variable to use a different connection string.",
      );
    }

    try {
      await this.dbInitial.query(`DROP DATABASE IF EXISTS "${databaseName}";`);
    } catch (error) {
      // Database may not exist, that's OK
    }
    try {
      await this.dbInitial.query(`CREATE DATABASE "${databaseName}";`);
    } catch (error) {
      throw new DatabaseError(
        `Failed to create temporary database: ${(error as Error).message}`,
        "postgres",
        "Check PostgreSQL user permissions to create databases",
      );
    }

    try {
      await this.db.connect();
    } catch (e) {
      throw new DatabaseError(
        `Failed to connect to temporary database: ${(e as Error).message}`,
        "postgres",
      );
    }

    await initializeDatabase(queries, async (query) => {
      try {
        await this.db.query(query.rawQuery);
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

    // Load type cache after migrations (so user-defined types like ENUMs are available)
    await loadTypeCache(this.db);
  }

  async executeQueries(queries: SQLQuery[]) {
    const db = this.db;
    if (!db) {
      throw new DatabaseError(
        "PostgreSQL database not initialized",
        "postgres",
        "This is an internal error. Check that migrations completed successfully.",
      );
    }
    try {
      // Skip the setup query as it's already executed
      const executableQueries = queries.filter((q) => !q.skipGenerateFunction);

      for (const query of executableQueries) {
        consola.debug(`Executing query: ${query.id}`);
        //consola.info("Variables:", Object.fromEntries(query.variables));

        await this.executeQuery(db, query);

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
  private async executeQuery(db: Client, query: SQLQuery) {
    const statement = query.queryPositional;
    try {
      consola.info("Query:", statement.sql);
      // Extract just the values from the parameter entries
      // Strip surrounding quotes from string literals since pg driver handles escaping
      const parameterValues = statement.parameters.map((p) => {
        const value = p.value;
        // Remove surrounding single or double quotes from string literals
        if (
          (value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"'))
        ) {
          return value.slice(1, -1);
        }
        return value;
      });
      let result: QueryResult<any>;
      try {
        await db.query("BEGIN");
        result = await db.query(statement.sql, parameterValues);
      } finally {
        await db.query("ROLLBACK");
      }
      // Get column information for queries
      if (query.isQuery) {
        const columnNames = result.fields.map((field) => field.name);
        const columnTypes = result.fields.map((field) => {
          // Map dataTypeID to type name using dynamic cache (includes arrays and user-defined types)
          return getTypeName(field.dataTypeID);
        });
        consola.debug("Columns:", columnNames);
        consola.debug("Types:", columnTypes);
        query.columns = columnNames.map((name, index) => ({
          name,
          type: columnTypes[index],
          nullable: true,
        }));
      }

      if (query.isQuery) {
        if (query.isOne) {
          return result.rows[0] || null;
        }
        return result.rows;
      }
      return result;
    } catch (error) {
      consola.error(`Failed to execute query '${query.id}':`, error);
      throw error;
    }
  }

  async introspectTables(tables: TableInfo[]) {
    const db = this.db;
    if (!db) {
      throw new DatabaseError(
        "PostgreSQL database not initialized",
        "postgres",
        "This is an internal error. Check that migrations completed successfully.",
      );
    }

    for (const table of tables) {
      consola.info(`Introspecting table schema: ${table.tableName}`);
      try {
        const result = await db.query(
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_name = $1
           ORDER BY ordinal_position`,
          [table.tableName],
        );
        table.columns = result.rows.map((row) => ({
          name: row.column_name,
          type: row.data_type.toUpperCase(),
          nullable: row.is_nullable === "YES",
        }));
        consola.success(`Introspected table: ${table.tableName} (${table.columns.length} columns)`);
      } catch (error) {
        consola.error(`Failed to introspect table '${table.tableName}':`, error);
        throw error;
      }
    }
  }

  async close() {
    await this.db.end();
    await this.dbInitial.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
    await this.dbInitial.end();

    // Stop testcontainer if we started one
    if (this.usingTestContainer) {
      await stopTestContainer();
    }
  }
})();
