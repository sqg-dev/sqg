<script lang="ts">
  import {
    createTable,
    FlexRender,
    getCoreRowModel,
    getSortedRowModel,
    type ColumnDef,
    type SortingState,
  } from '@tanstack/svelte-table';
  import { queryState } from '../stores/query.svelte';

  let sorting = $state<SortingState>([]);

  // Generate columns dynamically from result
  let columns = $derived<ColumnDef<Record<string, unknown>>[]>(
    (queryState.result?.columns || []).map((col) => ({
      accessorKey: col.name,
      header: col.name,
      cell: (info) => renderCell(info.getValue()),
    }))
  );

  let data = $derived(queryState.result?.rows || []);

  let table = createTable({
    get data() {
      return data;
    },
    get columns() {
      return columns;
    },
    state: {
      get sorting() {
        return sorting;
      },
    },
    onSortingChange: (updater) => {
      if (typeof updater === 'function') {
        sorting = updater(sorting);
      } else {
        sorting = updater;
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  function renderCell(cellValue: unknown): string {
    if (cellValue === null) return 'NULL';
    if (cellValue === undefined) return '';

    // Arrays (LIST type)
    if (Array.isArray(cellValue)) {
      if (cellValue.length === 0) return '[]';
      if (cellValue.length <= 5) {
        return '[' + cellValue.map(v => renderCell(v)).join(', ') + ']';
      }
      return `[${cellValue.length} items]`;
    }

    // Objects (STRUCT type)
    if (typeof cellValue === 'object') {
      const entries = Object.entries(cellValue);
      if (entries.length === 0) return '{}';
      if (entries.length <= 3) {
        return '{' + entries.map(([k, v]) => `${k}: ${renderCell(v)}`).join(', ') + '}';
      }
      return `{${entries.length} fields}`;
    }

    // Strings - show with quotes if they look like they need context
    if (typeof cellValue === 'string') {
      // Binary placeholder
      if (cellValue.startsWith('<binary ')) return cellValue;
      return cellValue;
    }

    // Numbers - format large numbers with locale
    if (typeof cellValue === 'number') {
      if (Number.isInteger(cellValue) && Math.abs(cellValue) >= 1000) {
        return cellValue.toLocaleString();
      }
      return String(cellValue);
    }

    return String(cellValue);
  }
</script>

<div class="h-full flex flex-col bg-gray-900">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-800">
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium text-gray-300">Results</span>
      {#if queryState.selectedCTE}
        <span class="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-400">
          {queryState.selectedCTE === 'main' ? 'Final Query' : queryState.selectedCTE}
        </span>
      {/if}
    </div>
    {#if queryState.result}
      <span class="text-xs text-gray-500">
        {queryState.result.rowCount.toLocaleString()} rows
        {#if queryState.result.truncated}
          <span class="text-yellow-500">(limited to {queryState.result.maxRows})</span>
        {/if}
        ({queryState.result.executionTimeMs}ms)
      </span>
    {/if}
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-auto">
    {#if queryState.isLoading}
      <div class="h-full flex items-center justify-center text-gray-500">
        <svg class="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24">
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
            fill="none"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        Executing query...
      </div>
    {:else if queryState.error}
      <div class="h-full flex items-center justify-center p-4">
        <div class="text-center">
          <div class="text-red-400 font-medium mb-2">Error</div>
          <div class="text-sm text-red-300 font-mono bg-red-900/20 p-3 rounded max-w-lg">
            {queryState.error}
          </div>
        </div>
      </div>
    {:else if queryState.result && queryState.result.columns.length > 0}
      <table class="results-table text-sm">
        <thead>
          {#each table.getHeaderGroups() as headerGroup}
            <tr>
              {#each headerGroup.headers as header}
                <th
                  class="px-4 py-1.5 text-left font-medium text-gray-400 cursor-pointer hover:bg-gray-700"
                  onclick={header.column.getToggleSortingHandler()}
                >
                  <div class="flex items-center gap-1">
                    {#if !header.isPlaceholder}
                      <FlexRender content={header.column.columnDef.header} context={header.getContext()} />
                    {/if}
                    {#if header.column.getIsSorted() === 'asc'}
                      <span class="text-blue-400">↑</span>
                    {:else if header.column.getIsSorted() === 'desc'}
                      <span class="text-blue-400">↓</span>
                    {/if}
                  </div>
                </th>
              {/each}
            </tr>
            <!-- Type row -->
            <tr class="border-b border-gray-700">
              {#each headerGroup.headers as header}
                {@const colType = queryState.result?.columns.find(c => c.name === header.column.id)?.type ?? ''}
                <th class="px-4 py-0.5 text-left">
                  <span class="text-[10px] font-mono text-blue-400/60 font-normal">{colType}</span>
                </th>
              {/each}
            </tr>
          {/each}
        </thead>
        <tbody>
          {#each table.getRowModel().rows as row}
            <tr class="border-b border-gray-800 hover:bg-gray-800/50">
              {#each row.getVisibleCells() as cell}
                {@const cellText = renderCell(cell.getValue())}
                <td
                  class="px-4 py-2 text-gray-300 font-mono"
                  title={cellText.length > 40 ? cellText : undefined}
                >
                  <div class="max-w-[300px] truncate">
                    {cellText}
                  </div>
                </td>
              {/each}
            </tr>
          {/each}
          {#if queryState.result && queryState.result.rows.length === 0}
            <tr>
              <td colspan={queryState.result.columns.length} class="px-4 py-3 text-center text-gray-500 text-sm">
                Query returned 0 rows
              </td>
            </tr>
          {/if}
        </tbody>
      </table>
    {:else if queryState.result}
      <div class="h-full flex items-center justify-center text-gray-500 text-sm">
        Statement executed successfully (no rows returned)
      </div>
    {:else}
      <div class="h-full flex items-center justify-center text-gray-500">
        Run a query or click a CTE node to see results
      </div>
    {/if}
  </div>
</div>
