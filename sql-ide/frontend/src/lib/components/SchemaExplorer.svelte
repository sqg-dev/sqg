<script lang="ts">
  import { trpc } from '../trpc';

  interface SchemaColumn {
    name: string;
    type: string;
    nullable: boolean;
  }

  interface SchemaTable {
    name: string;
    columns: SchemaColumn[];
  }

  let tables: SchemaTable[] = $state([]);
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let expandedTables = $state(new Set<string>());

  export async function refresh() {
    isLoading = true;
    error = null;
    try {
      tables = await trpc.getSchema.query();
    } catch (e) {
      error = (e as Error).message;
      tables = [];
    } finally {
      isLoading = false;
    }
  }

  function toggleTable(name: string) {
    const next = new Set(expandedTables);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    expandedTables = next;
  }

  function handleInsertTable(name: string) {
    // Dispatch custom event to insert text into editor
    document.dispatchEvent(new CustomEvent('sqg-insert-text', { detail: name }));
  }

  function handleInsertColumn(table: string, column: string) {
    document.dispatchEvent(new CustomEvent('sqg-insert-text', { detail: `${table}.${column}` }));
  }
</script>

<div class="h-full flex flex-col">
  <!-- Header -->
  <div class="px-4 py-2 flex items-center justify-between border-b border-gray-800">
    <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">
      Schema
    </span>
    <button
      onclick={refresh}
      disabled={isLoading}
      class="p-1 text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
      title="Refresh schema"
    >
      <svg class="w-3.5 h-3.5 {isLoading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-auto">
    {#if isLoading && tables.length === 0}
      <div class="flex items-center justify-center p-4 text-gray-500 text-sm">
        <svg class="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading schema...
      </div>
    {:else if error}
      <div class="p-4 text-center">
        <p class="text-sm text-red-400 mb-2">Connection failed</p>
        <p class="text-xs text-gray-500 mb-3">{error}</p>
        <button
          onclick={refresh}
          class="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          Retry
        </button>
      </div>
    {:else if tables.length === 0}
      <div class="p-4 text-center">
        <svg class="w-8 h-8 text-gray-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
        </svg>
        <p class="text-sm text-gray-400 mb-1">No tables yet</p>
        <p class="text-xs text-gray-500 mb-3">Run your migrations to create tables,<br>or write CREATE TABLE in the editor.</p>
      </div>
    {:else}
      <div class="py-1">
        {#each tables as table}
          <div>
            <!-- Table row -->
            <button
              onclick={() => toggleTable(table.name)}
              ondblclick={() => handleInsertTable(table.name)}
              class="w-full px-3 py-1.5 flex items-center gap-2 text-left hover:bg-gray-800/50 transition-colors group"
              title="Double-click to insert table name"
            >
              <svg class="w-3 h-3 text-gray-500 transition-transform {expandedTables.has(table.name) ? 'rotate-90' : ''}" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
              </svg>
              <svg class="w-3.5 h-3.5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
              </svg>
              <span class="text-sm text-gray-300 truncate">{table.name}</span>
              <span class="ml-auto text-xs text-gray-600 group-hover:text-gray-500">
                {table.columns.length}
              </span>
            </button>

            <!-- Columns (expanded) -->
            {#if expandedTables.has(table.name)}
              <div class="ml-5 border-l border-gray-800">
                {#each table.columns as col}
                  <button
                    onclick={() => handleInsertColumn(table.name, col.name)}
                    class="w-full pl-4 pr-3 py-1 flex items-center gap-2 text-left hover:bg-gray-800/50 transition-colors"
                    title="Click to insert {table.name}.{col.name}"
                  >
                    <span class="text-sm text-gray-400 truncate">{col.name}</span>
                    <span class="ml-auto text-xs font-mono text-blue-400/70 flex-shrink-0">{col.type}</span>
                    {#if col.nullable}
                      <span class="text-xs text-gray-600">?</span>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
