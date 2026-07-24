import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSQLQueries } from "../src/sql-query";

function parseSQL(content: string) {
  const tmpPath = join(
    tmpdir(),
    `sqg-test-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`,
  );
  writeFileSync(tmpPath, content);
  try {
    return parseSQLQueries(tmpPath, []);
  } finally {
    unlinkSync(tmpPath);
  }
}

describe("placeholder spacing", () => {
  // `LIMIT ${n}` used to render as `LIMIT$1`, which Postgres lexes as the
  // identifier `limit$1` instead of a placeholder. https://github.com/sqg-dev/sqg/issues/10
  it("keeps the whitespace in front of a variable", () => {
    const query = parseSQL(`-- QUERY paged
@set lim = 10
SELECT * FROM users LIMIT \${lim};
`).queries[0];

    expect(query.queryPositional.sql).toBe("SELECT * FROM users LIMIT $1;");
    expect(query.queryNamed.sql).toBe("SELECT * FROM users LIMIT $lim;");
    expect(query.queryAnonymous.sql).toBe("SELECT * FROM users LIMIT ?;");
  });

  it("separates a placeholder from a preceding keyword even without whitespace", () => {
    const query = parseSQL(`-- QUERY paged
@set lim = 10
SELECT * FROM users LIMIT\${lim};
`).queries[0];

    expect(query.queryPositional.sql).toBe("SELECT * FROM users LIMIT $1;");
    expect(query.queryAnonymous.sql).toBe("SELECT * FROM users LIMIT ?;");
  });

  it("does not add whitespace after operators or punctuation", () => {
    const query = parseSQL(`-- QUERY find
@set name = 'bob'
@set lim = 10
SELECT * FROM users WHERE name=\${name} AND rank>\${lim};
`).queries[0];

    expect(query.queryPositional.sql).toBe("SELECT * FROM users WHERE name=$1 AND rank>$2;");
  });

  // sqlParts feeds the template-literal renderers (TS/Java), so it has to carry
  // the same spacing as the joined `sql` string.
  it("keeps sqlParts and the joined sql in sync", () => {
    const query = parseSQL(`-- QUERY paged
@set lim = 10
@set off = 0
SELECT * FROM users LIMIT \${lim} OFFSET \${off};
`).queries[0];

    expect(query.queryPositional.sqlParts).toEqual([
      "SELECT * FROM users LIMIT ",
      "$1",
      " OFFSET ",
      "$2",
      ";",
    ]);
    expect(query.queryAnonymous.sqlParts).toEqual([
      "SELECT * FROM users LIMIT ",
      "?",
      " OFFSET ",
      "?",
      ";",
    ]);
    expect(query.queryNamed.sqlParts).toEqual([
      "SELECT * FROM users LIMIT ",
      "$lim",
      " OFFSET ",
      "$off",
      ";",
    ]);
  });
});
