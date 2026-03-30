import { linter, type Diagnostic } from '@codemirror/lint';
import { hoverTooltip, type Tooltip } from '@codemirror/view';
import { trpc } from '../trpc';

export interface ServerAnnotation {
  id: string;
  type: 'QUERY' | 'EXEC' | 'MIGRATE' | 'TESTDATA' | 'TABLE';
  line: number;
  one: boolean;
  pluck: boolean;
  sql: string;
}

/** Callback to receive parsed annotations from the server */
let onAnnotationsUpdate: ((annotations: ServerAnnotation[]) => void) | null = null;

export function setAnnotationsCallback(cb: (annotations: ServerAnnotation[]) => void) {
  onAnnotationsUpdate = cb;
}

/**
 * CodeMirror async linter that calls the SQG server parser.
 * Returns real parse errors as diagnostics and broadcasts annotations
 * to the sidebar via the callback.
 */
export function sqgLinter() {
  return linter(async (view) => {
    const doc = view.state.doc;
    const content = doc.toString();

    if (!content.trim()) return [];

    try {
      const result = await trpc.validateSQL.mutate({ content });

      // Broadcast annotations to sidebar/stores
      if (onAnnotationsUpdate) {
        onAnnotationsUpdate(result.annotations);
      }

      // Convert server diagnostics to CodeMirror diagnostics
      const diagnostics: Diagnostic[] = [];
      for (const d of result.diagnostics) {
        const lineNum = Math.min(d.line, doc.lines);
        const line = doc.line(lineNum);

        const from = d.column != null ? line.from + d.column : line.from;
        const to = d.endColumn != null ? line.from + d.endColumn : line.to;

        diagnostics.push({
          from,
          to,
          severity: d.severity === 'info' ? 'info' : d.severity,
          message: d.message,
        });
      }

      return diagnostics;
    } catch {
      // Server not reachable — no diagnostics
      return [];
    }
  }, { delay: 500 });
}

/** Hover tooltip for SQG annotations */
export function sqgHoverTooltip() {
  return hoverTooltip((view, pos) => {
    const line = view.state.doc.lineAt(pos);
    const text = line.text;

    const annMatch = text.match(/^--\s+(QUERY|EXEC|MIGRATE|TESTDATA|TABLE)\s+(\S+)((?:\s+:\w+)*)/);
    if (!annMatch) return null;

    const type = annMatch[1];
    const name = annMatch[2];
    const modifiers = (annMatch[3] || '').trim();

    const hints: string[] = [];

    switch (type) {
      case 'QUERY': hints.push('SELECT query — generates a typed function'); break;
      case 'EXEC': hints.push('Execute statement — INSERT/UPDATE/DELETE'); break;
      case 'MIGRATE': hints.push(`Migration #${name} — runs on database initialization`); break;
      case 'TESTDATA': hints.push('Test data — inserted after migrations'); break;
      case 'TABLE': hints.push('Table definition for appender generation'); break;
    }

    if (modifiers.includes(':one')) hints.push('Returns a single row');
    if (modifiers.includes(':pluck')) hints.push('Returns a single value (first column)');
    if (modifiers.includes(':all')) hints.push('Returns all rows (default)');
    if (modifiers.includes(':appender')) hints.push('Generates bulk insert appender');

    if (hints.length === 0) return null;

    return {
      pos: line.from,
      end: line.to,
      above: true,
      create() {
        const dom = document.createElement('div');
        dom.style.cssText = 'padding: 4px 8px; font-size: 12px; line-height: 1.5; max-width: 300px;';
        dom.innerHTML = hints.map(h => `<div>${h}</div>`).join('');
        return { dom };
      },
    } satisfies Tooltip;
  });
}
