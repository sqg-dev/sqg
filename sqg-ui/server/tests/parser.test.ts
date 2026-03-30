import { describe, it, expect } from 'vitest';
import { parseProject } from '../src/sqg/parser';
import { resolve } from 'node:path';

const TEST_PROJECT = resolve(import.meta.dirname, '../../../sqg/tests/test-duckdb.yaml');

describe('parseProject', () => {
  it('parses a valid SQG project', () => {
    const project = parseProject(TEST_PROJECT);

    expect(project.name).toBe('test-duckdb');
    expect(project.version).toBe(1);
    expect(project.engine).toBe('duckdb');
    expect(project.sqlFiles.length).toBeGreaterThan(0);
  });

  it('extracts queries with correct types', () => {
    const project = parseProject(TEST_PROJECT);

    expect(project.queries.length).toBeGreaterThan(0);
    for (const q of project.queries) {
      expect(q.id).toBeTruthy();
      expect(['QUERY', 'EXEC']).toContain(q.type);
      expect(q.sql).toBeTruthy();
      expect(q.file).toBeTruthy();
    }
  });

  it('extracts migrations sorted by order', () => {
    const project = parseProject(TEST_PROJECT);

    expect(project.migrations.length).toBeGreaterThan(0);
    for (let i = 1; i < project.migrations.length; i++) {
      expect(project.migrations[i].order).toBeGreaterThanOrEqual(project.migrations[i - 1].order);
    }
  });

  it('extracts tables', () => {
    const project = parseProject(TEST_PROJECT);

    expect(project.tables.length).toBeGreaterThan(0);
    for (const t of project.tables) {
      expect(t.id).toBeTruthy();
      expect(t.tableName).toBeTruthy();
    }
  });

  it('throws for missing config file', () => {
    expect(() => parseProject('/nonexistent/sqg.yaml')).toThrow('not found');
  });

  it('resolves @set variables in query SQL', () => {
    const project = parseProject(TEST_PROJECT);
    const queryWithVars = project.queries.find(q => Object.keys(q.variables).length > 0);

    if (queryWithVars) {
      // The resolved SQL should not contain ${varName} for defined variables
      for (const [varName, value] of Object.entries(queryWithVars.variables)) {
        expect(queryWithVars.sql).not.toContain(`\${${varName}}`);
      }
    }
  });
});
