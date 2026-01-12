---
title: FAQ
description: Frequently asked questions about SQG
---

## General

### What is SQG?

SQG (SQL Query Generator) is a build-time tool that generates type-safe database access code from annotated SQL files. You write SQL queries with simple comment annotations, and SQG generates TypeScript or Java code with full type safety.

### How is this different from an ORM?

ORMs (like Prisma, TypeORM, or Hibernate) provide an abstraction layer over SQL. You write queries using the ORM's API, and it generates SQL at runtime.

SQG takes the opposite approach:
- **You write SQL directly** - no query builder or abstraction
- **Types are generated at build time** - from your actual database schema
- **No runtime overhead** - generated code is plain function calls
- **Full SQL access** - use any database feature without limitations

### Why not just use raw SQL with manual types?

You can! But it's tedious and error-prone:

1. **Manual type definitions** - You must write and maintain TypeScript interfaces manually
2. **Type drift** - Schema changes can silently break your types
3. **Boilerplate** - Every query needs parameter binding and result mapping
4. **No validation** - Typos in column names aren't caught until runtime

SQG automates all of this by introspecting your actual database.

### What databases are supported?

Currently supported:
- **SQLite** - via better-sqlite3
- **DuckDB** - via @duckdb/node-api
- **PostgreSQL** - via pg

### What languages can I generate?

Currently supported:
- **TypeScript** - for SQLite (better-sqlite3) and DuckDB
- **Java** - via JDBC (any database) or DuckDB Arrow API

Adding new languages is straightforward with custom Handlebars templates.

### What IDE should I use for writing SQL files?

**[DBeaver](https://dbeaver.io)** - SQG's `@set` variable syntax is designed to be compatible with DBeaver. This is a DBeaver-specific feature, so other SQL editors won't understand the variable substitution.

With DBeaver you can:
- Execute queries with `@set` parameters directly
- Modify parameter values and re-run to test different scenarios
- Get autocomplete for table and column names
- View query execution plans for optimization
- Connect to SQLite, DuckDB, PostgreSQL, and many other databases

DBeaver is free, open-source, and cross-platform (Windows, macOS, Linux).

Your workflow becomes: develop and test queries in DBeaver, then run `sqg` to generate type-safe code.

## Installation & Setup

### How do I install SQG?

```bash
# pnpm (recommended)
pnpm add -D @sqg/sqg
pnpm approve-builds  # needed for native dependencies

# npm
npm install --save-dev @sqg/sqg

# yarn
yarn add -D @sqg/sqg
```

### How do I start a new project quickly?

Use the `sqg init` command to bootstrap a new project:

```bash
# Create a SQLite + TypeScript project (default)
sqg init

# Create a DuckDB project
sqg init --engine duckdb

# Create with specific generator and output directory
sqg init --engine sqlite --generator typescript/better-sqlite3 --output ./src/db
```

This creates:
- `sqg.yaml` - Project configuration
- `queries.sql` - Example SQL file with migrations and sample queries
- Output directory for generated code

### How do I validate my configuration?

Use the `--validate` flag to check your configuration without generating code:

```bash
sqg --validate sqg.yaml
```

This validates:
- YAML syntax
- Schema correctness
- File existence
- Generator/engine compatibility

For CI/CD pipelines, use JSON output:

```bash
sqg --validate --format json sqg.yaml
```

### Do I need a running database?

It depends on the database engine:

- **SQLite/DuckDB**: No. SQG creates an in-memory database for introspection.
- **PostgreSQL**: Yes. Set `SQG_POSTGRES_URL` environment variable to connect.

### How do I integrate with my build process?

Add SQG to your build scripts:

```json
{
  "scripts": {
    "generate": "sqg sqg.yaml",
    "build": "npm run generate && tsc",
    "dev": "npm run generate && vite"
  }
}
```

### How do I use SQG in CI/CD?

Example GitHub Actions workflow:

```yaml
# .github/workflows/build.yml
name: Build
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install

      # Validate SQG config (fast, catches errors early)
      - run: pnpm sqg --validate sqg.yaml

      # Generate code
      - run: pnpm sqg sqg.yaml

      # Build and test
      - run: pnpm build
      - run: pnpm test
```

For PostgreSQL projects, add a service container:

```yaml
services:
  postgres:
    image: postgres:16
    env:
      POSTGRES_USER: sqg
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: sqg-db
    ports:
      - 5432:5432
env:
  SQG_POSTGRES_URL: postgresql://sqg:secret@localhost:5432/sqg-db
```

### Can I use SQG in a monorepo?

Yes. Create a `sqg.yaml` per package or use relative paths:

```yaml
version: 1
name: shared-db

sql:
  - engine: sqlite
    files:
      - ../../shared/queries.sql
    gen:
      - generator: typescript/better-sqlite3
        output: ./src/generated/
```

## SQL Syntax

### How do I handle nullable columns?

SQG automatically detects nullable columns from your schema. Generated types use `| null`:

```typescript
// Column defined as TEXT (nullable)
name: string | null

// Column defined as TEXT NOT NULL
name: string
```

### Can I override inferred types?

Yes, use block comment syntax with explicit type configuration:

```sql
/* QUERY get_count :one :pluck
  result:
    count: integer not null
*/
SELECT COUNT(*) as count FROM users;
```

### How do I handle dynamic queries?

SQG generates static queries. For dynamic queries, you have options:

1. **Multiple specific queries** - Create separate queries for common cases
2. **Optional parameters** - Use COALESCE or similar SQL patterns
3. **Raw SQL** - Use your database driver directly for truly dynamic cases

Example with optional filter:

```sql
-- QUERY find_users
@set name = 'John'
@set filter_by_name = true
SELECT * FROM users
WHERE (${filter_by_name} = false OR name = ${name});
```

### Can I use JOINs?

Absolutely. SQG handles any valid SQL:

```sql
-- QUERY get_user_posts
@set user_id = 1
SELECT u.name, p.title, p.created_at
FROM users u
JOIN posts p ON u.id = p.user_id
WHERE u.id = ${user_id};
```

### How do I handle transactions?

Transactions are handled at the application level using your database driver:

```typescript
import Database from 'better-sqlite3';
import { MyApp } from './generated/my-app';

const db = new Database('app.db');
const queries = new MyApp(db);

// Use better-sqlite3's transaction helper
const transfer = db.transaction((from, to, amount) => {
  queries.debit(from, amount);
  queries.credit(to, amount);
});

transfer(1, 2, 100);
```

## Generated Code

### Where is the generated code saved?

Specified by the `output` field in your config:

```yaml
gen:
  - generator: typescript/better-sqlite3
    output: ./src/generated/  # Creates ./src/generated/my-project.ts
```

### Should I commit generated code?

It depends on your workflow:

**Commit generated code:**
- Simpler CI/CD (no generation step needed)
- Easier to review changes
- Works without database access

**Don't commit generated code:**
- Single source of truth (SQL files)
- No risk of stale generated code
- Smaller repository

### Can I customize the generated code?

Yes, in several ways:

1. **Custom templates** - Create your own Handlebars templates
2. **Post-processing** - Run formatters or transforms after generation
3. **Wrapper classes** - Extend or wrap generated classes

### How do I handle migrations in production?

SQG generates a `getMigrations()` method that returns an array of migration SQL strings. You're responsible for:

1. Tracking which migrations have run (e.g., migrations table)
2. Running new migrations in order
3. Handling rollbacks if needed

Example migration runner:

```typescript
function runMigrations(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const applied = db.prepare('SELECT id FROM _migrations').all().map(r => r.id);
  const migrations = MyApp.getMigrations();

  migrations.forEach((sql, index) => {
    const migrationId = index + 1;
    if (!applied.includes(migrationId)) {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (id) VALUES (?)').run(migrationId);
    }
  });
}
```

## Troubleshooting

### "Column not found" errors

Ensure your TESTDATA block populates all tables referenced in queries:

```sql
-- TESTDATA
INSERT INTO users (id, name) VALUES (1, 'Test');
INSERT INTO posts (id, user_id, title) VALUES (1, 1, 'Test Post');
```

### Type inference seems wrong

Check that:
1. Your TESTDATA includes representative values
2. NULL values are included for nullable columns
3. The sample values in `@set` match expected types

### PostgreSQL connection fails

Verify your `SQG_POSTGRES_URL` environment variable:

```bash
export SQG_POSTGRES_URL="postgresql://user:password@localhost:5432/dbname"
```

SQG creates a temporary database for introspection, so the user needs CREATE DATABASE privileges.

### Generated types are all `any`

This usually means type introspection failed. Check:
1. Migrations run successfully
2. TESTDATA populates required tables
3. Queries execute without errors

Run SQG with verbose output for debugging:

```bash
sqg --verbose sqg.yaml
```

### How do I debug configuration issues?

Use the `--validate` flag to check configuration without running generation:

```bash
sqg --validate sqg.yaml
```

For machine-readable error output (useful for tooling):

```bash
sqg --format json sqg.yaml
```

Example error output:
```json
{
  "status": "error",
  "error": {
    "code": "INVALID_GENERATOR",
    "message": "Invalid generator 'typescript/sqlite'. Valid generators: typescript/better-sqlite3, typescript/duckdb, java/jdbc, java/duckdb-arrow",
    "suggestion": "Use 'typescript/better-sqlite3' instead"
  }
}
```

### What error codes does SQG return?

SQG provides structured error codes for programmatic handling:

| Code | Description |
|------|-------------|
| `CONFIG_PARSE_ERROR` | Invalid YAML syntax |
| `CONFIG_VALIDATION_ERROR` | Schema validation failed |
| `FILE_NOT_FOUND` | SQL or config file missing |
| `INVALID_ENGINE` | Unknown database engine |
| `INVALID_GENERATOR` | Unknown code generator |
| `GENERATOR_ENGINE_MISMATCH` | Incompatible generator/engine |
| `SQL_PARSE_ERROR` | Invalid SQL annotation syntax |
| `SQL_EXECUTION_ERROR` | Query failed during introspection |
| `DUPLICATE_QUERY` | Two queries have the same name |
| `MISSING_VARIABLE` | Variable used but not defined |

### Where can I see the SQL annotation syntax?

Use the built-in syntax reference:

```bash
sqg syntax
```

This displays all annotation types, modifiers, and examples.

## Performance

### Is there runtime overhead?

Minimal. Generated code is essentially what you'd write by hand:
- Direct database driver calls
- No reflection or runtime type checking
- No query parsing at runtime

### How fast is code generation?

Very fast. For typical projects:
- SQLite/DuckDB: Sub-second (in-memory database)
- PostgreSQL: A few seconds (network latency for type introspection)

### Can I use connection pooling?

Yes. Pass a pooled connection to the generated class:

```typescript
import { Pool } from 'pg';
import { MyApp } from './generated/my-app';

const pool = new Pool();
const queries = new MyApp(pool);
```

The generated code uses the connection you provide - pooling is your responsibility.
