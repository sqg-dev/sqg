import consola from "consola";
import { Client, type QueryResult } from "pg";
import types from "pg-types";
import { DatabaseError, SqlExecutionError } from "../errors.js";
import type { SQLQuery, TableInfo } from "../sql-query.js";
import { type DatabaseEngine, initializeDatabase } from "./types.js";

const databaseName = "sqg-db-temp";

// PostgreSQL connection configuration
// TODO: Make this configurable via sqg.yaml
const connectionString = process.env.SQG_POSTGRES_URL || "postgresql://sqg:secret@localhost:15432/sqg-db";
const connectionStringTemp = process.env.SQG_POSTGRES_URL
  ? process.env.SQG_POSTGRES_URL.replace(/\/[^/]+$/, `/${databaseName}`)
  : `postgresql://sqg:secret@localhost:15432/${databaseName}`;

const typeIdToName = new Map<number, string>();
for (const [name, id] of Object.entries(types.builtins)) {
  typeIdToName.set(Number(id), name);
}

export const postgres = new (class implements DatabaseEngine {
  dbInitial!: Client;
  db!: Client;

  async initializeDatabase(queries: SQLQuery[]) {
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
      await this.dbInitial.query(`DROP DATABASE "${databaseName}";`);
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
      let result: QueryResult<any>;
      try {
        await db.query("BEGIN");
        result = await db.query(statement.sql, statement.parameters);
      } finally {
        await db.query("ROLLBACK");
      }
      // Get column information for queries
      if (query.isQuery) {
        const columnNames = result.fields.map((field) => field.name);
        const columnTypes = result.fields.map((field) => {
          // Map dataTypeID to type name using pg-types builtins
          return typeIdToName.get(field.dataTypeID) || `type_${field.dataTypeID}`;
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
    await this.dbInitial.query(`DROP DATABASE "${databaseName}"`);
    await this.dbInitial.end();
  }
})();
