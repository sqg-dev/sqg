-- Install and load the SQLite extension
INSTALL sqlite;
LOAD sqlite;

attach 'users.sqlite' (type sqlite);
use "users";

drop table if exists "users";

-- Create a table
CREATE TABLE users (
    id INTEGER,
    name TEXT,
    email TEXT
);

-- Insert sample data
INSERT INTO users VALUES (1, 'Alice', 'alice@example.com');
INSERT INTO users VALUES (2, 'Bob', 'bob@example.com');


