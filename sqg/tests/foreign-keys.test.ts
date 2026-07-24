import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { processProject } from "../src/sqltool";

// Introspection executes every EXEC against a database with no data, so a
// NOT NULL foreign key cannot be satisfied — the parent row does not exist and
// statements do not share a transaction. Generation must not fail over it.
// https://github.com/sqg-dev/sqg/issues/10
describe("foreign keys during introspection", () => {
  it("generates for sqlite despite an unsatisfiable foreign key", async () => {
    const files = await processProject("tests/test-fk-sqlite.yaml");
    expect(files).toHaveLength(1);
    const generated = readFileSync(files[0], "utf-8");
    expect(generated).toContain("insertPost");
    expect(generated).toContain("limit ?");
  });

  it("generates for duckdb despite an unsatisfiable foreign key", async () => {
    const files = await processProject("tests/test-fk-duckdb.yaml");
    expect(files).toHaveLength(1);
    expect(readFileSync(files[0], "utf-8")).toContain("insertPost");
  });

  // Relaxing the constraints must not reach the fixtures: TESTDATA describes
  // real data, so a foreign key it violates is a mistake worth reporting.
  it("still rejects a foreign key violation in TESTDATA", async () => {
    await expect(processProject("tests/test-fk-testdata.yaml")).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });
});
