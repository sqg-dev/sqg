---
id: migrations
title: Schema Migrations
description: Example with multiple migrations
sql: |
  -- MIGRATE 1
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- MIGRATE 2
  CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  -- QUERY all_users
  SELECT * FROM users ORDER BY created_at DESC;
engine: sqlite
language: typescript
---

