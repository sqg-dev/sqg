import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Startup cost is the whole cost of a run that generates nothing (`--if-stale`
 * over an unchanged project). These packages are expensive to import and are
 * needed only once real work starts, so they must stay out of the module graph
 * the CLI loads eagerly — a stray top-level import puts ~0.5s back on every
 * invocation without failing a single functional test.
 */
const DEFERRED = [
  "prettier",
  "prettier-plugin-java",
  "@testcontainers/postgresql",
  "pg",
  "@duckdb/node-api",
  "better-sqlite3",
  "@modelcontextprotocol/sdk",
  "update-notifier",
  "@clack/prompts",
];

/** Static `import`/`export ... from` specifiers, ignoring erased type-only ones. */
function staticImports(file: string): string[] {
  const source = readFileSync(file, "utf-8");
  const specifiers: string[] = [];
  const fromClause = /(?:^|\n)\s*(?:import|export)\s+(?!type\s)([^;]*?)\s*from\s*["']([^"']+)["']/g;
  for (const match of source.matchAll(fromClause)) {
    specifiers.push(match[2]);
  }
  const bare = /(?:^|\n)\s*import\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(bare)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

/** Every module reachable from an entry point through static imports. */
function staticGraph(entry: string): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  const queue = [resolve(entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (graph.has(file)) continue;
    const specifiers = staticImports(file);
    graph.set(file, specifiers);
    for (const specifier of specifiers) {
      if (!specifier.startsWith(".")) continue;
      const resolved = resolve(dirname(file), specifier.replace(/\.js$/, ".ts"));
      if (existsSync(resolved)) queue.push(resolved);
    }
  }
  return graph;
}

describe("CLI startup", () => {
  it("keeps the expensive dependencies out of the eagerly loaded graph", () => {
    const graph = staticGraph("src/sqg.ts");

    const offenders: string[] = [];
    for (const [file, specifiers] of graph) {
      for (const specifier of specifiers) {
        const pkg = DEFERRED.find((p) => specifier === p || specifier.startsWith(`${p}/`));
        if (pkg) {
          offenders.push(`${relative(process.cwd(), file)} imports ${specifier}`);
        }
      }
    }

    // Load these with `await import()` at the point of use instead.
    expect(offenders).toEqual([]);
  });

  it("walks far enough to be meaningful", () => {
    const graph = staticGraph("src/sqg.ts");
    const files = [...graph.keys()].map((file) => relative(process.cwd(), file));

    // Guards the guard: if resolution silently broke, the check above would
    // pass vacuously.
    expect(files).toContain(join("src", "sqltool.ts"));
    expect(files).toContain(join("src", "cache.ts"));
    expect(files).toContain(join("src", "generators", "java-generator.ts"));
    expect(graph.size).toBeGreaterThan(10);
  });
});
