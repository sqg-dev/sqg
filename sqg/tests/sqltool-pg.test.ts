import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postgres } from "../src/db/postgres";
import { parseSQLQueries } from "../src/sql-query";
import { processProject } from "../src/sqltool";
import { startPostgres, stopPostgres } from "./helpers/postgres-container";

describe("sqg-pg", () => {
  beforeAll(async () => {
    await startPostgres();
  }, 60_000); // 60 second timeout for container startup

  afterAll(async () => {
    await stopPostgres();
  });

  describe("processProjectPostgres", () => {
    it("handle postgres correctly", async () => {
      const files = await processProject("tests/test-pg.yaml");
      expect(files.map((file) => basename(file))).toEqual(["TestPg.java", "TestPg.java"]);

      // Only snapshot the first file (/tmp/TestPg.java with com.test package)
      // The second file (java/src/main/java/sqg/generated/TestPg.java) is for Java tests
      const fileContent = readFileSync(files[0], "utf-8");
      await expect(fileContent).toMatchFileSnapshot("./__snapshots__/TestPg.java.snapshot");
    }, 30_000); // 30 second timeout for test execution
  });

  describe("parameter type introspection", () => {
    it("should infer BIGINT parameter type from column, not from literal value", async () => {
      const filePath = resolve("tests/test-pg.sql");
      const { queries } = parseSQLQueries(filePath, []);

      await postgres.initializeDatabase(queries);
      await postgres.executeQueries(queries);
      await postgres.close();

      // get_bigint_record: @set id = 1, WHERE id = ${id} against BIGINT column
      const bigintRecord = queries.find((q) => q.id === "get_bigint_record")!;
      expect(bigintRecord.parameterTypes).toBeDefined();
      expect(bigintRecord.parameterTypes!.get("id")).toBe("INT8");

      // get_bigint_amount: same pattern
      const bigintAmount = queries.find((q) => q.id === "get_bigint_amount")!;
      expect(bigintAmount.parameterTypes).toBeDefined();
      expect(bigintAmount.parameterTypes!.get("id")).toBe("INT8");
    }, 30_000);

    it("should infer TEXT parameter type for text columns", async () => {
      const filePath = resolve("tests/test-pg.sql");
      const { queries } = parseSQLQueries(filePath, []);

      await postgres.initializeDatabase(queries);
      await postgres.executeQueries(queries);
      await postgres.close();

      // users6: @set name = 'name', WHERE name = ${name} against TEXT column
      const users6 = queries.find((q) => q.id === "users6")!;
      expect(users6.parameterTypes).toBeDefined();
      expect(users6.parameterTypes!.get("name")).toBe("TEXT");
    }, 30_000);

    it("should not set parameterTypes for queries without parameters", async () => {
      const filePath = resolve("tests/test-pg.sql");
      const { queries } = parseSQLQueries(filePath, []);

      await postgres.initializeDatabase(queries);
      await postgres.executeQueries(queries);
      await postgres.close();

      // users1: SELECT * FROM users (no parameters)
      const users1 = queries.find((q) => q.id === "users1")!;
      expect(users1.parameterTypes).toBeUndefined();

      // get_all_tasks: no parameters
      const allTasks = queries.find((q) => q.id === "get_all_tasks")!;
      expect(allTasks.parameterTypes).toBeUndefined();
    }, 30_000);
  });
});
