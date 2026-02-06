import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
});
