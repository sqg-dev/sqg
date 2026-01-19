import { existsSync, unlinkSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import Database, { type Database as BetterSqlite3Database } from "better-sqlite3";
import { DatabaseSync } from "node:sqlite";
import { createClient, type Client } from "@libsql/client";
import { connect, type Database as TursoDatabase } from "@tursodatabase/database";
import { TestSqlite as BetterSqlite3Queries } from "./__generated__/test-sqlite-better-sqlite3.js";
import { TestSqlite as NodeSqliteQueries } from "./__generated__/test-sqlite-node.js";
import { TestSqlite as LibsqlQueries } from "./__generated__/test-sqlite-libsql.js";
import { TestSqlite as TursoQueries } from "./__generated__/test-sqlite-turso.js";

// Test configuration for each SQLite implementation
interface SqliteDriverConfig {
  name: string;
  generator: string;
  configFile: string;
  outputPath: string;
  dbPath: string;
  isAsync: boolean;
  setup: () => Promise<{
    connection: unknown;
    queries: unknown;
    cleanup: () => Promise<void>;
  }>;
}

function cleanupDbFiles(dbPath: string) {
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = dbPath + suffix;
    if (existsSync(file)) {
      try {
        unlinkSync(file);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

// Shared test data
const TEST_USERS = [
  { id: "1", name: "Alice", email: "alice@example.com" },
  { id: "2", name: "Bob", email: "bob@example.com" },
  { id: "3", name: "Charlie", email: null },
];

// Define driver configurations
const DRIVERS: SqliteDriverConfig[] = [
  {
    name: "better-sqlite3",
    generator: "typescript/sqlite/better-sqlite3",
    configFile: "tests/test-sqlite.yaml",
    outputPath: "/tmp/better-sqlite3",
    dbPath: "/tmp/test-better-sqlite3-runtime.db",
    isAsync: false,
    setup: async () => {
      cleanupDbFiles("/tmp/test-better-sqlite3-runtime.db");

      const db = new Database("/tmp/test-better-sqlite3-runtime.db");
      const QueriesClass = BetterSqlite3Queries;

      // Run migrations
      for (const migration of QueriesClass.getMigrations()) {
        db.exec(migration);
      }

      // Insert test data
      const insertStmt = db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)");
      for (const user of TEST_USERS) {
        insertStmt.run(user.id, user.name, user.email);
      }

      const queries = new QueriesClass(db);

      return {
        connection: db,
        queries,
        cleanup: async () => {
          db.close();
          cleanupDbFiles("/tmp/test-better-sqlite3-runtime.db");
        },
      };
    },
  },
  {
    name: "node:sqlite",
    generator: "typescript/sqlite/node",
    configFile: "tests/test-node-sqlite.yaml",
    outputPath: "/tmp/node-sqlite",
    dbPath: "/tmp/test-node-sqlite-runtime.db",
    isAsync: false,
    setup: async () => {
      cleanupDbFiles("/tmp/test-node-sqlite-runtime.db");

      const db = new DatabaseSync("/tmp/test-node-sqlite-runtime.db");
      const QueriesClass = NodeSqliteQueries;

      // Run migrations
      for (const migration of QueriesClass.getMigrations()) {
        db.exec(migration);
      }

      // Insert test data
      const insertStmt = db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)");
      for (const user of TEST_USERS) {
        insertStmt.run(user.id, user.name, user.email);
      }

      const queries = new QueriesClass(db);

      return {
        connection: db,
        queries,
        cleanup: async () => {
          db.close();
          cleanupDbFiles("/tmp/test-node-sqlite-runtime.db");
        },
      };
    },
  },
  {
    name: "libsql",
    generator: "typescript/sqlite/libsql",
    configFile: "tests/test-libsql.yaml",
    outputPath: "/tmp/libsql",
    dbPath: "/tmp/test-libsql-runtime.db",
    isAsync: true,
    setup: async () => {
      cleanupDbFiles("/tmp/test-libsql-runtime.db");

      const client = createClient({ url: `file:/tmp/test-libsql-runtime.db` });
      const QueriesClass = LibsqlQueries;

      // Run migrations
      for (const migration of QueriesClass.getMigrations()) {
        await client.execute(migration);
      }

      // Insert test data
      for (const user of TEST_USERS) {
        await client.execute({
          sql: "INSERT INTO users (id, name, email) VALUES (?, ?, ?)",
          args: [user.id, user.name, user.email],
        });
      }

      const queries = new QueriesClass(client);

      return {
        connection: client,
        queries,
        cleanup: async () => {
          client.close();
          cleanupDbFiles("/tmp/test-libsql-runtime.db");
        },
      };
    },
  },
  {
    name: "turso",
    generator: "typescript/sqlite/turso",
    configFile: "tests/test-turso.yaml",
    outputPath: "/tmp/turso",
    dbPath: "/tmp/test-turso-runtime.db",
    isAsync: true,
    setup: async () => {
      cleanupDbFiles("/tmp/test-turso-runtime.db");

      const db = await connect("/tmp/test-turso-runtime.db");
      const QueriesClass = TursoQueries;

      // Run migrations - Turso doesn't support STRICT tables, so remove the STRICT keyword
      const migrations = QueriesClass.getMigrations().map((migration) =>
        migration.replace(/\s+strict\s*;?/i, ";"),
      );
      for (const migration of migrations) {
        const stmt = await db.prepare(migration);
        await stmt.run();
      }

      // Insert test data
      const insertStmt = await db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)");
      for (const user of TEST_USERS) {
        await insertStmt.run(user.id, user.name, user.email);
      }

      const queries = new QueriesClass(db);

      return {
        connection: db,
        queries,
        cleanup: async () => {
          cleanupDbFiles("/tmp/test-turso-runtime.db");
        },
      };
    },
  },
];

// Type for the queries object
type Queries = {
  users1: () => Promise<{ id: string; name: string; email: string | null }[]> | { id: string; name: string; email: string | null }[];
  users2: () => Promise<string | undefined> | string | undefined;
  users3: () => Promise<string | undefined> | string | undefined;
  users4: () => Promise<{ email: string | null; name: string } | undefined> | { email: string | null; name: string } | undefined;
  users5: () => Promise<{ count: number; email: string | null }[]> | { count: number; email: string | null }[];
  users6: (name: string) => Promise<{ id: string; name: string; email: string } | undefined> | { id: string; name: string; email: string } | undefined;
  users7: (name: string) => Promise<{ id: string; name: string; email: string | null }[]> | { id: string; name: string; email: string | null }[];
};

// Helper to handle async/sync queries
async function executeQuery<T>(query: () => T | Promise<T>): Promise<T> {
  const result = query();
  return result instanceof Promise ? result : Promise.resolve(result);
}

// Shared test suite
function createTestSuite(config: SqliteDriverConfig) {
  describe(`${config.name} runtime tests`, () => {
    let queries: Queries;
    let cleanup: () => Promise<void>;
    let connection: unknown;

    beforeAll(async () => {
      const setup = await config.setup();
      queries = setup.queries as Queries;
      cleanup = setup.cleanup;
      connection = setup.connection;
    });

    afterAll(async () => {
      await cleanup();
    });

    it("users1 - should return all users", async () => {
      const result = await executeQuery(() => queries.users1());
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ id: "1", name: "Alice", email: "alice@example.com" });
      expect(result[1]).toEqual({ id: "2", name: "Bob", email: "bob@example.com" });
      expect(result[2]).toEqual({ id: "3", name: "Charlie", email: null });
    });

    it("users2 - should pluck single id value", async () => {
      const result = await executeQuery(() => queries.users2());
      expect(result).toBe("1");
    });

    it("users3 - should pluck single name value", async () => {
      const result = await executeQuery(() => queries.users3());
      expect(result).toBe("Alice");
    });

    it("users4 - should return single row with email and name", async () => {
      const result = await executeQuery(() => queries.users4());
      expect(result).toEqual({ email: "alice@example.com", name: "Alice" });
    });

    it("users5 - should return rows with computed count column", async () => {
      const result = await executeQuery(() => queries.users5());
      expect(result).toHaveLength(1);
      expect(result[0].count).toBe(10);
      expect(result[0].email).toBe("alice@example.com");
    });

    it("users6 - should find user by name parameter", async () => {
      const result = await executeQuery(() => queries.users6("Bob"));
      expect(result).toEqual({ id: "2", name: "Bob", email: "bob@example.com" });
    });

    it("users6 - should return undefined for non-existent user", async () => {
      const result = await executeQuery(() => queries.users6("NonExistent"));
      expect(result).toBeUndefined();
    });

    it("users7 - should return multiple users matching name", async () => {
      const result = await executeQuery(() => queries.users7("Alice"));
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ id: "1", name: "Alice", email: "alice@example.com" });
    });

    it("users7 - should return empty array for non-matching name", async () => {
      const result = await executeQuery(() => queries.users7("NonExistent"));
      expect(result).toHaveLength(0);
    });

    it("should handle null values correctly in results", async () => {
      const result = await executeQuery(() => queries.users1());
      const charlie = result.find((u) => u.id === "3");
      expect(charlie).toBeDefined();
      expect(charlie?.email).toBeNull();
      expect(charlie?.name).toBe("Charlie");
    });

    it("should verify query result types are correct", async () => {
      const allUsers = await executeQuery(() => queries.users1());
      expect(Array.isArray(allUsers)).toBe(true);
      if (allUsers.length > 0) {
        const user = allUsers[0];
        expect(typeof user.id).toBe("string");
        expect(typeof user.name).toBe("string");
        expect(user.email === null || typeof user.email === "string").toBe(true);
      }
    });

    it("should handle parameterized queries with different values", async () => {
      // Test with existing name
      const result1 = await executeQuery(() => queries.users6("Alice"));
      expect(result1?.name).toBe("Alice");

      // Test with different existing name
      const result2 = await executeQuery(() => queries.users6("Bob"));
      expect(result2?.name).toBe("Bob");

      // Test with non-existent name
      const result3 = await executeQuery(() => queries.users6("NonExistent"));
      expect(result3).toBeUndefined();
    });

    it("should return correct count in computed columns", async () => {
      const result = await executeQuery(() => queries.users5());
      expect(result).toHaveLength(1);
      expect(typeof result[0].count).toBe("number");
      expect(result[0].count).toBe(10);
    });

    it("should handle empty result sets correctly", async () => {
      // This test modifies the database, so we need to restore data after
      if (config.name === "better-sqlite3") {
        const db = connection as BetterSqlite3Database;
        db.exec("DELETE FROM users");
        const result = await executeQuery(() => queries.users1());
        expect(result).toHaveLength(0);
        
        // Restore data
        const insertStmt = db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)");
        for (const user of TEST_USERS) {
          insertStmt.run(user.id, user.name, user.email);
        }
      } else if (config.name === "node:sqlite") {
        const db = connection as DatabaseSync;
        db.exec("DELETE FROM users");
        const result = await executeQuery(() => queries.users1());
        expect(result).toHaveLength(0);
        
        // Restore data
        const insertStmt = db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)");
        for (const user of TEST_USERS) {
          insertStmt.run(user.id, user.name, user.email);
        }
      } else if (config.name === "libsql") {
        const client = connection as Client;
        await client.execute("DELETE FROM users");
        const result = await executeQuery(() => queries.users1());
        expect(result).toHaveLength(0);
        
        // Restore data
        for (const user of TEST_USERS) {
          await client.execute({
            sql: "INSERT INTO users (id, name, email) VALUES (?, ?, ?)",
            args: [user.id, user.name, user.email],
          });
        }
      } else if (config.name === "turso") {
        const db = connection as TursoDatabase;
        const deleteStmt = await db.prepare("DELETE FROM users");
        await deleteStmt.run();
        const result = await executeQuery(() => queries.users1());
        expect(result).toHaveLength(0);
        
        // Restore data
        const insertStmt = await db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)");
        for (const user of TEST_USERS) {
          await insertStmt.run(user.id, user.name, user.email);
        }
      }
    });

    it("should handle pluck queries returning undefined for no results", async () => {
      // This test also modifies the database
      if (config.name === "better-sqlite3") {
        const db = connection as BetterSqlite3Database;
        db.exec("DELETE FROM users");
        
        const idResult = await executeQuery(() => queries.users2());
        expect(idResult).toBeUndefined();
        
        const nameResult = await executeQuery(() => queries.users3());
        expect(nameResult).toBeUndefined();
        
        // Restore data
        const insertStmt = db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)");
        for (const user of TEST_USERS) {
          insertStmt.run(user.id, user.name, user.email);
        }
      } else if (config.name === "node:sqlite") {
        const db = connection as DatabaseSync;
        db.exec("DELETE FROM users");
        
        const idResult = await executeQuery(() => queries.users2());
        expect(idResult).toBeUndefined();
        
        const nameResult = await executeQuery(() => queries.users3());
        expect(nameResult).toBeUndefined();
        
        // Restore data
        const insertStmt = db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)");
        for (const user of TEST_USERS) {
          insertStmt.run(user.id, user.name, user.email);
        }
      } else if (config.name === "libsql") {
        const client = connection as Client;
        await client.execute("DELETE FROM users");
        
        const idResult = await executeQuery(() => queries.users2());
        expect(idResult).toBeUndefined();
        
        const nameResult = await executeQuery(() => queries.users3());
        expect(nameResult).toBeUndefined();
        
        // Restore data
        for (const user of TEST_USERS) {
          await client.execute({
            sql: "INSERT INTO users (id, name, email) VALUES (?, ?, ?)",
            args: [user.id, user.name, user.email],
          });
        }
      } else if (config.name === "turso") {
        const db = connection as TursoDatabase;
        const deleteStmt = await db.prepare("DELETE FROM users");
        await deleteStmt.run();
        
        const idResult = await executeQuery(() => queries.users2());
        expect(idResult).toBeUndefined();
        
        const nameResult = await executeQuery(() => queries.users3());
        expect(nameResult).toBeUndefined();
        
        // Restore data
        const insertStmt = await db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)");
        for (const user of TEST_USERS) {
          await insertStmt.run(user.id, user.name, user.email);
        }
      }
    });
  });
}

// Create test suites for all drivers
for (const driver of DRIVERS) {
  createTestSuite(driver);
}

