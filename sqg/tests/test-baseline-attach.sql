-- Demonstrates attaching an external database via BASELINE so SQG can
-- introspect queries against it, while the application performs its own ATTACH
-- at runtime. An in-memory catalog is used here so the test needs no live
-- server; in real use this is `ATTACH '<dsn>' AS prod (TYPE postgres)` pointed
-- at a local docker container that replicates the production schema.
--
-- All three BASELINE blocks run before introspection but are NOT emitted into
-- getMigrations() — the app owns the attach + schema at runtime.

-- BASELINE attach_prod
attach ':memory:' as prod;

-- BASELINE prod_schema
create schema prod.public;

-- BASELINE prod_orders
create table prod.public.orders (
    id bigint,
    customer varchar,
    total decimal(10, 2),
    created_at timestamp
);

-- QUERY getOrder :one
@set id = 1
select id, customer, total, created_at from prod.public.orders where id = ${id};

-- QUERY listOrders
select id, customer from prod.public.orders order by id;
