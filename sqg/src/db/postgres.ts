import consola from "consola";
import { Client, type QueryResult } from "pg";
import types from "pg-types";
import { DatabaseError, SqlExecutionError } from "../errors.js";
import type { SQLQuery, TableInfo } from "../sql-query.js";
import { type DatabaseEngine, initializeDatabase } from "./types.js";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

const tempDatabaseName = "sqg-db-temp";

// Static mapping from pg-types builtins
const typeIdToName = new Map<number, string>();
for (const [name, id] of Object.entries(types.builtins)) {
  typeIdToName.set(Number(id), name);
}

/**
 * Encapsulates how a PostgreSQL connection is set up and torn down.
 * Two modes: external DB (user-provided) vs temp DB (managed by SQG).
 */
interface ConnectionMode {
  /** Connect and return the Client to use for all queries. */
  connect(): Promise<Client>;
  /** Wrap a query execution so side effects are isolated. */
  wrapQuery(db: Client, fn: () => Promise<QueryResult>): Promise<QueryResult>;
  /** Clean up connections. */
  close(db: Client): Promise<void>;
}

/**
 * External database mode: connects directly to the user's database.
 * Uses a single transaction for the entire session and rolls back on close,
 * so the database is never modified. Individual queries use savepoints.
 */
class ExternalDbMode implements ConnectionMode {
  constructor(private connectionString: string) {}

  async connect(): Promise<Client> {
    const db = new Client({ connectionString: this.connectionString });
    try {
      await db.connect();
    } catch (e) {
      throw new DatabaseError(
        `Failed to connect to PostgreSQL: ${(e as Error).message}`,
        "postgres",
        `Check that PostgreSQL is running and accessible at ${this.connectionString}.`,
      );
    }
    // Wrap everything in a transaction so the external database is never modified.
    // PostgreSQL supports transactional DDL, so even CREATE TABLE can be rolled back.
    await db.query("BEGIN");
    return db;
  }

  async wrapQuery(db: Client, fn: () => Promise<QueryResult>): Promise<QueryResult> {
    // Already inside a transaction — use savepoints to isolate each query
    try {
      await db.query("SAVEPOINT sqg_query");
      return await fn();
    } finally {
      await db.query("ROLLBACK TO SAVEPOINT sqg_query");
    }
  }

  async close(db: Client): Promise<void> {
    // Roll back the outer transaction so the external database is untouched
    await db.query("ROLLBACK");
    await db.end();
  }
}

/**
 * Temp database mode: creates a temporary database for SQG to work in.
 * Connects to the provided server first (dbInitial) to CREATE the temp DB,
 * then connects to the temp DB for all operations.
 * On close, drops the temp DB and optionally stops the testcontainer.
 */
class TempDbMode implements ConnectionMode {
  private dbInitial!: Client;
  private container: StartedPostgreSqlContainer | null = null;

  constructor(
    private connectionString: string,
    container: StartedPostgreSqlContainer,
  ) {
    this.container = container;
  }

  async connect(): Promise<Client> {
    this.dbInitial = new Client({ connectionString: this.connectionString });
    try {
      await this.dbInitial.connect();
    } catch (e) {
      throw new DatabaseError(
        `Failed to connect to PostgreSQL: ${(e as Error).message}`,
        "postgres",
        `Check that PostgreSQL is running and accessible at ${this.connectionString}. ` +
          "Set SQG_POSTGRES_URL environment variable to use a different connection string.",
      );
    }

    try {
      await this.dbInitial.query(`DROP DATABASE IF EXISTS "${tempDatabaseName}";`);
    } catch (error) {
      // Database may not exist, that's OK
    }
    try {
      await this.dbInitial.query(`CREATE DATABASE "${tempDatabaseName}";`);
    } catch (error) {
      throw new DatabaseError(
        `Failed to create temporary database: ${(error as Error).message}`,
        "postgres",
        "Check PostgreSQL user permissions to create databases",
      );
    }

    const tempConnectionString = this.connectionString.replace(
      /\/[^/]+$/,
      `/${tempDatabaseName}`,
    );
    const db = new Client({ connectionString: tempConnectionString });
    try {
      await db.connect();
    } catch (e) {
      throw new DatabaseError(
        `Failed to connect to temporary database: ${(e as Error).message}`,
        "postgres",
      );
    }

    return db;
  }

  async wrapQuery(db: Client, fn: () => Promise<QueryResult>): Promise<QueryResult> {
    try {
      await db.query("BEGIN");
      return await fn();
    } finally {
      await db.query("ROLLBACK");
    }
  }

  async close(db: Client): Promise<void> {
    await db.end();
    await this.dbInitial.query(`DROP DATABASE IF EXISTS "${tempDatabaseName}"`);
    await this.dbInitial.end();

    if (this.container) {
      consola.info("Stopping PostgreSQL container...");
      await this.container.stop();
      this.container = null;
    }
  }
}

export const postgres = new (class implements DatabaseEngine {
  db!: Client;
  private mode!: ConnectionMode;
  private dynamicTypeCache = new Map<number, string>();

  private async startContainer(): Promise<{ connectionUri: string; container: StartedPostgreSqlContainer }> {
    consola.info("Starting PostgreSQL container via testcontainers...");

    const container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("sqg-db")
      .withUsername("sqg")
      .withPassword("secret")
      .start();

    const connectionUri = container.getConnectionUri();
    consola.success(`PostgreSQL container started at: ${connectionUri}`);
    return { connectionUri, container };
  }

  private async loadTypeCache(db: Client): Promise<void> {
    const result = await db.query(`
      SELECT t.oid, t.typname, t.typtype, t.typelem, et.typname AS elemtype
      FROM pg_type t
      LEFT JOIN pg_type et ON t.typelem = et.oid
      WHERE t.typtype IN ('b', 'e', 'r', 'c') -- base, enum, range, composite
         OR t.typelem != 0 -- array types
    `);

    this.dynamicTypeCache = new Map();
    for (const row of result.rows) {
      const oid = row.oid;
      let typeName = row.typname;

      if (typeName.startsWith("_") && row.elemtype) {
        typeName = `_${row.elemtype.toUpperCase()}`;
      } else {
        typeName = typeName.toUpperCase();
      }

      this.dynamicTypeCache.set(oid, typeName);
    }
  }

  private getTypeName(dataTypeID: number): string {
    const cached = this.dynamicTypeCache.get(dataTypeID);
    if (cached) {
      return cached;
    }
    return typeIdToName.get(dataTypeID) || `type_${dataTypeID}`;
  }

  async initializeDatabase(queries: SQLQuery[]) {
    const externalUrl = process.env.SQG_POSTGRES_URL;
    this.dynamicTypeCache = new Map();

    if (externalUrl) {
      this.mode = new ExternalDbMode(externalUrl);
    } else {
      const { connectionUri, container } = await this.startContainer();
      this.mode = new TempDbMode(connectionUri, container);
    }

    this.db = await this.mode.connect();

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

    // Load type cache (so user-defined types like ENUMs are available)
    await this.loadTypeCache(this.db);
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
      const executableQueries = queries.filter((q) => !q.skipGenerateFunction);

      for (const query of executableQueries) {
        consola.debug(`Executing query: ${query.id}`);
        await this.executeQuery(db, query);
        consola.success(`Query ${query.id} executed successfully`);
      }
    } catch (error) {
      consola.error("Error executing queries:", (error as Error).message);
      throw error;
    }
  }

  private async executeQuery(db: Client, query: SQLQuery) {
    const statement = query.queryPositional;
    try {
      consola.debug("Query:", statement.sql);
      const parameterValues = statement.parameters.map((p) => {
        const value = p.value;
        if (
          (value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"'))
        ) {
          return value.slice(1, -1);
        }
        return value;
      });

      // Introspect parameter types using PREPARE + pg_prepared_statements
      if (statement.parameters.length > 0) {
        try {
          await db.query("DEALLOCATE ALL");
          await db.query(`PREPARE sqg_param_check AS ${statement.sql}`);
          const paramTypeResult = await db.query(
            `SELECT unnest(parameter_types)::oid AS oid FROM pg_prepared_statements WHERE name = 'sqg_param_check'`,
          );
          await db.query("DEALLOCATE sqg_param_check");

          if (paramTypeResult.rows.length === statement.parameters.length) {
            const paramTypes = new Map<string, string>();
            for (let i = 0; i < statement.parameters.length; i++) {
              const oid = Number(paramTypeResult.rows[i].oid);
              const typeName = this.getTypeName(oid);
              paramTypes.set(statement.parameters[i].name, typeName);
            }
            query.parameterTypes = paramTypes;
            consola.debug("Parameter types:", Object.fromEntries(paramTypes));
          }
        } catch (e) {
          consola.debug(
            `Parameter type introspection failed for ${query.id}, using heuristic:`,
            (e as Error).message,
          );
        }
      }

      const result = await this.mode.wrapQuery(db, () =>
        db.query(statement.sql, parameterValues),
      );

      if (query.isQuery) {
        const columnNames = result.fields.map((field) => field.name);
        const columnTypes = result.fields.map((field) => {
          return this.getTypeName(field.dataTypeID);
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
    await this.mode.close(this.db);
    this.dynamicTypeCache = new Map();
  }
})();
