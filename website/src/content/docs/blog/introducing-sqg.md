---
title: Introducing SQG
date: 2024-12-17
authors:
  - name: SQG Team
    url: https://github.com/sqg-dev
---

We're excited to announce **SQG** (SQL Query Generator), a tool that generates type-safe database access code from your SQL queries.

## The Problem

Writing database code means maintaining SQL queries and matching TypeScript/Java types. When schemas change, you update both—and hope nothing breaks. ORMs abstract SQL away, but what if you want to write SQL directly while keeping type safety?

## The Solution

SQG reads annotated `.sql` files, executes queries against real databases to introspect column types, and generates fully-typed wrapper code.

Write your SQL with simple annotations:

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

SQG generates type-safe code:

```typescript
export class Queries {
  getUserById(id: number): { id: number; name: string; email: string | null } | undefined
  getUsers(): { id: number; name: string; email: string | null }[]
  insertUser(name: string, email: string): RunResult
}
```

## Key Features

- **Type-safe by design** - Column types inferred from your actual database
- **Multiple databases** - SQLite, DuckDB, and PostgreSQL
- **Multiple languages** - Generate TypeScript or Java from the same SQL
- **DBeaver compatible** - Develop queries in DBeaver, generate code from the same file
- **Zero runtime overhead** - Generated code is plain function calls

## Get Started

Install SQG:

```bash
pnpm add -g @sqg/sqg
pnpm approve-builds -g  # needed for sqlite dependency
```

Create a `sqg.yaml` config and your SQL file, then run `sqg sqg.yaml`. Check out the [Getting Started guide](/guides/getting-started/) for details.

We'd love your feedback! File issues and feature requests on [GitHub](https://github.com/sqg-dev/sqg).
