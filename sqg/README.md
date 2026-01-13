# SQG - SQL Query Generator

Type-safe code generation from SQL. Write SQL, get fully-typed database access code.

## What it does

SQG reads annotated `.sql` files, executes queries against real databases to introspect column types, and generates type-safe  code to execute the SQL queries.

The syntax of the `.sql` file is compatible with [DBeaver](https://dbeaver.io/), this allows to develop the SQL
queries with it and then generate the code from the same file.

## Features

- **Type-safe by design** - Generates fully-typed code with accurate column types inferred from your database
- **Multiple database engines** - Supports SQLite, DuckDB, and (soon) PostgreSQL
- **Multiple language targets** - Generate TypeScript or Java code from the same SQL files
- **Arrow API support** - Can generate Apache Arrow API bindings for DuckDB (Java)
- **DBeaver compatible** - Works seamlessly with DBeaver for database development and testing
- **Complex type support** - DuckDB: Handles structs, lists, and maps
- **Migration management** - Built-in support for schema migrations and test data


## Installation

```bash
pnpm add -g @sqg/sqg
pnpm approve-builds -g  # needed for sqlite dependency
```

Check if the install was successful:
```bash
sqg --help
```

## Quick Start

### Option 1: Use `sqg init` (Recommended)

```bash
# Initialize a new project (creates sqg.yaml and queries.sql)
sqg init

# Or with a specific database engine
sqg init --engine duckdb

# Generate code
sqg sqg.yaml
```

### Option 2: Manual Setup

1. Create `sqg.yaml` in your project root:

```yaml
version: 1
name: my-project
sql:
  - engine: sqlite    # sqlite, duckdb, or postgres
    files:
      - queries.sql
    gen:
      - generator: typescript/better-sqlite3
        output: src/db.ts
```

2. Write your SQL file with annotations

For example `queries.sql`:

```sql
-- MIGRATE createUsersTable
CREATE TABLE users (id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT);

-- QUERY getUserById :one
@set id = 1
SELECT id, name, email FROM users WHERE id = ${id};

-- QUERY getUsers
SELECT id, name, email FROM users;

-- EXEC insertUser
@set name = 'John'
@set email = 'john@example.com'
INSERT INTO users (name, email) VALUES (${name}, ${email});
```

3. Run SQG to generate code:

```bash
sqg sqg.yaml
```

4. Use the generated code:

```typescript
import Database from 'better-sqlite3';
import { Queries } from './db';

const db = new Database(':memory:');
const queries = new Queries(db);

// Run migrations
for (const sql of Queries.getMigrations()) {
  db.exec(sql);
}

// Type-safe queries
queries.insertUser('Alice', 'alice@example.com');
const user = queries.getUserById(1);
console.log(user?.name);
```

## SQL Annotations

| Annotation | Description |
|------------|-------------|
| `-- MIGRATE name` | Schema migration (CREATE TABLE, etc.) |
| `-- QUERY name` | SELECT query returning rows |
| `-- QUERY name :one` | Query returning single row or undefined |
| `-- QUERY name :pluck` | Return single (first) column value |
| `-- EXEC name` | INSERT/UPDATE/DELETE (no result rows) |
| `-- TESTDATA name` | Test data, runs after migrations |
| `@set var = value` | Define parameter with sample value |
| `${var}` | Reference parameter in query |

## Supported Databases & Generators

| Language | Database | API | Generator | Status |
|----------|----------|-----|-----------|--------|
| TypeScript | SQLite   | better-sqlite3 | `typescript/better-sqlite3` | Tested |
| TypeScript | DuckDB   | @duckdb/node-api | `typescript/duckdb` | Tested |
| Java | Any (JDBC) | JDBC | `java/jdbc` | Tested |
| Java | DuckDB   | Apache Arrow | `java/duckdb-arrow` | Tested |
| TypeScript | PostgreSQL | pg (node-postgres) | `typescript/pg` | under development |

## CLI Commands

```bash
sqg <config>              # Generate code from config file
sqg init                  # Initialize new project with example files
sqg init --engine duckdb  # Initialize with specific database engine
sqg --validate <config>   # Validate config without generating code
sqg --format json <config> # Output as JSON (for tooling integration)
sqg syntax                # Show SQL annotation syntax reference
sqg mcp                   # Start MCP server for AI assistants
sqg --help                # Show all options
```

## MCP Server (Model Context Protocol)

SQG includes an MCP server for AI assistants like Claude Code, Claude Desktop, and Cursor. See the [Build with AI guide](https://sqg.dev/guides/build-with-ai/) for setup instructions.

## Documentation

Full documentation at [sqg.dev](https://sqg.dev)

## License

Apache-2.0
