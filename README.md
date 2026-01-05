# SQG - SQL Query Generator

Type-safe code generation from SQL. Write SQL, get fully-typed database access code.

## What it does

SQG reads annotated `.sql` files, executes queries against real databases to introspect column types, and generates type-safe wrapper code.

**Input** (`queries.sql`):
```sql
-- MIGRATE createUsersTable
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT);

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

**Output** (TypeScript):
```typescript
export class Queries {
  getUserById(id: number): { id: number; name: string; email: string | null } | undefined
  getUsers(): { id: number; name: string; email: string | null }[]
  insertUser(name: string, email: string): RunResult
}
```

## Top Features

- **Type-safe by design** - Generates fully-typed code with accurate column types inferred from your database
- **Multiple database engines** - Supports SQLite, DuckDB, and PostgreSQL
- **Multiple language targets** - Generate TypeScript or Java code from the same SQL files
- **Arrow API support** - Produces Apache Arrow API bindings for DuckDB (Java)
- **DBeaver compatible** - Works seamlessly with DBeaver for database development and testing
- **Runtime type introspection** - Executes queries against real databases to determine exact column types
- **Complex type support** - Handles structs, lists, and maps (especially for DuckDB)
- **Migration management** - Built-in support for schema migrations and test data
- **Simple annotations** - Clean, comment-based syntax that doesn't interfere with SQL readability
- **Parameterized queries** - Type-safe parameter binding with compile-time validation

## Installation

```bash
npm install @sqg/sqg
# or
pnpm add @sqg/sqg
```

## Quick Start

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

3. Run the generator:

```bash
npx sqg .
```

4. Use the generated code:

```typescript
import Database from 'better-sqlite3';
import { Queries } from './db';

const db = new Database('app.db');
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
| `-- QUERY name :pluck` | Return single column value |
| `-- EXEC name` | INSERT/UPDATE/DELETE (no result rows) |
| `-- TESTDATA name` | Test data, runs after migrations |
| `@set var = value` | Define parameter with sample value |
| `${var}` | Reference parameter in query |

## Supported Databases & Generators

| Database | Generator |
|----------|-----------|
| SQLite | `typescript/better-sqlite3` |
| DuckDB | `typescript/duckdb` |
| PostgreSQL | `typescript/pg` |
| Any (JDBC) | `java/jdbc` |
| DuckDB | `java/duckdb-arrow` |

## Documentation

Full documentation at [sqg.dev](https://sqg.dev)

## License

Apache-2.0
