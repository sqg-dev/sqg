import { describe, it, expect } from 'vitest';
import { extractCTEs, detectDependencies, debugTree } from './cte-extractor';

describe('extractCTEs', () => {
  it('should return empty CTEs for query without WITH clause', () => {
    const sql = 'SELECT * FROM users';
    const result = extractCTEs(sql);

    expect(result.ctes).toHaveLength(0);
    expect(result.recursive).toBe(false);
    expect(result.mainQuery).toBe('SELECT * FROM users');
  });

  it('should parse a simple CTE', () => {
    const sql = `
      WITH active_users AS (
        SELECT * FROM users WHERE active = true
      )
      SELECT * FROM active_users
    `;
    const result = extractCTEs(sql);

    expect(result.ctes).toHaveLength(1);
    expect(result.ctes[0].name).toBe('active_users');
    expect(result.ctes[0].body).toContain('SELECT * FROM users WHERE active = true');
    expect(result.recursive).toBe(false);
  });

  it('should parse multiple CTEs', () => {
    const sql = `
      WITH
        first_cte AS (SELECT 1),
        second_cte AS (SELECT 2),
        third_cte AS (SELECT 3)
      SELECT * FROM third_cte
    `;
    const result = extractCTEs(sql);

    expect(result.ctes).toHaveLength(3);
    expect(result.ctes[0].name).toBe('first_cte');
    expect(result.ctes[1].name).toBe('second_cte');
    expect(result.ctes[2].name).toBe('third_cte');
  });

  it('should detect RECURSIVE keyword', () => {
    const sql = `
      WITH RECURSIVE counter AS (
        SELECT 1 AS n
        UNION ALL
        SELECT n + 1 FROM counter WHERE n < 10
      )
      SELECT * FROM counter
    `;
    const result = extractCTEs(sql);

    expect(result.recursive).toBe(true);
    expect(result.ctes).toHaveLength(1);
    expect(result.ctes[0].name).toBe('counter');
  });

  it('should handle nested parentheses in CTE body', () => {
    const sql = `
      WITH stats AS (
        SELECT
          category,
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count
        FROM items
        GROUP BY category
      )
      SELECT * FROM stats
    `;
    const result = extractCTEs(sql);

    expect(result.ctes).toHaveLength(1);
    expect(result.ctes[0].body).toContain('CASE WHEN');
    expect(result.ctes[0].body).toContain('GROUP BY category');
  });

  it('should handle string literals in CTE body', () => {
    const sql = `
      WITH greeting AS (
        SELECT 'Hello, World!' AS message, 'It''s a test' AS escaped
      )
      SELECT * FROM greeting
    `;
    const result = extractCTEs(sql);

    expect(result.ctes).toHaveLength(1);
    expect(result.ctes[0].body).toContain("'Hello, World!'");
    expect(result.ctes[0].body).toContain("'It''s a test'");
  });

  it('should handle comments between CTEs', () => {
    const sql = `
      -- This is a comment before WITH
      WITH
        -- First CTE comment
        first_cte AS (SELECT 1),
        -- Second CTE comment
        second_cte AS (SELECT 2)
      SELECT * FROM second_cte
    `;
    const result = extractCTEs(sql);

    expect(result.ctes).toHaveLength(2);
    expect(result.ctes[0].name).toBe('first_cte');
    expect(result.ctes[1].name).toBe('second_cte');
  });

  it('should handle block comments', () => {
    const sql = `
      /* Block comment before */
      WITH
        /* Comment before name */
        my_cte AS (
          SELECT /* inline comment */ 1 AS value
        )
      SELECT * FROM my_cte
    `;
    const result = extractCTEs(sql);

    expect(result.ctes).toHaveLength(1);
    expect(result.ctes[0].name).toBe('my_cte');
  });

  it('should handle case-insensitive keywords', () => {
    const sql = `
      with RECURSIVE my_CTE as (
        SELECT 1
      )
      SELECT * FROM my_CTE
    `;
    const result = extractCTEs(sql);

    expect(result.recursive).toBe(true);
    expect(result.ctes).toHaveLength(1);
    expect(result.ctes[0].name).toBe('my_CTE');
  });

  it('should extract main query correctly', () => {
    const sql = `
      WITH temp AS (SELECT 1)
      SELECT a, b, c
      FROM temp
      JOIN other ON temp.id = other.id
      WHERE x > 5
    `;
    const result = extractCTEs(sql);

    expect(result.mainQuery).toContain('SELECT a, b, c');
    expect(result.mainQuery).toContain('FROM temp');
    expect(result.mainQuery).toContain('WHERE x > 5');
  });

  it('should handle complex sales analysis query', () => {
    const sql = `
      -- Sales Analysis Pipeline
      -- Click each CTE node to see how data transforms at each stage

      WITH
        -- Stage 1: Raw transaction data
        raw_sales AS (
          SELECT * FROM (VALUES
            ('2024-01-15', 'Electronics', 'Laptop', 1200, 2),
            ('2024-01-15', 'Electronics', 'Phone', 800, 5)
          ) AS t(sale_date, category, product, unit_price, quantity)
        ),

        -- Stage 2: Enrich with computed fields
        enriched_sales AS (
          SELECT
            sale_date,
            category,
            unit_price * quantity AS line_total,
            CASE
              WHEN unit_price >= 500 THEN 'Premium'
              ELSE 'Budget'
            END AS price_tier
          FROM raw_sales
        ),

        -- Stage 3: Aggregate by category
        category_stats AS (
          SELECT
            category,
            COUNT(*) AS transactions,
            SUM(line_total) AS revenue
          FROM enriched_sales
          GROUP BY category
        )

      SELECT * FROM category_stats
    `;
    const result = extractCTEs(sql);

    expect(result.ctes).toHaveLength(3);
    expect(result.ctes[0].name).toBe('raw_sales');
    expect(result.ctes[1].name).toBe('enriched_sales');
    expect(result.ctes[2].name).toBe('category_stats');

    // Check bodies contain expected content
    expect(result.ctes[0].body).toContain('VALUES');
    expect(result.ctes[1].body).toContain('CASE');
    expect(result.ctes[2].body).toContain('GROUP BY');
  });
});

describe('detectDependencies', () => {
  it('should detect no dependencies for independent CTEs', () => {
    const ctes = [
      { name: 'a', body: 'SELECT 1', start: 0, end: 10 },
      { name: 'b', body: 'SELECT 2', start: 10, end: 20 },
    ];
    const deps = detectDependencies(ctes);

    expect(deps.get('a')).toEqual([]);
    expect(deps.get('b')).toEqual([]);
  });

  it('should detect simple dependencies', () => {
    const ctes = [
      { name: 'raw', body: 'SELECT * FROM table1', start: 0, end: 10 },
      { name: 'processed', body: 'SELECT * FROM raw', start: 10, end: 20 },
    ];
    const deps = detectDependencies(ctes);

    expect(deps.get('raw')).toEqual([]);
    expect(deps.get('processed')).toEqual(['raw']);
  });

  it('should detect multiple dependencies', () => {
    const ctes = [
      { name: 'a', body: 'SELECT 1', start: 0, end: 10 },
      { name: 'b', body: 'SELECT 2', start: 10, end: 20 },
      { name: 'c', body: 'SELECT * FROM a JOIN b ON a.id = b.id', start: 20, end: 30 },
    ];
    const deps = detectDependencies(ctes);

    expect(deps.get('a')).toEqual([]);
    expect(deps.get('b')).toEqual([]);
    expect(deps.get('c')).toContain('a');
    expect(deps.get('c')).toContain('b');
  });

  it('should handle chain dependencies', () => {
    const ctes = [
      { name: 'first', body: 'SELECT 1', start: 0, end: 10 },
      { name: 'second', body: 'SELECT * FROM first', start: 10, end: 20 },
      { name: 'third', body: 'SELECT * FROM second', start: 20, end: 30 },
    ];
    const deps = detectDependencies(ctes);

    expect(deps.get('first')).toEqual([]);
    expect(deps.get('second')).toEqual(['first']);
    expect(deps.get('third')).toEqual(['second']);
  });

  it('should be case-insensitive', () => {
    const ctes = [
      { name: 'RawData', body: 'SELECT 1', start: 0, end: 10 },
      { name: 'processed', body: 'SELECT * FROM rawdata WHERE x > 0', start: 10, end: 20 },
    ];
    const deps = detectDependencies(ctes);

    expect(deps.get('processed')).toEqual(['RawData']);
  });

  it('should not match partial names', () => {
    const ctes = [
      { name: 'user', body: 'SELECT 1', start: 0, end: 10 },
      { name: 'processed', body: 'SELECT * FROM users', start: 10, end: 20 },
    ];
    const deps = detectDependencies(ctes);

    // Should NOT match 'user' in 'users'
    expect(deps.get('processed')).toEqual([]);
  });
});

describe('debugTree', () => {
  it('should output syntax tree structure', () => {
    const sql = 'WITH a AS (SELECT 1) SELECT * FROM a';
    const output = debugTree(sql);

    expect(output).toContain('Query');
    expect(output).toContain('WithClause');
    expect(output).toContain('CTEDef');
    expect(output).toContain('CTEName');
    expect(output).toContain('CTEBody');
  });
});
