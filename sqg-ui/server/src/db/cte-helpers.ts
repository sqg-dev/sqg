import { extractCTEs } from '@sqg-ui/shared';
import type { QueryResult, CTEPreviewResult, DatabaseAdapter } from './types';

/**
 * Strip SQG annotations from SQL before execution.
 * Removes comment headers (-- QUERY, -- EXEC, etc.) and @set variable lines.
 */
export function stripAnnotations(sql: string): string {
  return sql
    .replace(/^\s*--\s*(QUERY|EXEC|MIGRATE|TESTDATA|TABLE)\s+.*/gm, '')
    .replace(/@set\s+\w+\s*=\s*.+/g, '')
    .trim();
}

/**
 * Execute a specific CTE by reconstructing the query up to that CTE.
 * Shared across all database adapters.
 */
export async function executeCTEHelper(
  adapter: DatabaseAdapter,
  fullSql: string,
  cteName: string
): Promise<QueryResult> {
  const parsed = extractCTEs(fullSql);

  if (parsed.ctes.length === 0) {
    throw new Error('Query does not contain any CTEs');
  }

  const targetIndex = parsed.ctes.findIndex(
    (c) => c.name.toLowerCase() === cteName.toLowerCase()
  );

  if (targetIndex === -1) {
    throw new Error(`CTE "${cteName}" not found in query`);
  }

  const neededCtes = parsed.ctes.slice(0, targetIndex + 1);
  const withPrefix = parsed.recursive ? 'WITH RECURSIVE ' : 'WITH ';
  const reconstructed =
    withPrefix +
    neededCtes.map((c) => `${c.name} AS (${c.body})`).join(',\n') +
    `\nSELECT * FROM ${cteName}`;

  return adapter.executeSQL(reconstructed);
}

const PREVIEW_ROWS = 5;

/**
 * Preview all CTEs by executing each incrementally.
 * Shared across all database adapters.
 */
export async function previewAllCTEsHelper(
  adapter: DatabaseAdapter,
  fullSql: string
): Promise<Record<string, CTEPreviewResult>> {
  const parsed = extractCTEs(fullSql);

  if (parsed.ctes.length === 0) {
    return {};
  }

  const results: Record<string, CTEPreviewResult> = {};
  const withPrefix = parsed.recursive ? 'WITH RECURSIVE ' : 'WITH ';

  for (let i = 0; i < parsed.ctes.length; i++) {
    const cteName = parsed.ctes[i].name;
    const neededCtes = parsed.ctes.slice(0, i + 1);

    const previewSql =
      withPrefix +
      neededCtes.map((c) => `${c.name} AS (${c.body})`).join(',\n') +
      `\nSELECT * FROM ${cteName} LIMIT ${PREVIEW_ROWS}`;

    const countSql =
      withPrefix +
      neededCtes.map((c) => `${c.name} AS (${c.body})`).join(',\n') +
      `\nSELECT COUNT(*) as cnt FROM ${cteName}`;

    try {
      const previewResult = await adapter.executeSQL(previewSql, false);
      const countResult = await adapter.executeSQL(countSql, false);
      const rowCount = Number(countResult.rows[0]?.cnt ?? previewResult.rowCount);

      results[cteName] = {
        columns: previewResult.columns,
        rows: previewResult.rows,
        rowCount,
      };
    } catch (error) {
      console.error(`[previewAllCTEs] Error previewing CTE ${cteName}:`, error);
    }
  }

  return results;
}
