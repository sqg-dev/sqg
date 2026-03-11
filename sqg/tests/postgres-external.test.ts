import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postgres } from "../src/db/postgres";
import { parseSQLQueries } from "../src/sql-query";
import { startPostgres, stopPostgres } from "./helpers/postgres-container";

/**
 * Tests that SQG does not modify an external PostgreSQL database.
 *
 * Scenario: The user has a database with existing tables and data (table A).
 * SQG SQL files contain migrations to create additional tables (table B) and
 * queries that reference both A and B — including destructive statements like DELETE.
 * After SQG runs, all original data in the external database must be intact.
 */

const EXTERNAL_SQL = `
-- MIGRATE 1
CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    active BOOLEAN DEFAULT true
);

-- EXEC delete_all_users
DELETE FROM users;

-- EXEC delete_all_projects
DELETE FROM projects;

-- QUERY get_users_and_projects
SELECT u.id as user_id, u.name as user_name, p.name as project_name
FROM users u, projects p;

-- QUERY get_user_by_name :one
@set name = 'Alice'
SELECT * FROM users WHERE name = \${name};
`;

describe("external postgres database", () => {
  let connectionUri: string;

  beforeAll(async () => {
    const container = await startPostgres();
    connectionUri = container.getConnectionUri();

    // Set up the external database: create table A and insert data
    const client = new Client({ connectionString: connectionUri });
    await client.connect();
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT
      );
      INSERT INTO users (name, email) VALUES
        ('Alice', 'alice@example.com'),
        ('Bob', 'bob@example.com'),
        ('Charlie', 'charlie@example.com');
    `);
    await client.end();
  }, 60_000);

  afterAll(async () => {
    await stopPostgres();
  });

  it("should not modify the external database after running SQG", async () => {
    const tmpFile = join(tmpdir(), "sqg-external-test.sql");
    writeFileSync(tmpFile, EXTERNAL_SQL);

    const { queries } = parseSQLQueries(tmpFile, []);

    process.env.SQG_POSTGRES_URL = connectionUri;
    try {
      await postgres.initializeDatabase(queries);
      await postgres.executeQueries(queries);
      await postgres.close();
    } finally {
      delete process.env.SQG_POSTGRES_URL;
    }

    // Verify the external database is untouched
    const client = new Client({ connectionString: connectionUri });
    await client.connect();

    // All original user data must still be there (DELETE was rolled back)
    const rows = await client.query("SELECT * FROM users ORDER BY id");
    expect(rows.rows).toHaveLength(3);
    expect(rows.rows.map((r: any) => r.name)).toEqual(["Alice", "Bob", "Charlie"]);

    // The migration table (projects) must NOT exist (CREATE TABLE was rolled back)
    const tables = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename = 'projects'
    `);
    expect(tables.rows).toHaveLength(0);

    await client.end();
  }, 30_000);
});
