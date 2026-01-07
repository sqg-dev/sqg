---
title: CLI Reference
description: Complete reference for SQG command-line interface
---

Complete reference for the SQG command-line interface.

## Commands

### `sqg <config-file>`

Generate code from a configuration file.

```bash
sqg sqg.yaml
sqg path/to/config.yaml
```

**Options:**

| Option | Description |
|--------|-------------|
| `--validate` | Validate configuration without generating code |
| `--format <format>` | Output format: `text` (default) or `json` |
| `--verbose` | Enable debug logging |

**Examples:**

```bash
# Generate code
sqg sqg.yaml

# Validate only
sqg --validate sqg.yaml

# JSON output for tooling
sqg --format json sqg.yaml

# Debug mode
sqg --verbose sqg.yaml

# Combine options
sqg --validate --format json sqg.yaml
```

---

### `sqg init`

Initialize a new SQG project with example files.

```bash
sqg init [options]
```

**Options:**

| Option | Default | Description |
|--------|---------|-------------|
| `-e, --engine <engine>` | `sqlite` | Database engine: `sqlite`, `duckdb`, `postgres` |
| `-g, --generator <gen>` | Auto | Code generator (auto-selected if omitted) |
| `-o, --output <dir>` | `./generated` | Output directory for generated files |
| `-f, --force` | `false` | Overwrite existing files |

**Default generators by engine:**

| Engine | Default Generator |
|--------|-------------------|
| `sqlite` | `typescript/better-sqlite3` |
| `duckdb` | `typescript/duckdb` |
| `postgres` | `java/jdbc` |

**Examples:**

```bash
# SQLite + TypeScript (default)
sqg init

# DuckDB project
sqg init --engine duckdb

# Custom generator
sqg init --engine sqlite --generator java/jdbc

# Custom output directory
sqg init --output ./src/db

# Overwrite existing files
sqg init --force

# Full example
sqg init --engine duckdb --generator typescript/duckdb --output ./src/generated --force
```

**Created files:**

```
./
├── sqg.yaml        # Project configuration
├── queries.sql     # Example SQL file with migrations and queries
└── generated/      # Output directory (empty)
```

---

### `sqg syntax`

Display SQL annotation syntax reference.

```bash
sqg syntax
```

Shows:
- Query types (`MIGRATE`, `QUERY`, `EXEC`, `TESTDATA`)
- Modifiers (`:one`, `:pluck`, `:all`)
- Variable syntax (`@set`, `${var}`)
- Examples

---

## Global Options

These options work with all commands:

| Option | Description |
|--------|-------------|
| `-v, --version` | Display version number |
| `-h, --help` | Display help for command |
| `--verbose` | Enable debug logging |
| `--format <format>` | Output format: `text` or `json` |

---

## JSON Output Mode

Use `--format json` for machine-readable output, ideal for:
- CI/CD pipelines
- Editor integrations
- AI assistants
- Build tools

### Successful Generation

```bash
sqg --format json sqg.yaml
```

```json
{
  "status": "success",
  "generatedFiles": [
    "/path/to/generated/my-app.ts"
  ]
}
```

### Validation Result

```bash
sqg --validate --format json sqg.yaml
```

```json
{
  "valid": true,
  "project": {
    "name": "my-app",
    "version": 1
  },
  "sqlFiles": ["queries.sql"],
  "generators": ["typescript/better-sqlite3"]
}
```

### Error Output

```bash
sqg --format json invalid.yaml
```

```json
{
  "status": "error",
  "error": {
    "code": "FILE_NOT_FOUND",
    "message": "SQL file not found: queries.sql",
    "suggestion": "Check that queries.sql exists relative to /path/to/project",
    "context": {
      "file": "/path/to/project/queries.sql"
    }
  }
}
```

---

## Error Codes

SQG provides structured error codes for programmatic handling:

| Code | Description |
|------|-------------|
| `CONFIG_PARSE_ERROR` | Invalid YAML syntax in config file |
| `CONFIG_VALIDATION_ERROR` | Configuration doesn't match schema |
| `FILE_NOT_FOUND` | SQL or config file doesn't exist |
| `INVALID_ENGINE` | Unknown database engine specified |
| `INVALID_GENERATOR` | Unknown generator specified |
| `GENERATOR_ENGINE_MISMATCH` | Generator not compatible with engine |
| `SQL_PARSE_ERROR` | Invalid SQL annotation syntax |
| `SQL_EXECUTION_ERROR` | Query failed during type introspection |
| `DUPLICATE_QUERY` | Two queries have the same name |
| `MISSING_VARIABLE` | Variable referenced but not defined with `@set` |
| `VALIDATION_ERROR` | General validation error |
| `DATABASE_ERROR` | Database connection or execution error |
| `TYPE_MAPPING_ERROR` | Unable to map SQL type to target language |

### Error Suggestions

All errors include actionable suggestions:

```json
{
  "error": {
    "code": "INVALID_GENERATOR",
    "message": "Invalid generator 'typescript/sqlite'",
    "suggestion": "Use 'typescript/better-sqlite3' instead"
  }
}
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Success |
| `1` | Error (check output for details) |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SQG_POSTGRES_URL` | PostgreSQL connection string for type introspection |

**Example:**

```bash
export SQG_POSTGRES_URL="postgresql://user:pass@localhost:5432/mydb"
sqg sqg.yaml
```

---

## Configuration File

See [Getting Started](/guides/getting-started/#project-configuration) for full configuration documentation.

**Minimal example:**

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

---

## Supported Engines

| Engine | Description |
|--------|-------------|
| `sqlite` | SQLite (in-memory for introspection) |
| `duckdb` | DuckDB (in-memory for introspection) |
| `postgres` | PostgreSQL (requires running server) |

---

## Supported Generators

| Generator | Engine(s) | Output |
|-----------|-----------|--------|
| `typescript/better-sqlite3` | `sqlite` | TypeScript with sync API |
| `typescript/duckdb` | `duckdb` | TypeScript with async API |
| `java/jdbc` | `sqlite`, `duckdb`, `postgres` | Java with JDBC |
| `java/duckdb-arrow` | `duckdb` | Java with Arrow API |

See individual generator pages for detailed documentation:
- [TypeScript + SQLite](/generators/typescript-sqlite/)
- [TypeScript + DuckDB](/generators/typescript-duckdb/)
- [Java + JDBC](/generators/java-jdbc/)
- [Java + DuckDB Arrow](/generators/java-duckdb-arrow/)

---

## Troubleshooting

### Debug Mode

```bash
sqg --verbose sqg.yaml
```

Shows:
- SQL file parsing details
- Database initialization
- Query execution
- Type introspection results

### Validate Before Generate

```bash
sqg --validate sqg.yaml
```

Catches configuration errors before running full generation.

### Check Version

```bash
sqg --version
```

Ensure you're running the expected version.
