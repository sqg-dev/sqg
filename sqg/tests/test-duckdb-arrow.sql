-- MIGRATE 1 

CREATE SEQUENCE seq_users_id START 1;

create table if not exists users (
    id integer primary key not null default nextval('seq_users_id'),
    name text not null,
    email text not null unique
);


create table if not exists actions (
    id integer primary key not null,
    action text not null,
    value double,
    user_id integer not null references users(id),
    timestamp integer not null
);

-- EXEC insert

@set name = 'John Doe'
@set email = 'john.doe@example.com'
insert into users (name, email) values (${name}, ${email});


-- QUERY all 
select 'abc' as a,1 as x,* from users;

-- QUERY all_emails :pluck
select email from users;

-- QUERY by_id  :one
@set id = 1
select * from users where id = ${id} limit 1;

-- QUERY by_email :one

@set email = 'john.doe@example.com'
select * from users where email = ${email};

-- QUERY get_id_by_email :one :pluck
@set email = 'john.doe@example.com'
select id from users where email = ${email};


-- EXEC update_email
@set id = 1
@set email = 'john.doe@example.com'

update users set email = ${email} where id = ${id};

-- EXEC delete
@set id = 1
delete from users where id = ${id};   


-- QUERY actions_by_user_id
@set user_id = 1
select * from actions where user_id = ${user_id};

-- QUERY actions_by_user_id_and_action 
@set user_id = 1
@set action = 'click'

select * from actions  -- line comment
/*
 block comment 

*/
  where user_id = ${user_id} and action = ${action};

/* end */

/* 
  QUERY top_users :all

  config:
    - limit: 10
    - order_by: total_value
    - order_direction: desc


*/

SELECT user_id, SUM(value) as total_value FROM actions GROUP BY user_id ORDER BY total_value DESC LIMIT 10;

       

-- QUERY test         
         
@set a  = 5
  
 select 1 as n where ${a} ::int is null; -- ok /* lol */ aaa

-- QUERY test2         
 select /* -- test */ 1 as n; 
 
-- QUERY test3         
 select '--ok' b,2 as a -- nice 1 
 
-- QUERY test4         
 select '/* lol */' s /* ok */, 5 as z
 
-- QUERY test5         
 select 'a 	' x , 'a	 a' y, 1 as c 
 
 