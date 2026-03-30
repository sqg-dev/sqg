import { describe, expect, it } from "vitest";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseSQLQueries } from "../src/sql-query";

function parseSQL(content: string) {
  const tmpPath = join(tmpdir(), `sqg-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  writeFileSync(tmpPath, content);
  try {
    return parseSQLQueries(tmpPath, []);
  } finally {
    unlinkSync(tmpPath);
  }
}

describe("parseSQLQueries line numbers", () => {
  it("reports correct line for first annotation at line 1", () => {
    const result = parseSQL(`-- QUERY first
select 1 as n;
`);
    expect(result.queries).toHaveLength(1);
    expect(result.queries[0].id).toBe("first");
    expect(result.queries[0].line).toBe(1);
  });

  it("reports correct line for annotation after blank lines", () => {
    const result = parseSQL(`

-- QUERY second
select 1 as n;
`);
    expect(result.queries[0].id).toBe("second");
    expect(result.queries[0].line).toBe(3);
  });

  it("reports correct lines for multiple queries", () => {
    const result = parseSQL(`-- MIGRATE 1
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);

-- EXEC insert_user
@set name = 'John'
INSERT INTO users (name) VALUES (\${name});

-- QUERY get_users
SELECT * FROM users;

-- QUERY get_user_by_id :one
@set id = 1
SELECT * FROM users WHERE id = \${id};
`);
    expect(result.queries.map(q => [q.id, q.line])).toEqual([
      ["1", 1],
      ["insert_user", 4],
      ["get_users", 8],
      ["get_user_by_id", 11],
    ]);
  });

  it("reports correct lines with no-space annotation format (--QUERY)", () => {
    const result = parseSQL(`--MIGRATE 1
CREATE TABLE topics (id INTEGER PRIMARY KEY, name TEXT);

--QUERY getTopics
SELECT * FROM topics;
`);
    expect(result.queries.map(q => [q.id, q.line])).toEqual([
      ["1", 1],
      ["getTopics", 4],
    ]);
  });

  it("reports correct lines for TABLE annotations", () => {
    const result = parseSQL(`-- MIGRATE 1
CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);

-- TABLE users :appender

-- TABLE actions :appender
`);
    expect(result.tables.map(t => [t.id, t.line])).toEqual([
      ["users", 4],
      ["actions", 6],
    ]);
  });

  it("reports correct lines with block comment annotations", () => {
    const result = parseSQL(`-- MIGRATE 1
CREATE TABLE users (id INTEGER PRIMARY KEY);

/* QUERY fancy :one */
SELECT 1 as n;
`);
    expect(result.queries[0].id).toBe("1");
    expect(result.queries[0].line).toBe(1);
    expect(result.queries[1].id).toBe("fancy");
    expect(result.queries[1].line).toBe(4);
  });

  it("reports correct lines with leading whitespace on annotations", () => {
    const result = parseSQL(`-- MIGRATE 1
CREATE TABLE users (id INTEGER PRIMARY KEY);

 -- QUERY indented
SELECT * FROM users;
`);
    expect(result.queries[1].id).toBe("indented");
    expect(result.queries[1].line).toBe(4);
  });

  it("handles real-world file with mixed annotation types", () => {
    const result = parseSQL(`-- MIGRATE 1

CREATE SEQUENCE seq_users_id START 1;

create table if not exists users (
    id integer primary key not null default nextval('seq_users_id'),
    name text not null,
    email text not null unique
);

-- EXEC insert
@set name = 'John Doe'
@set email = 'john.doe@example.com'
insert into users (name, email) values (\${name}, \${email});

-- QUERY all
select * from users;

-- QUERY by_id :one
@set id = 1
select * from users where id = \${id} limit 1;

-- TABLE users :appender
`);
    const queries = result.queries.map(q => [q.id, q.type, q.line]);
    expect(queries).toEqual([
      ["1", "MIGRATE", 1],
      ["insert", "EXEC", 11],
      ["all", "QUERY", 16],
      ["by_id", "QUERY", 19],
    ]);

    expect(result.tables).toHaveLength(1);
    expect(result.tables[0].id).toBe("users");
    expect(result.tables[0].line).toBe(23);
  });
});
