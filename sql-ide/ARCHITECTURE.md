# SQL IDE - Architecture & Plan

A web-based SQL IDE with CTE visualization for debugging complex queries.

## Problem Statement

Complex SQL queries with many CTEs are hard to debug. You can't easily see:
- What each CTE produces
- How data flows between CTEs
- Where row counts drop unexpectedly

This IDE solves this by parsing CTEs and showing intermediate results as a visual graph.

## Architecture Overview

| Component | Library |
|-----------|---------|
| Frontend Framework | Svelte + Vite |
| Server Framework | Fastify |
| API Layer | tRPC |
| SQL Editor | CodeMirror 6 + @codemirror/lang-sql |
| CTE Graph | Svelte Flow + dagre |
| Panels | svelte-splitpanes |
| Results Table | @tanstack/svelte-table |
| CTE Parser | Lezer (custom grammar) |
| Styling | Tailwind |
| Database | DuckDB (initially) |

## UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  SQL IDE                                        [Run] [Save] │
├─────────────────────────┬───────────────────────────────────┤
│                         │                                   │
│   SQL Editor            │   CTE Dependency Graph            │
│   (CodeMirror 6)        │   (Svelte Flow)                   │
│                         │                                   │
│                         │   ┌─────────┐    ┌─────────┐      │
│                         │   │ users   │───▶│ active  │──┐   │
│                         │   │ 50 rows │    │ 23 rows │  │   │
│                         │   └─────────┘    └─────────┘  │   │
│                         │                               ▼   │
│                         │   ┌─────────┐    ┌─────────────┐  │
│                         │   │ orders  │───▶│ final_query │  │
│                         │   │ 200 rows│    │ 42 rows     │  │
│                         │   └─────────┘    └─────────────┘  │
│                         │                                   │
├─────────────────────────┴───────────────────────────────────┤
│                                                             │
│   Results Table (selected CTE or final query)               │
│   ┌──────┬─────────────┬────────────┬──────────────────┐    │
│   │ id   │ name        │ email      │ created_at       │    │
│   ├──────┼─────────────┼────────────┼──────────────────┤    │
│   │ 1    │ Alice       │ alice@...  │ 2024-01-15       │    │
│   │ 2    │ Bob         │ bob@...    │ 2024-01-16       │    │
│   └──────┴─────────────┴────────────┴──────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
sql-ide/
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── components/
│   │   │   │   ├── Editor.svelte        # CodeMirror wrapper
│   │   │   │   ├── CTEGraph.svelte      # Svelte Flow graph
│   │   │   │   ├── ResultsTable.svelte  # TanStack Table
│   │   │   │   ├── Layout.svelte        # Split panes
│   │   │   │   └── Toolbar.svelte       # Run/Save buttons
│   │   │   ├── parser/
│   │   │   │   ├── cte.grammar          # Lezer grammar
│   │   │   │   └── cte-parser.ts        # Parse + extract CTEs
│   │   │   ├── stores/
│   │   │   │   ├── query.ts             # Current SQL state
│   │   │   │   └── results.ts           # Query results
│   │   │   └── trpc.ts                  # tRPC client
│   │   ├── App.svelte
│   │   └── main.ts
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── server/
│   ├── src/
│   │   ├── index.ts                     # Fastify entry
│   │   ├── trpc/
│   │   │   ├── context.ts               # tRPC context
│   │   │   ├── router.ts                # Main router
│   │   │   └── procedures/
│   │   │       ├── query.ts             # Execute queries
│   │   │       └── schema.ts            # Get table schemas
│   │   └── db/
│   │       └── duckdb.ts                # DuckDB connection
│   ├── package.json
│   └── tsconfig.json
├── shared/
│   ├── types.ts                         # Shared TypeScript types
│   └── package.json
├── ARCHITECTURE.md                      # This file
└── package.json                         # Workspace root
```

## Data Flow

1. User writes/edits SQL in CodeMirror editor
2. On change (debounced), frontend parses SQL with Lezer
3. CTEs are extracted, dependency graph is computed
4. Graph UI updates to show CTE nodes and edges
5. User clicks "Run" or clicks a specific CTE node
6. Frontend calls tRPC `executeQuery` or `executeCTE`
7. Server executes against DuckDB, returns results
8. Results displayed in table, row counts shown on graph nodes

## CTE Parser (Lezer)

Custom Lezer grammar that extracts CTEs without full SQL parsing:

- Recognizes `WITH` / `WITH RECURSIVE`
- Captures CTE names and bodies (balanced parentheses)
- Handles strings, comments (won't be confused by keywords inside)
- Supports DuckDB syntax (dollar quotes, etc.)
- Does NOT parse SQL inside CTEs - treats as opaque

Output structure:
```typescript
interface ParsedQuery {
  recursive: boolean;
  ctes: Array<{
    name: string;
    body: string;      // Raw SQL inside parens
    start: number;     // Position in source
    end: number;
  }>;
  mainQuery: string;
  mainQueryStart: number;
}
```

## Dependency Detection

To build the graph edges, scan each CTE body for references to other CTE names:

```typescript
function detectDependencies(ctes: CTE[]): Map<string, string[]> {
  const deps = new Map<string, string[]>();
  const names = new Set(ctes.map(c => c.name));

  for (const cte of ctes) {
    const references = ctes
      .filter(other => other.name !== cte.name)
      .filter(other => cte.body.includes(other.name))  // Simple check
      .map(other => other.name);
    deps.set(cte.name, references);
  }

  return deps;
}
```

(Could be improved with proper identifier tokenization to avoid false matches)

## tRPC API

```typescript
// Procedures
executeQuery(sql: string) -> { columns: Column[], rows: any[], rowCount: number }
executeCTE(sql: string, cteName: string, cteBody: string, dependencies: string[]) -> same
getTableSchema(tableName: string) -> { columns: Column[] }
listTables() -> { tables: string[] }
```

## Implementation Plan

### Phase 1: Foundation ✅
- [x] Set up monorepo (pnpm workspace)
- [x] Initialize Svelte + Vite frontend
- [x] Initialize Fastify + tRPC server
- [x] Set up shared types package
- [x] Basic tRPC integration

### Phase 2: Core Components ✅
- [x] CodeMirror editor with SQL highlighting
- [x] Hand-written CTE parser (tokenizer + balanced parens)
- [x] CTE extraction and dependency detection
- [x] Svelte Flow graph with dagre layout

### Phase 3: Query Execution ✅
- [x] DuckDB connection on server
- [x] Execute full query via tRPC
- [x] Execute individual CTE
- [x] Results table with TanStack Table

### Phase 4: Integration ✅
- [x] Wire editor → parser → graph
- [x] Click graph node → execute → show results
- [x] Show row counts on graph nodes
- [x] Error handling and display

### Phase 5: Polish ✅
- [x] Resizable panels (svelte-splitpanes)
- [x] Auto-layout graph with dagre
- [ ] Syntax error highlighting
- [x] Loading states
- [x] Keyboard shortcuts (Ctrl+Enter to run)

### Phase 6: Extended Features (Future)
- [ ] Save/load queries
- [ ] Query history
- [ ] Multiple database support (SQLite, Postgres)
- [ ] Export results (CSV, JSON)
- [ ] Schema browser sidebar
- [ ] Query formatting

## Key Decisions

1. **CTE parsing vs full SQL parsing**: Only parse CTE structure, not SQL internals. Simpler, works with any SQL dialect DuckDB supports.

2. **Lezer for parsing**: Incremental parsing, integrates with CodeMirror, already used in sqg project.

3. **tRPC over REST**: End-to-end type safety, great DX, simple setup with Fastify.

4. **DuckDB first**: Fast, supports complex SQL, good for analytics queries where CTEs are common. Can add other databases later.

5. **Svelte Flow for graph**: Purpose-built for node-based UIs, good Svelte integration, supports custom nodes.

## References

- [Svelte Flow](https://svelteflow.dev/)
- [CodeMirror 6](https://codemirror.net/)
- [TanStack Table](https://tanstack.com/table)
- [tRPC](https://trpc.io/)
- [Fastify](https://fastify.dev/)
- [Lezer](https://lezer.codemirror.net/)
- [DuckDB Node API](https://duckdb.org/docs/clients/node_neo/overview)
