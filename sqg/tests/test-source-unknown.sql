-- A :source= referencing a source that is not declared in sqg.yaml.

-- BASELINE orphan :source=ghost
create table x (id integer);

-- QUERY q :one
select 1 as n;
