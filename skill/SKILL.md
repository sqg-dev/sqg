---
name: sqg
description: Generate type-safe database access code from annotated SQL files using SQG (SQL Query Generator). Use this skill whenever the user wants to generate TypeScript, Java, or Python code from .sql files; write or maintain a sqg.yaml config; add annotated queries (`-- QUERY`, `-- EXEC`, `-- MIGRATE`, `-- BASELINE`, `-- TABLE`, `:one`, `:pluck`, `:appender`, `:result=`); produce typed wrappers for better-sqlite3, @duckdb/node-api, JDBC, DuckDB Arrow, sqlite3, duckdb (Python), or psycopg; design migrations and baselines; build DuckDB bulk appenders; or debug SQG error codes like `INVALID_GENERATOR`, `SQL_PARSE_ERROR`, `DUPLICATE_QUERY`, `MISSING_VARIABLE`. Also use when the user mentions SQG, sqg.dev, sqg.yaml, `sqg init`, `sqg --validate`, type-safe SQL, generated query types, or asks how to introspect query result types at build time against a real database.
license: MIT
metadata:
  author: sqg-dev
  version: "0.20.0"
---

# SQG — SQL Query Generator

SQG reads `.sql` files with comment annotations and generates type-safe database access code in TypeScript, Java, or Python. It introspects queries against a real database engine (SQLite, DuckDB, or PostgreSQL) at build time to determine column types, then emits strongly-typed wrapper functions.

Project site: https://sqg.dev — Repo: https://github.com/sqg-dev/sqg

## When to use SQG

Reach for SQG when the user wants typed query results without writing the types by hand. Typical signals:

- "Generate types from this SQL", "I want type-safe queries", "no more `any` rows"
- They show a `.sql` file with `-- QUERY` / `-- MIGRATE` comments, or a `sqg.yaml`
- They mention better-sqlite3, @duckdb/node-api, DuckDB Arrow, JDBC, psycopg, duckdb (Python), or sqlite3 (Python) and want a generated wrapper
- They need a DuckDB bulk insert appender (`:appender`)
- They have schema created elsewhere (ETL, sibling service) and need a "baseline" for type introspection only

If the user wants ad-hoc query execution without codegen, SQG is not the right tool — point them at the database driver directly.

## SQL annotation syntax (the core thing to get right)

A SQG `.sql` file is normal SQL plus `-- KIND name [modifiers]` comments. Variables are declared with `@set` and referenced with `${...}`. SQG treats SQL as opaque blocks — only the annotation comments are parsed.

### Statement kinds

| Annotation | Purpose | Emitted in generated code? |
|---|---|---|
| `-- QUERY name` | A SELECT that returns rows | yes, returns typed rows |
| `-- EXEC name` | A statement run for side effect (INSERT/UPDATE/DELETE) | yes, no row result |
| `-- MIGRATE name` | Schema migration, applied in source order | yes, exposed via `getMigrations()` |
| `-- BASELINE name` | Schema created **outside** SQG (ETL, sibling service). Used only for type introspection | **no** — not emitted in `getMigrations()` |
| `-- TESTDATA name` | Test fixture data | yes, available to tests |
| `-- TABLE name :appender` | Generate a high-performance bulk-insert appender (DuckDB) | yes |

### Modifiers on `-- QUERY`

- `:one` — single-row result; generated function returns `Row \| undefined` (or equivalent)
- `:pluck` — single-column result; generated function returns the scalar, not a row object
- `:all` — default; array of rows
- `:result=Name` — name the row type so multiple same-shape queries share one type (**Java only**; annotating any ONE query in a same-shape group is enough — the rest pick it up). Without it, each query gets its own per-query type, except for `SELECT *` that exactly matches a `TABLE`.

### Variables

```sql
-- QUERY getUserById :one
@set id = 1
SELECT id, name, email FROM users WHERE id = ${id};
```

`@set` values are used **only during type introspection** (so SQG can execute the query and inspect column types). The generated function takes a real parameter — the placeholder value is not baked in.

### Migration ordering

`-- MIGRATE` blocks run **in source order** within a file, and files run in the order listed in `sqg.yaml`. The name after `-- MIGRATE` is an identifier for migration tracking (`1`, `add_email`, `2026_01_users`, …) — it does **not** drive ordering.

`-- BASELINE` runs before `-- MIGRATE` during type introspection but is excluded from the generated migrations array. Use it when the schema is owned by another system.

### Appenders (`-- TABLE … :appender`)

```sql
-- TABLE users :appender
```

Generates a typed bulk-insert appender for DuckDB. Use it instead of a loop of `INSERT`s when ingesting many rows. If the identifier should differ from the table name, put the table name on the next line:

```sql
-- TABLE user_bulk_insert :appender
users
```

## Configuration (`sqg.yaml`)

Minimum viable config:

```yaml
version: 1
name: my-project
sql:
  - files:
      - queries.sql
    gen:
      - generator: typescript/sqlite
        output: src/db.ts
```

Multiple generators can read the same SQL — generate Java and TypeScript wrappers from one source of truth:

```yaml
sql:
  - files:
      - queries.sql
    gen:
      - generator: typescript/duckdb
        output: ./generated/db.ts
      - generator: java/duckdb
        output: ./java/src/main/java/generated/
        config:
          package: generated
```

### Generator strings

Format: `<language>/<engine>[/<driver>]`. The driver is optional; the default is used when omitted.

| Short form | Full form | Driver |
|---|---|---|
| `typescript/sqlite` | `typescript/sqlite/better-sqlite3` | better-sqlite3 |
| `typescript/duckdb` | `typescript/duckdb/node-api` | @duckdb/node-api |
| `java/sqlite` | `java/sqlite/jdbc` | JDBC |
| `java/duckdb` | `java/duckdb/jdbc` | JDBC |
| `java/duckdb/arrow` | `java/duckdb/arrow` | DuckDB Arrow API |
| `java/postgres` | `java/postgres/jdbc` | JDBC |
| `python/sqlite` | `python/sqlite/sqlite3` | stdlib sqlite3 |
| `python/duckdb` | `python/duckdb/duckdb` | duckdb |
| `python/postgres` | `python/postgres/psycopg` | psycopg3 |

For Java generators, set `config.package` to the Java package name and point `output` at the package directory.

## CLI

```bash
sqg <config>                         # Generate code from a sqg.yaml
sqg --validate <config>              # Validate without generating
sqg --format json --validate <cfg>   # Machine-readable validation output
sqg --verbose <config>               # Show SQL execution during introspection
sqg init --generator typescript/duckdb   # Scaffold a new project
sqg syntax                           # Print the annotation syntax reference
sqg mcp                              # Start the MCP server for AI assistants
sqg ui                               # Start the interactive SQL development UI
```

Inside the monorepo, prefer `pnpm sqg <args>`. `sqg --validate --format json sqg.yaml` is the right call when you need to react to errors programmatically — it returns structured JSON with error codes.

## MCP tools (when available)

If the user's session exposes the SQG MCP server, prefer these tools over shelling out:

- `mcp__sqg__generate_code` — generate code from a config
- `mcp__sqg__validate_sql` — validate a config or SQL file

The MCP server is started via `sqg mcp` and registered in the user's MCP client. The MCP path is preferred for quick iteration loops because it returns structured results directly.

## Error codes (and how to react)

All SQG errors carry a code. In JSON mode they appear under `errors[].code`.

| Code | Likely cause | Fix |
|---|---|---|
| `CONFIG_PARSE_ERROR` | Invalid YAML | Lint the YAML; check indentation and quoting |
| `CONFIG_VALIDATION_ERROR` | YAML parses but doesn't match the schema | Compare against the example config above; common cause is missing `version: 1` or wrong `generator` string |
| `FILE_NOT_FOUND` | A `sql.files` entry or the config itself is missing | Check paths relative to the config file's directory |
| `INVALID_GENERATOR` | Unknown `<language>/<engine>[/<driver>]` | Use one of the strings in the generator table |
| `SQL_PARSE_ERROR` | Annotation syntax is wrong | Check the `-- KIND name :modifiers` line; common issues are unknown modifiers, missing name, or stray characters |
| `SQL_EXECUTION_ERROR` | The query failed when SQG tried to execute it against the dev database | Read the underlying SQL error; usually a real bug in the query or a missing migration. `@set` values must produce a valid execution |
| `DUPLICATE_QUERY` | Two queries share a name | Rename one |
| `MISSING_VARIABLE` | `${foo}` used without `@set foo = …` | Add the `@set` line above the query |

## Workflows

### 1. Add a new query to an existing project

1. Open the `.sql` file referenced by `sqg.yaml`.
2. Add a `-- QUERY name [modifiers]` comment, optional `@set` lines, then the SQL.
3. Run `sqg <config>` (or `pnpm sqg <config>`) to regenerate.
4. Use the generated typed function from application code.

### 2. Initialize a new project

```bash
sqg init --generator typescript/duckdb -o ./generated
```

This scaffolds a `sqg.yaml`, an example `queries.sql`, and any project glue needed for the target language. Use `--force` to overwrite.

### 3. Mix BASELINE + MIGRATE

When some tables come from an external ETL but the application also owns its own schema:

```sql
-- BASELINE etl_users
CREATE TABLE etl_users (id BIGINT, email VARCHAR);

-- MIGRATE 1_app_settings
CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);
```

The generated `getMigrations()` includes only `1_app_settings`. SQG knows about `etl_users` for type introspection but expects the application to obtain that schema from elsewhere at runtime.

### 4. Bulk insert into DuckDB

```sql
-- MIGRATE 1
CREATE TABLE events (ts TIMESTAMP, payload JSON);

-- TABLE events :appender
```

The generated code includes a typed appender — use it instead of issuing many `INSERT`s. Order of magnitude faster for ingest.

### 5. Share row types across same-shape queries (Java only)

```sql
-- QUERY findUserById :one :result=User
SELECT id, name, email FROM users WHERE id = ${id};

-- QUERY findUserByEmail :one
SELECT id, name, email FROM users WHERE email = ${email};
```

Both queries return the same `User` type. Annotating one with `:result=User` is enough.

## Reference examples

The SQG repo ships canonical examples that double as integration tests. When the user asks for a starting point, point them at:

- `examples/typescript-sqlite/` — minimal TypeScript + better-sqlite3
- `examples/typescript-duckdb/` — TypeScript + @duckdb/node-api, including struct/list/map types
- `examples/java-duckdb/` — Java + JDBC for DuckDB
- `examples/java-duckdb-benchmark/`, `examples/java-postgres-benchmark/`, `examples/typescript-sqlite-benchmark/` — performance benchmarks

Each example directory contains `queries.sql`, `sqg.yaml`, and source code calling the generated wrappers.

## Heuristics

- Don't hand-edit generated files — they are overwritten on every `sqg` run. Add the output paths to `.gitignore` or commit them as-is, but never patch them in place.
- Prefer `:one` over `:all` + `[0]` in application code; it's clearer and the generated type is non-array.
- For PostgreSQL, the dev database must be reachable during codegen (introspection runs real queries). Use `just start-pg` inside the SQG repo for local testing.
- When changes to generated code are unexpected, run `sqg --validate --verbose <config>` to see what SQG sees.
- If the user is using Claude Code with the SQG MCP server registered, prefer `mcp__sqg__generate_code` / `mcp__sqg__validate_sql` over shelling out.
