<script lang="ts">
  import { queryState } from '../stores/query.svelte';

  interface Props {
    onRun: () => void;
    engine?: string;
    watchStatus?: { watching: boolean; fileCount: number; lastChangeFile: string | null };
  }

  let { onRun, engine = 'duckdb', watchStatus }: Props = $props();

  let showChangeFlash = $state(false);
  let flashFile = $state('');
  let lastFile = $state<string | null>(null);

  $effect(() => {
    if (watchStatus?.lastChangeFile && watchStatus.lastChangeFile !== lastFile) {
      lastFile = watchStatus.lastChangeFile;
      flashFile = watchStatus.lastChangeFile;
      showChangeFlash = true;
      setTimeout(() => { showChangeFlash = false; }, 3000);
    }
  });
</script>

<div class="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
  <div class="flex items-center gap-4">
    <h1 class="text-lg font-semibold text-gray-100">SQL IDE</h1>

    <!-- Engine badge -->
    <span class="px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-300 font-mono">
      {engine}
    </span>

    <!-- Watch status -->
    {#if watchStatus?.watching}
      <span class="text-xs text-gray-500 flex items-center gap-1">
        {#if showChangeFlash}
          <span class="text-green-400">&#10003; {flashFile} updated</span>
        {:else}
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Watching {watchStatus.fileCount} files
        {/if}
      </span>
    {/if}
  </div>

  <div class="flex items-center gap-2">
    <button
      onclick={() => queryState.hasPreview ? queryState.clearPreviews() : queryState.previewAll()}
      disabled={queryState.isPreviewLoading || queryState.isLoading}
      class="px-4 py-1.5 text-sm font-medium rounded transition-colors flex items-center gap-2 {queryState.hasPreview ? 'bg-purple-700 hover:bg-purple-800' : 'bg-purple-600 hover:bg-purple-700'} disabled:bg-purple-800 disabled:cursor-not-allowed"
    >
      {#if queryState.isPreviewLoading}
        <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Previewing...
      {:else if queryState.hasPreview}
        Hide Preview
      {:else}
        Preview All
      {/if}
    </button>

    <button
      onclick={onRun}
      disabled={queryState.isLoading}
      class="px-4 py-1.5 text-sm font-medium rounded bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
    >
      {#if queryState.isLoading}
        <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        Running...
      {:else}
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
        Run
      {/if}
    </button>

    <span class="text-xs text-gray-500">Ctrl+Enter</span>
  </div>
</div>
