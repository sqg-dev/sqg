<script lang="ts">
  import { queryState } from '../stores/query.svelte';

  // Map common SQL types to shorter display names
  function formatType(type: string): string {
    const typeMap: Record<string, string> = {
      'VARCHAR': 'varchar',
      'INTEGER': 'int',
      'BIGINT': 'bigint',
      'DOUBLE': 'double',
      'BOOLEAN': 'bool',
      'TIMESTAMP': 'timestamp',
      'DATE': 'date',
      'DECIMAL': 'decimal',
    };
    const upper = type.toUpperCase();
    return typeMap[upper] || type.toLowerCase();
  }
</script>

<div class="h-full flex flex-col bg-gray-900">
  <!-- Header -->
  <div class="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-gray-800">
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium text-gray-300">Schema</span>
      {#if queryState.selectedCTE}
        <span class="text-xs px-2 py-0.5 rounded bg-blue-900/50 text-blue-300">
          {queryState.selectedCTE === 'main' ? 'Final Query' : queryState.selectedCTE}
        </span>
      {/if}
    </div>
    {#if queryState.result}
      <span class="text-xs text-gray-500">
        {queryState.result.columns.length} columns
      </span>
    {/if}
  </div>

  <!-- Schema columns -->
  <div class="flex-1 overflow-auto p-3">
    {#if queryState.isLoading}
      <div class="flex items-center text-gray-500 text-sm">
        <svg class="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
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
        Loading schema...
      </div>
    {:else if queryState.result && queryState.result.columns.length > 0}
      <div class="flex flex-wrap gap-2">
        {#each queryState.result.columns as col}
          <div class="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-gray-800 border border-gray-700">
            <span class="text-sm font-medium text-gray-200">{col.name}</span>
            <span class="text-xs text-gray-500 font-mono">{formatType(col.type)}</span>
          </div>
        {/each}
      </div>
    {:else if queryState.error}
      <div class="text-sm text-red-400">Error loading schema</div>
    {:else}
      <div class="text-sm text-gray-500">
        Click a CTE node or run the query to see schema
      </div>
    {/if}
  </div>
</div>
