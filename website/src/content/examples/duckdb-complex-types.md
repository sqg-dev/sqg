---
id: duckdb-complex-types
title: DuckDB Complex Types
description: DuckDB struct and array example
sql: |
  -- MIGRATE 1
  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    tags TEXT[],
    metadata STRUCT(
      price DOUBLE,
      category TEXT,
      in_stock BOOLEAN
    )
  );

  -- QUERY all_products
  SELECT * FROM products;

  -- QUERY products_by_category
  @set category = 'electronics'
  SELECT * FROM products WHERE metadata.category = ${category};

  -- TABLE products :appender
engine: duckdb
language: typescript
---

