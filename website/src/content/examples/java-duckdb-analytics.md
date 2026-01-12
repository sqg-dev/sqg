---
id: java-duckdb-analytics
title: Analytics Dashboard
description: Example analytics dashboard queries with aggregations and date filtering
sql: |
  -- MIGRATE 1
  CREATE TABLE events (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      event_type VARCHAR NOT NULL,
      properties STRUCT(page VARCHAR, referrer VARCHAR),
      timestamp TIMESTAMP NOT NULL
  );

  -- TESTDATA seed
  INSERT INTO events (id, user_id, event_type, properties, timestamp) VALUES
    (1, 100, 'pageview', {'page': '/home', 'referrer': 'google'}, TIMESTAMP '2024-01-15 10:00:00'),
    (2, 101, 'pageview', {'page': '/products', 'referrer': 'direct'}, TIMESTAMP '2024-01-15 11:00:00'),
    (3, 100, 'conversion', {'page': '/checkout', 'referrer': 'internal'}, TIMESTAMP '2024-01-15 12:00:00'),
    (4, 102, 'pageview', {'page': '/home', 'referrer': 'google'}, TIMESTAMP '2024-01-16 09:00:00'),
    (5, 101, 'conversion', {'page': '/checkout', 'referrer': 'internal'}, TIMESTAMP '2024-01-16 14:00:00');

  -- QUERY daily_metrics
  @set start_date = 2024-01-01
  @set end_date = 2024-01-31
  SELECT
    DATE_TRUNC('day', timestamp) as day,
    COUNT(*) as events,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(*) FILTER (WHERE event_type = 'conversion') as conversions
  FROM events
  WHERE timestamp BETWEEN ${start_date} AND ${end_date}
  GROUP BY 1
  ORDER BY 1;

  -- QUERY top_pages
  @set limit_count = 10
  SELECT
    properties.page as page,
    COUNT(*) as views,
    COUNT(DISTINCT user_id) as unique_visitors
  FROM events
  WHERE event_type = 'pageview'
  GROUP BY 1
  ORDER BY views DESC
  LIMIT ${limit_count};
engine: duckdb
language: java-arrow
---

