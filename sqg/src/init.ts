/**
 * SQG Project Initialization - Creates new SQG projects with example files
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import consola from "consola";
import {
  DB_ENGINES,
  SUPPORTED_GENERATORS,
  type DbEngine,
  type SupportedGenerator,
  findSimilarGenerators,
} from "./constants.js";
import { InvalidEngineError, InvalidGeneratorError, SqgError } from "./errors.js";

export interface InitOptions {
  engine?: string;
  generator?: string;
  output?: string;
  force?: boolean;
}

/**
 * Get the default generator for an engine
 */
function getDefaultGenerator(engine: DbEngine): SupportedGenerator {
  const defaults: Record<DbEngine, SupportedGenerator> = {
    sqlite: "typescript/better-sqlite3",
    duckdb: "typescript/duckdb",
    postgres: "java/jdbc",
  };
  return defaults[engine];
}

/**
 * Generate example SQL content based on engine
 */
function getExampleSql(engine: DbEngine): string {
  // Note: File must start with a valid query block (MIGRATE, QUERY, EXEC, or TESTDATA)
  // Regular comments at the start of the file will cause parsing errors

  const migrations: Record<DbEngine, string> = {
    sqlite: `-- MIGRATE 1
-- Create the users table (SQG Example - https://sqg.dev/guides/sql-syntax/)
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- MIGRATE 2
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  content TEXT,
  published INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- TESTDATA seed_data
INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com');
INSERT INTO users (name, email) VALUES ('Bob', 'bob@example.com');
INSERT INTO posts (user_id, title, content, published) VALUES (1, 'Hello World', 'My first post!', 1);
`,

    duckdb: `-- MIGRATE 1
-- Create the users table (SQG Example - https://sqg.dev/guides/sql-syntax/)
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name VARCHAR NOT NULL,
  email VARCHAR UNIQUE NOT NULL,
  metadata STRUCT(role VARCHAR, active BOOLEAN),
  tags VARCHAR[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MIGRATE 2
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title VARCHAR NOT NULL,
  content VARCHAR,
  published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TESTDATA seed_data
INSERT INTO users (id, name, email, metadata, tags)
VALUES (1, 'Alice', 'alice@example.com', {'role': 'admin', 'active': true}, ['developer', 'lead']);
INSERT INTO users (id, name, email, metadata, tags)
VALUES (2, 'Bob', 'bob@example.com', {'role': 'user', 'active': true}, ['developer']);
INSERT INTO posts (id, user_id, title, content, published)
VALUES (1, 1, 'Hello World', 'My first post!', TRUE);
`,

    postgres: `-- MIGRATE 1
-- Create the users table (SQG Example - https://sqg.dev/guides/sql-syntax/)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MIGRATE 2
CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  content TEXT,
  published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TESTDATA seed_data
INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com');
INSERT INTO users (name, email) VALUES ('Bob', 'bob@example.com');
INSERT INTO posts (user_id, title, content, published) VALUES (1, 'Hello World', 'My first post!', TRUE);
`,
  };

  const selectQueries = `
-- QUERY list_users
SELECT id, name, email, created_at
FROM users
ORDER BY created_at DESC;

-- QUERY get_user_by_id :one
@set id = 1
SELECT id, name, email, created_at
FROM users
WHERE id = \${id};

-- QUERY get_user_by_email :one
@set email = 'alice@example.com'
SELECT id, name, email, created_at
FROM users
WHERE email = \${email};

-- QUERY count_users :one :pluck
SELECT COUNT(*) FROM users;

-- QUERY list_posts_by_user
@set user_id = 1
SELECT p.id, p.title, p.content, p.published, p.created_at
FROM posts p
WHERE p.user_id = \${user_id}
ORDER BY p.created_at DESC;

-- QUERY list_published_posts
SELECT
  p.id,
  p.title,
  p.content,
  p.created_at,
  u.name as author_name,
  u.email as author_email
FROM posts p
JOIN users u ON p.user_id = u.id
WHERE p.published = 1
ORDER BY p.created_at DESC;
`;

  // DuckDB requires explicit id values since it doesn't have AUTOINCREMENT
  const execQueries: Record<DbEngine, string> = {
    sqlite: `
-- EXEC create_user
@set name = 'New User'
@set email = 'new@example.com'
INSERT INTO users (name, email)
VALUES (\${name}, \${email});

-- EXEC create_post
@set user_id = 1
@set title = 'New Post'
@set content = 'Post content here'
INSERT INTO posts (user_id, title, content)
VALUES (\${user_id}, \${title}, \${content});

-- EXEC publish_post
@set id = 1
UPDATE posts SET published = 1 WHERE id = \${id};

-- EXEC delete_post
@set id = 1
DELETE FROM posts WHERE id = \${id};
`,
    duckdb: `
-- EXEC create_user
@set id = 100
@set name = 'New User'
@set email = 'new@example.com'
INSERT INTO users (id, name, email)
VALUES (\${id}, \${name}, \${email});

-- EXEC create_post
@set id = 100
@set user_id = 1
@set title = 'New Post'
@set content = 'Post content here'
INSERT INTO posts (id, user_id, title, content)
VALUES (\${id}, \${user_id}, \${title}, \${content});

-- EXEC publish_post
@set id = 1
UPDATE posts SET published = TRUE WHERE id = \${id};

-- EXEC delete_post
@set id = 1
DELETE FROM posts WHERE id = \${id};
`,
    postgres: `
-- EXEC create_user
@set name = 'New User'
@set email = 'new@example.com'
INSERT INTO users (name, email)
VALUES (\${name}, \${email});

-- EXEC create_post
@set user_id = 1
@set title = 'New Post'
@set content = 'Post content here'
INSERT INTO posts (user_id, title, content)
VALUES (\${user_id}, \${title}, \${content});

-- EXEC publish_post
@set id = 1
UPDATE posts SET published = TRUE WHERE id = \${id};

-- EXEC delete_post
@set id = 1
DELETE FROM posts WHERE id = \${id};
`,
  };

  return migrations[engine] + selectQueries + execQueries[engine];
}

/**
 * Generate sqg.yaml configuration
 */
function getConfigYaml(engine: DbEngine, generator: SupportedGenerator, output: string): string {
  const generatorInfo = SUPPORTED_GENERATORS[generator];
  const config: Record<string, unknown> = {
    version: 1,
    name: "my-project",
    sql: [
      {
        engine,
        files: ["queries.sql"],
        gen: [
          {
            generator,
            output: output.endsWith("/") ? output : `${output}/`,
          },
        ],
      },
    ],
  };

  // Add package config for Java generators
  if (generator.startsWith("java/")) {
    (config.sql as any[])[0].gen[0].config = {
      package: "generated",
    };
  }

  // Convert to YAML manually for clean formatting
  return `# SQG Configuration
# Generated by: sqg init
# Documentation: https://sqg.dev

version: 1
name: my-project

sql:
  - engine: ${engine}
    files:
      - queries.sql
    gen:
      - generator: ${generator}
        output: ${output.endsWith("/") ? output : `${output}/`}${
          generator.startsWith("java/")
            ? `
        config:
          package: generated`
            : ""
        }
`;
}

/**
 * Initialize a new SQG project
 */
export async function initProject(options: InitOptions): Promise<void> {
  const engine = (options.engine || "sqlite") as DbEngine;
  const output = options.output || "./generated";

  // Validate engine
  if (!DB_ENGINES.includes(engine as DbEngine)) {
    throw new InvalidEngineError(engine, [...DB_ENGINES]);
  }

  // Determine generator
  let generator: SupportedGenerator;
  if (options.generator) {
    if (!(options.generator in SUPPORTED_GENERATORS)) {
      const similar = findSimilarGenerators(options.generator);
      throw new InvalidGeneratorError(
        options.generator,
        Object.keys(SUPPORTED_GENERATORS),
        similar.length > 0 ? similar[0] : undefined,
      );
    }
    generator = options.generator as SupportedGenerator;

    // Validate generator/engine compatibility
    const generatorInfo = SUPPORTED_GENERATORS[generator];
    if (!(generatorInfo.compatibleEngines as readonly string[]).includes(engine)) {
      throw new SqgError(
        `Generator '${generator}' is not compatible with engine '${engine}'`,
        "GENERATOR_ENGINE_MISMATCH",
        `For '${engine}', use one of: ${Object.entries(SUPPORTED_GENERATORS)
          .filter(([_, info]) => (info.compatibleEngines as readonly string[]).includes(engine))
          .map(([name]) => name)
          .join(", ")}`,
      );
    }
  } else {
    generator = getDefaultGenerator(engine);
  }

  // Check if files already exist
  const configPath = "sqg.yaml";
  const sqlPath = "queries.sql";

  if (!options.force) {
    if (existsSync(configPath)) {
      throw new SqgError(
        `File already exists: ${configPath}`,
        "VALIDATION_ERROR",
        "Use --force to overwrite existing files",
      );
    }
    if (existsSync(sqlPath)) {
      throw new SqgError(
        `File already exists: ${sqlPath}`,
        "VALIDATION_ERROR",
        "Use --force to overwrite existing files",
      );
    }
  }

  // Create output directory if needed
  if (!existsSync(output)) {
    mkdirSync(output, { recursive: true });
    consola.success(`Created output directory: ${output}`);
  }

  // Write configuration file
  const configContent = getConfigYaml(engine, generator, output);
  writeFileSync(configPath, configContent);
  consola.success(`Created ${configPath}`);

  // Write example SQL file
  const sqlContent = getExampleSql(engine);
  writeFileSync(sqlPath, sqlContent);
  consola.success(`Created ${sqlPath}`);

  // Print next steps
  consola.box(`
SQG project initialized!

Engine:    ${engine}
Generator: ${generator}
Output:    ${output}

Next steps:
  1. Edit queries.sql to add your SQL queries
  2. Run: sqg sqg.yaml
  3. Import the generated code from ${output}

Documentation: https://sqg.dev
  `);
}
