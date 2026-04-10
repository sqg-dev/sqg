-- MIGRATE 1

create table users (
    id text primary key,
    name text not null,
    email text unique
);

CREATE TYPE task_status AS ENUM ('pending', 'active', 'completed', 'cancelled');

CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    status task_status DEFAULT 'pending',
    tags TEXT[],
    priority_scores INTEGER[]
);

CREATE TABLE bigint_test (
    id BIGINT PRIMARY KEY,
    serial_id BIGSERIAL NOT NULL,
    small_id SMALLINT,
    regular_id INTEGER,
    amount BIGINT NOT NULL,
    name TEXT NOT NULL
);

CREATE TABLE uuid_test (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL
);

CREATE TABLE all_types_test (
    id SERIAL PRIMARY KEY,
    bool_val BOOLEAN,
    small_val SMALLINT,
    int_val INTEGER,
    big_val BIGINT,
    real_val REAL,
    double_val DOUBLE PRECISION,
    numeric_val NUMERIC(10, 2),
    text_val TEXT,
    varchar_val VARCHAR(255),
    date_val DATE,
    ts_val TIMESTAMP,
    tstz_val TIMESTAMPTZ,
    uuid_val UUID,
    json_val JSONB,
    int_arr INTEGER[],
    text_arr TEXT[],
    big_arr BIGINT[]
);

CREATE TABLE identity_test (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name TEXT NOT NULL,
    value INTEGER
);

CREATE TYPE tricky_enum AS ENUM ('hello', 'HELLO', ' hello', ' hello ', 'hello_1');

CREATE TABLE tricky_test (
    id SERIAL PRIMARY KEY,
    val tricky_enum NOT NULL
);


-- TESTDATA seed_tasks
INSERT INTO tasks (title, status, tags, priority_scores) VALUES
    ('Task 1', 'active', ARRAY['urgent', 'backend'], ARRAY[10, 20, 30]),
    ('Task 2', 'pending', ARRAY['frontend'], ARRAY[5, 15]);


-- QUERY users1
select * from users;

-- QUERY users2 :pluck :one
select id from users where id = '1';

-- QUERY users3 :pluck :one
select name from users where id = '1';


-- QUERY users4  :one

select email, name from users where id = '1';


/* QUERY users5

  result:
    count: integer not null

*/
select 10 count, email from users where id = '1';



/* QUERY users6 :one
  result:
   email: text not null
*/
@set name = 'name'


SELECT * FROM users WHERE name = ${name}


-- QUERY users7

@set name = 'name'
SELECT * FROM users WHERE name = ${name}


-- QUERY get_tasks_by_status
@set status = 'active'
SELECT id, title, status, tags, priority_scores FROM tasks WHERE status = ${status}::task_status;


-- QUERY get_all_tasks
SELECT id, title, status, tags, priority_scores FROM tasks;


-- QUERY get_task_tags :one :pluck
SELECT tags FROM tasks WHERE id = 1;


-- QUERY get_task_priorities :one :pluck
SELECT priority_scores FROM tasks WHERE id = 1;


-- EXEC insert_task :batch
@set title = 'Test Task'
@set status = 'active'
@set tags = '{test,urgent}'
@set priority_scores = '{1,2}'
INSERT INTO tasks (title, status, tags, priority_scores) VALUES (${title}, ${status}::task_status, ${tags}, ${priority_scores});

-- TESTDATA seed_bigint
INSERT INTO bigint_test (id, small_id, regular_id, amount, name) VALUES (1, 42, 100, 9999999999, 'test');

-- EXEC insert_bigint_record :batch
@set id = 2
@set small_id = 7
@set regular_id = 200
@set amount = 1234567890
@set name = 'inserted'
INSERT INTO bigint_test (id, small_id, regular_id, amount, name) VALUES (${id}, ${small_id}, ${regular_id}, ${amount}, ${name});

-- QUERY get_bigint_record :one
@set id = 1
SELECT id, serial_id, small_id, regular_id, amount, name FROM bigint_test WHERE id = ${id};

-- QUERY get_bigint_amount :one :pluck
@set id = 1
SELECT amount FROM bigint_test WHERE id = ${id};

-- QUERY count_bigint_test :one :pluck
SELECT COUNT(*) FROM bigint_test;

-- TESTDATA seed_tricky
INSERT INTO tricky_test (val) VALUES ('hello'), ('HELLO'), (' hello'), (' hello '), ('hello_1');

-- EXEC insert_tricky :batch
@set val = 'hello'
INSERT INTO tricky_test (val) VALUES (${val}::tricky_enum);

-- QUERY get_tricky_values
SELECT id, val FROM tricky_test;

-- TESTDATA seed_uuid
INSERT INTO uuid_test (id, label) VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'test-uuid');

-- EXEC insert_uuid :batch
@set id = 'b1ffcd00-1d1c-5ff9-cc7e-7ccaae491b22'
@set label = 'test'
INSERT INTO uuid_test (id, label) VALUES (${id}::uuid, ${label});

-- QUERY get_uuid_by_id :one
@set id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
SELECT id, label FROM uuid_test WHERE id = ${id}::uuid;

-- EXEC insert_user :batch
@set id = 'test'
@set name = 'Test User'
@set email = 'test@example.com'
INSERT INTO users (id, name, email) VALUES (${id}, ${name}, ${email});

-- EXEC update_user_email :batch
@set id = 'test'
@set email = 'new@example.com'
UPDATE users SET email = ${email} WHERE id = ${id};

-- EXEC delete_user :batch
@set id = 'test'
DELETE FROM users WHERE id = ${id};

-- TABLE bigint_test :appender

-- TABLE tasks :appender

-- TABLE all_types_test :appender

-- TABLE identity_test :appender

-- QUERY get_identity_records
SELECT * FROM identity_test ORDER BY id;

-- QUERY get_all_types_record :one
@set id = 1
SELECT * FROM all_types_test WHERE id = ${id};
