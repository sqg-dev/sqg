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
