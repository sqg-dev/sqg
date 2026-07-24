-- Schema with a NOT NULL foreign key: introspection runs every statement
-- against an empty database, so the parent row referenced by insertPost can
-- never exist. Generation must still succeed.
-- MIGRATE 1
create table authors (
    id integer primary key,
    name text not null
);

-- MIGRATE 2
create table posts (
    id integer primary key,
    author_id integer not null references authors(id),
    title text not null
);

-- EXEC insertPost
@set id = 1
@set author_id = 42
@set title = 'hello'
insert into posts (id, author_id, title) values (${id}, ${author_id}, ${title});

-- QUERY postsByAuthor
@set author_id = 42
@set lim = 10
select id, title from posts where author_id = ${author_id} limit ${lim};
