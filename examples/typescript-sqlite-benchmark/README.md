# TypeScript SQLite Benchmark

Benchmark comparing SQG's two TypeScript SQLite generators:
- `typescript/sqlite/better-sqlite3` - Uses the [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) package
- `typescript/sqlite/node` - Uses Node.js built-in [node:sqlite](https://nodejs.org/api/sqlite.html) module

## Running the Benchmark

```bash
# Generate the database access code
pnpm generate

# Run the benchmark
pnpm bench
```

## SQLite Configuration

Both databases are configured with recommended pragma settings for optimal performance:

```sql
PRAGMA journal_mode = WAL      -- Write-Ahead Logging for better concurrency
PRAGMA synchronous = NORMAL    -- Balance between safety and speed
PRAGMA cache_size = -64000     -- 64MB cache
PRAGMA temp_store = MEMORY     -- Store temp tables in memory
PRAGMA mmap_size = 268435456   -- 256MB memory-mapped I/O
```

## What's Tested

The benchmark compares performance across various query types:

| Operation | Description |
|-----------|-------------|
| `getAllUsers` | Select all rows from a table |
| `getUserById` | Select single row by primary key |
| `getUserByEmail` | Select single row by indexed column |
| `countUsers` | Pluck query (single value) |
| `getPostsByUser` | Select multiple rows with WHERE clause |
| `getPublishedPosts` | JOIN query returning multiple rows |
| `getPostWithAuthor` | JOIN query returning single row |
| `countPostsByUser` | Pluck query with parameter |
| `insertUser` | INSERT operation |
| `updatePostViews` | UPDATE operation |

## Notes

- `node:sqlite` is marked as experimental in Node.js
- better-sqlite3 is a mature, well-optimized library
- Write operations (INSERT/UPDATE) are I/O bound and show similar performance
- Read operations generally favor better-sqlite3 due to its optimizations
