---
title: SQL Syntax Reference
description: Complete reference for SQG query annotations and modifiers
---

This page documents all SQL annotations and modifiers supported by SQG.

## File Structure

An SQG SQL file contains multiple blocks, each starting with a comment annotation:

```sql
-- MIGRATE 1
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);

-- MIGRATE 2
ALTER TABLE users ADD COLUMN email TEXT;

-- TESTDATA
INSERT INTO users VALUES (1, 'Test User', 'test@example.com');

-- QUERY get_all_users
SELECT * FROM users;

-- QUERY get_user :one
@set id = 1
SELECT * FROM users WHERE id = ${id};

-- EXEC create_user
@set name = 'John'
@set email = 'john@example.com'
INSERT INTO users (name, email) VALUES (${name}, ${email});
```

## Block Types

### MIGRATE

Schema migrations are executed in order to set up the database structure.

```sql
-- MIGRATE 1
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MIGRATE 2
CREATE INDEX idx_users_name ON users(name);

-- MIGRATE 3
ALTER TABLE users ADD COLUMN email TEXT UNIQUE;
```

**Rules:**
- Migrations must be numbered sequentially starting from 1
- Each migration is executed once during type introspection
- Generated code includes a `getMigrations()` static method
- You're responsible for tracking which migrations have run in production

### TESTDATA

Populate sample data used during type introspection. This data helps SQG understand nullable columns and complex return types.

```sql
-- TESTDATA
INSERT INTO users (id, name, email) VALUES
  (1, 'Alice', 'alice@example.com'),
  (2, 'Bob', 'bob@example.com');

INSERT INTO posts (id, user_id, title) VALUES
  (1, 1, 'Hello World');
```

**Rules:**
- TESTDATA blocks are executed after all migrations
- Use meaningful test data that exercises your queries
- Data is only used during generation, not included in output

### QUERY

Select queries that return data.

```sql
-- QUERY find_active_users
SELECT * FROM users WHERE active = true;
```

**Generated code returns:**
- Array of row objects (default)
- Single row with `:one` modifier
- Column values with `:pluck` modifier

### EXEC

Execute statements that don't return rows (INSERT, UPDATE, DELETE).

```sql
-- EXEC deactivate_user
@set id = 1
UPDATE users SET active = false WHERE id = ${id};
```

**Generated code returns:**
- Database-specific result type (e.g., `RunResult` for SQLite)
- Typically includes `changes` count and `lastInsertRowid`

## Modifiers

Modifiers change how query results are returned. Add them after the query name:

```sql
-- QUERY name :modifier1 :modifier2
```

### :all (default)

Returns all matching rows as an array.

```sql
-- QUERY get_users :all
SELECT * FROM users;
```

```typescript
// Generated: User[]
getUsers(): { id: number | null; name: string | null; }[]
```

### :one

Returns a single row or undefined. Use for queries expected to return 0 or 1 rows.

```sql
-- QUERY get_user :one
@set id = 1
SELECT * FROM users WHERE id = ${id};
```

```typescript
// Generated: User | undefined
getUser(id: number): { id: number | null; name: string | null; } | undefined
```

### :pluck

Extracts values from the first (or only) column. Useful for fetching lists of IDs or scalar values.

```sql
-- QUERY get_user_ids :pluck
SELECT id FROM users;
```

```typescript
// Generated: (number | null)[]
getUserIds(): (number | null)[]
```

### Combining Modifiers

Modifiers can be combined:

```sql
-- QUERY count_users :one :pluck
SELECT COUNT(*) FROM users;
```

```typescript
// Generated: number | null | undefined
countUsers(): number | null | undefined
```

```sql
-- QUERY get_first_email :one :pluck
SELECT email FROM users ORDER BY id LIMIT 1;
```

```typescript
// Generated: string | null | undefined
getFirstEmail(): string | null | undefined
```

## Parameters

### Defining Parameters

Use `@set` to define parameters with sample values:

```sql
-- QUERY find_users_by_name
@set name = 'John'
SELECT * FROM users WHERE name = ${name};
```

The sample value (`'John'`) is used during type introspection. At runtime, the parameter becomes a function argument.

### Multiple Parameters

```sql
-- QUERY find_users
@set name = 'John'
@set min_age = 18
@set max_age = 65
SELECT * FROM users
WHERE name LIKE ${name}
  AND age >= ${min_age}
  AND age <= ${max_age};
```

```typescript
findUsers(name: string, min_age: number, max_age: number): User[]
```

### Parameter Order

Parameters appear in the generated function in the order they're defined with `@set`:

```sql
-- QUERY example
@set first = 'a'
@set second = 1
@set third = true
SELECT * FROM t WHERE a = ${first} AND b = ${second} AND c = ${third};
```

```typescript
example(first: string, second: number, third: boolean): Result[]
```

### Parameter Types

Parameter types are inferred from the sample values:

| Sample Value | Inferred Type |
|--------------|---------------|
| `'text'` | `string` |
| `123` | `number` (integer) |
| `12.5` | `number` (float) |
| `true` / `false` | `boolean` |

## Block Comments

You can use block comments for queries with configuration:

```sql
/* QUERY complex_query :one
  result:
    count: integer not null
    email: text not null
*/
SELECT COUNT(*) as count, email FROM users GROUP BY email LIMIT 1;
```

The YAML-like configuration allows explicit type overrides when automatic inference isn't sufficient.

## Inline Comments

Regular SQL comments within queries are preserved:

```sql
-- QUERY get_active_users
SELECT * FROM users
WHERE active = true  -- Filter active users
  AND deleted_at IS NULL;  -- Exclude deleted
```

## Complex Types (DuckDB)

DuckDB supports rich data types that SQG fully maps:

### Arrays/Lists

```sql
-- QUERY get_tags :one
SELECT ['tag1', 'tag2', 'tag3'] as tags;
```

```typescript
// Generated: { tags: (string | null)[] }
```

### Structs

```sql
-- QUERY get_user_data :one
SELECT {'name': 'John', 'age': 30} as user;
```

```typescript
// Generated: { user: { name: string | null; age: number | null } }
```

### Maps

```sql
-- QUERY get_metadata :one
SELECT MAP {'key1': 'value1', 'key2': 'value2'} as meta;
```

```typescript
// Generated: { meta: Map<string, string | null> }
```

### Nested Structures

```sql
-- QUERY get_complex :one
SELECT {
  'user': {'id': 1, 'name': 'John'},
  'tags': ['admin', 'user'],
  'settings': MAP {'theme': 'dark'}
} as data;
```

```typescript
// Generated:
{
  data: {
    user: { id: number | null; name: string | null };
    tags: (string | null)[];
    settings: Map<string, string | null>;
  }
}
```

## Best Practices

### Naming Conventions

- Use `snake_case` for query names: `get_user_by_id`
- Generated code converts to `camelCase`: `getUserById`

### One Query Per Block

Each query should be in its own block:

```sql
-- QUERY get_users
SELECT * FROM users;

-- QUERY get_posts
SELECT * FROM posts;
```

### Use Meaningful Test Data

Test data helps with type inference:

```sql
-- TESTDATA
-- Include NULL values to test nullable handling
INSERT INTO users (id, name, email) VALUES
  (1, 'Test', 'test@example.com'),
  (2, 'No Email', NULL);
```

### Keep Migrations Atomic

Each migration should be a single logical change:

```sql
-- MIGRATE 1
CREATE TABLE users (id INTEGER PRIMARY KEY);

-- MIGRATE 2
ALTER TABLE users ADD COLUMN name TEXT;

-- MIGRATE 3
CREATE INDEX idx_users_name ON users(name);
```
