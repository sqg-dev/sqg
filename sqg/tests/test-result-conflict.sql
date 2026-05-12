-- Fixture used by sqltool.test.ts to verify that conflicting `:result=`
-- annotations on incompatible shapes are rejected end-to-end (parser → dedup).

-- MIGRATE 1
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT
) STRICT;

-- QUERY name_email :result=Foo
SELECT name, email FROM users;

-- QUERY id_name :result=Foo
SELECT id, name FROM users;
