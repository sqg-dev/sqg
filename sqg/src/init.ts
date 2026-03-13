/**
 * SQG Project Initialization - Creates new SQG projects with example files
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import * as clack from "@clack/prompts";
import pc from "picocolors";
import {
  type DbEngine,
  findSimilarGenerators,
  GENERATOR_NAMES,
  GENERATORS,
  isValidGenerator,
  parseGenerator,
  SHORT_GENERATOR_NAMES,
} from "./constants.js";
import { InvalidGeneratorError, SqgError } from "./errors.js";

export interface InitOptions {
  generator?: string;
  output?: string;
  force?: boolean;
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
function getConfigYaml(generator: string, output: string, projectName: string): string {
  const generatorInfo = parseGenerator(generator);
  const isJava = generatorInfo.language === "java";

  // Convert to YAML manually for clean formatting
  return `# SQG Configuration
# Generated by: sqg init
# Documentation: https://sqg.dev

version: 1
name: ${projectName}

sql:
  - files:
      - queries.sql
    gen:
      - generator: ${generator}
        output: ${output.endsWith("/") ? output : `${output}/`}${
          isJava
            ? `
        config:
          package: generated`
            : ""
        }
`;
}

/**
 * Run interactive wizard when no --generator flag is provided
 */
async function runInteractiveInit(options: InitOptions): Promise<void> {
  clack.intro(pc.bold("Create a new SQG project"));

  const projectName = await clack.text({
    message: "Project name",
    placeholder: "my-project",
    defaultValue: "my-project",
    validate: (value) => {
      if (!value?.trim()) return "Project name is required";
    },
  });

  if (clack.isCancel(projectName)) {
    clack.cancel("Operation cancelled");
    process.exit(0);
  }

  // Build generator options grouped by language
  const generatorOptions: { value: string; label: string; hint?: string }[] = [];

  for (const shortName of SHORT_GENERATOR_NAMES) {
    const fullName = `${shortName}/${Object.entries(GENERATORS).find(([k]) => k.startsWith(`${shortName}/`))?.[1]?.driver}`;
    const info = GENERATORS[fullName];
    if (info) {
      generatorOptions.push({
        value: shortName,
        label: shortName,
        hint: info.description,
      });
    }
  }

  const generator = await clack.select({
    message: "Generator",
    options: generatorOptions,
  });

  if (clack.isCancel(generator)) {
    clack.cancel("Operation cancelled");
    process.exit(0);
  }

  const output = await clack.text({
    message: "Output directory",
    placeholder: "./generated",
    defaultValue: options.output || "./generated",
  });

  if (clack.isCancel(output)) {
    clack.cancel("Operation cancelled");
    process.exit(0);
  }

  // Show file preview
  clack.log.step("Files to create:");
  clack.log.message(`  ${pc.dim("sqg.yaml")}      Project configuration`);
  clack.log.message(`  ${pc.dim("queries.sql")}    Example SQL queries`);
  clack.log.message(`  ${pc.dim(`${output}/`)}      Output directory`);

  const confirm = await clack.confirm({
    message: "Create files?",
  });

  if (clack.isCancel(confirm) || !confirm) {
    clack.cancel("Operation cancelled");
    process.exit(0);
  }

  // Perform initialization
  await createProjectFiles({
    generator: generator as string,
    output: output as string,
    force: options.force,
    projectName: projectName as string,
  });

  clack.outro(`Done! Run: ${pc.bold("sqg sqg.yaml")}`);
}

interface CreateFilesOptions {
  generator: string;
  output: string;
  force?: boolean;
  projectName: string;
}

/**
 * Create project files (shared between interactive and non-interactive modes)
 */
async function createProjectFiles(options: CreateFilesOptions): Promise<void> {
  const { generator, output, force, projectName } = options;

  // Validate generator
  if (!isValidGenerator(generator)) {
    const similar = findSimilarGenerators(generator);
    const allGenerators = [...SHORT_GENERATOR_NAMES, ...GENERATOR_NAMES];
    throw new InvalidGeneratorError(
      generator,
      allGenerators,
      similar.length > 0 ? similar[0] : undefined,
    );
  }

  const generatorInfo = parseGenerator(generator);
  const engine = generatorInfo.engine;

  // Check if files already exist
  const configPath = "sqg.yaml";
  const sqlPath = "queries.sql";

  if (!force) {
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
  }

  // Write configuration file
  const configContent = getConfigYaml(generator, output, projectName);
  writeFileSync(configPath, configContent);

  // Write example SQL file
  const sqlContent = getExampleSql(engine);
  writeFileSync(sqlPath, sqlContent);
}

/**
 * Initialize a new SQG project
 */
export async function initProject(options: InitOptions): Promise<void> {
  // If no generator specified and running in interactive TTY, run wizard
  if (!options.generator && process.stdin.isTTY) {
    await runInteractiveInit(options);
    return;
  }

  // Non-interactive mode
  const generator = options.generator || "typescript/sqlite";
  const output = options.output || "./generated";

  await createProjectFiles({
    generator,
    output,
    force: options.force,
    projectName: "my-project",
  });

  const generatorInfo = parseGenerator(generator);

  clack.intro(pc.bold("SQG project initialized!"));
  clack.log.info(`Generator: ${generator}`);
  clack.log.info(`Engine: ${generatorInfo.engine}`);
  clack.log.info(`Output: ${output}`);
  clack.log.step("Next steps:");
  clack.log.message("  1. Edit queries.sql to add your SQL queries");
  clack.log.message("  2. Run: sqg sqg.yaml");
  clack.log.message(`  3. Import the generated code from ${output}`);
  clack.outro("Documentation: https://sqg.dev");
}
