---
id: basic-query
title: Basic User Query
description: Simple SELECT query example
sql: |
  -- MIGRATE 1
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  );

  -- QUERY all_users
  SELECT * FROM users;
engine: sqlite
language: typescript
---

