---
id: parameters
title: Query with Parameters
description: Example using @set parameters
sql: |
  -- MIGRATE 1
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  );

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
engine: sqlite
language: typescript
---

