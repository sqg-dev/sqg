-- QUERY test1

select 1 as x;


-- EXEC attach

attach ${sources_users} as "users" (TYPE SQLITE);


-- QUERY test2

select * from users.users limit 10;