-- Schema for an external production database, declared as a postgres `source`.
-- During generation SQG starts a throwaway postgres testcontainer, applies these
-- :source=prod BASELINE blocks NATIVELY to it (true Postgres types), attaches it
-- into the DuckDB introspection connection as `prod`, and type-checks the queries.
-- The schema and the synthesized ATTACH are NOT emitted — at runtime the
-- application attaches the real production database under the same `prod` alias.

-- BASELINE prod_orders :source=prod
create table orders (
    id bigint primary key,
    customer text not null,
    total numeric(10, 2),
    created_at timestamp
);

-- QUERY getOrder :one
@set id = 1
select id, customer, total, created_at from prod.public.orders where id = ${id};

-- QUERY listOrders
select id, customer from prod.public.orders order by id;
