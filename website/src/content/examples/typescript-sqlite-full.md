---
id: typescript-sqlite-full
title: TypeScript SQLite Complete Example
description: Full example with migrations, queries, and exec statements
sql: |
  -- MIGRATE 1
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  -- QUERY all_users
  SELECT * FROM users ORDER BY created_at DESC;

  -- QUERY get_user :one
  @set id = 1
  SELECT * FROM users WHERE id = ${id};

  -- QUERY find_users_by_name
  @set name = 'John'
  SELECT * FROM users WHERE name LIKE '%' || ${name} || '%';

  -- EXEC create_user
  @set name = 'John Doe'
  @set email = 'john@example.com'
  INSERT INTO users (name, email) VALUES (${name}, ${email});

  -- EXEC update_user
  @set id = 1
  @set name = 'Jane Doe'
  UPDATE users SET name = ${name} WHERE id = ${id};

  -- EXEC delete_user
  @set id = 1
  DELETE FROM users WHERE id = ${id};
engine: sqlite
language: typescript
---

