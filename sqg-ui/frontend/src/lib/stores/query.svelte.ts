import type { ParsedQuery, CTE, CTENode, CTEPreview, QueryResult } from '@sqg-ui/shared';
import { extractCTEs, detectDependencies } from '@sqg-ui/shared';
import { trpc } from '../trpc';
import { statusState } from './status.svelte';

/** Extract a clean error message from tRPC/fetch errors */
function cleanError(e: unknown): string {
  if (e instanceof TypeError && (e as Error).message === 'Failed to fetch') {
    return 'Server not reachable. Is the IDE server running?';
  }
  if (e instanceof Error) {
    // tRPC wraps errors with JSON — try to extract the inner message
    const msg = e.message;
    try {
      const parsed = JSON.parse(msg);
      if (Array.isArray(parsed)) return parsed[0]?.message || msg;
      if (parsed.message) return parsed.message;
    } catch { /* not JSON */ }
    return msg;
  }
  return 'Unknown error';
}

// Reactive state using Svelte 5 runes in .svelte.ts files
class QueryState {
  sql = $state<string>('');

  parsed = $derived.by(() => {
    try {
      return extractCTEs(this.sql);
    } catch (e) {
      console.error('Parse error:', e);
      return null;
    }
  });

  dependencies = $derived.by(() => {
    if (!this.parsed) return new Map<string, string[]>();
    return detectDependencies(this.parsed.ctes);
  });

  hasCTEs = $derived(this.parsed != null && this.parsed.ctes.length > 0);

  /** Annotations from the server-side SQG parser (set by the linter callback) */
  annotations = $state<Array<{ id: string; type: 'QUERY' | 'EXEC' | 'MIGRATE' | 'TESTDATA' | 'TABLE'; one: boolean; pluck: boolean; line: number; sql: string }>>([]);

  setAnnotations(items: typeof this.annotations) {
    this.annotations = items;
  }

  nodeStates = $state<Map<string, CTENode>>(new Map());
  selectedCTE = $state<string | null>(null);

  // Results state
  result = $state<QueryResult | null>(null);
  error = $state<string | null>(null);
  isLoading = $state(false);
  isPreviewLoading = $state(false);

  /** The SQL to execute — set when user clicks a query in the sidebar */
  selectedQuerySQL = $state<string | null>(null);

  /** The SQL that will actually be executed: selected query, or full editor content */
  executableSQL = $derived(this.selectedQuerySQL || this.sql);

  setSQL(value: string) {
    this.sql = value;
  }

  setSelectedQuery(sql: string | null) {
    this.selectedQuerySQL = sql;
  }

  async previewAll() {
    const sql = this.sql;
    const parsed = this.parsed;

    if (!parsed || parsed.ctes.length === 0) {
      return;
    }

    this.isPreviewLoading = true;

    // Initialize node states if not already set
    const states = new Map<string, CTENode>();
    for (const cte of parsed.ctes) {
      const existing = this.nodeStates.get(cte.name);
      states.set(cte.name, existing || {
        id: cte.name,
        name: cte.name,
        status: 'pending',
      });
    }
    const existingMain = this.nodeStates.get('main');
    states.set('main', existingMain || {
      id: 'main',
      name: 'Result',
      status: 'pending',
    });
    this.nodeStates = states;

    try {
      const previews = await trpc.previewAllCTEs.mutate({ sql });

      // Update node states with preview data
      const newStates = new Map(this.nodeStates);
      for (const [cteName, preview] of Object.entries(previews)) {
        const existing = newStates.get(cteName);
        if (existing) {
          newStates.set(cteName, {
            ...existing,
            status: 'success',
            rowCount: preview.rowCount,
            preview: {
              columns: preview.columns,
              rows: preview.rows,
            },
          });
        }
      }
      this.nodeStates = newStates;
    } catch (e) {
      console.error('Preview error:', e);
    } finally {
      this.isPreviewLoading = false;
    }
  }

  async execute() {
    const sql = this.executableSQL;
    const parsed = extractCTEs(sql) ?? this.parsed;

    if (!parsed) {
      this.error = 'Failed to parse SQL';
      return;
    }

    // Reset all node states
    const states = new Map<string, CTENode>();
    for (const cte of parsed.ctes) {
      states.set(cte.name, {
        id: cte.name,
        name: cte.name,
        status: 'pending',
      });
    }
    states.set('main', {
      id: 'main',
      name: 'Result',
      status: 'pending',
    });
    this.nodeStates = states;

    // Execute full query
    const newStates = new Map(states);
    newStates.set('main', { ...newStates.get('main')!, status: 'running' });
    this.nodeStates = newStates;
    this.isLoading = true;
    this.error = null;

    try {
      const result = await trpc.executeQuery.mutate({ sql });

      // Update node states with row counts
      const finalStates = new Map(this.nodeStates);
      finalStates.set('main', {
        id: 'main',
        name: 'Result',
        status: 'success',
        rowCount: result.rowCount,
      });
      this.nodeStates = finalStates;

      // Show results
      this.result = result;
      this.error = null;
      this.selectedCTE = 'main';
    } catch (e) {
      const error = cleanError(e);
      const errorStates = new Map(this.nodeStates);
      errorStates.set('main', {
        id: 'main',
        name: 'Result',
        status: 'error',
        error,
      });
      this.nodeStates = errorStates;
      this.error = error;
      this.result = null;
      statusState.error(error);
    } finally {
      this.isLoading = false;
    }
  }

  async executeCTE(cteName: string) {
    const sql = this.sql;
    const states = new Map(this.nodeStates);

    // Set this CTE as running
    const currentState = states.get(cteName) || {
      id: cteName,
      name: cteName,
      status: 'pending' as const,
    };
    states.set(cteName, { ...currentState, status: 'running' });
    this.nodeStates = states;
    this.isLoading = true;
    this.error = null;

    try {
      const result = await trpc.executeCTE.mutate({
        fullSql: sql,
        cteName,
      });

      const successStates = new Map(this.nodeStates);
      successStates.set(cteName, {
        ...currentState,
        status: 'success',
        rowCount: result.rowCount,
      });
      this.nodeStates = successStates;

      this.result = result;
      this.error = null;
      this.selectedCTE = cteName;
    } catch (e) {
      const error = cleanError(e);
      const errorStates = new Map(this.nodeStates);
      errorStates.set(cteName, {
        ...currentState,
        status: 'error',
        error,
      });
      this.nodeStates = errorStates;
      this.error = error;
      this.result = null;
      statusState.error(error);
    } finally {
      this.isLoading = false;
    }
  }

  clearResults() {
    this.result = null;
    this.error = null;
    this.isLoading = false;
  }

  clearPreviews() {
    // Clear preview data from all node states
    const newStates = new Map<string, CTENode>();
    for (const [name, state] of this.nodeStates) {
      newStates.set(name, {
        ...state,
        preview: undefined,
      });
    }
    this.nodeStates = newStates;
  }

  get hasPreview(): boolean {
    for (const state of this.nodeStates.values()) {
      if (state.preview && state.preview.columns.length > 0) {
        return true;
      }
    }
    return false;
  }
}

export const queryState = new QueryState();
