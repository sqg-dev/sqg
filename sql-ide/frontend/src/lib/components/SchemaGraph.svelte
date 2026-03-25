<script lang="ts">
  import { onMount } from 'svelte';
  import { trpc } from '../trpc';

  interface SchemaTable {
    name: string;
    columns: Array<{ name: string; type: string; nullable: boolean }>;
  }

  let tables = $state<SchemaTable[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);

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

  function insertText(text: string) {
    document.dispatchEvent(new CustomEvent('sqg-insert-text', { detail: text }));
  }

  onMount(() => { refresh(); });
</script>

<div class="h-full overflow-auto bg-gray-900 p-4">
  {#if isLoading}
    <div class="flex items-center justify-center h-full text-gray-500 text-sm">
      <svg class="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Loading schema...
    </div>
  {:else if error}
    <div class="flex flex-col items-center justify-center h-full">
      <p class="text-sm text-red-400 mb-2">Failed to load schema</p>
      <p class="text-xs text-gray-500 mb-3">{error}</p>
      <button onclick={refresh} class="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700">Retry</button>
    </div>
  {:else if tables.length === 0}
    <div class="flex flex-col items-center justify-center h-full">
      <svg class="w-10 h-10 text-gray-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
      </svg>
      <p class="text-sm text-gray-400">No tables yet</p>
      <p class="text-xs text-gray-500">Run your migrations to create tables.</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {#each tables as table}
        <div class="rounded-lg border border-gray-700 bg-gray-800 overflow-hidden">
          <!-- Table header -->
          <button
            onclick={() => insertText(table.name)}
            class="w-full px-3 py-2 flex items-center gap-2 bg-gray-800 hover:bg-gray-750 border-b border-gray-700 text-left"
            title="Click to insert table name"
          >
            <svg class="w-3.5 h-3.5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
            </svg>
            <span class="text-sm font-medium text-green-300">{table.name}</span>
            <span class="ml-auto text-xs text-gray-500">{table.columns.length} cols</span>
          </button>

          <!-- Columns -->
          <div class="py-1">
            {#each table.columns as col}
              <div class="px-3 py-0.5 flex items-center gap-2 text-xs">
                <span
                  class="flex-shrink-0 text-[9px] {col.nullable ? 'text-gray-600' : 'text-blue-400'}"
                  title={col.nullable ? 'Nullable' : 'NOT NULL'}
                >{col.nullable ? '○' : '●'}</span>
                <span class="text-gray-300 truncate">{col.name}</span>
                <span class="ml-auto font-mono text-blue-400/70 flex-shrink-0 text-[10px]">{col.type}</span>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
