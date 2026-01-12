---
id: getting-started-full
title: Complete Getting Started Example
description: Full example with migrations, queries, and exec statements
sql: |
  -- MIGRATE 1
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  );

  -- QUERY all_users
  SELECT * FROM users;

  -- QUERY get_user :one
  @set id = 1
  SELECT * FROM users WHERE id = ${id};

  -- EXEC create_user
  @set name = 'John Doe'
  @set email = 'john@example.com'
  INSERT INTO users (name, email) VALUES (${name}, ${email});

  -- EXEC delete_user
  @set id = 1
  DELETE FROM users WHERE id = ${id};
engine: sqlite
language: typescript
---

