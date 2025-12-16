---
title: Related Projects
description: Similar tools and alternatives to SQG
---

SQG isn't the only tool for generating type-safe database code. Here's how it compares to similar projects and when you might choose one over another.

## SQL-First Code Generators

These tools, like SQG, start with SQL and generate typed code.

### sqlc

**Language:** Go, with experimental TypeScript/Python support
**Website:** [sqlc.dev](https://sqlc.dev)

sqlc is the most popular SQL-first code generator, primarily for Go. It parses SQL using a full SQL parser and generates type-safe Go code.

**How SQG differs:**
- SQG uses runtime type introspection instead of SQL parsing
- SQG has first-class TypeScript and Java support
- sqlc has a larger community and more mature Go support
- SQG supports DuckDB's complex types (structs, lists, maps)

**Choose sqlc if:** You're building in Go and want a mature, well-supported tool.

**Choose SQG if:** You need TypeScript/Java, use DuckDB, or prefer runtime introspection.

### PgTyped

**Language:** TypeScript
**Website:** [pgtyped.dev](https://pgtyped.dev)

PgTyped generates TypeScript types from PostgreSQL queries. It uses a query parser and connects to PostgreSQL for type information.

**How SQG differs:**
- SQG supports SQLite and DuckDB, not just PostgreSQL
- PgTyped uses SQL comments with `@name` annotations
- SQG generates full wrapper classes, PgTyped generates types only
- PgTyped has a VS Code extension for inline type hints

**Choose PgTyped if:** You're PostgreSQL-only and want minimal generated code.

**Choose SQG if:** You need multi-database support or prefer generated wrapper functions.

### Kysely

**Language:** TypeScript
**Website:** [kysely.dev](https://kysely.dev)

Kysely is a type-safe SQL query builder for TypeScript. Unlike SQG, you write queries in TypeScript using a fluent API.

**How SQG differs:**
- SQG uses raw SQL; Kysely uses a query builder
- Kysely queries are type-checked as you write them
- SQG has zero runtime overhead; Kysely builds queries at runtime
- Kysely works with any SQL database via plugins

**Choose Kysely if:** You prefer a query builder API and want IDE autocomplete for queries.

**Choose SQG if:** You want to write raw SQL and avoid runtime query building.

## ORMs

Object-Relational Mappers provide a higher-level abstraction over databases.

### Prisma

**Language:** TypeScript, JavaScript
**Website:** [prisma.io](https://prisma.io)

Prisma is a popular ORM with its own schema language, migrations, and query client.

**How SQG differs:**
- SQG uses SQL directly; Prisma uses its own query API
- Prisma manages your schema; SQG works with existing schemas
- Prisma handles migrations end-to-end; SQG just stores them
- Prisma has a larger ecosystem (Prisma Studio, etc.)

**Choose Prisma if:** You want a full-featured ORM with managed migrations and tooling.

**Choose SQG if:** You want raw SQL control and minimal abstraction.

### Drizzle ORM

**Language:** TypeScript
**Website:** [orm.drizzle.team](https://orm.drizzle.team)

Drizzle is a TypeScript ORM that's "closer to SQL" than Prisma, with a SQL-like query API.

**How SQG differs:**
- Drizzle uses a TypeScript schema definition; SQG uses SQL
- Drizzle builds queries at runtime; SQG uses static SQL
- Drizzle has relational queries; SQG requires explicit JOINs

**Choose Drizzle if:** You want an ORM with SQL-like syntax and TypeScript schemas.

**Choose SQG if:** You prefer writing actual SQL and want build-time code generation.

### TypeORM / Sequelize

**Language:** TypeScript, JavaScript
**Website:** [typeorm.io](https://typeorm.io), [sequelize.org](https://sequelize.org)

Traditional ORMs with decorator-based or model-based entity definitions.

**How SQG differs:**
- These ORMs use runtime reflection and decorators
- More "magic" - automatic query generation, lazy loading, etc.
- Larger learning curve but more features
- SQG has zero runtime overhead

**Choose these if:** You want a traditional ORM experience with Active Record patterns.

**Choose SQG if:** You prefer explicit SQL and minimal abstraction.

## Java Ecosystem

### jOOQ

**Language:** Java
**Website:** [jooq.org](https://jooq.org)

jOOQ generates Java code from your database schema and provides a fluent DSL for writing type-safe queries.

**How SQG differs:**
- jOOQ generates code from schema; SQG from queries
- jOOQ has a runtime query builder; SQG uses static SQL strings
- jOOQ is a commercial product (with a free tier)
- SQG is simpler but less feature-rich

**Choose jOOQ if:** You need advanced Java SQL building with enterprise support.

**Choose SQG if:** You want simple, SQL-first code generation for Java.

### MyBatis

**Language:** Java
**Website:** [mybatis.org](https://mybatis.org)

MyBatis is a persistence framework that maps SQL to Java objects using XML or annotations.

**How SQG differs:**
- MyBatis uses XML configuration; SQG uses YAML + SQL files
- MyBatis has runtime mapping; SQG generates static code
- MyBatis is more mature with larger community
- SQG generates simpler, more transparent code

**Choose MyBatis if:** You need a mature, flexible SQL mapping framework.

**Choose SQG if:** You want generated code without XML configuration.

## Other Notable Tools

### Atlas

**Website:** [atlasgo.io](https://atlasgo.io)

Schema migration tool using HCL or SQL. Focuses on database schema management rather than query generation.

**Complementary to SQG:** Use Atlas for schema management, SQG for query code generation.

### Flyway / Liquibase

**Websites:** [flywaydb.org](https://flywaydb.org), [liquibase.org](https://liquibase.org)

Database migration tools for managing schema changes across environments.

**Complementary to SQG:** These handle production migrations; SQG's migrations are for type introspection during development.

### SQLX (Rust)

**Website:** [github.com/launchbadge/sqlx](https://github.com/launchbadge/sqlx)

Compile-time SQL verification for Rust. Similar philosophy to SQG but for Rust with macro-based query checking.

**Inspiration for SQG:** SQLX demonstrates the value of compile-time SQL verification.

## Comparison Table

| Tool | Approach | Languages | Databases | Runtime Overhead |
|------|----------|-----------|-----------|------------------|
| **SQG** | SQL-first, introspection | TS, Java | SQLite, DuckDB, PG | None |
| sqlc | SQL-first, parsing | Go, TS, Python | PostgreSQL, MySQL | None |
| PgTyped | SQL-first, introspection | TypeScript | PostgreSQL | Minimal |
| Kysely | Query builder | TypeScript | Many | Query building |
| Prisma | ORM, schema-first | TypeScript | Many | Runtime client |
| Drizzle | ORM, SQL-like | TypeScript | Many | Query building |
| jOOQ | Schema-first, DSL | Java | Many | Query building |

## When to Choose SQG

SQG is a good fit when you:

- Want to write raw SQL, not learn a query builder or ORM API
- Need type safety without runtime overhead
- Use DuckDB and want support for complex types
- Want generated code that's readable and debuggable
- Need TypeScript and/or Java from the same SQL definitions
- Prefer simple tools with minimal configuration

SQG might not be the best fit when you:

- Need dynamic query composition at runtime
- Want automatic schema migrations in production
- Prefer query builder APIs over raw SQL
- Need features like lazy loading or entity caching
- Require extensive tooling (visual editors, etc.)
