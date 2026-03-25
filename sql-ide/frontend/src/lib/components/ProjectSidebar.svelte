<script lang="ts">
  import { projectState } from '../stores/project.svelte';
  import { tabsState } from '../stores/tabs.svelte';
  import { queryState } from '../stores/query.svelte';
  import type { SqgQuery } from '@sql-ide/shared';

  // Use server-parsed annotations when available, fall back to project data
  let hasAnnotations = $derived(queryState.annotations.length > 0);
  let liveQueries = $derived(hasAnnotations ? queryState.annotations.filter(a => a.type === 'QUERY') : null);
  let liveExecs = $derived(hasAnnotations ? queryState.annotations.filter(a => a.type === 'EXEC') : null);
  let liveMigrations = $derived(hasAnnotations ? queryState.annotations.filter(a => a.type === 'MIGRATE') : null);
  let liveTestdata = $derived(hasAnnotations ? queryState.annotations.filter(a => a.type === 'TESTDATA') : null);

  /** Scroll the editor to an annotation, finding the line if not provided */
  function scrollToAnnotation(id: string, knownLine: number) {
    let line = knownLine;

    // If line unknown, search the file content
    if (line <= 0) {
      const content = tabsState.activeTab?.content;
      if (content) {
        const pattern = new RegExp(`^--\\s+(?:QUERY|EXEC|MIGRATE|TESTDATA|TABLE)\\s+${escapeRegex(id)}\\b`, 'm');
        const match = content.match(pattern);
        if (match?.index != null) {
          line = content.substring(0, match.index).split('\n').length;
        }
      }
    }

    if (line > 0) {
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent('sqg-scroll-to-line', { detail: line }));
      }, 100);
    }
  }

  async function ensureFileTab() {
    if (!tabsState.activeTab?.fileName) {
      const fileTab = tabsState.tabs.find(t => t.fileName);
      if (fileTab) {
        tabsState.switchTab(fileTab.id);
      } else if (projectState.project?.sqlFiles?.[0]) {
        await tabsState.openFile(projectState.project.sqlFiles[0]);
      }
    }
  }

  async function handleAnnotationClick(annotation: { id: string; line: number; sql?: string }) {
    projectState.selectQuery(annotation.id);
    queryState.setSelectedQuery(annotation.sql || null);
    await ensureFileTab();
    scrollToAnnotation(annotation.id, annotation.line);
  }

  async function handleQueryClick(query: SqgQuery) {
    projectState.selectQuery(query.id);
    queryState.setSelectedQuery(query.sql);
    await tabsState.openFile(query.file);
    scrollToAnnotation(query.id, 0);
  }

  function handleFileClick(fileName: string) {
    tabsState.openFile(fileName);
  }

  function escapeRegex(str: string) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
</script>

<div class="h-full flex flex-col bg-gray-900">
  <!-- Header -->
  <div class="px-4 py-3 border-b border-gray-700 bg-gray-800">
    <div class="flex items-center gap-2">
      <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
      <span class="text-sm font-medium text-gray-200 truncate">
        {projectState.project?.name ?? 'Project'}
      </span>
    </div>
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-auto">
    {#if projectState.isLoading}
      <div class="flex items-center justify-center p-4 text-gray-500">
        <svg class="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading...
      </div>
    {:else if projectState.error}
      <div class="p-4 text-sm text-red-400">{projectState.error}</div>
    {:else if projectState.hasProject}
      <!-- Init error (migrations failed) -->
      {#if projectState.project?.initError}
        <div class="px-4 py-2 border-b border-gray-800">
          <p class="text-xs text-red-400">{projectState.project.initError}</p>
        </div>
      {/if}

      <!-- Schema -->
      <div class="border-b border-gray-800">
        <button
          onclick={() => tabsState.openSchema()}
          class="w-full px-4 py-2 flex items-center gap-2 text-left hover:bg-gray-800/50 transition-colors
            {tabsState.activeTab?.id === 'schema' ? 'bg-blue-900/30 border-r-2 border-blue-400' : ''}"
        >
          <svg class="w-3.5 h-3.5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
          </svg>
          <span class="text-xs font-medium text-gray-400 uppercase tracking-wider">Schema</span>
        </button>
      </div>

      <!-- SQL Files Section -->
      {#if projectState.project?.sqlFiles && projectState.project.sqlFiles.length > 0}
        <div class="border-b border-gray-800">
          <div class="px-4 py-2">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Files ({projectState.project.sqlFiles.length})
            </span>
          </div>
          <div class="pb-2">
            {#each projectState.project.sqlFiles as file}
              <button
                onclick={() => handleFileClick(file)}
                class="w-full px-4 py-1.5 flex items-center gap-2 text-left hover:bg-gray-800/50 transition-colors
                  {tabsState.activeTab?.fileName === file ? 'bg-blue-900/30 border-r-2 border-blue-400' : ''}"
              >
                <svg class="w-3.5 h-3.5 text-blue-400/70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span class="text-sm text-gray-300 truncate">{file}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Migrations Section -->
      {@const displayMigrations = liveMigrations ?? projectState.migrations.map(m => ({ id: m.id, type: 'MIGRATE' as const, one: false, pluck: false, line: 0 }))}
      {#if displayMigrations.length > 0}
        <div class="border-b border-gray-800">
          <div class="px-4 py-2">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Migrations ({displayMigrations.length})
            </span>
          </div>
          <div class="pb-2">
            {#each displayMigrations as item}
              <button
                onclick={() => handleAnnotationClick(item)}
                class="w-full px-4 py-1.5 flex items-center gap-2 text-left hover:bg-gray-800/50 transition-colors"
              >
                <svg class="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span class="text-sm text-gray-300 truncate">{item.id}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Testdata Section -->
      {@const displayTestdata = liveTestdata ?? []}
      {#if displayTestdata.length > 0}
        <div class="border-b border-gray-800">
          <div class="px-4 py-2">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Testdata ({displayTestdata.length})
            </span>
          </div>
          <div class="pb-2">
            {#each displayTestdata as item}
              <button
                onclick={() => handleAnnotationClick(item)}
                class="w-full px-4 py-1.5 flex items-center gap-2 text-left hover:bg-gray-800/50 transition-colors"
              >
                <svg class="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span class="text-sm text-gray-300 truncate">{item.id}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Queries Section -->
      {@const displayQueries = liveQueries ?? projectState.queryGroups.queries.map(q => ({ id: q.id, type: q.type, one: q.modifiers.one, pluck: q.modifiers.pluck, line: 0 }))}
      {#if displayQueries.length > 0}
        <div class="border-b border-gray-800">
          <div class="px-4 py-2">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Queries ({displayQueries.length})
            </span>
          </div>
          <div class="pb-2">
            {#each displayQueries as query}
              <button
                onclick={() => handleAnnotationClick(query)}
                class="w-full px-4 py-1.5 flex items-center gap-2 text-left hover:bg-gray-800/50 transition-colors {projectState.selectedQueryId === query.id ? 'bg-blue-900/30 border-r-2 border-blue-400' : ''}"
              >
                <svg class="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span class="text-sm text-gray-300 truncate">{query.id}</span>
                {#if query.one}
                  <span class="ml-auto px-1.5 py-0.5 text-xs rounded bg-purple-900/50 text-purple-300">:one</span>
                {/if}
                {#if query.pluck}
                  <span class="px-1.5 py-0.5 text-xs rounded bg-orange-900/50 text-orange-300">:pluck</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Exec Section -->
      {@const displayExecs = liveExecs ?? projectState.queryGroups.execs.map(q => ({ id: q.id, type: q.type, one: false, pluck: false, line: 0 }))}
      {#if displayExecs.length > 0}
        <div class="border-b border-gray-800">
          <div class="px-4 py-2">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Exec ({displayExecs.length})
            </span>
          </div>
          <div class="pb-2">
            {#each displayExecs as query}
              <button
                onclick={() => handleAnnotationClick(query)}
                class="w-full px-4 py-1.5 flex items-center gap-2 text-left hover:bg-gray-800/50 transition-colors {projectState.selectedQueryId === query.id ? 'bg-blue-900/30 border-r-2 border-blue-400' : ''}"
              >
                <svg class="w-3.5 h-3.5 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span class="text-sm text-gray-300 truncate">{query.id}</span>
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Tables Section -->
      {#if projectState.tables.length > 0}
        <div>
          <div class="px-4 py-2">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Tables ({projectState.tables.length})
            </span>
          </div>
          <div class="pb-2">
            {#each projectState.tables as table}
              <div class="px-4 py-1.5 flex items-center gap-2">
                <svg class="w-3.5 h-3.5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                </svg>
                <span class="text-sm text-gray-300">{table.tableName}</span>
                {#if table.hasAppender}
                  <span class="ml-auto px-1.5 py-0.5 text-xs rounded bg-cyan-900/50 text-cyan-300">appender</span>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {:else}
      <div class="p-4 text-sm text-gray-500">
        No project loaded. Start server with --project flag.
      </div>
    {/if}
  </div>

  <!-- Footer -->
  <div class="px-4 py-2 border-t border-gray-700 bg-gray-800/50">
    <button
      onclick={() => document.dispatchEvent(new CustomEvent('sqg-close-project'))}
      class="text-xs text-gray-500 hover:text-gray-300 transition-colors"
    >
      Switch Project...
    </button>
  </div>
</div>
