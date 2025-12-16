import { describe, it, expect, beforeEach } from "vitest";
import { processProject } from "../src/sqltool";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

export async function handleProject(projectPath: string, expectedFiles: string[]) {
  const files = await processProject(projectPath);
  expect(files.map(file => basename(file))).toEqual(expectedFiles);
  for (const file of files) {
    const fileContent = readFileSync(file, "utf-8");
    const snapshotFile = `./__snapshots__/${basename(file)}.snapshot`;
    await expect(fileContent).toMatchFileSnapshot(snapshotFile);
  }
  return files;
}

describe("sqg", () => {
  beforeEach(() => {
    //generator = new JavaGenerator('test-template');
  });

  describe("processProject", () => {
    it("handle duckdb correctly", async () => {
      await handleProject("tests/test-duckdb.yaml", ["TestDuckdb.java", "test-duckdb.ts"]);
    });
    it("handle duckdb-arrow correctly", async () => {
      await handleProject("tests/test-duckdb-arrow.yaml", ["TestDuckDbArrow.java"]);
    });
   
   
    it("handle sources correctly", async () => {
      await handleProject("tests/test-sources.yaml", ["TestSources.java"]);
    });
  });


  describe("processProjectSqlite", () => {
    it("handle sqlite correctly", async () => {
      await handleProject("tests/test-sqlite.yaml", ["test-sqlite.ts", "TestSqlite.java"]);
    });
  });
});
