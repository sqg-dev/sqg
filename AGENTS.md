# AGENTS.md - SQG Project Guide for AI Agents

## Project Overview

SQG (SQL Query Generator) is a **type-safe SQL code generator** that reads SQL queries from `.sql` files with special annotations and generates type-safe database access code in multiple target languages (TypeScript and Java). It introspects SQL queries at build time against real database engines to determine column types and generates strongly-typed wrapper functions.

**Repository:** https://github.com/sqg-dev/sqg
**Website:** https://sqg.dev

**Key capabilities:**
- Parse SQL files with metadata annotations
- Execute queries against SQLite, DuckDB, or PostgreSQL to introspect types
- Generate type-safe TypeScript or Java code
- Support complex types: structs, lists, maps (especially for DuckDB)

## Project Structure

This is a **pnpm monorepo workspace**:

```
sqg/
├── sqg/                          # Core code generator package (@sqg/sqg)
│   ├── src/
│   │   ├── sqg.ts               # CLI entry point
│   │   ├── sqltool.ts           # Main orchestration, validation
│   │   ├── sql-query.ts         # SQL parsing logic
│   │   ├── constants.ts         # Supported engines/generators definitions
│   │   ├── errors.ts            # Structured error classes
│   │   ├── init.ts              # Project scaffolding (sqg init)
│   │   ├── type-mapping.ts      # Type system mapping
│   │   ├── db/
│   │   │   ├── sqlite.ts        # SQLite adapter
│   │   │   ├── postgres.ts      # PostgreSQL adapter
│   │   │   └── duckdb.ts        # DuckDB adapter
│   │   ├── generators/          # Language-specific generators
│   │   │   ├── typescript-generator.ts
│   │   │   └── java-generator.ts
│   │   ├── parser/
│   │   │   ├── sql.grammar      # Lezer grammar definition
│   │   │   └── sql-parser.ts    # Generated parser (do not edit)
│   │   └── templates/           # Handlebars code templates
│   │       ├── typescript-duckdb.hbs
│   │       ├── better-sqlite3.hbs
│   │       ├── java-jdbc.hbs
│   │       └── java-duckdb-arrow.hbs
│   ├── tests/                   # Test files and fixtures
│   │   ├── sqltool.test.ts      # Integration tests
│   │   ├── generator.test.ts    # Unit tests
│   │   ├── test-duckdb.yaml     # Test project configs
│   │   ├── test-duckdb.sql      # Test SQL files
│   │   └── __snapshots__/       # Snapshot test files
│   ├── java/                    # Java test project (Gradle)
│   └── justfile                 # Task runner recipes
├── website/                     # Astro + Starlight documentation site
├── examples/
│   ├── typescript-sqlite/       # Example: SQLite + TypeScript
│   └── typescript-duckdb/       # Example: DuckDB + TypeScript
└── pnpm-workspace.yaml
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `sqg/src/sqg.ts` | CLI entry point with commands (init, syntax) and options (--validate, --format) |
| `sqg/src/sqltool.ts` | Main orchestrator: parses YAML config, validates, coordinates generation |
| `sqg/src/sql-query.ts` | Custom SQL parser using Lezer, extracts query metadata |
| `sqg/src/constants.ts` | Centralized definitions for supported engines/generators |
| `sqg/src/errors.ts` | Structured error classes with codes, suggestions, context |
| `sqg/src/init.ts` | Project scaffolding logic for `sqg init` command |
| `sqg/src/type-mapping.ts` | Maps SQL types to target language types |
| `sqg/src/parser/sql.grammar` | Lezer grammar for annotated SQL syntax |
| `sqg/src/templates/*.hbs` | Handlebars templates for generated code |

## Tech Stack

- **Runtime:** Node.js >= 20
- **Package Manager:** pnpm
- **Build:** tsdown, tsc
- **Testing:** vitest
- **Linting:** biome
- **Parsing:** @lezer/lr (LR parser generator)
- **Templates:** handlebars
- **DB Drivers:** better-sqlite3, pg, @duckdb/node-api
- **Validation:** zod

## External Documentation

- **DuckDB Node.js API:** https://duckdb.org/docs/stable/clients/node_neo/overview
- **DuckDB Java API:** https://duckdb.org/docs/stable/clients/java

## Build & Test Commands

**From the `sqg/` subdirectory:**

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Run tests
pnpm test        # Watch mode
pnpm test:run    # Single run
pnpm test:run -u # Update snapshots

# Regenerate Lezer parser (after editing sql.grammar)
pnpm lezer-gen

# Lint and format
pnpm check

# Run SQG directly
pnpm sqg <path>

# Validate configuration without generating
pnpm sqg --validate <path>

# Get JSON output (for programmatic use)
pnpm sqg --format json <path>

# Initialize a new project
pnpm sqg init --engine duckdb
```

**Using justfile (from `sqg/sqg/`):**

```bash
just all          # Build all test targets
just build-duckdb # Generate from test-duckdb.yaml
just build-sqlite # Generate from test-sqlite.yaml
just start-pg     # Start PostgreSQL Docker container
```

## SQL File Format

Queries use special comment annotations:

```sql
-- MIGRATE 1
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);

-- QUERY get_user_by_id :one
@set id = 1
SELECT * FROM users WHERE id = ${id};

-- QUERY all_users
SELECT * FROM users;

-- EXEC insert_user
@set name = 'John'
INSERT INTO users (name) VALUES (${name});

-- QUERY countUsers :one :pluck
SELECT COUNT(*) FROM users;

-- TABLE users :appender
```

**Query types:** `QUERY`, `EXEC`, `MIGRATE`, `TESTDATA`, `TABLE`
**Modifiers:** `:one` (single row), `:pluck` (single column), `:all` (default), `:appender` (generate bulk insert appender)
**Variables:** `@set varName = value` to define, `${varName}` to reference

### TABLE Annotation (Appenders)

The `TABLE` annotation generates high-performance bulk insert appenders for DuckDB:

```sql
-- TABLE <table_name> :appender
```

- `<table_name>` is the database table name (also used as the identifier)
- The `:appender` modifier is required to generate appender code
- Appenders provide type-safe bulk insert methods that are much faster than individual INSERT statements

For a different identifier, specify the table name on the next line:
```sql
-- TABLE user_bulk_insert :appender
users
```

## Project Configuration (sqg.yaml)

```yaml
version: 1
name: my-project
sql:
  - engine: duckdb  # or: sqlite, postgres
    files:
      - queries.sql
    gen:
      - generator: typescript/duckdb
        output: ./generated/
      - generator: java/jdbc
        output: ./java/src/main/java/generated/
        config:
          package: generated
```

## Development Workflow

1. **Making changes to code generation:**
   - Edit the relevant generator in `sqg/src/generator.ts`
   - Or modify Handlebars templates in `sqg/src/templates/`
   - Run `pnpm test:run` to verify against snapshots
   - Update snapshots if changes are intentional

2. **Adding support for new SQL syntax:**
   - Modify `sqg/src/parser/sql.grammar`
   - Run `pnpm lezer-gen` to regenerate the parser
   - Update `sqg/src/sql-query.ts` to handle new constructs

3. **Adding a new generator:**
   - Create template in `sqg/src/templates/new-generator.hbs`
   - Add generator class extending `BaseGenerator` in `generator.ts`
   - Add type mapper in `type-mapping.ts` if needed
   - Register in `getGenerator()` switch statement

## Testing Strategy

- **Snapshot testing:** Generated code compared against `.snapshot` files
- **Integration tests:** Full pipeline in `sqltool.test.ts`
- **Unit tests:** Individual functions in `generator.test.ts`
- **In-memory databases:** SQLite and DuckDB for fast tests
- **PostgreSQL tests:** Require Docker, may be skipped in CI

**Update snapshots:** When generation changes are intentional, run `pnpm test:run -u`

## Code Conventions

- **TypeScript:** Use Biome for linting/formatting
- **Naming:** camelCase for functions, PascalCase for classes
- **Templates:** Handlebars with custom helpers in `generator.ts`
- **Error handling:** Use consola for logging, Zod for validation
- **Type safety:** Strict TypeScript with no implicit any

## Important Architecture Notes

1. **Parser is minimal:** Only parses metadata comments, treats SQL as opaque blocks
2. **Type introspection via execution:** Runs queries against real databases to get types
3. **Template separation:** Code patterns live in `.hbs` files, logic in generators
4. **No full SQL parsing:** Uses Lezer for annotations only, not SQL syntax

## Common Tasks

### Add a new database engine
1. Implement adapter in `sqg/src/db/new-engine.ts`
2. Export from `sqg/src/database.ts`
3. Add to engine switch in `sqltool.ts`

### Add a new target language
1. Create template: `sqg/src/templates/new-lang.hbs`
2. Create type mapper in `type-mapping.ts`
3. Create generator class in `generator.ts`
4. Register generator name in `getGenerator()`

### Debug type introspection
- Check that migrations run successfully in `database.ts`
- Verify column types are captured correctly after query execution
- Look at `SQLQuery.columns` after `executeQueries()`

## CLI Reference (for AI Agents)

### Commands

```bash
sqg <config>              # Generate code from config file
sqg init [options]        # Initialize new project
sqg syntax                # Show SQL annotation syntax reference
sqg --help                # Show all options
```

### Key Options

| Option | Description |
|--------|-------------|
| `--validate` | Validate config without generating code |
| `--format json` | Output as JSON (useful for parsing errors programmatically) |
| `--verbose` | Show detailed debug output |

### JSON Output Mode

Use `--format json` for machine-readable output:

```bash
sqg --validate --format json sqg.yaml
```

Returns structured JSON with validation results or errors:

```json
{
  "valid": true,
  "project": { "name": "my-project", "version": 1 },
  "sqlFiles": ["queries.sql"],
  "generators": ["typescript/better-sqlite3"]
}
```

### Error Codes

All errors include structured codes for programmatic handling:

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

### Supported Engines & Generators

Defined in `sqg/src/constants.ts`:

| Engine | Compatible Generators |
|--------|----------------------|
| `sqlite` | `typescript/better-sqlite3`, `java/jdbc` |
| `duckdb` | `typescript/duckdb`, `java/jdbc`, `java/duckdb-arrow` |
| `postgres` | `java/jdbc` |
