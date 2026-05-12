# SQG Skill for AI Agents

A reusable skill that teaches AI coding agents (Claude Code, Cursor, Codex, Copilot, etc.) how to use [SQG](https://sqg.dev) — a SQL Query Generator that emits type-safe TypeScript, Java, and Python code from annotated `.sql` files.

## What this skill covers

- The full SQL annotation syntax (`-- QUERY`, `-- EXEC`, `-- MIGRATE`, `-- BASELINE`, `-- TABLE :appender`, `@set`, `${var}`, modifiers `:one` / `:pluck` / `:all` / `:result=`)
- How to write and validate a `sqg.yaml` configuration
- All supported generators (TypeScript / Java / Python × SQLite / DuckDB / PostgreSQL, plus DuckDB Arrow)
- The CLI surface (`sqg`, `sqg init`, `sqg syntax`, `sqg --validate`, `sqg mcp`, `sqg ui`)
- Common error codes and how to react to them
- When to prefer the SQG MCP server over shelling out

## Installation

Using the [skills.sh](https://skills.sh) CLI:

```bash
npx skills add sqg-dev/sqg/skill
```

Or install manually by copying `SKILL.md` into your agent's skills directory (e.g. `.claude/skills/sqg/SKILL.md`).

## Triggering

The skill activates on a broad range of SQL + codegen phrases. It is appropriate when the user wants typed query results from annotated SQL — including any mention of SQG, `sqg.yaml`, type-safe queries, better-sqlite3, `@duckdb/node-api`, DuckDB Arrow, JDBC-generated code, psycopg, or DuckDB appenders.

## Repository

- Site: https://sqg.dev
- Source: https://github.com/sqg-dev/sqg
- Examples: see [`examples/`](../examples/) in the SQG repo

## License

MIT
