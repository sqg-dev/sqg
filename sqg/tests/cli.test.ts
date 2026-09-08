import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const exec = promisify(execFile);

const SQL = `-- MIGRATE 1
create table users (id text primary key) strict;

-- QUERY allUsers
select * from users;
`;

const dirs: string[] = [];

function makeProject(name: string, yaml?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "sqg-cli-"));
  dirs.push(dir);
  mkdirSync(join(dir, "gen"), { recursive: true });
  writeFileSync(join(dir, "q.sql"), SQL);
  writeFileSync(
    join(dir, "sqg.yaml"),
    yaml ??
      `version: 1
name: ${name}
sql:
  - files:
      - q.sql
    gen:
      - generator: typescript/sqlite
        output: ./gen/
`,
  );
  return join(dir, "sqg.yaml");
}

/** Run the real CLI the way a build script would. */
async function sqg(args: string[]) {
  try {
    const { stdout } = await exec("./node_modules/.bin/tsx", ["src/sqg.ts", ...args]);
    return { code: 0, json: JSON.parse(stdout) };
  } catch (e) {
    const err = e as { code?: number; stdout?: string };
    return { code: err.code ?? 1, json: err.stdout ? JSON.parse(err.stdout) : undefined };
  }
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("CLI", () => {
  it("processes several projects in one run and reports each", async () => {
    const a = makeProject("cli-a");
    const b = makeProject("cli-b");

    const first = await sqg(["--if-stale", "--format", "json", a, b]);
    expect(first.code).toBe(0);
    expect(first.json.status).toBe("success");
    expect(first.json.projects).toHaveLength(2);
    expect(first.json.projects.map((p: { status: string }) => p.status)).toEqual([
      "success",
      "success",
    ]);

    const second = await sqg(["--if-stale", "--format", "json", a, b]);
    expect(second.json.status).toBe("up-to-date");
    expect(second.json.projects.map((p: { status: string }) => p.status)).toEqual([
      "up-to-date",
      "up-to-date",
    ]);

    // One stale project among skipped ones makes the whole run a "success".
    writeFileSync(join(a, "..", "q.sql"), `${SQL}\n-- QUERY ping :one :pluck\nselect 1;\n`);
    const third = await sqg(["--if-stale", "--format", "json", a, b]);
    expect(third.json.status).toBe("success");
    expect(third.json.projects.map((p: { status: string }) => p.status)).toEqual([
      "success",
      "up-to-date",
    ]);
  }, 120_000);

  it("keeps the single-project JSON shape unchanged", async () => {
    const a = makeProject("cli-single");

    const result = await sqg(["--format", "json", a]);
    expect(result.code).toBe(0);
    expect(result.json).toEqual({
      status: "success",
      generatedFiles: [expect.stringContaining("q.ts")],
    });
    expect(result.json.projects).toBeUndefined();
  }, 60_000);

  it("fails the run when any project in a batch is invalid", async () => {
    const good = makeProject("cli-good");
    const bad = makeProject("cli-bad", "version: 1\nname: cli-bad\nsql: []\n");

    const result = await sqg(["--validate", "--format", "json", good, bad]);
    expect(result.code).toBe(1);
    expect(result.json).toHaveLength(2);
    expect(result.json[0].valid).toBe(true);
    expect(result.json[1].valid).toBe(false);
  }, 60_000);
});
