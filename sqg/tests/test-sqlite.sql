-- MIGRATE 1 

create table  users (
    id text primary key,
    name text not null,
    email text unique
) strict;


-- QUERY users1
select * from users;

-- QUERY users2 :pluck :one
select id from users where id = '1';

-- QUERY users3 :pluck :one
select name from users where id = '1';

-- QUERY allEmails :pluck
select email from users;

-- QUERY existsAny :one :pluck
select exists(select 1 from users where id = '1');

-- QUERY countAll :one :pluck
select count(*) from users;

-- QUERY castSum :one :pluck
select cast(count(*) as integer) as n from users where id = '1';

-- QUERY existsNoSemi :one :pluck
select exists(select 1 from users where id = '1')

-- QUERY countTrailingWs :one :pluck
select count(*) from users ;

-- MIGRATE 2
create table bigints (
  id integer primary key,
  posts bigint,
  total bigint not null
);

-- TESTDATA bigints_seed
insert into bigints (id, posts, total) values (1, 100, 200);

-- QUERY getBigints :one
select posts, total from bigints where id = 1;



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

-- QUERY reserved_word_test :one
SELECT name as class, email as type FROM users WHERE id = '1'
