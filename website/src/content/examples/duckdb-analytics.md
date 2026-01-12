---
id: duckdb-analytics
title: Analytics Query
description: Example analytics query with aggregations and date filtering
sql: |
  -- MIGRATE 1
  CREATE TABLE orders (
      id INTEGER PRIMARY KEY,
      region VARCHAR NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      order_date DATE NOT NULL
  );

  -- TESTDATA seed
  INSERT INTO orders (id, region, amount, order_date) VALUES
    (1, 'North', 100.50, DATE '2024-01-15'),
    (2, 'South', 250.75, DATE '2024-02-20'),
    (3, 'North', 175.25, DATE '2024-03-10'),
    (4, 'East', 300.00, DATE '2024-04-05'),
    (5, 'South', 125.50, DATE '2024-05-12');

  -- QUERY sales_by_region
  @set start_date = 2024-01-01
  @set end_date = 2024-12-31
  SELECT
    region,
    COUNT(*) as order_count,
    SUM(amount) as total_sales,
    AVG(amount) as avg_order_value
  FROM orders
  WHERE order_date BETWEEN ${start_date} AND ${end_date}
  GROUP BY region
  ORDER BY total_sales DESC;
engine: duckdb
language: typescript
---

