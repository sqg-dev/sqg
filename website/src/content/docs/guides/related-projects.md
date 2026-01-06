---
title: Related Projects
description: Similar tools and alternatives to SQG
---

There are many other tools out there, here is a list of popular alternatives.

**Note**: This research was done with the help of AI, please send a PR if you would like to add or change something.

## SQL ORMs and Code Generators

### sqlc
**Languages:** Go, TypeScript, Python  
**Website:** [sqlc.dev](https://sqlc.dev)<br>
**GitHub:** [sqlc-dev/sqlc](https://github.com/sqlc-dev/sqlc)
 <a class="github-button" href="https://github.com/sqlc-dev/sqlc" 
 style="margin-left:5px;"
 data-color-scheme="no-preference: light; light: light; dark: dark;" data-show-count="true" aria-label="Star on GitHub">Star</a>

Parses SQL using a full SQL parser and generates type-safe code. Primarily focused on Go.

**Differences:** Uses SQL parsing instead of runtime introspection. Stronger Go ecosystem support.

### PgTyped
**Language:** TypeScript  
**Website:** [pgtyped.dev](https://pgtyped.dev)<br>
**GitHub:** [adelsz/pgtyped](https://github.com/adelsz/pgtyped)
 <a class="github-button" href="https://github.com/adelsz/pgtyped" 
 style="margin-left:5px;"
 data-color-scheme="no-preference: light; light: light; dark: dark;" data-show-count="true" aria-label="Star on GitHub">Star</a>

Generates TypeScript types from PostgreSQL queries using query parsing and database introspection.

**Differences:** PostgreSQL-only. Generates types rather than wrapper classes.

### SQLDelight
**Languages:** Kotlin, Swift, C++  
**Website:** [cashapp.github.io/sqldelight](https://sqldelight.github.io/sqldelight/latest/)<br>
**GitHub:** [cashapp/sqldelight](https://github.com/sqldelight/sqldelight)
 <a class="github-button" href="https://github.com/sqldelight/sqldelight" 
 style="margin-left:5px;"
 data-color-scheme="no-preference: light; light: light; dark: dark;" data-show-count="true" aria-label="Star on GitHub">Star</a>

Generates type-safe Kotlin code from SQL queries. Supports multiple platforms including Android, iOS, and JVM.

**Differences:** Kotlin-focused with multi-platform support. Uses SQL parsing.

### Kysely
**Language:** TypeScript  
**Website:** [kysely.dev](https://kysely.dev)<br>
**GitHub:** [kysely-org/kysely](https://github.com/kysely-org/kysely)
 <a class="github-button" href="https://github.com/kysely-org/kysely" 
 style="margin-left:5px;"
 data-color-scheme="no-preference: light; light: light; dark: dark;" data-show-count="true" aria-label="Star on GitHub">Star</a>

Type-safe SQL query builder with a fluent API. Queries are built at runtime.

**Differences:** Query builder API vs. raw SQL. Runtime query construction.

### Dapper
**Language:** C# (.NET)  
**Website:** [github.com/DapperLib/Dapper](https://www.learndapper.com/)<br>
**GitHub:** [DapperLib/Dapper](https://github.com/DapperLib/Dapper)
 <a class="github-button" href="https://github.com/DapperLib/Dapper" 
 style="margin-left:5px;"
 data-color-scheme="no-preference: light; light: light; dark: dark;" data-show-count="true" aria-label="Star on GitHub">Star</a>

Micro-ORM for .NET that extends IDbConnection with methods for mapping SQL query results to objects.

**Differences:** Runtime mapping with extension methods. No code generation.


### Prisma
**Languages:** TypeScript, JavaScript  
**Website:** [prisma.io](https://prisma.io)<br>
**GitHub:** [prisma/prisma](https://github.com/prisma/prisma)
 <a class="github-button" href="https://github.com/prisma/prisma" 
 style="margin-left:5px;"
 data-color-scheme="no-preference: light; light: light; dark: dark;" data-show-count="true" aria-label="Star on GitHub">Star</a>

ORM with schema language, migrations, and query client.

**Differences:** Uses schema definitions and query API rather than raw SQL.

### Drizzle ORM
**Language:** TypeScript  
**Website:** [orm.drizzle.team](https://orm.drizzle.team)<br>
**GitHub:** [drizzle-team/drizzle-orm](https://github.com/drizzle-team/drizzle-orm)
 <a class="github-button" href="https://github.com/drizzle-team/drizzle-orm" 
 style="margin-left:5px;"
 data-color-scheme="no-preference: light; light: light; dark: dark;" data-show-count="true" aria-label="Star on GitHub">Star</a>

TypeScript ORM with SQL-like query API and TypeScript schema definitions.

**Differences:** Schema-first approach with runtime query building.

### SQLAlchemy
**Language:** Python  
**Website:** [sqlalchemy.org](https://sqlalchemy.org)<br>
**GitHub:** [sqlalchemy/sqlalchemy](https://github.com/sqlalchemy/sqlalchemy)
 <a class="github-button" href="https://github.com/sqlalchemy/sqlalchemy" 
 style="margin-left:5px;"
 data-color-scheme="no-preference: light; light: light; dark: dark;" data-show-count="true" aria-label="Star on GitHub">Star</a>

Python SQL toolkit and ORM with both SQL expression language and high-level ORM API.

**Differences:** Dual-layer architecture with both SQL and ORM APIs. Runtime query building.

### Exposed
**Language:** Kotlin  
**Website:** [github.com/JetBrains/Exposed](https://github.com/JetBrains/Exposed)<br>
**GitHub:** [JetBrains/Exposed](https://github.com/JetBrains/Exposed)
 <a class="github-button" href="https://github.com/JetBrains/Exposed" 
 style="margin-left:5px;"
 data-color-scheme="no-preference: light; light: light; dark: dark;" data-show-count="true" aria-label="Star on GitHub">Star</a>

Kotlin SQL framework with both type-safe DSL and lightweight ORM capabilities.

**Differences:** Kotlin DSL for queries. Runtime query building.


### jOOQ
**Language:** Java  
**Website:** [jooq.org](https://jooq.org)<br>
**GitHub:** [jOOQ/jOOQ](https://github.com/jOOQ/jOOQ)
 <a class="github-button" href="https://github.com/jOOQ/jOOQ" 
 style="margin-left:5px;"
 data-color-scheme="no-preference: light; light: light; dark: dark;" data-show-count="true" aria-label="Star on GitHub">Star</a>

Generates Java code from database schema and provides a fluent DSL for type-safe queries.

**Differences:** Schema-first code generation with runtime query builder.

### MyBatis
**Language:** Java  
**Website:** [mybatis.org](https://mybatis.org)<br>
**GitHub:** [mybatis/mybatis-3](https://github.com/mybatis/mybatis-3)
 <a class="github-button" href="https://github.com/mybatis/mybatis-3" 
 style="margin-left:5px;"
 data-color-scheme="no-preference: light; light: light; dark: dark;" data-show-count="true" aria-label="Star on GitHub">Star</a>

Persistence framework that maps SQL to Java objects using XML or annotations.

**Differences:** XML-based configuration with runtime mapping.

### Hibernate
**Language:** Java  
**Website:** [hibernate.org](https://hibernate.org)<br>
**GitHub:** [hibernate/hibernate-orm](https://github.com/hibernate/hibernate-orm)
 <a class="github-button" href="https://github.com/hibernate/hibernate-orm" 
 style="margin-left:5px;"
 data-color-scheme="no-preference: light; light: light; dark: dark;" data-show-count="true" aria-label="Star on GitHub">Star</a>

Mature Java ORM implementing JPA specification with extensive features and ecosystem.

**Differences:** Full-featured ORM with entity management, caching, and lazy loading.

### JPA (Java Persistence API)
**Language:** Java  
**Website:** [jakarta.ee/specifications/persistence](https://jakarta.ee/specifications/persistence)

Java standard specification for object-relational mapping. Implemented by Hibernate, EclipseLink, and others.

**Differences:** Standard API specification. Implementations provide full ORM features.




<script async defer src="https://buttons.github.io/buttons.js"></script>