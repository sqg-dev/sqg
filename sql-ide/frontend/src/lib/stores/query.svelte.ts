import type { ParsedQuery, CTE, CTENode, CTEPreview, QueryResult } from '@sql-ide/shared';
import { extractCTEs, detectDependencies } from '@sql-ide/shared';
import { trpc } from '../trpc';

// Reactive state using Svelte 5 runes in .svelte.ts files
class QueryState {
  sql = $state<string>(`-- Sales Analysis Pipeline
-- Click each CTE node to see how data transforms at each stage

WITH
  -- Stage 1: Raw transaction data (12 rows, 5 columns)
  raw_sales AS (
    SELECT * FROM (VALUES
      ('2024-01-15', 'Electronics', 'Laptop', 1200, 2),
      ('2024-01-15', 'Electronics', 'Phone', 800, 5),
      ('2024-01-16', 'Clothing', 'Jacket', 150, 3),
      ('2024-01-16', 'Electronics', 'Tablet', 500, 4),
      ('2024-01-17', 'Clothing', 'Shoes', 120, 6),
      ('2024-01-17', 'Home', 'Lamp', 80, 10),
      ('2024-01-18', 'Electronics', 'Laptop', 1200, 1),
      ('2024-01-18', 'Home', 'Chair', 250, 2),
      ('2024-01-19', 'Clothing', 'Shirt', 45, 15),
      ('2024-01-19', 'Electronics', 'Phone', 800, 3),
      ('2024-01-20', 'Home', 'Table', 400, 1),
      ('2024-01-20', 'Clothing', 'Pants', 70, 8)
    ) AS t(sale_date, category, product, unit_price, quantity)
  ),

  -- Stage 2: Enrich with computed fields (12 rows, 7 columns)
  enriched_sales AS (
    SELECT
      sale_date,
      category,
      product,
      unit_price,
      quantity,
      unit_price * quantity AS line_total,
      CASE
        WHEN unit_price >= 500 THEN 'Premium'
        WHEN unit_price >= 100 THEN 'Standard'
        ELSE 'Budget'
      END AS price_tier
    FROM raw_sales
  ),

  -- Stage 3: Aggregate by category (3 rows)
  category_stats AS (
    SELECT
      category,
      COUNT(*) AS transactions,
      SUM(quantity) AS units_sold,
      SUM(line_total) AS revenue,
      ROUND(AVG(line_total), 2) AS avg_order_value
    FROM enriched_sales
    GROUP BY category
  ),

  -- Stage 4: Calculate market share (3 rows, with percentages)
  category_share AS (
    SELECT
      category,
      revenue,
      units_sold,
      ROUND(100.0 * revenue / SUM(revenue) OVER (), 1) AS revenue_pct,
      ROUND(100.0 * units_sold / SUM(units_sold) OVER (), 1) AS units_pct
    FROM category_stats
  ),

  -- Stage 5: Daily revenue trend (6 rows)
  daily_trend AS (
    SELECT
      sale_date,
      COUNT(*) AS num_orders,
      SUM(line_total) AS daily_revenue,
      STRING_AGG(DISTINCT category, ', ') AS categories
    FROM enriched_sales
    GROUP BY sale_date
    ORDER BY sale_date
  )

-- Final: Executive summary (1 row)
SELECT
  (SELECT SUM(revenue) FROM category_stats) AS total_revenue,
  (SELECT category FROM category_share ORDER BY revenue DESC LIMIT 1) AS top_category,
  (SELECT revenue_pct FROM category_share ORDER BY revenue DESC LIMIT 1) AS top_category_share,
  (SELECT MAX(daily_revenue) FROM daily_trend) AS peak_day_revenue,
  (SELECT COUNT(DISTINCT product) FROM raw_sales) AS product_count;
`);

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

  nodeStates = $state<Map<string, CTENode>>(new Map());
  selectedCTE = $state<string | null>(null);

  // Results state
  result = $state<QueryResult | null>(null);
  error = $state<string | null>(null);
  isLoading = $state(false);
  isPreviewLoading = $state(false);

  setSQL(value: string) {
    this.sql = value;
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
    const sql = this.sql;
    const parsed = this.parsed;

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
      const error = e instanceof Error ? e.message : 'Unknown error';
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
      const error = e instanceof Error ? e.message : 'Unknown error';
      const errorStates = new Map(this.nodeStates);
      errorStates.set(cteName, {
        ...currentState,
        status: 'error',
        error,
      });
      this.nodeStates = errorStates;
      this.error = error;
      this.result = null;
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
