import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initializeDatabase } from "../src/db/types";
import { parseSQLQueries, type SQLQuery } from "../src/sql-query";

function parseSQL(content: string) {
  const tmpPath = join(
    tmpdir(),
    `sqg-baseline-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`,
  );
  writeFileSync(tmpPath, content);
  try {
    return parseSQLQueries(tmpPath, []);
  } finally {
    unlinkSync(tmpPath);
  }
}

describe("BASELINE annotation parsing", () => {
  it("parses BASELINE blocks and marks them as baseline (not migration/testdata)", () => {
    const result = parseSQL(`-- BASELINE schema
create table clusters(id integer primary key);

-- MIGRATE 1
alter table clusters add column extra text;
`);
    expect(result.queries.map((q) => [q.id, q.type])).toEqual([
      ["schema", "BASELINE"],
      ["1", "MIGRATE"],
    ]);

    const baseline = result.queries[0];
    expect(baseline.isBaseline).toBe(true);
    expect(baseline.isMigrate).toBe(false);
    expect(baseline.isTestdata).toBe(false);
    expect(baseline.skipGenerateFunction).toBe(true);
  });

  it("allows BASELINE, MIGRATE, and TESTDATA to share the same name", () => {
    // B1 + B2 interaction: each annotation kind has its own name namespace.
    const result = parseSQL(`-- BASELINE 1
create table foo(id integer);

-- MIGRATE 1
alter table foo add column bar text;

-- TESTDATA 1
insert into foo(id, bar) values (1, 'a');
`);
    expect(result.queries.map((q) => [q.id, q.type])).toEqual([
      ["1", "BASELINE"],
      ["1", "MIGRATE"],
      ["1", "TESTDATA"],
    ]);
  });

  it("still rejects duplicate names within the BASELINE namespace", () => {
    expect(() =>
      parseSQL(`-- BASELINE schema
create table foo(id integer);

-- BASELINE schema
create table bar(id integer);
`),
    ).toThrow(/Duplicate BASELINE name 'schema'/);
  });
});

describe("BASELINE database initialization order", () => {
  it("runs BASELINE blocks before MIGRATE blocks", async () => {
    // The point under test is the BASELINE/MIGRATE/TESTDATA *grouping order*.
    // Within MIGRATE, source order is preserved (numeric sort across MIGRATEs is
    // a separate concern outside the scope of B2).
    const result = parseSQL(`-- TESTDATA seed
insert into clusters(id, a, b) values (1, 'a', 'b');

-- MIGRATE 1
alter table clusters add column a text;

-- BASELINE schema
create table clusters(id integer primary key);

-- MIGRATE 2
alter table clusters add column b text;
`);

    const order: Array<{ type: string; id: string }> = [];
    await initializeDatabase(result.queries, async (q: SQLQuery) => {
      order.push({ type: q.type, id: q.id });
    });

    expect(order).toEqual([
      { type: "BASELINE", id: "schema" },
      { type: "MIGRATE", id: "1" },
      { type: "MIGRATE", id: "2" },
      { type: "TESTDATA", id: "seed" },
    ]);
  });

  it("works when MIGRATE depends on schema declared in BASELINE (B2 repro)", async () => {
    // The original B2 reproduction: external schema in BASELINE, additive change
    // in MIGRATE. Without the fix, MIGRATE ran first and the ALTER hit "no such table".
    const Database = (await import("better-sqlite3")).default;
    const db = new Database(":memory:");

    const result = parseSQL(`-- BASELINE schema
create table clusters(id integer primary key);

-- MIGRATE 1
alter table clusters add column extra text;
`);

    await initializeDatabase(result.queries, async (q: SQLQuery) => {
      db.exec(q.rawQuery);
    });

    const cols = db.prepare("PRAGMA table_info(clusters)").all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name).sort()).toEqual(["extra", "id"]);
    db.close();
  });

  it("does not include BASELINE in the generated migration array", async () => {
    // BASELINE schema is owned externally — the generated app must not try to
    // re-apply it via getMigrations().
    const { processProject } = await import("../src/sqltool");
    const { readFileSync, writeFileSync, mkdirSync, rmSync } = await import("node:fs");

    const dir = join(tmpdir(), `sqg-baseline-gen-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(dir, { recursive: true });
    const sqlPath = join(dir, "schema.sql");
    const yamlPath = join(dir, "sqg.yaml");
    writeFileSync(
      sqlPath,
      `-- BASELINE base
create table clusters(id integer primary key);

-- MIGRATE 1
alter table clusters add column extra text;

-- QUERY getOne :one
@set id = 1
select id, extra from clusters where id = \${id}
`,
    );
    writeFileSync(
      yamlPath,
      `version: 1
name: baseline-test
sql:
  - files: [schema.sql]
    gen:
      - generator: typescript/sqlite
        output: ./generated/
`,
    );

    try {
      const files = await processProject(yamlPath);
      expect(files).toHaveLength(1);
      const generated = readFileSync(files[0], "utf-8");

      // The CREATE TABLE in BASELINE must NOT appear in the migration array.
      expect(generated).not.toMatch(/create table clusters/i);
      // The MIGRATE alter must still appear.
      expect(generated).toMatch(/alter table clusters add column extra text/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
