<script lang="ts">
  import { trpc } from '../trpc';

  let mode: 'choose' | 'create' | 'open' = $state('choose');
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  // Create form
  let directory = $state('.');
  let name = $state('my-project');
  let engine: 'sqlite' | 'duckdb' | 'postgres' = $state('duckdb');
  let language: 'typescript' | 'java' | 'python' = $state('typescript');

  // Open form
  let configPath = $state('');

  interface Props {
    onProjectLoaded: () => void;
  }

  let { onProjectLoaded }: Props = $props();

  async function handleCreate() {
    isLoading = true;
    error = null;
    try {
      await trpc.initProject.mutate({ directory, name, engine, language });
      onProjectLoaded();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      isLoading = false;
    }
  }

  async function handleOpen() {
    if (!configPath.trim()) {
      error = 'Please enter a path to sqg.yaml';
      return;
    }
    isLoading = true;
    error = null;
    try {
      await trpc.openProject.mutate({ configPath: configPath.trim() });
      onProjectLoaded();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="h-full flex items-center justify-center bg-gray-900">
  <div class="w-full max-w-md">
    <!-- Header -->
    <div class="text-center mb-8">
      <h1 class="text-2xl font-semibold text-gray-100 mb-2">SQG IDE</h1>
      <p class="text-sm text-gray-400">Create a new SQG project or open an existing one.</p>
    </div>

    {#if mode === 'choose'}
      <!-- Two paths -->
      <div class="space-y-3">
        <button
          onclick={() => mode = 'create'}
          class="w-full p-4 rounded-lg bg-gray-800 border border-gray-700 hover:border-blue-500 transition-colors text-left group"
        >
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            <div>
              <div class="text-sm font-medium text-gray-200">Create New Project</div>
              <div class="text-xs text-gray-500">Set up a new sqg.yaml with your database and language</div>
            </div>
          </div>
        </button>

        <button
          onclick={() => mode = 'open'}
          class="w-full p-4 rounded-lg bg-gray-800 border border-gray-700 hover:border-blue-500 transition-colors text-left group"
        >
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <div>
              <div class="text-sm font-medium text-gray-200">Open Existing Project</div>
              <div class="text-xs text-gray-500">Load an existing sqg.yaml configuration</div>
            </div>
          </div>
        </button>
      </div>

    {:else if mode === 'create'}
      <!-- Create form -->
      <div class="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-medium text-gray-200">New Project</h2>
          <button onclick={() => { mode = 'choose'; error = null; }} class="text-xs text-gray-500 hover:text-gray-300">Back</button>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-gray-400 mb-1">Directory</label>
            <input
              type="text"
              bind:value={directory}
              class="w-full px-3 py-2 text-sm font-mono bg-gray-900 border border-gray-700 rounded text-gray-300 focus:border-blue-500 focus:outline-none"
              placeholder="./my-project"
            />
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-400 mb-1">Database Engine</label>
            <div class="grid grid-cols-3 gap-2">
              {#each [
                { value: 'duckdb', label: 'DuckDB' },
                { value: 'sqlite', label: 'SQLite' },
                { value: 'postgres', label: 'PostgreSQL' },
              ] as opt}
                <button
                  onclick={() => engine = opt.value as typeof engine}
                  class="px-3 py-2 text-sm rounded border transition-colors {engine === opt.value
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'}"
                >
                  {opt.label}
                </button>
              {/each}
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-400 mb-1">Language</label>
            <div class="grid grid-cols-3 gap-2">
              {#each [
                { value: 'typescript', label: 'TypeScript' },
                { value: 'java', label: 'Java' },
                { value: 'python', label: 'Python' },
              ] as opt}
                <button
                  onclick={() => language = opt.value as typeof language}
                  class="px-3 py-2 text-sm rounded border transition-colors {language === opt.value
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'}"
                >
                  {opt.label}
                </button>
              {/each}
            </div>
          </div>

          {#if error}
            <p class="text-sm text-red-400">{error}</p>
          {/if}

          <button
            onclick={handleCreate}
            disabled={isLoading}
            class="w-full py-2 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:bg-blue-800 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>

    {:else if mode === 'open'}
      <!-- Open form -->
      <div class="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-medium text-gray-200">Open Project</h2>
          <button onclick={() => { mode = 'choose'; error = null; }} class="text-xs text-gray-500 hover:text-gray-300">Back</button>
        </div>

        <div class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-gray-400 mb-1">Path to sqg.yaml</label>
            <input
              type="text"
              bind:value={configPath}
              class="w-full px-3 py-2 text-sm font-mono bg-gray-900 border border-gray-700 rounded text-gray-300 focus:border-blue-500 focus:outline-none"
              placeholder="./sqg.yaml"
            />
          </div>

          {#if error}
            <p class="text-sm text-red-400">{error}</p>
          {/if}

          <button
            onclick={handleOpen}
            disabled={isLoading}
            class="w-full py-2 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:bg-blue-800 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Loading...' : 'Open Project'}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>
