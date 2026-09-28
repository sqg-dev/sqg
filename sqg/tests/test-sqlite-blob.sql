-- MIGRATE 1
create table files (
    hash text primary key,
    size integer not null,
    created_at integer not null,
    data blob not null
);

-- `x'…'` in @set is a BLOB parameter: bound as real bytes while introspecting
-- and typed as the language's byte type, not text.
-- EXEC putFile
@set hash = 'abc'
@set size = 3
@set created_at = 1700000000000
@set data = x'00ff10'
insert into files (hash, size, created_at, data) values (${hash}, ${size}, ${created_at}, ${data});

-- QUERY getFile :one
@set hash = 'abc'
select size, created_at, data from files where hash = ${hash};

-- substr on a BLOB yields a BLOB; the typeof() probe sees real bytes.
-- QUERY readSlice :one :pluck
@set start = 1
@set length = 2
@set hash = 'abc'
select substr(data, ${start}, ${length}) from files where hash = ${hash};
