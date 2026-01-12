---
id: duckdb-appender
title: DuckDB Appender
description: High-performance bulk inserts using DuckDB's Appender API
sql: |
  -- MIGRATE 1
  CREATE TABLE events (
      id INTEGER PRIMARY KEY,
      event_type VARCHAR NOT NULL,
      payload VARCHAR,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- TABLE events :appender
engine: duckdb
language: typescript
---

