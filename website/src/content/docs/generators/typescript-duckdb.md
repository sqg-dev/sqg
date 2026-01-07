---
title: TypeScript + DuckDB
description: Generate type-safe TypeScript code for DuckDB with complex type support
---

Generate asynchronous TypeScript code for DuckDB databases using the [@duckdb/node-api](https://duckdb.org/docs/stable/clients/node_neo/overview) driver (DuckDB Node.js Neo). Includes support for DuckDB's advanced types like structs, lists, and maps.

## Overview

| Property | Value |
|----------|-------|
| Generator | `typescript/duckdb` |
| Engine | `duckdb` |
| Runtime | Node.js |
| API Style | Asynchronous (async/await) |
| Driver | @duckdb/node-api |

## Installation

```bash
# Install SQG (choose one)
pnpm add -D @sqg/sqg        # pnpm
npm install -D @sqg/sqg     # npm
yarn add -D @sqg/sqg        # yarn

# Install runtime dependency
pnpm add @duckdb/node-api   # or: npm install / yarn add
```

## Configuration

```yaml
# sqg.yaml
version: 1
name: my-app

sql:
  - engine: duckdb
    files:
      - queries.sql
    gen:
      - generator: typescript/duckdb
        output: ./src/generated/
```

## Quick Start

### 1. Initialize a project

```bash
sqg init --engine duckdb
```

### 2. Write your SQL

```sql
-- queries.sql

-- MIGRATE 1
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name VARCHAR NOT NULL,
  email VARCHAR UNIQUE,
  metadata STRUCT(role VARCHAR, active BOOLEAN),
  tags VARCHAR[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TESTDATA seed
INSERT INTO users (id, name, email, metadata, tags)
VALUES (1, 'Alice', 'alice@example.com',
        {'role': 'admin', 'active': true},
        ['developer', 'lead']);

-- QUERY all_users
SELECT * FROM users ORDER BY created_at DESC;

-- QUERY get_user :one
@set id = 1
SELECT * FROM users WHERE id = ${id};

-- QUERY get_user_tags :one :pluck
@set id = 1
SELECT tags FROM users WHERE id = ${id};

-- EXEC create_user
@set id = 2
@set name = 'Bob'
@set email = 'bob@example.com'
INSERT INTO users (id, name, email) VALUES (${id}, ${name}, ${email});
```

### 3. Generate code

```bash
sqg sqg.yaml
```

### 4. Use the generated code

```typescript
import { DuckDBInstance } from '@duckdb/node-api';
import { MyApp } from './generated/my-app';

async function main() {
  // Create database connection
  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();

  // Run migrations
  for (const migration of MyApp.getMigrations()) {
    await connection.run(migration);
  }

  // Create query instance
  const queries = new MyApp(connection);

  // Insert data
  await queries.createUser(2, 'Bob', 'bob@example.com');

  // Query data
  const users = await queries.allUsers();
  console.log(users);

  const user = await queries.getUser(1);  // Gets Alice from TESTDATA
  console.log(user?.name); // 'Alice'

  // Access complex types
  console.log(user?.metadata?.entries.role); // 'admin'
  console.log(user?.tags?.items); // ['developer', 'lead']
}

main();
```

## Complex Types

DuckDB supports advanced types that SQG fully handles:

### Structs

SQL:
```sql
CREATE TABLE products (
  id INTEGER,
  details STRUCT(name VARCHAR, price DECIMAL(10,2), in_stock BOOLEAN)
);
```

TypeScript:
```typescript
interface DetailsStruct {
  entries: {
    name: string | null;
    price: { width: number; scale: number; value: bigint } | null;
    in_stock: boolean | null;
  };
}
```

Usage:
```typescript
const product = await queries.getProduct(1);
console.log(product?.details?.entries.name);
console.log(product?.details?.entries.price);
```

### Lists (Arrays)

SQL:
```sql
CREATE TABLE posts (
  id INTEGER,
  tags VARCHAR[],
  scores INTEGER[]
);
```

TypeScript:
```typescript
interface PostRow {
  id: number;
  tags: { items: (string | null)[] } | null;
  scores: { items: (number | null)[] } | null;
}
```

Usage:
```typescript
const post = await queries.getPost(1);
console.log(post?.tags?.items); // ['tech', 'news']
console.log(post?.scores?.items); // [95, 87, 92]
```

### Maps

SQL:
```sql
CREATE TABLE settings (
  id INTEGER,
  config MAP(VARCHAR, VARCHAR)
);
```

TypeScript:
```typescript
interface SettingsRow {
  id: number;
  config: { entries: { key: string; value: string }[] } | null;
}
```

Usage:
```typescript
const settings = await queries.getSettings(1);
for (const entry of settings?.config?.entries ?? []) {
  console.log(`${entry.key}: ${entry.value}`);
}
```

### Nested Complex Types

DuckDB supports deeply nested types:

```sql
CREATE TABLE reports (
  id INTEGER,
  data STRUCT(
    summary VARCHAR,
    metrics STRUCT(views INTEGER, clicks INTEGER)[],
    tags MAP(VARCHAR, VARCHAR[])
  )
);
```

## Type Mapping

| DuckDB Type | TypeScript Type |
|-------------|-----------------|
| `INTEGER`, `BIGINT` | `number`, `bigint` |
| `DOUBLE`, `FLOAT` | `number` |
| `VARCHAR`, `TEXT` | `string` |
| `BOOLEAN` | `boolean` |
| `TIMESTAMP` | `{ micros: bigint }` |
| `DATE` | `{ days: number }` |
| `TIME` | `{ micros: bigint }` |
| `BLOB` | `{ bytes: Uint8Array }` |
| `UUID` | `{ hugeint: bigint }` |
| `DECIMAL(p,s)` | `{ width: number; scale: number; value: bigint }` |
| `STRUCT(...)` | `{ entries: {...} }` |
| `T[]` | `{ items: T[] }` |
| `MAP(K,V)` | `{ entries: { key: K; value: V }[] }` |

## Async Pattern

All generated methods are async:

```typescript
// Query methods return Promise
const users: UserRow[] = await queries.allUsers();
const user: UserRow | undefined = await queries.getUser(1);

// Exec methods return Promise<void>
await queries.createUser(1, 'Alice', 'alice@example.com');
await queries.updateUser(1, 'Alice Smith');
```

## Connection Management

```typescript
import { DuckDBInstance } from '@duckdb/node-api';

// In-memory database
const instance = await DuckDBInstance.create(':memory:');

// File-based database
const instance = await DuckDBInstance.create('app.duckdb');

// Connect
const connection = await instance.connect();
const queries = new MyApp(connection);

// Multiple connections (for concurrent access)
const conn1 = await instance.connect();
const conn2 = await instance.connect();

// Close connections
connection.closeSync();
```

## Use Cases

DuckDB + TypeScript is ideal for:

- **Analytics applications** - Fast OLAP queries
- **Data pipelines** - ETL processing with complex transformations
- **Embedded analytics** - Local analytics without a database server
- **Parquet/CSV processing** - Direct querying of file formats

## Example: Analytics Query

```sql
-- QUERY sales_by_region
@set start_date = '2024-01-01'
@set end_date = '2024-12-31'
SELECT
  region,
  COUNT(*) as order_count,
  SUM(amount) as total_sales,
  AVG(amount) as avg_order_value
FROM orders
WHERE order_date BETWEEN ${start_date} AND ${end_date}
GROUP BY region
ORDER BY total_sales DESC;
```

## Limitations

- **No browser support** - @duckdb/node-api is Node.js only
- **Async required** - All operations are asynchronous
- **Complex type wrappers** - Structs/lists/maps have wrapper objects

## See Also

- [TypeScript + SQLite](/generators/typescript-sqlite/) - Simpler sync API for SQLite
- [Java + DuckDB Arrow](/generators/java-duckdb-arrow/) - Java equivalent with Arrow API
- [SQL Syntax Reference](/guides/sql-syntax/)
- [FAQ](/guides/faq/)
- [DuckDB Documentation](https://duckdb.org/docs/)
- [@duckdb/node-api (Node.js Neo)](https://duckdb.org/docs/stable/clients/node_neo/overview)
