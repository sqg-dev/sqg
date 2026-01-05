# TypeScript + SQLite Example

This example demonstrates using SQG with TypeScript and better-sqlite3.

## Setup

```bash
# Install dependencies
pnpm install

# Generate the TypeScript code from SQL
pnpm generate
```

## Run

```bash
# Run with tsx (development)
pnpm dev

# Or build and run
pnpm build
pnpm start
```

## Files

- `queries.sql` - SQL queries with SQG annotations
- `sqg.yaml` - SQG configuration
- `src/db.ts` - Generated TypeScript code (after running `pnpm generate`)
- `src/main.ts` - Example program using the generated code
