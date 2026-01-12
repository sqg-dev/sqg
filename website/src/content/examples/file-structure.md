---
id: file-structure
title: Complete File Structure Example
description: Example showing all block types in an SQG SQL file
sql: |
  -- MIGRATE 1
  CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);

  -- MIGRATE 2
  ALTER TABLE users ADD COLUMN email TEXT;

  -- TESTDATA test1
  INSERT INTO users VALUES (1, 'Test User', 'test@example.com');

  -- QUERY get_all_users
  SELECT * FROM users;

  -- QUERY get_user :one
  @set id = 1
  SELECT * FROM users WHERE id = ${id};

  -- EXEC create_user
  @set name = 'John'
  @set email = 'john@example.com'
  INSERT INTO users (name, email) VALUES (${name}, ${email});
engine: sqlite
language: typescript
---

