---
id: java-jdbc-full
title: Java JDBC Complete Example
description: Full example for Java JDBC generator
sql: |
  -- MIGRATE 1
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    active INTEGER DEFAULT 1
  );

  -- QUERY all_users
  SELECT id, name, email, active FROM users ORDER BY name;

  -- QUERY get_user :one
  @set id = 1
  SELECT id, name, email, active FROM users WHERE id = ${id};

  -- QUERY find_active_users
  @set active = 1
  SELECT id, name, email FROM users WHERE active = ${active};

  -- EXEC create_user
  @set name = 'John Doe'
  @set email = 'john@example.com'
  INSERT INTO users (name, email) VALUES (${name}, ${email});

  -- EXEC update_user
  @set id = 1
  @set name = 'Jane Doe'
  @set email = 'jane@example.com'
  UPDATE users SET name = ${name}, email = ${email} WHERE id = ${id};

  -- EXEC delete_user
  @set id = 1
  DELETE FROM users WHERE id = ${id};
engine: sqlite
language: java-jdbc
---

