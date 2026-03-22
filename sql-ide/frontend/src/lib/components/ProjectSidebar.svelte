<script lang="ts">
  import { projectState } from '../stores/project.svelte';
  import { queryState } from '../stores/query.svelte';
  import type { SqgQuery } from '@sql-ide/shared';

  function handleQueryClick(query: SqgQuery) {
    projectState.selectQuery(query.id);
    // Load the query SQL into the editor
    queryState.setSQL(query.sql);
  }

  function handleRunMigrations() {
    projectState.runMigrations();
  }
</script>

<div class="h-full flex flex-col bg-gray-900">
  <!-- Header -->
  <div class="px-4 py-3 border-b border-gray-700 bg-gray-800">
    <div class="flex items-center gap-2">
      <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
      <span class="text-sm font-medium text-gray-200">
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
      <!-- Migrations Section -->
      {#if projectState.migrations.length > 0}
        <div class="border-b border-gray-800">
          <div class="px-4 py-2 flex items-center justify-between">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Migrations ({projectState.migrations.length})
            </span>
            {#if !projectState.migrationsRun}
              <button
                onclick={handleRunMigrations}
                class="px-2 py-1 text-xs rounded bg-green-900/50 text-green-400 hover:bg-green-800/50 transition-colors"
              >
                Run All
              </button>
            {:else}
              <span class="px-2 py-1 text-xs rounded bg-green-900/30 text-green-500">
                Done
              </span>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Queries Section -->
      {#if projectState.queryGroups.queries.length > 0}
        <div class="border-b border-gray-800">
          <div class="px-4 py-2">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Queries ({projectState.queryGroups.queries.length})
            </span>
          </div>
          <div class="pb-2">
            {#each projectState.queryGroups.queries as query}
              <button
                onclick={() => handleQueryClick(query)}
                class="w-full px-4 py-1.5 flex items-center gap-2 text-left hover:bg-gray-800/50 transition-colors {projectState.selectedQueryId === query.id ? 'bg-blue-900/30 border-r-2 border-blue-400' : ''}"
              >
                <svg class="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span class="text-sm text-gray-300 truncate">{query.id}</span>
                {#if query.modifiers.one}
                  <span class="ml-auto px-1.5 py-0.5 text-xs rounded bg-purple-900/50 text-purple-300">:one</span>
                {/if}
                {#if query.modifiers.pluck}
                  <span class="px-1.5 py-0.5 text-xs rounded bg-orange-900/50 text-orange-300">:pluck</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Exec Section -->
      {#if projectState.queryGroups.execs.length > 0}
        <div class="border-b border-gray-800">
          <div class="px-4 py-2">
            <span class="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Exec ({projectState.queryGroups.execs.length})
            </span>
          </div>
          <div class="pb-2">
            {#each projectState.queryGroups.execs as query}
              <button
                onclick={() => handleQueryClick(query)}
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

  <!-- Footer with file info -->
  {#if projectState.project}
    <div class="px-4 py-2 border-t border-gray-700 bg-gray-800/50">
      <div class="text-xs text-gray-500">
        {projectState.project.sqlFiles.join(', ')}
      </div>
    </div>
  {/if}
</div>
