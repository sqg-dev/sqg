import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CACHE_FILE, cacheBlocker, computeFingerprint } from "../src/cache";
import { parseProjectConfig, processProject, processProjectFromConfig } from "../src/sqltool";
import { UI } from "../src/ui";

const SQL = `-- MIGRATE 1
create table users (
  id text primary key,
  name text not null
) strict;

-- QUERY allUsers
select * from users;
`;

const YAML = `version: 1
name: cache-test
sql:
  - files:
      - cache-test.sql
    gen:
      - generator: typescript/sqlite
        output: ./gen/
`;

const dirs: string[] = [];

/** A throwaway sqlite project on disk. */
function makeProject(yaml = YAML, sql = SQL): { dir: string; config: string } {
  const dir = mkdtempSync(join(tmpdir(), "sqg-cache-"));
  dirs.push(dir);
  writeFileSync(join(dir, "sqg.yaml"), yaml);
  writeFileSync(join(dir, "cache-test.sql"), sql);
  return { dir, config: join(dir, "sqg.yaml") };
}

/** Generate, reporting whether the run was skipped as up to date. */
async function generate(config: string, ifStale = true) {
  const ui = new UI({ format: "json" });
  const files = await processProject(config, ui, { ifStale });
  return { files, upToDate: ui.wasUpToDate };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("--if-stale", () => {
  it("generates once, then skips while nothing changes", async () => {
    const { dir, config } = makeProject();

    const first = await generate(config);
    expect(first.upToDate).toBe(false);
    expect(first.files).toHaveLength(1);
    expect(existsSync(join(dir, CACHE_FILE))).toBe(true);
    const written = statSync(first.files[0]).mtimeMs;

    const second = await generate(config);
    expect(second.upToDate).toBe(true);
    expect(second.files).toEqual(first.files);
    // Skipped means skipped: the output was not rewritten.
    expect(statSync(second.files[0]).mtimeMs).toBe(written);
  });

  it("regenerates when a SQL file changes", async () => {
    const { dir, config } = makeProject();
    await generate(config);

    writeFileSync(
      join(dir, "cache-test.sql"),
      `${SQL}\n-- QUERY oneUser :one\nselect * from users;\n`,
    );

    const run = await generate(config);
    expect(run.upToDate).toBe(false);
    expect(readFileSync(run.files[0], "utf-8")).toContain("oneUser");
  });

  it("regenerates when the config changes", async () => {
    const { dir, config } = makeProject();
    await generate(config);

    writeFileSync(join(dir, "sqg.yaml"), YAML.replace("cache-test", "renamed-test"));

    expect((await generate(config)).upToDate).toBe(false);
  });

  it("ignores YAML reformatting that does not change the config", async () => {
    const { dir, config } = makeProject();
    await generate(config);

    writeFileSync(join(dir, "sqg.yaml"), `${YAML.replace("version: 1", "version: 1\n\n")}\n`);

    expect((await generate(config)).upToDate).toBe(true);
  });

  it("regenerates when a generated file was edited or deleted", async () => {
    const { config } = makeProject();
    const first = await generate(config);

    writeFileSync(first.files[0], "// hand-edited\n");
    expect((await generate(config)).upToDate).toBe(false);
    expect(readFileSync(first.files[0], "utf-8")).not.toContain("hand-edited");

    rmSync(first.files[0]);
    expect((await generate(config)).upToDate).toBe(false);
    expect(existsSync(first.files[0])).toBe(true);
  });

  it("regenerates when the sqg version changes", async () => {
    const { dir, config } = makeProject();
    await generate(config);

    const stamp = JSON.parse(readFileSync(join(dir, CACHE_FILE), "utf-8"));
    stamp.fingerprint.sqg = "0.0.1-old";
    writeFileSync(join(dir, CACHE_FILE), JSON.stringify(stamp));

    expect((await generate(config)).upToDate).toBe(false);
  });

  it("ignores an unreadable or foreign stamp instead of failing", async () => {
    const { dir, config } = makeProject();
    await generate(config);

    writeFileSync(join(dir, CACHE_FILE), "{ not json");
    expect((await generate(config)).upToDate).toBe(false);

    writeFileSync(join(dir, CACHE_FILE), JSON.stringify({ format: 99 }));
    expect((await generate(config)).upToDate).toBe(false);
  });

  it("covers every output, including aux files and paths outside the project dir", async () => {
    // The shape the monorepo projects actually have: several SQL files, several
    // generators, an output tree above the project dir, and a generator that
    // emits a shared support file alongside the main one.
    const dir = mkdtempSync(join(tmpdir(), "sqg-cache-"));
    dirs.push(dir);
    const projectDir = join(dir, "project");
    mkdirSync(projectDir);
    writeFileSync(join(projectDir, "a.sql"), SQL);
    writeFileSync(join(projectDir, "b.sql"), SQL.replaceAll("users", "accounts"));
    writeFileSync(
      join(projectDir, "sqg.yaml"),
      `version: 1
name: multi-test
sql:
  - files:
      - a.sql
      - b.sql
    gen:
      - generator: typescript/sqlite
        output: ../out/ts/
      - generator: java/sqlite
        output: ./gen/java/
        config:
          package: com.test
          observer: true
`,
    );
    const config = join(projectDir, "sqg.yaml");

    const first = await generate(config);
    expect(first.upToDate).toBe(false);
    // a.ts, b.ts, A.java, B.java + the shared SqgObserver.java (recorded once).
    expect(first.files).toHaveLength(5);
    for (const file of first.files) {
      expect(existsSync(file)).toBe(true);
    }

    // Outputs above the project dir round-trip through the stamp as "../".
    const stamp = JSON.parse(readFileSync(join(projectDir, CACHE_FILE), "utf-8"));
    expect(Object.keys(stamp.outputs)).toContain(join("..", "out", "ts", "a.ts"));
    expect(Object.keys(stamp.fingerprint.inputs)).toEqual(
      expect.arrayContaining(["a.sql", "b.sql"]),
    );

    expect((await generate(config)).upToDate).toBe(true);

    // The second SQL file counts as an input.
    writeFileSync(
      join(projectDir, "b.sql"),
      `${SQL.replaceAll("users", "accounts")}\n-- QUERY ping :one :pluck\nselect 1;\n`,
    );
    expect((await generate(config)).upToDate).toBe(false);
    expect((await generate(config)).upToDate).toBe(true);

    // So does an output outside the project dir...
    rmSync(join(dir, "out", "ts", "a.ts"));
    expect((await generate(config)).upToDate).toBe(false);
    expect(existsSync(join(dir, "out", "ts", "a.ts"))).toBe(true);

    // ...and the shared aux file, which no SQL file is named after.
    writeFileSync(join(projectDir, "gen", "java", "SqgObserver.java"), "// clobbered\n");
    expect((await generate(config)).upToDate).toBe(false);
    expect(
      readFileSync(join(projectDir, "gen", "java", "SqgObserver.java"), "utf-8"),
    ).not.toContain("clobbered");
  }, 60_000);

  it("writes no stamp when generation fails", async () => {
    const { dir, config } = makeProject();
    writeFileSync(join(dir, "cache-test.sql"), "-- QUERY broken\nselect * from no_such_table;\n");

    await expect(generate(config)).rejects.toThrow();
    // A failed run must not be recorded as a good one, or the next --if-stale
    // would skip over a project that never produced output.
    expect(existsSync(join(dir, CACHE_FILE))).toBe(false);
  });

  it("does not cache when generating to stdout", async () => {
    const { dir, config } = makeProject();
    const project = parseProjectConfig(config);

    // stdout mode writes the generated code to stdout; keep it out of the report.
    const write = process.stdout.write;
    process.stdout.write = (() => true) as typeof write;
    try {
      await processProjectFromConfig(project, dir, true, undefined, { ifStale: true });
    } finally {
      process.stdout.write = write;
    }

    expect(existsSync(join(dir, CACHE_FILE))).toBe(false);
  });

  it("tracks each project separately when several share one process", async () => {
    const a = makeProject();
    const b = makeProject();
    // What `sqg a/sqg.yaml b/sqg.yaml` does: one UI, one process, many projects.
    const ui = new UI({ format: "json", projects: 2 });

    await processProject(a.config, ui, { ifStale: true });
    expect(ui.wasUpToDate).toBe(false);
    await processProject(b.config, ui, { ifStale: true });
    expect(ui.wasUpToDate).toBe(false);

    await processProject(a.config, ui, { ifStale: true });
    expect(ui.wasUpToDate).toBe(true);

    // A stale project after a skipped one must clear the flag again.
    writeFileSync(join(b.dir, "cache-test.sql"), `${SQL}\n-- QUERY ping :one :pluck\nselect 1;\n`);
    await processProject(b.config, ui, { ifStale: true });
    expect(ui.wasUpToDate).toBe(false);
  });

  it("writes no stamp and never skips when the flag is absent", async () => {
    const { dir, config } = makeProject();

    expect((await generate(config, false)).upToDate).toBe(false);
    expect(existsSync(join(dir, CACHE_FILE))).toBe(false);
    expect((await generate(config, false)).upToDate).toBe(false);
  });
});

describe("fingerprint inputs", () => {
  it("tracks file sources by size and mtime, not content", () => {
    const { dir } = makeProject();
    const source = join(dir, "data.parquet");
    writeFileSync(source, "aaaa");

    const project = parseProjectConfig(join(dir, "sqg.yaml"));
    project.sources = [{ path: source }];

    const before = computeFingerprint(project, dir);
    expect(Object.keys(before.sources)).toEqual([source]);

    // A rewrite that changes the size invalidates...
    writeFileSync(source, "aaaaa");
    const resized = computeFingerprint(project, dir).sources[source];
    expect(resized).not.toBe(before.sources[source]);

    // ...as does one that only moves the timestamp.
    const later = new Date(Date.now() + 60_000);
    utimesSync(source, later, later);
    expect(computeFingerprint(project, dir).sources[source]).not.toBe(resized);
  });

  it("keys the template by name, so the install location is not an input", () => {
    const { dir } = makeProject();
    const project = parseProjectConfig(join(dir, "sqg.yaml"));

    const keys = Object.keys(computeFingerprint(project, dir).inputs);
    const template = keys.find((key) => key.startsWith("template:"));
    // Not "template:/home/someone/sqg/dist/templates/...": that would invalidate
    // every project whenever sqg is installed somewhere else.
    expect(template).toBe("template:better-sqlite3.hbs");
  });

  it("fingerprints the running build, not just the version string", () => {
    const { dir } = makeProject();
    const project = parseProjectConfig(join(dir, "sqg.yaml"));
    const fingerprint = computeFingerprint(project, dir);

    // An unreleased build of a released version must not look identical to it.
    expect(fingerprint.build).toMatch(/^[0-9a-f]{16}$/);
    expect(fingerprint.build).not.toBe("<missing>");
    expect(computeFingerprint(project, dir).build).toBe(fingerprint.build);
  });

  it("records a missing input rather than throwing", () => {
    const { dir } = makeProject();
    const project = parseProjectConfig(join(dir, "sqg.yaml"));
    project.sources = [{ path: join(dir, "absent.parquet") }];
    rmSync(join(dir, "cache-test.sql"));

    const fingerprint = computeFingerprint(project, dir);
    expect(fingerprint.inputs["cache-test.sql"]).toBe("<missing>");
    expect(Object.values(fingerprint.sources)).toEqual(["<missing>"]);
  });

  it("hashes the generator template, so a template edit invalidates", () => {
    const { dir } = makeProject();
    const project = parseProjectConfig(join(dir, "sqg.yaml"));

    const keys = Object.keys(computeFingerprint(project, dir).inputs);
    const template = keys.find((key) => key.startsWith("template:"));
    expect(template).toMatch(/^template:.+\.hbs$/);
    // Resolved and read, not just named — a template edit changes this value.
    expect(computeFingerprint(project, dir).inputs[template!]).not.toBe("<missing>");

    // A different generator hashes a different template.
    project.sql[0].gen[0].generator = "python/sqlite";
    const other = Object.keys(computeFingerprint(project, dir).inputs).find((key) =>
      key.startsWith("template:"),
    );
    expect(other).not.toBe(template);
  });

  it("is unaffected by key order in the config", () => {
    const { dir } = makeProject();
    const project = parseProjectConfig(join(dir, "sqg.yaml"));
    const reordered = { ...project, sql: [...project.sql] };

    expect(computeFingerprint(reordered, dir).config).toBe(computeFingerprint(project, dir).config);
  });
});

describe("source paths", () => {
  it("resolves a relative source against the project, from any directory", async () => {
    // bsky's shape: a fixture committed next to the config, referenced by a
    // relative path. Before this resolved against the project dir it only
    // worked when sqg was run from that directory.
    const dir = mkdtempSync(join(tmpdir(), "sqg-cache-"));
    dirs.push(dir);
    execFileSync("duckdb", [
      "-c",
      `COPY (SELECT 1 AS id, 'a' AS name) TO '${join(dir, "gens.parquet")}' (FORMAT PARQUET);`,
    ]);
    writeFileSync(
      join(dir, "q.sql"),
      "-- TESTDATA 1\nCREATE TABLE gens AS SELECT * FROM read_parquet(${sources_gens});\n\n-- QUERY allGens\nselect * from gens;\n",
    );
    writeFileSync(
      join(dir, "sqg.yaml"),
      `version: 1
name: rel-source
sql:
  - files:
      - q.sql
    gen:
      - generator: typescript/duckdb
        output: ./gen/
sources:
  - path: gens.parquet
    name: gens
`,
    );
    expect(process.cwd()).not.toBe(dir);

    const run = await generate(join(dir, "sqg.yaml"));
    expect(run.upToDate).toBe(false);
    const generated = readFileSync(run.files[0], "utf-8");
    expect(generated).toContain("allGens");
    // The resolved absolute path is an introspection detail, never emitted.
    expect(generated).not.toContain(dir);
  }, 60_000);
});

describe("cacheBlocker", () => {
  it("refuses to cache a project introspecting a live postgres database", () => {
    const reason = cacheBlocker({
      version: 1,
      name: "x",
      sql: [],
      sources: [{ type: "postgres", name: "prod", url: "postgresql://host/db" }],
    } as never);
    expect(reason).toMatch(/prod.*live database/);
  });

  it("allows a container-backed postgres source, whose schema is in the SQL", () => {
    const allowed = cacheBlocker({
      version: 1,
      name: "x",
      sql: [],
      sources: [{ type: "postgres", name: "prod" }],
    } as never);
    expect(allowed).toBeUndefined();
  });
});
