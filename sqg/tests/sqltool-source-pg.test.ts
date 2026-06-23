import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { processProject } from "../src/sqltool";

// Exercises a `type: postgres` source: SQG starts a throwaway postgres
// testcontainer, applies the :source=prod BASELINE schema natively, attaches it
// into DuckDB, and introspects against it. Requires Docker.
describe("sqg postgres source", () => {
  it("introspects against an attached postgres source and omits it from output", async () => {
    const files = await processProject("tests/test-postgres-source.yaml");
    expect(files.map((f) => basename(f))).toEqual([
      "test-postgres-source.ts",
      "TestPostgresSource.java",
      "test_postgres_source.py",
    ]);

    for (const file of files) {
      const generated = readFileSync(file, "utf-8");
      await expect(generated).toMatchFileSnapshot(`./__snapshots__/${basename(file)}.snapshot`);

      // A runtime ATTACH helper is generated for the source, under the same alias.
      expect(generated).toMatch(/AS prod \(TYPE postgres\)/);
      // But the generation-time container DSN and source schema must NOT leak in.
      expect(generated).not.toMatch(/postgresql:\/\//);
      expect(generated).not.toMatch(/create table orders/i);
      // The query SQL references the attached catalog verbatim, with PG types.
      expect(generated).toMatch(/prod\.public\.orders/);
    }
  }, 90_000);

  it("scopes the attach helper to only the sql blocks that reference the source", async () => {
    const files = await processProject("tests/test-postgres-source-scoped.yaml");
    const byName = new Map(files.map((f) => [basename(f), readFileSync(f, "utf-8")]));

    // The block whose SQL references prod gets the attach helper.
    const uses = byName.get("test-postgres-source.ts")!;
    expect(uses).toMatch(/attachProd/);

    // The unrelated block must stay byte-identical to a no-sources project: no
    // attach helper, no leaked DSN. This is the core of Issue 1 — adding a
    // source for one block must not change another block's generated code.
    const unrelated = byName.get("test-no-source.ts")!;
    expect(unrelated).not.toMatch(/attachProd/i);
    expect(unrelated).not.toMatch(/TYPE postgres/);
    expect(unrelated).not.toMatch(/postgresql:\/\//);
  }, 90_000);

  it("errors when a postgres source has no DuckDB generator", async () => {
    await expect(processProject("tests/test-postgres-source-bad.yaml")).rejects.toThrow(
      /Postgres sources require a DuckDB generator/,
    );
  }, 30_000);
});
