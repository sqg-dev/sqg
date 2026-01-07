---
title: Java + DuckDB Arrow
description: Generate high-performance Java code for DuckDB using the Apache Arrow API
---

Generate Java code for DuckDB using the high-performance Apache Arrow API. This generator provides zero-copy data access and is optimized for analytical workloads with large result sets.

## Overview

| Property | Value |
|----------|-------|
| Generator | `java/duckdb-arrow` |
| Engine | `duckdb` |
| Runtime | JVM (Java 17+) |
| API Style | Synchronous with Arrow vectors |
| Driver | DuckDB Java + Arrow |

## When to Use

Choose `java/duckdb-arrow` over `java/jdbc` when:

- Processing **large result sets** (millions of rows)
- Building **analytics applications**
- Need **maximum performance** for data processing
- Working with **complex types** (structs, lists, maps)
- Integrating with **Arrow-based tools** (Pandas, Spark)

Use `java/jdbc` instead when:
- Working with small result sets
- Need portability across databases
- Simpler integration requirements

## Installation

### Gradle

```groovy
// build.gradle
dependencies {
    implementation 'org.duckdb:duckdb_jdbc:1.0.0'
    implementation 'org.apache.arrow:arrow-vector:15.0.0'
    implementation 'org.apache.arrow:arrow-memory-netty:15.0.0'
}
```

### Maven

```xml
<!-- pom.xml -->
<dependencies>
    <dependency>
        <groupId>org.duckdb</groupId>
        <artifactId>duckdb_jdbc</artifactId>
        <version>1.0.0</version>
    </dependency>
    <dependency>
        <groupId>org.apache.arrow</groupId>
        <artifactId>arrow-vector</artifactId>
        <version>15.0.0</version>
    </dependency>
    <dependency>
        <groupId>org.apache.arrow</groupId>
        <artifactId>arrow-memory-netty</artifactId>
        <version>15.0.0</version>
    </dependency>
</dependencies>
```

## Configuration

```yaml
# sqg.yaml
version: 1
name: analytics

sql:
  - engine: duckdb
    files:
      - queries.sql
    gen:
      - generator: java/duckdb-arrow
        output: ./src/main/java/com/myapp/analytics/
        config:
          package: com.myapp.analytics
```

## Quick Start

### 1. Write your SQL

```sql
-- queries.sql

-- MIGRATE 1
CREATE TABLE events (
  id INTEGER,
  user_id INTEGER,
  event_type VARCHAR,
  properties STRUCT(page VARCHAR, referrer VARCHAR),
  tags VARCHAR[],
  timestamp TIMESTAMP
);

-- TESTDATA seed
INSERT INTO events VALUES
  (1, 100, 'pageview', {'page': '/home', 'referrer': 'google.com'}, ['web'], NOW()),
  (2, 100, 'click', {'page': '/products', 'referrer': '/home'}, ['web', 'conversion'], NOW());

-- QUERY events_by_user
@set user_id = 100
SELECT * FROM events WHERE user_id = ${user_id} ORDER BY timestamp DESC;

-- QUERY event_counts
SELECT event_type, COUNT(*) as count
FROM events
GROUP BY event_type
ORDER BY count DESC;

-- QUERY events_with_tag
@set tag = 'web'
SELECT * FROM events WHERE list_contains(tags, ${tag});
```

### 2. Generate code

```bash
sqg sqg.yaml
```

### 3. Use the generated code

```java
import com.myapp.analytics.Analytics;
import org.duckdb.DuckDBConnection;
import java.sql.DriverManager;

public class Main {
    public static void main(String[] args) throws Exception {
        // Connect to DuckDB
        DuckDBConnection conn = (DuckDBConnection) DriverManager
            .getConnection("jdbc:duckdb:");

        // Run migrations
        for (String migration : Analytics.getMigrations()) {
            conn.createStatement().execute(migration);
        }

        // Create query instance
        Analytics queries = new Analytics(conn);

        // Query with Arrow result
        for (var event : queries.eventsByUser(100)) {
            System.out.println(event.eventType());
            System.out.println(event.properties().page());  // Struct access
            System.out.println(event.tags());  // List access
        }

        // Aggregate query
        for (var count : queries.eventCounts()) {
            System.out.printf("%s: %d%n", count.eventType(), count.count());
        }

        conn.close();
    }
}
```

## Complex Types

The Arrow generator provides native support for DuckDB's complex types:

### Structs

```sql
CREATE TABLE products (
  id INTEGER,
  details STRUCT(name VARCHAR, price DOUBLE, available BOOLEAN)
);
```

```java
var product = queries.getProduct(1);
System.out.println(product.details().name());
System.out.println(product.details().price());
System.out.println(product.details().available());
```

### Lists

```sql
CREATE TABLE posts (
  id INTEGER,
  tags VARCHAR[],
  scores INTEGER[]
);
```

```java
var post = queries.getPost(1);
List<String> tags = post.tags();  // Direct List access
List<Integer> scores = post.scores();
```

### Nested Types

```sql
CREATE TABLE reports (
  id INTEGER,
  data STRUCT(
    summary VARCHAR,
    metrics STRUCT(views INTEGER, clicks INTEGER)[]
  )
);
```

```java
var report = queries.getReport(1);
System.out.println(report.data().summary());
for (var metric : report.data().metrics()) {
    System.out.printf("Views: %d, Clicks: %d%n",
        metric.views(), metric.clicks());
}
```

## Type Mapping

| DuckDB Type | Java Type |
|-------------|-----------|
| `INTEGER` | `Integer` |
| `BIGINT` | `Long` |
| `DOUBLE` | `Double` |
| `VARCHAR` | `String` |
| `BOOLEAN` | `Boolean` |
| `TIMESTAMP` | `Instant` |
| `DATE` | `LocalDate` |
| `TIME` | `LocalTime` |
| `DECIMAL` | `BigDecimal` |
| `UUID` | `UUID` |
| `BLOB` | `byte[]` |
| `STRUCT(...)` | Generated record type |
| `T[]` | `List<T>` |
| `MAP(K,V)` | `HashMap<K,V>` |

## Performance Considerations

### Batch Processing

Arrow enables efficient batch processing:

```java
// Process large results in batches
try (var result = queries.largeQuery()) {
    while (result.hasNext()) {
        var batch = result.nextBatch();
        processBatch(batch);
    }
}
```

### Memory Management

Arrow uses off-heap memory. For large queries:

```java
// Increase Arrow memory allocation
System.setProperty("arrow.memory.max", "4g");
```

### Connection Reuse

Reuse connections for multiple queries:

```java
DuckDBConnection conn = (DuckDBConnection) DriverManager
    .getConnection("jdbc:duckdb:analytics.duckdb");
Analytics queries = new Analytics(conn);

// Reuse for multiple operations
var users = queries.allUsers();
var events = queries.recentEvents();
var metrics = queries.calculateMetrics();
```

## Generated Code Structure

```java
package com.myapp.analytics;

import org.duckdb.*;
import java.sql.*;
import java.util.*;

public class Analytics {
    private final DuckDBConnection connection;

    public Analytics(DuckDBConnection connection) {
        this.connection = connection;
    }

    // Struct record for complex types
    public record PropertiesResult(String page, String referrer) {
        private static PropertiesResult fromAttributes(Object[] v) {
            return new PropertiesResult((String)v[0], (String)v[1]);
        }
    }

    // Query result record
    public record EventsByUserRow(
        Integer id,
        Integer userId,
        String eventType,
        PropertiesResult properties,
        List<String> tags,
        Instant timestamp
    ) {}

    // Query method
    public List<EventsByUserRow> eventsByUser(Integer userId) throws SQLException {
        // Uses Arrow API for efficient data transfer
    }
}
```

## Use Cases

- **Real-time analytics dashboards**
- **Log analysis and aggregation**
- **Data pipeline processing**
- **Machine learning feature extraction**
- **Business intelligence applications**

## Example: Analytics Dashboard

```sql
-- QUERY daily_metrics
@set start_date = '2024-01-01'
@set end_date = '2024-01-31'
SELECT
  DATE_TRUNC('day', timestamp) as day,
  COUNT(*) as events,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(*) FILTER (WHERE event_type = 'conversion') as conversions
FROM events
WHERE timestamp BETWEEN ${start_date} AND ${end_date}
GROUP BY 1
ORDER BY 1;

-- QUERY top_pages
@set limit_count = 10
SELECT
  properties.page as page,
  COUNT(*) as views,
  COUNT(DISTINCT user_id) as unique_visitors
FROM events
WHERE event_type = 'pageview'
GROUP BY 1
ORDER BY views DESC
LIMIT ${limit_count};
```

## Limitations

- **DuckDB only** - Not portable to other databases
- **More dependencies** - Requires Arrow libraries
- **Memory usage** - Arrow vectors use off-heap memory
- **Java 17+ required** - Uses modern Java features

## See Also

- [Java + JDBC](/generators/java-jdbc/) - Simpler JDBC-based option (also supports DuckDB)
- [TypeScript + DuckDB](/generators/typescript-duckdb/) - TypeScript equivalent
- [SQL Syntax Reference](/guides/sql-syntax/)
- [FAQ](/guides/faq/)
- [DuckDB Java Documentation](https://duckdb.org/docs/api/java)
