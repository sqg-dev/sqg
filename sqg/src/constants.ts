/**
 * SQG Constants - Centralized definitions for supported generators
 *
 * Generator format: <language>/<engine>/<driver>
 * Short format:  <language>/<engine> (uses default driver)
 */

/** Supported database engines */
export const DB_ENGINES = ["sqlite", "duckdb", "postgres"] as const;
export type DbEngine = (typeof DB_ENGINES)[number];

/** Supported languages */
export const LANGUAGES = ["typescript", "java"] as const;
export type Language = (typeof LANGUAGES)[number];

/** Generator information */
export interface GeneratorInfo {
  language: Language;
  engine: DbEngine;
  driver: string;
  description: string;
  extension: ".ts" | ".java";
  template: string;
}

/** All supported generators with their full specification */
export const GENERATORS: Record<string, GeneratorInfo> = {
  "typescript/sqlite/better-sqlite3": {
    language: "typescript",
    engine: "sqlite",
    driver: "better-sqlite3",
    description: "TypeScript with better-sqlite3 driver",
    extension: ".ts",
    template: "better-sqlite3.hbs",
  },
  "typescript/duckdb/node-api": {
    language: "typescript",
    engine: "duckdb",
    driver: "node-api",
    description: "TypeScript with @duckdb/node-api driver",
    extension: ".ts",
    template: "typescript-duckdb.hbs",
  },
  "java/sqlite/jdbc": {
    language: "java",
    engine: "sqlite",
    driver: "jdbc",
    description: "Java with JDBC for SQLite",
    extension: ".java",
    template: "java-jdbc.hbs",
  },
  "java/duckdb/jdbc": {
    language: "java",
    engine: "duckdb",
    driver: "jdbc",
    description: "Java with JDBC for DuckDB",
    extension: ".java",
    template: "java-jdbc.hbs",
  },
  "java/duckdb/arrow": {
    language: "java",
    engine: "duckdb",
    driver: "arrow",
    description: "Java with DuckDB Arrow API",
    extension: ".java",
    template: "java-duckdb-arrow.hbs",
  },
  "java/postgres/jdbc": {
    language: "java",
    engine: "postgres",
    driver: "jdbc",
    description: "Java with JDBC for PostgreSQL",
    extension: ".java",
    template: "java-jdbc.hbs",
  },
} as const;

/** Default drivers for language/engine combinations */
export const DEFAULT_DRIVERS: Record<string, string> = {
  "typescript/sqlite": "better-sqlite3",
  "typescript/duckdb": "node-api",
  "java/sqlite": "jdbc",
  "java/duckdb": "jdbc",
  "java/postgres": "jdbc",
};

/** List of all full generator names */
export const GENERATOR_NAMES = Object.keys(GENERATORS);

/** List of short generator names (language/engine) */
export const SHORT_GENERATOR_NAMES = Object.keys(DEFAULT_DRIVERS);

/**
 * Resolve a generator string to its full form.
 * Accepts both short (language/engine) and full (language/engine/driver) formats.
 */
export function resolveGenerator(generator: string): string {
  // Already a full generator
  if (generator in GENERATORS) {
    return generator;
  }

  // Check if it's a short form
  if (generator in DEFAULT_DRIVERS) {
    const driver = DEFAULT_DRIVERS[generator];
    return `${generator}/${driver}`;
  }

  // Return as-is (validation will catch invalid generators)
  return generator;
}

/**
 * Parse a generator string and return its info.
 * Throws if the generator is invalid.
 */
export function parseGenerator(generator: string): GeneratorInfo {
  const fullGenerator = resolveGenerator(generator);
  const info = GENERATORS[fullGenerator];

  if (!info) {
    throw new Error(`Invalid generator: ${generator}`);
  }

  return info;
}

/**
 * Check if a generator string is valid (either short or full form).
 */
export function isValidGenerator(generator: string): boolean {
  const fullGenerator = resolveGenerator(generator);
  return fullGenerator in GENERATORS;
}

/**
 * Get the database engine for a generator.
 */
export function getGeneratorEngine(generator: string): DbEngine {
  return parseGenerator(generator).engine;
}

/**
 * Get the language for a generator.
 */
export function getGeneratorLanguage(generator: string): Language {
  return parseGenerator(generator).language;
}

/**
 * Find similar generator names for typo suggestions.
 */
export function findSimilarGenerators(input: string): string[] {
  const normalized = input.toLowerCase();
  const allNames = [...GENERATOR_NAMES, ...SHORT_GENERATOR_NAMES];

  return allNames.filter((name) => {
    const nameLower = name.toLowerCase();
    // Check for partial matches
    if (nameLower.includes(normalized) || normalized.includes(nameLower)) {
      return true;
    }
    // Check for common typos (wrong separator)
    const variants = [
      normalized.replace(/\//g, "-"),
      normalized.replace(/-/g, "/"),
      normalized.replace(/_/g, "/"),
      normalized.replace(/_/g, "-"),
    ];
    return variants.some((v) => nameLower.includes(v) || v.includes(nameLower));
  });
}

/**
 * Format generators for CLI help output.
 */
export function formatGeneratorsHelp(): string {
  const lines: string[] = [];

  // Group by short form
  for (const shortName of SHORT_GENERATOR_NAMES) {
    const defaultDriver = DEFAULT_DRIVERS[shortName];
    const fullName = `${shortName}/${defaultDriver}`;
    const info = GENERATORS[fullName];

    lines.push(`  ${shortName.padEnd(24)} ${info.description} (default)`);

    // Show non-default drivers for this language/engine
    for (const [generatorName, generatorInfo] of Object.entries(GENERATORS)) {
      if (generatorName.startsWith(`${shortName}/`) && generatorName !== fullName) {
        lines.push(`  ${generatorName.padEnd(24)} ${generatorInfo.description}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Format a simple list of valid generators.
 */
export function formatGeneratorsList(): string {
  return [...SHORT_GENERATOR_NAMES, ...GENERATOR_NAMES.filter((t) => !SHORT_GENERATOR_NAMES.some((s) => t === `${s}/${DEFAULT_DRIVERS[s]}`))].join(", ");
}

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

