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

-- TESTDATA seed
insert into posts (id, author_id, title) values (1, 999, 'orphan');

-- QUERY allPosts
select id, title from posts;
