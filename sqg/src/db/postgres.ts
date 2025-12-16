import consola from "consola";
import { Client, type QueryResult } from "pg";
import types from "pg-types";
import type { DatabaseEngine } from "../database";
import { initializeDatabase } from "../database";
import type { SQLQuery } from "../sql-query";

const databaseName = "sqg-db-temp";

const connectionString = "postgresql://sqg:secret@localhost:15432/sqg-db";
const connectionStringTemp = `postgresql://sqg:secret@localhost:15432/${databaseName}`;

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

    await this.dbInitial.connect();

    try {
      await this.dbInitial.query(`DROP DATABASE "${databaseName}";`);
    } catch (error) {
      // consola.error("Error dropping database:", error);
    }
    try {
      await this.dbInitial.query(`CREATE DATABASE "${databaseName}";`);
    } catch (error) {
      consola.error("Error creating database:", error);
    }

    await this.db.connect();

    await initializeDatabase(queries, async (query) => {
      await this.db.query(query.rawQuery);
    });
  }

  async executeQueries(queries: SQLQuery[]) {
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
        consola.info("Columns:", columnNames);
        consola.info("Types:", columnTypes);
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

  async close() {
    await this.db.end();
    await this.dbInitial.query(`DROP DATABASE "${databaseName}"`);
    await this.dbInitial.end();
  }
})();
