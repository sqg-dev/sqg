-- A query that does NOT reference any postgres source. Even though the project
-- declares a `prod` postgres source (used by a different sql block), the
-- generated code for this file must stay byte-identical to a project with no
-- sources at all — in particular, no attach<Source>() helper.

-- QUERY countNumbers :one :pluck
select count(*) from range(10);
