/**
 * CTE Extractor using Lezer parser
 * Extracts Common Table Expression definitions from SQL queries
 */

import { parser } from './cte-parser';
import type { SyntaxNode, Tree } from '@lezer/common';
import type { CTE, ParsedQuery } from '../index';

/**
 * Get child nodes of a specific type
 */
function getChildren(node: SyntaxNode, type: string): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  let cursor = node.firstChild;
  while (cursor) {
    if (cursor.name === type) {
      children.push(cursor);
    }
    cursor = cursor.nextSibling;
  }
  return children;
}

/**
 * Get first child node of a specific type
 */
function getChild(node: SyntaxNode, type: string): SyntaxNode | null {
  let cursor = node.firstChild;
  while (cursor) {
    if (cursor.name === type) {
      return cursor;
    }
    cursor = cursor.nextSibling;
  }
  return null;
}

/**
 * Check if node has a child of a specific type
 */
function hasChild(node: SyntaxNode, type: string): boolean {
  return getChild(node, type) !== null;
}

/**
 * Extract text from a node
 */
function getText(sql: string, node: SyntaxNode): string {
  return sql.slice(node.from, node.to);
}

/**
 * Extract CTEs from SQL using Lezer parser
 */
export function extractCTEs(sql: string): ParsedQuery {
  const tree: Tree = parser.parse(sql);
  const ctes: CTE[] = [];
  let recursive = false;
  let mainQueryStart = 0;

  // Find WithClause
  let cursor = tree.cursor();
  let withClauseEnd = 0;

  // Traverse to find WithClause
  if (cursor.firstChild()) {
    do {
      if (cursor.name === 'WithClause') {
        const withClause = cursor.node;
        withClauseEnd = withClause.to;

        // Check for RECURSIVE
        recursive = hasChild(withClause, 'Recursive');

        // Get all CTEDef nodes
        const cteDefs = getChildren(withClause, 'CTEDef');

        for (const cteDef of cteDefs) {
          const nameNode = getChild(cteDef, 'CTEName');
          const bodyNode = getChild(cteDef, 'CTEBody');

          if (nameNode && bodyNode) {
            const name = getText(sql, nameNode);
            // Body is inside parens, extract content without outer parens
            const bodyText = getText(sql, bodyNode);
            const body = bodyText.slice(1, -1).trim();

            ctes.push({
              name,
              body,
              start: cteDef.from,
              end: cteDef.to,
            });
          }
        }

        // Main query starts after the WITH clause
        mainQueryStart = withClause.to;
        break;
      }
    } while (cursor.nextSibling());
  }

  // If no WITH clause, return empty CTEs with full query as main
  if (ctes.length === 0) {
    return {
      recursive: false,
      ctes: [],
      mainQuery: sql.trim(),
      mainQueryStart: 0,
    };
  }

  return {
    recursive,
    ctes,
    mainQuery: sql.slice(mainQueryStart).trim(),
    mainQueryStart,
  };
}

/**
 * Detect dependencies between CTEs by scanning for references
 */
export function detectDependencies(ctes: CTE[]): Map<string, string[]> {
  const deps = new Map<string, string[]>();
  const names = new Set(ctes.map((c) => c.name.toLowerCase()));

  for (const cte of ctes) {
    const references: string[] = [];

    for (const otherName of names) {
      if (otherName === cte.name.toLowerCase()) continue;

      // Use word boundary regex to avoid partial matches
      const regex = new RegExp(`\\b${otherName}\\b`, 'i');
      if (regex.test(cte.body)) {
        // Find the original case name
        const originalName = ctes.find(
          (c) => c.name.toLowerCase() === otherName
        )?.name;
        if (originalName) {
          references.push(originalName);
        }
      }
    }

    deps.set(cte.name, references);
  }

  return deps;
}

/**
 * Debug: Print syntax tree
 */
export function debugTree(sql: string): string {
  const tree = parser.parse(sql);
  const lines: string[] = [];

  function printNode(cursor: ReturnType<Tree['cursor']>, indent: number) {
    const text = sql.slice(cursor.from, cursor.to);
    const preview =
      text.length > 50 ? text.slice(0, 50) + '...' : text;
    lines.push(
      '  '.repeat(indent) +
        `${cursor.name} [${cursor.from}-${cursor.to}]: ${JSON.stringify(preview)}`
    );
    if (cursor.firstChild()) {
      do {
        printNode(cursor, indent + 1);
      } while (cursor.nextSibling());
      cursor.parent();
    }
  }

  const cursor = tree.cursor();
  printNode(cursor, 0);
  return lines.join('\n');
}
