/**
 * SQG Constants - Centralized definitions for supported engines and generators
 * This file enables self-documenting CLI help and validation.
 */

/** Supported database engines */
export const DB_ENGINES = ["sqlite", "duckdb", "postgres"] as const;
export type DbEngine = (typeof DB_ENGINES)[number];

/** Supported code generators with their descriptions */
export const SUPPORTED_GENERATORS = {
  "typescript/better-sqlite3": {
    description: "TypeScript with better-sqlite3 driver",
    compatibleEngines: ["sqlite"] as const,
    extension: ".ts",
  },
  "typescript/duckdb": {
    description: "TypeScript with @duckdb/node-api driver",
    compatibleEngines: ["duckdb"] as const,
    extension: ".ts",
  },
  "java/jdbc": {
    description: "Java with JDBC (SQLite, DuckDB, PostgreSQL)",
    compatibleEngines: ["sqlite", "duckdb", "postgres"] as const,
    extension: ".java",
  },
  "java/duckdb-arrow": {
    description: "Java with DuckDB Arrow API",
    compatibleEngines: ["duckdb"] as const,
    extension: ".java",
  },
} as const;

export type SupportedGenerator = keyof typeof SUPPORTED_GENERATORS;

/** List of all generator names for validation */
export const GENERATOR_NAMES = Object.keys(SUPPORTED_GENERATORS) as SupportedGenerator[];

/** SQL annotation syntax reference */
export const SQL_SYNTAX_REFERENCE = `
SQL Annotation Syntax:
  -- QUERY <name> [:one] [:pluck]   Select query (returns rows)
  -- EXEC <name>                    Execute statement (INSERT/UPDATE/DELETE)
  -- MIGRATE <number>               Schema migration (run in order)
  -- TESTDATA <name>                Test data setup (not generated)
  -- TABLE <name> :appender         Table for bulk insert appender (DuckDB only)

  @set <varName> = <value>          Define a variable
  \${varName}                        Reference a variable in SQL

Modifiers:
  :one      Return single row (or null) instead of array
  :pluck    Return single column value (requires exactly 1 column)
  :all      Return all rows (default)
  :appender Generate bulk insert appender for TABLE annotation

Example:
  -- MIGRATE 1
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);

  -- QUERY get_user :one
  @set id = 1
  SELECT * FROM users WHERE id = \${id};

  -- TABLE users :appender
`.trim();

/**
 * Find similar generator names for typo suggestions
 */
export function findSimilarGenerators(input: string): string[] {
  const normalized = input.toLowerCase();
  return GENERATOR_NAMES.filter((name) => {
    const nameLower = name.toLowerCase();
    // Check for partial matches
    if (nameLower.includes(normalized) || normalized.includes(nameLower)) {
      return true;
    }
    // Check for common typos (missing hyphen, wrong separator)
    const variants = [
      normalized.replace("/", "-"),
      normalized.replace("-", "/"),
      normalized.replace("_", "/"),
      normalized.replace("_", "-"),
    ];
    return variants.some((v) => nameLower.includes(v) || v.includes(nameLower));
  });
}

/**
 * Format generators for CLI help output
 */
export function formatGeneratorsHelp(): string {
  return Object.entries(SUPPORTED_GENERATORS)
    .map(([name, info]) => `  ${name.padEnd(28)} ${info.description} (${info.compatibleEngines.join(", ")})`)
    .join("\n");
}

/**
 * Format engines for CLI help output
 */
export function formatEnginesHelp(): string {
  return DB_ENGINES.map((e) => `  ${e}`).join("\n");
}
