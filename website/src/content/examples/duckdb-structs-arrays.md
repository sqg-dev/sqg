---
id: duckdb-structs-arrays
title: DuckDB Structs and Arrays
description: Example with DuckDB complex types including structs and arrays
sql: |
  -- MIGRATE 1
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name VARCHAR NOT NULL,
    email VARCHAR UNIQUE,
    metadata STRUCT(role VARCHAR, active BOOLEAN),
    tags VARCHAR[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  -- TESTDATA seed
  INSERT INTO users (id, name, email, metadata, tags)
  VALUES (1, 'Alice', 'alice@example.com',
          {'role': 'admin', 'active': true},
          ['developer', 'lead']);

  -- QUERY all_users
  SELECT * FROM users ORDER BY created_at DESC;

  -- QUERY get_user :one
  @set id = 1
  SELECT * FROM users WHERE id = ${id};

  -- QUERY get_user_tags :one :pluck
  @set id = 1
  SELECT tags FROM users WHERE id = ${id};

  -- EXEC create_user
  @set id = 2
  @set name = 'Bob'
  @set email = 'bob@example.com'
  INSERT INTO users (id, name, email) VALUES (${id}, ${name}, ${email});
engine: duckdb
language: typescript
---

