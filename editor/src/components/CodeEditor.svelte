<script lang="ts">
  import Editor from './Editor.svelte';
  import { actions } from 'astro:actions';
  

  let sqlCode = `-- Enter your SQL queries here
SELECT * FROM users;
`;

  let generatedCode = '';
  let error: string | null = null;
  let isGenerating = false;
  let selectedDatabase: 'sqlite' | 'duckdb' = 'sqlite';
  let selectedLanguage: 'java-jdbc' | 'java-arrow' | 'typescript' = 'java-jdbc';

  function handleCodeUpdate(newCode: string) {
    sqlCode = newCode;
    // Clear generated code when SQL changes
    if (generatedCode) {
      generatedCode = '';
      error = null;
    }
  }

  async function generateCode() {
    if (!sqlCode.trim()) {
      error = 'Please enter some SQL code';
      return;
    }

    error = null;
    generatedCode = '';
    isGenerating = true;

    try {
      const { data, error: actionError } = await actions.generateCode({
        sql: sqlCode,
        database: selectedDatabase,
        language: selectedLanguage,
      });

      if (actionError) {
        error = actionError.message || 'An error occurred while generating code';
      } else if (data) {
        generatedCode = data.code || '';
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'An error occurred while generating code';
    } finally {
      isGenerating = false;
    }
  }
</script>

<div class="flex h-screen w-screen">
  <div class="flex flex-1 flex-col border-r border-gray-200">
    <div class="px-4 py-4 bg-gray-50 border-b border-gray-200 h-20 flex items-center">
      <div class="flex items-center justify-between w-full">
        <h2 class="m-0 text-xl font-semibold text-gray-900">SQL Editor</h2>
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <label for="database-select" class="text-sm font-medium text-gray-700">Database:</label>
            <select
              id="database-select"
              bind:value={selectedDatabase}
              class="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="sqlite">SQLite</option>
              <option value="duckdb">DuckDB</option>
            </select>
          </div>
          <div class="flex items-center gap-2">
            <label for="language-select" class="text-sm font-medium text-gray-700">Language:</label>
            <select
              id="language-select"
              bind:value={selectedLanguage}
              class="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="java-jdbc">Java JDBC</option>
              <option value="java-arrow">Java Arrow</option>
              <option value="typescript">TypeScript</option>
            </select>
          </div>
          <button
            on:click={generateCode}
            disabled={isGenerating}
            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGenerating ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </div>
    </div>
    <div class="flex-1 overflow-auto bg-white">
      <Editor value={sqlCode} onUpdate={handleCodeUpdate} />
    </div>
  </div>

  <div class="flex flex-1 flex-col border-l border-gray-200">
    <div class="px-4 py-4 bg-gray-50 border-b border-gray-200 h-20 flex items-center">
      <h2 class="m-0 text-xl font-semibold text-gray-900">Generated Code</h2>
    </div>
    <div class="flex-1 overflow-auto bg-white">
      {#if isGenerating}
        <div class="py-8 text-center text-gray-500">Generating...</div>
      {:else if error}
        <div class="p-8 text-red-600 bg-red-50 m-4 rounded-lg whitespace-pre-wrap font-mono text-sm">{error}</div>
      {:else if generatedCode}
        <pre class="m-0 p-4 bg-slate-800 text-slate-200 font-mono text-sm leading-relaxed overflow-x-auto h-full"><code>{generatedCode}</code></pre>
      {:else}
        <div class="py-8 text-center text-gray-500">Generated code will appear here</div>
      {/if}
    </div>
  </div>
</div>

