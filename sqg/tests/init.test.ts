import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initProject, type InitOptions } from "../src/init";
import { InvalidEngineError, InvalidGeneratorError, SqgError } from "../src/errors";
import { processProject } from "../src/sqltool";

describe("initProject", () => {
  let testDir: string;
  let originalCwd: string;

  beforeEach(() => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `sqg-init-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });

    // Save original cwd and change to test directory
    originalCwd = process.cwd();
    process.chdir(testDir);
  });

  afterEach(() => {
    // Restore original cwd
    process.chdir(originalCwd);

    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("default options", () => {
    it("creates sqg.yaml and queries.sql with sqlite defaults", async () => {
      await initProject({});

      expect(existsSync("sqg.yaml")).toBe(true);
      expect(existsSync("queries.sql")).toBe(true);
      expect(existsSync("generated")).toBe(true);

      const config = readFileSync("sqg.yaml", "utf-8");
      expect(config).toContain("engine: sqlite");
      expect(config).toContain("generator: typescript/better-sqlite3");
      expect(config).toContain("output: ./generated/");
    });

    it("creates valid SQL with sqlite syntax", async () => {
      await initProject({});

      const sql = readFileSync("queries.sql", "utf-8");
      expect(sql).toContain("-- MIGRATE 1");
      expect(sql).toContain("INTEGER PRIMARY KEY AUTOINCREMENT");
      expect(sql).toContain("-- QUERY list_users");
      expect(sql).toContain("-- EXEC create_user");
    });
  });

  describe("engine option", () => {
    it("creates duckdb project with correct defaults", async () => {
      await initProject({ engine: "duckdb" });

      const config = readFileSync("sqg.yaml", "utf-8");
      expect(config).toContain("engine: duckdb");
      expect(config).toContain("generator: typescript/duckdb");

      const sql = readFileSync("queries.sql", "utf-8");
      expect(sql).toContain("VARCHAR");
      expect(sql).toContain("STRUCT(role VARCHAR, active BOOLEAN)");
      expect(sql).toContain("tags VARCHAR[]");
    });

    it("creates postgres project with correct defaults", async () => {
      await initProject({ engine: "postgres" });

      const config = readFileSync("sqg.yaml", "utf-8");
      expect(config).toContain("engine: postgres");
      expect(config).toContain("generator: java/jdbc");
      expect(config).toContain("package: generated");

      const sql = readFileSync("queries.sql", "utf-8");
      expect(sql).toContain("SERIAL PRIMARY KEY");
    });

    it("throws InvalidEngineError for unknown engine", async () => {
      await expect(initProject({ engine: "mysql" })).rejects.toThrow(InvalidEngineError);
    });
  });

  describe("generator option", () => {
    it("uses specified generator", async () => {
      await initProject({ engine: "sqlite", generator: "java/jdbc" });

      const config = readFileSync("sqg.yaml", "utf-8");
      expect(config).toContain("generator: java/jdbc");
      expect(config).toContain("package: generated");
    });

    it("throws InvalidGeneratorError for unknown generator", async () => {
      await expect(initProject({ generator: "typescript/sqlite" })).rejects.toThrow(
        InvalidGeneratorError,
      );
    });

    it("throws error for incompatible generator/engine combination", async () => {
      await expect(
        initProject({ engine: "postgres", generator: "typescript/better-sqlite3" }),
      ).rejects.toThrow(SqgError);

      try {
        await initProject({ engine: "postgres", generator: "typescript/better-sqlite3" });
      } catch (e) {
        expect((e as SqgError).code).toBe("GENERATOR_ENGINE_MISMATCH");
      }
    });

    it("allows java/jdbc with any engine", async () => {
      await initProject({ engine: "sqlite", generator: "java/jdbc" });
      expect(existsSync("sqg.yaml")).toBe(true);

      // Clean up for next test
      rmSync("sqg.yaml");
      rmSync("queries.sql");

      await initProject({ engine: "duckdb", generator: "java/jdbc", force: true });
      expect(existsSync("sqg.yaml")).toBe(true);
    });
  });

  describe("output option", () => {
    it("uses specified output directory", async () => {
      await initProject({ output: "./src/db" });

      const config = readFileSync("sqg.yaml", "utf-8");
      expect(config).toContain("output: ./src/db/");
      expect(existsSync("src/db")).toBe(true);
    });

    it("adds trailing slash if missing", async () => {
      await initProject({ output: "./custom-output" });

      const config = readFileSync("sqg.yaml", "utf-8");
      expect(config).toContain("output: ./custom-output/");
    });
  });

  describe("force option", () => {
    it("throws error when files exist without --force", async () => {
      writeFileSync("sqg.yaml", "existing content");

      await expect(initProject({})).rejects.toThrow(SqgError);
      await expect(initProject({})).rejects.toThrow("already exists");
    });

    it("throws error when sql file exists without --force", async () => {
      writeFileSync("queries.sql", "existing content");

      await expect(initProject({})).rejects.toThrow(SqgError);
      await expect(initProject({})).rejects.toThrow("already exists");
    });

    it("overwrites existing files with --force", async () => {
      writeFileSync("sqg.yaml", "old content");
      writeFileSync("queries.sql", "old content");

      await initProject({ force: true });

      const config = readFileSync("sqg.yaml", "utf-8");
      expect(config).toContain("engine: sqlite");
      expect(config).not.toContain("old content");
    });
  });

  describe("generated config structure", () => {
    it("includes all required fields", async () => {
      await initProject({});

      const config = readFileSync("sqg.yaml", "utf-8");
      expect(config).toContain("version: 1");
      expect(config).toContain("name: my-project");
      expect(config).toContain("sql:");
      expect(config).toContain("files:");
      expect(config).toContain("- queries.sql");
      expect(config).toContain("gen:");
    });

    it("includes package config for Java generators", async () => {
      await initProject({ generator: "java/jdbc" });

      const config = readFileSync("sqg.yaml", "utf-8");
      expect(config).toContain("config:");
      expect(config).toContain("package: generated");
    });

    it("does not include package config for TypeScript generators", async () => {
      await initProject({ generator: "typescript/better-sqlite3" });

      const config = readFileSync("sqg.yaml", "utf-8");
      expect(config).not.toContain("config:");
      expect(config).not.toContain("package:");
    });
  });

  describe("generated SQL structure", () => {
    it("includes migrations, testdata, queries, and exec statements", async () => {
      await initProject({});

      const sql = readFileSync("queries.sql", "utf-8");
      expect(sql).toContain("-- MIGRATE 1");
      expect(sql).toContain("-- MIGRATE 2");
      expect(sql).toContain("-- TESTDATA");
      expect(sql).toContain("-- QUERY");
      expect(sql).toContain("-- EXEC");
      expect(sql).toContain("@set");
      expect(sql).toContain("${");
    });

    it("includes documentation link in first migration", async () => {
      await initProject({});

      const sql = readFileSync("queries.sql", "utf-8");
      expect(sql).toContain("sqg.dev");
    });

    it("uses appropriate syntax for each engine", async () => {
      // Test SQLite syntax
      await initProject({ engine: "sqlite" });
      let sql = readFileSync("queries.sql", "utf-8");
      expect(sql).toContain("AUTOINCREMENT");
      expect(sql).toContain("TEXT");

      // Clean up
      rmSync("sqg.yaml");
      rmSync("queries.sql");

      // Test DuckDB syntax
      await initProject({ engine: "duckdb", force: true });
      sql = readFileSync("queries.sql", "utf-8");
      expect(sql).toContain("VARCHAR");
      expect(sql).toContain("STRUCT");
      expect(sql).toContain("VARCHAR[]");

      // Clean up
      rmSync("sqg.yaml");
      rmSync("queries.sql");

      // Test PostgreSQL syntax
      await initProject({ engine: "postgres", force: true });
      sql = readFileSync("queries.sql", "utf-8");
      expect(sql).toContain("SERIAL PRIMARY KEY");
      expect(sql).toContain("BOOLEAN");
    });
  });

  describe("end-to-end: init + generate", () => {
    it("generates valid TypeScript code for sqlite project", async () => {
      await initProject({ engine: "sqlite", generator: "typescript/better-sqlite3" });

      // Run the code generator on the initialized project
      const generatedFiles = await processProject("sqg.yaml");

      expect(generatedFiles.length).toBe(1);
      expect(generatedFiles[0]).toContain("queries.ts");
      expect(existsSync(generatedFiles[0])).toBe(true);

      // Verify generated code structure
      const generatedCode = readFileSync(generatedFiles[0], "utf-8");
      expect(generatedCode).toContain("export class Queries");
      expect(generatedCode).toContain("listUsers");
      expect(generatedCode).toContain("getUserById");
      expect(generatedCode).toContain("createUser");
      expect(generatedCode).toContain("getMigrations");
    });

    it("generates valid TypeScript code for duckdb project", async () => {
      await initProject({ engine: "duckdb", generator: "typescript/duckdb" });

      const generatedFiles = await processProject("sqg.yaml");

      expect(generatedFiles.length).toBe(1);
      expect(generatedFiles[0]).toContain("queries.ts");
      expect(existsSync(generatedFiles[0])).toBe(true);

      // Verify generated code structure
      const generatedCode = readFileSync(generatedFiles[0], "utf-8");
      expect(generatedCode).toContain("export class Queries");
      expect(generatedCode).toContain("async"); // DuckDB uses async API
      expect(generatedCode).toContain("listUsers");
      expect(generatedCode).toContain("getUserById");
    });

    it("generates valid Java code for sqlite project", async () => {
      await initProject({ engine: "sqlite", generator: "java/jdbc" });

      const generatedFiles = await processProject("sqg.yaml");

      expect(generatedFiles.length).toBe(1);
      expect(generatedFiles[0]).toContain("Queries.java");
      expect(existsSync(generatedFiles[0])).toBe(true);

      // Verify generated code structure
      const generatedCode = readFileSync(generatedFiles[0], "utf-8");
      expect(generatedCode).toContain("public class Queries");
      expect(generatedCode).toContain("package generated");
      expect(generatedCode).toContain("listUsers");
      expect(generatedCode).toContain("getUserById");
      expect(generatedCode).toContain("createUser");
      expect(generatedCode).toContain("getMigrations");
    });

    it("generates valid Java code for duckdb project with jdbc", async () => {
      await initProject({ engine: "duckdb", generator: "java/jdbc" });

      const generatedFiles = await processProject("sqg.yaml");

      expect(generatedFiles.length).toBe(1);
      expect(generatedFiles[0]).toContain("Queries.java");
      expect(existsSync(generatedFiles[0])).toBe(true);

      const generatedCode = readFileSync(generatedFiles[0], "utf-8");
      expect(generatedCode).toContain("public class Queries");
    });

    it("generates valid Java code for duckdb project with arrow", async () => {
      await initProject({ engine: "duckdb", generator: "java/duckdb-arrow" });

      const generatedFiles = await processProject("sqg.yaml");

      expect(generatedFiles.length).toBe(1);
      expect(generatedFiles[0]).toContain("Queries.java");
      expect(existsSync(generatedFiles[0])).toBe(true);

      const generatedCode = readFileSync(generatedFiles[0], "utf-8");
      expect(generatedCode).toContain("public class Queries");
    });
  });
});
