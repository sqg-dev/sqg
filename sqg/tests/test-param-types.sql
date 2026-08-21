-- MIGRATE 1
create table events(day date, n integer, label text, big bigint);

-- `@set x = null` must produce a nullable parameter, and must bind as a real
-- SQL NULL during introspection (binding the string "null" fails on BIGINT).
-- EXEC insertNullable
@set day = '2024-01-01'
@set label = null
@set big = null
insert into events(day, label, big) values (${day}::DATE, ${label}, ${big});

-- Parameters DuckDB cannot type at prepare time. Each of these makes
-- `parameterType()` throw "Failed to get param logical type"; the type must
-- fall back to the `@set` default instead of failing the whole query.

-- DDL cannot be typed at all: DuckDB resolves the parameter only on bind.
-- EXEC ddlWithParam
@set seed = 5
create or replace temp table tmp as select ${seed} as a;

-- Arithmetic on a cast leaves the second operand untyped.
-- QUERY castMinusParam
@set since = '2024-01-01'
@set days = 3
select n from events where day > (cast(${since} as DATE) - ${days});

-- strptime() does not constrain its argument's type.
-- QUERY strptimeParam
@set since = '2024-01-01'
select n from events where day > strptime(${since}, '%Y-%m-%d');

-- Forms DuckDB *can* type, kept as a control so the fallback never shadows
-- a real introspected type.
-- QUERY castParam
@set since = '2024-01-01'
select n from events where day > cast(${since} as DATE);
