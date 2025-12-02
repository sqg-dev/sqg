<script lang="ts">
  import Editor from './Editor.svelte';

  let sqlCode = `-- Enter your SQL queries here
SELECT * FROM users;
`;

  let generatedCode = '';
  let error: string | null = null;
  let isGenerating = false;

  async function handleCodeUpdate(newCode: string) {
    sqlCode = newCode;
    error = null;
    generatedCode = '';

    if (!newCode.trim()) {
      return;
    }

    try {
      isGenerating = true;
      // TODO: Integrate with actual code generation logic
      // For now, we'll just echo the SQL code
      generatedCode = `-- Generated code from SQL:\n${sqlCode}`;
    } catch (e) {
      error = e instanceof Error ? e.message : 'An error occurred';
    } finally {
      isGenerating = false;
    }
  }
</script>

<div class="flex h-screen w-screen">
  <div class="flex flex-1 flex-col border-r border-gray-200">
    <div class="px-4 py-4 bg-gray-50 border-b border-gray-200">
      <h2 class="m-0 text-xl font-semibold text-gray-900">SQL Editor</h2>
    </div>
    <div class="flex-1 overflow-auto bg-white">
      <Editor value={sqlCode} onUpdate={handleCodeUpdate} />
    </div>
  </div>

  <div class="flex flex-1 flex-col border-l border-gray-200">
    <div class="px-4 py-4 bg-gray-50 border-b border-gray-200">
      <h2 class="m-0 text-xl font-semibold text-gray-900">Generated Code</h2>
    </div>
    <div class="flex-1 overflow-auto bg-white">
      {#if isGenerating}
        <div class="py-8 text-center text-gray-500">Generating...</div>
      {:else if error}
        <div class="p-8 text-red-600 bg-red-50 m-4 rounded-lg">{error}</div>
      {:else if generatedCode}
        <pre class="m-0 p-4 bg-slate-800 text-slate-200 font-mono text-sm leading-relaxed overflow-x-auto h-full"><code>{generatedCode}</code></pre>
      {:else}
        <div class="py-8 text-center text-gray-500">Generated code will appear here</div>
      {/if}
    </div>
  </div>
</div>

