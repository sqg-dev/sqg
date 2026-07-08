-- MIGRATE 1
create table users (
    id integer primary key,
    name text not null,
    email text
);

-- QUERY allUsers
select id, name, email from users order by id;

-- QUERY userById :one
@set id = 1
select id, name, email from users where id = ${id};

-- QUERY nameById :one :pluck
@set id = 1
select name from users where id = ${id};

-- EXEC insertUser
@set id = 1
@set name = 'a'
@set email = 'a@b.c'
insert into users (id, name, email) values (${id}, ${name}, ${email});

-- EXEC insertUserBatch :batch
@set id = 2
@set name = 'a'
@set email = 'a@b.c'
insert into users (id, name, email) values (${id}, ${name}, ${email});
