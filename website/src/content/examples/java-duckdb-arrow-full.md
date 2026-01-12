---
id: java-duckdb-arrow-full
title: Java DuckDB Arrow Complete Example
description: Full example for Java DuckDB Arrow generator with complex types
sql: |
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
engine: duckdb
language: java-arrow
---

