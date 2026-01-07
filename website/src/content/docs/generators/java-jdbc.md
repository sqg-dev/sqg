---
title: Java + JDBC
description: Generate type-safe Java code using standard JDBC for any database
---

Generate Java code using standard JDBC APIs. Works with any JDBC-compatible database including SQLite, DuckDB, PostgreSQL, MySQL, and more.

## Overview

| Property | Value |
|----------|-------|
| Generator | `java/jdbc` |
| Compatible Engines | `sqlite`, `duckdb`, `postgres` |
| Runtime | JVM (Java 17+) |
| API Style | Synchronous |
| Driver | Any JDBC driver |

## Installation

Add SQG to your build process and include the appropriate JDBC driver:

```bash
# Install SQG globally
pnpm add -g @sqg/sqg
```

### Gradle Dependencies

```groovy
// build.gradle

// SQLite
implementation 'org.xerial:sqlite-jdbc:3.45.0.0'

// DuckDB
implementation 'org.duckdb:duckdb_jdbc:1.0.0'

// PostgreSQL
implementation 'org.postgresql:postgresql:42.7.0'
```

### Maven Dependencies

```xml
<!-- pom.xml -->

<!-- SQLite -->
<dependency>
    <groupId>org.xerial</groupId>
    <artifactId>sqlite-jdbc</artifactId>
    <version>3.45.0.0</version>
</dependency>

<!-- DuckDB -->
<dependency>
    <groupId>org.duckdb</groupId>
    <artifactId>duckdb_jdbc</artifactId>
    <version>1.0.0</version>
</dependency>

<!-- PostgreSQL -->
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <version>42.7.0</version>
</dependency>
```

## Configuration

```yaml
# sqg.yaml
version: 1
name: my-app

sql:
  - engine: sqlite  # or: duckdb, postgres
    files:
      - queries.sql
    gen:
      - generator: java/jdbc
        output: ./src/main/java/com/myapp/db/
        config:
          package: com.myapp.db
```

The `config.package` option specifies the Java package name for generated classes.

## Quick Start

### 1. Write your SQL

```sql
-- queries.sql

-- MIGRATE 1
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  active INTEGER DEFAULT 1
);

-- QUERY all_users
SELECT id, name, email, active FROM users ORDER BY name;

-- QUERY get_user :one
@set id = 1
SELECT id, name, email, active FROM users WHERE id = ${id};

-- QUERY find_active_users
@set active = 1
SELECT id, name, email FROM users WHERE active = ${active};

-- EXEC create_user
@set name = 'John Doe'
@set email = 'john@example.com'
INSERT INTO users (name, email) VALUES (${name}, ${email});

-- EXEC update_user
@set id = 1
@set name = 'Jane Doe'
@set email = 'jane@example.com'
UPDATE users SET name = ${name}, email = ${email} WHERE id = ${id};

-- EXEC delete_user
@set id = 1
DELETE FROM users WHERE id = ${id};
```

### 2. Generate code

```bash
sqg sqg.yaml
```

### 3. Use the generated code

```java
import com.myapp.db.MyApp;
import java.sql.Connection;
import java.sql.DriverManager;

public class Main {
    public static void main(String[] args) throws Exception {
        // Connect to database
        Connection conn = DriverManager.getConnection("jdbc:sqlite:app.db");

        // Run migrations
        for (String migration : MyApp.getMigrations()) {
            conn.createStatement().execute(migration);
        }

        // Create query instance
        MyApp queries = new MyApp(conn);

        // Insert data
        queries.createUser("Alice", "alice@example.com");
        queries.createUser("Bob", "bob@example.com");

        // Query data
        for (MyApp.AllUsersRow user : queries.allUsers()) {
            System.out.println(user.name() + ": " + user.email());
        }

        // Get single row
        MyApp.GetUserRow user = queries.getUser(1);
        if (user != null) {
            System.out.println("Found: " + user.name());
        }

        // Update data
        queries.updateUser(1, "Alice Smith", "alice.smith@example.com");

        // Delete data
        queries.deleteUser(2);

        conn.close();
    }
}
```

## Generated Code Structure

The generator creates a single Java file with:

- **Record types** for each query result
- **A class** with methods for each query/exec
- **Static `getMigrations()`** method returning migration SQL strings

Example generated code:

```java
package com.myapp.db;

import java.sql.*;
import java.util.*;

public class MyApp {
    private final Connection connection;

    public MyApp(Connection connection) {
        this.connection = connection;
    }

    public static String[] getMigrations() {
        return new String[] {
            "CREATE TABLE users (...)"
        };
    }

    // Query result records
    public record AllUsersRow(Integer id, String name, String email, Integer active) {}
    public record GetUserRow(Integer id, String name, String email, Integer active) {}

    // Query methods
    public List<AllUsersRow> allUsers() throws SQLException {
        // Implementation using PreparedStatement
    }

    public GetUserRow getUser(Integer id) throws SQLException {
        // Returns null if not found
    }

    // Exec methods
    public void createUser(String name, String email) throws SQLException {
        // Implementation using PreparedStatement
    }
}
```

## Connection Management

### Simple Connection

```java
Connection conn = DriverManager.getConnection("jdbc:sqlite:app.db");
MyApp queries = new MyApp(conn);
// ... use queries ...
conn.close();
```

### Connection Pooling (HikariCP)

```java
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;

HikariConfig config = new HikariConfig();
config.setJdbcUrl("jdbc:postgresql://localhost:5432/mydb");
config.setUsername("user");
config.setPassword("password");

HikariDataSource ds = new HikariDataSource(config);

try (Connection conn = ds.getConnection()) {
    MyApp queries = new MyApp(conn);
    // ... use queries ...
}
```

### Try-with-resources

```java
try (Connection conn = DriverManager.getConnection(url)) {
    MyApp queries = new MyApp(conn);

    for (var user : queries.allUsers()) {
        System.out.println(user.name());
    }
} // Connection automatically closed
```

## Transactions

```java
Connection conn = DriverManager.getConnection(url);
conn.setAutoCommit(false);

try {
    MyApp queries = new MyApp(conn);

    queries.debit(fromAccount, amount);
    queries.credit(toAccount, amount);

    conn.commit();
} catch (SQLException e) {
    conn.rollback();
    throw e;
} finally {
    conn.setAutoCommit(true);
}
```

## Type Mapping

| SQL Type | Java Type |
|----------|-----------|
| `INTEGER`, `INT` | `Integer` |
| `BIGINT` | `Long` |
| `REAL`, `DOUBLE` | `Double` |
| `FLOAT` | `Float` |
| `TEXT`, `VARCHAR` | `String` |
| `BLOB` | `byte[]` |
| `BOOLEAN` | `Boolean` |
| `DATE` | `LocalDate` |
| `TIMESTAMP` | `LocalDateTime` |
| `TIME` | `LocalTime` |
| `DECIMAL`, `NUMERIC` | `BigDecimal` |
| `UUID` | `UUID` |

All types are nullable (using wrapper classes).

## Database-Specific Notes

### SQLite

```java
// JDBC URL
String url = "jdbc:sqlite:path/to/database.db";

// In-memory database
String url = "jdbc:sqlite::memory:";
```

### DuckDB

```java
// JDBC URL
String url = "jdbc:duckdb:path/to/database.duckdb";

// In-memory database
String url = "jdbc:duckdb:";
```

### PostgreSQL

```java
// JDBC URL
String url = "jdbc:postgresql://localhost:5432/mydb";

// With credentials
String url = "jdbc:postgresql://localhost:5432/mydb?user=myuser&password=mypass";
```

## Integration with Spring

```java
@Repository
public class UserRepository {
    private final MyApp queries;

    public UserRepository(DataSource dataSource) throws SQLException {
        this.queries = new MyApp(dataSource.getConnection());
    }

    public List<MyApp.AllUsersRow> findAll() throws SQLException {
        return queries.allUsers();
    }

    public Optional<MyApp.GetUserRow> findById(int id) throws SQLException {
        return Optional.ofNullable(queries.getUser(id));
    }
}
```

## Limitations

- **No async support** - JDBC is synchronous
- **Manual connection management** - You handle connections and pooling
- **SQLException handling** - All methods throw SQLException

## See Also

- [Java + DuckDB Arrow](/generators/java-duckdb-arrow/) - Higher performance Arrow API for DuckDB
- [TypeScript + SQLite](/generators/typescript-sqlite/) - TypeScript equivalent for SQLite
- [TypeScript + DuckDB](/generators/typescript-duckdb/) - TypeScript equivalent for DuckDB
- [SQL Syntax Reference](/guides/sql-syntax/)
- [FAQ](/guides/faq/)
