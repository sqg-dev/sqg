<script lang="ts">
  import { trpc } from '../trpc';

  let mode: 'choose' | 'create' | 'open' | 'example' = $state('choose');
  let isLoading = $state(false);
  let error = $state<string | null>(null);
  let examples = $state<Array<{ name: string; path: string; engine: string }>>([]);

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

  async function loadExamples() {
    mode = 'example';
    isLoading = true;
    try {
      examples = await trpc.listExamples.query();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      isLoading = false;
    }
  }

  async function openExample(path: string) {
    isLoading = true;
    error = null;
    try {
      await trpc.openProject.mutate({ configPath: path });
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

        <button
          onclick={loadExamples}
          class="w-full p-4 rounded-lg bg-gray-800 border border-gray-700 hover:border-green-500 transition-colors text-left group"
        >
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <div>
              <div class="text-sm font-medium text-gray-200">Open Example Project</div>
              <div class="text-xs text-gray-500">Explore a sample project to see SQG in action</div>
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
            <label for="sqg-dir" class="block text-xs font-medium text-gray-400 mb-1">Directory</label>
            <input
              id="sqg-dir"
              type="text"
              bind:value={directory}
              class="w-full px-3 py-2 text-sm font-mono bg-gray-900 border border-gray-700 rounded text-gray-300 focus:border-blue-500 focus:outline-none"
              placeholder="./my-project"
            />
          </div>

          <div>
            <span id="sqg-engine-label" class="block text-xs font-medium text-gray-400 mb-1">Database Engine</span>
            <div class="grid grid-cols-3 gap-2" role="group" aria-labelledby="sqg-engine-label">
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
            <span id="sqg-lang-label" class="block text-xs font-medium text-gray-400 mb-1">Language</span>
            <div class="grid grid-cols-3 gap-2" role="group" aria-labelledby="sqg-lang-label">
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
            <label for="sqg-config-path" class="block text-xs font-medium text-gray-400 mb-1">Path to sqg.yaml</label>
            <input
              id="sqg-config-path"
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
    {:else if mode === 'example'}
      <!-- Example list -->
      <div class="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-medium text-gray-200">Example Projects</h2>
          <button onclick={() => { mode = 'choose'; error = null; }} class="text-xs text-gray-500 hover:text-gray-300">Back</button>
        </div>

        {#if isLoading}
          <div class="flex items-center justify-center py-4 text-gray-500 text-sm">
            <svg class="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading examples...
          </div>
        {:else if examples.length === 0}
          <p class="text-sm text-gray-500 text-center py-4">No example projects found.</p>
        {:else}
          <div class="space-y-2">
            {#each examples as example}
              <button
                onclick={() => openExample(example.path)}
                disabled={isLoading}
                class="w-full p-3 rounded-lg bg-gray-900 border border-gray-700 hover:border-green-500 transition-colors text-left disabled:opacity-50"
              >
                <div class="flex items-center justify-between">
                  <span class="text-sm text-gray-200">{example.name}</span>
                  <span class="px-2 py-0.5 text-xs rounded bg-gray-700 text-gray-400 font-mono">{example.engine}</span>
                </div>
              </button>
            {/each}
          </div>
        {/if}

        {#if error}
          <p class="text-sm text-red-400 mt-3">{error}</p>
        {/if}
      </div>
    {/if}
  </div>
</div>
