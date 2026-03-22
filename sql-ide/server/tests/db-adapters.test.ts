import { describe, it, expect, afterEach } from 'vitest';
import { createDuckDBAdapter } from '../src/db/duckdb';
import { createSQLiteAdapter } from '../src/db/sqlite';
import type { DatabaseAdapter } from '../src/db/types';

// Test both adapters with the same suite
describe.each([
  { name: 'DuckDB', create: () => createDuckDBAdapter() },
  { name: 'SQLite', create: () => createSQLiteAdapter() },
])('$name adapter', ({ create }) => {
  let adapter: DatabaseAdapter;

  afterEach(async () => {
    if (adapter) await adapter.close();
  });

  it('executes CREATE TABLE and INSERT', async () => {
    adapter = create();
    await adapter.executeSQL('CREATE TABLE test (id INTEGER, name TEXT)', false);
    await adapter.executeSQL("INSERT INTO test VALUES (1, 'Alice'), (2, 'Bob')", false);
    const result = await adapter.executeSQL('SELECT * FROM test');

    expect(result.rowCount).toBe(2);
    expect(result.columns).toHaveLength(2);
    expect(result.rows[0]).toHaveProperty('id');
    expect(result.rows[0]).toHaveProperty('name');
  });

  it('applies row limit by default', async () => {
    adapter = create();
    await adapter.executeSQL('CREATE TABLE nums (n INTEGER)', false);
    const values = Array.from({ length: 50 }, (_, i) => `(${i})`).join(',');
    await adapter.executeSQL(`INSERT INTO nums VALUES ${values}`, false);

    const result = await adapter.executeSQL('SELECT * FROM nums');
    expect(result.rowCount).toBe(50);

    // applyLimit=false should also work
    const unlimited = await adapter.executeSQL('SELECT * FROM nums', false);
    expect(unlimited.rowCount).toBe(50);
  });

  it('returns execution time', async () => {
    adapter = create();
    const result = await adapter.executeSQL('SELECT 1 AS x', false);
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('executes CTEs', async () => {
    adapter = create();
    const result = await adapter.executeCTE(
      'WITH nums AS (SELECT 1 AS n UNION ALL SELECT 2 AS n) SELECT * FROM nums',
      'nums'
    );
    expect(result.rowCount).toBe(2);
    expect(result.rows).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('throws on missing CTE', async () => {
    adapter = create();
    await expect(
      adapter.executeCTE('WITH a AS (SELECT 1) SELECT * FROM a', 'nonexistent')
    ).rejects.toThrow('not found');
  });

  it('previews all CTEs', async () => {
    adapter = create();
    const previews = await adapter.previewAllCTEs(
      'WITH a AS (SELECT 1 AS x), b AS (SELECT x + 1 AS y FROM a) SELECT * FROM b'
    );
    expect(Object.keys(previews)).toEqual(['a', 'b']);
    expect(previews.a.rowCount).toBe(1);
    expect(previews.b.rowCount).toBe(1);
    expect(previews.b.rows[0]).toEqual({ y: 2 });
  });

  it('returns empty for query without CTEs', async () => {
    adapter = create();
    const previews = await adapter.previewAllCTEs('SELECT 1');
    expect(previews).toEqual({});
  });

  it('returns schema after creating tables', async () => {
    adapter = create();
    await adapter.executeSQL('CREATE TABLE users (id INTEGER, name TEXT, email TEXT)', false);
    await adapter.executeSQL('CREATE TABLE posts (id INTEGER, title TEXT, user_id INTEGER)', false);

    const schema = await adapter.getSchema();
    expect(schema).toHaveLength(2);

    const users = schema.find(t => t.name === 'users');
    expect(users).toBeDefined();
    expect(users!.columns).toHaveLength(3);
    expect(users!.columns.map(c => c.name)).toEqual(['id', 'name', 'email']);

    const posts = schema.find(t => t.name === 'posts');
    expect(posts).toBeDefined();
    expect(posts!.columns).toHaveLength(3);
  });

  it('returns empty schema for empty database', async () => {
    adapter = create();
    const schema = await adapter.getSchema();
    expect(schema).toEqual([]);
  });
});
