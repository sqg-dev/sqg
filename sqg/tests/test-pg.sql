-- MIGRATE 1 

create table users (
    id text primary key,
    name text not null,
    email text unique
);


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
