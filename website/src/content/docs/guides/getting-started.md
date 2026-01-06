---
title: Getting Started
description: Install SQG and generate your first type-safe database code
---

This guide will walk you through installing SQG and generating your first type-safe database access code.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 18** or later
- **pnpm** (recommended) or npm/yarn

## Installation

### From pnpm (recommended)

```bash
pnpm add -g @sqg/sqg
pnpm approve-builds -g  # needed for sqlite dependency
```

### From source

```bash
git clone https://github.com/sqg-dev/sqg.git
cd sqg/sqg
pnpm install
pnpm build
pnpm link --global
```

## Quick Start

### 1. Create your SQL file

Create a file called `queries.sql`:

```sql
-- MIGRATE 1
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE
);

-- QUERY all_users
SELECT * FROM users;

-- QUERY get_user :one
@set id = 1
SELECT * FROM users WHERE id = ${id};

-- EXEC create_user
@set name = 'John Doe'
@set email = 'john@example.com'
INSERT INTO users (name, email) VALUES (${name}, ${email});

-- EXEC delete_user
@set id = 1
DELETE FROM users WHERE id = ${id};
```

### 2. Create a project configuration

Create a file called `sqg.yaml`:

```yaml
version: 1
name: my-app

sql:
  - engine: sqlite
    files:
      - queries.sql
    gen:
      - generator: typescript/better-sqlite3
        output: ./src/generated/
```

### 3. Run the generator

```bash
sqg sqg.yaml
```

This creates `./src/generated/my-app.ts` with fully typed query functions.

### 4. Use the generated code

```typescript
import Database from 'better-sqlite3';
import { MyApp } from './generated/my-app';

// Initialize database
const db = new Database('app.db');

// Run migrations
for (const migration of MyApp.getMigrations()) {
  db.exec(migration);
}

// Create query instance
const queries = new MyApp(db);

// Use typed queries
queries.createUser('Alice', 'alice@example.com');
queries.createUser('Bob', 'bob@example.com');

const users = queries.allUsers();
console.log(users);
// [{ id: 1, name: 'Alice', email: 'alice@example.com' }, ...]

const user = queries.getUser(1);
console.log(user?.name); // 'Alice'
```

## Project Configuration

The `sqg.yaml` file defines your project structure:

```yaml
version: 1          # Config version (always 1)
name: my-project    # Project name (used for class names)

sql:
  - engine: sqlite  # Database engine: sqlite, duckdb, or postgres
    files:
      - queries.sql # SQL files to process
      - users.sql
    gen:
      - generator: typescript/better-sqlite3
        output: ./src/db/

      - generator: java/jdbc
        output: ./java/src/main/java/db/
        config:
          package: com.myapp.db
```

### Available Generators

| Generator | Description | Output |
|-----------|-------------|--------|
| `typescript/better-sqlite3` | TypeScript for SQLite | Sync functions using better-sqlite3 |
| `typescript/duckdb` | TypeScript for DuckDB | Async functions using @duckdb/node-api |
| `java/jdbc` | Java with JDBC | Standard JDBC with PreparedStatement |
| `java/duckdb-arrow` | Java with Arrow API | High-performance DuckDB Arrow interface |

### Generator Configuration

#### TypeScript generators

No additional configuration required.

#### Java generators

```yaml
gen:
  - generator: java/jdbc
    output: ./java/src/main/java/mypackage/
    config:
      package: com.mycompany.mypackage
```

## Database Engines

### SQLite

SQLite is the simplest option - no server required.

**Project config:**
```yaml
sql:
  - engine: sqlite
    files: [queries.sql]
    gen:
      - generator: typescript/better-sqlite3
        output: ./src/generated/
```

**Runtime dependency:**
```bash
pnpm add better-sqlite3
pnpm add -D @types/better-sqlite3
```

### DuckDB

DuckDB supports advanced analytics and complex types (structs, lists, maps).

**Project config:**
```yaml
sql:
  - engine: duckdb
    files: [queries.sql]
    gen:
      - generator: typescript/duckdb
        output: ./src/generated/
```

**Runtime dependency:**
```bash
pnpm add @duckdb/node-api
```

### PostgreSQL

PostgreSQL requires a running database server for type introspection.

**Project config:**
```yaml
sql:
  - engine: postgres
    files: [queries.sql]
    gen:
      - generator: java/jdbc
        output: ./java/src/main/java/db/
        config:
          package: db
```

**Environment setup:**
```bash
# Set connection URL in environment
export DATABASE_URL="postgresql://user:pass@localhost:5432/mydb"
```

## Development Workflow with DBeaver

SQG's SQL syntax is **designed to be compatible with [DBeaver](https://dbeaver.io)**, the popular open-source database IDE. The `@set` variable syntax is a DBeaver feature, which means you can use DBeaver as your primary SQL development environment.

### Why DBeaver?

DBeaver natively supports the `@set` variable syntax that SQG uses. This means you can:

- Execute queries with parameters directly in DBeaver
- Modify parameter values and re-run to test different scenarios
- Get autocomplete for table and column names
- View query execution plans for optimization
- Debug queries before generating code

### Recommended Workflow

1. **Install [DBeaver](https://dbeaver.io)** (free, cross-platform)

2. **Connect DBeaver to your database** (SQLite file, DuckDB, or PostgreSQL server)

3. **Create your SQL file** with migrations and queries

4. **Develop queries interactively in DBeaver:**
   - Run migrations to set up your schema
   - Execute queries and verify results
   - Modify `@set` values to test edge cases

5. **Run SQG to generate code** when your queries are ready

### Testing Parameters in DBeaver

The `@set` declarations work as variable definitions in DBeaver. Modify parameter values and re-run queries to test different scenarios:

```sql
-- QUERY find_users
@set name = 'Alice'        -- Change this value in DBeaver to test
@set min_age = 25          -- different scenarios
SELECT * FROM users WHERE name = ${name} AND age >= ${min_age};
```

Select the entire block (including `@set` lines) and execute - DBeaver will substitute the variables automatically.

## SQL Syntax Overview

### Query Types

```sql
-- MIGRATE 1
-- Schema migrations, executed in order
CREATE TABLE users (id INTEGER PRIMARY KEY);

-- MIGRATE 2
ALTER TABLE users ADD COLUMN email TEXT;

-- TESTDATA
-- Populate test data (used during type introspection)
INSERT INTO users (id, email) VALUES (1, 'test@example.com');

-- QUERY get_users
-- Select queries, return rows
SELECT * FROM users;

-- EXEC insert_user
-- Execute statements (INSERT, UPDATE, DELETE)
INSERT INTO users (email) VALUES (${email});
```

### Parameters

Define parameters with `@set` and reference them with `${name}`:

```sql
-- QUERY find_users
@set name = 'John'
@set min_age = 18
SELECT * FROM users WHERE name = ${name} AND age >= ${min_age};
```

Parameters become typed function arguments:

```typescript
findUsers(name: string, min_age: number): User[]
```

### Return Modifiers

```sql
-- QUERY all_users
-- Returns: User[]
SELECT * FROM users;

-- QUERY all_users :all
-- Explicit :all, same as default
SELECT * FROM users;

-- QUERY get_user :one
-- Returns: User | undefined
@set id = 1
SELECT * FROM users WHERE id = ${id};

-- QUERY all_emails :pluck
-- Returns: (string | null)[]
SELECT email FROM users;

-- QUERY count_users :one :pluck
-- Returns: number | null | undefined
SELECT COUNT(*) FROM users;
```

## Next Steps

- [SQL Syntax Reference](/guides/sql-syntax/) - Complete annotation reference
- [Playground](/playground/) - Try SQG in your browser
- [FAQ](/guides/faq/) - Common questions and troubleshooting
- [Related Projects](/guides/related-projects/) - Similar tools and alternatives
