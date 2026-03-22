<script lang="ts">
  import { onMount } from 'svelte';
  import SplitPane from './lib/components/SplitPane.svelte';
  import Editor from './lib/components/Editor.svelte';
  import CTEGraph from './lib/components/CTEGraph.svelte';
  import ResultsTable from './lib/components/ResultsTable.svelte';
  import SchemaView from './lib/components/SchemaView.svelte';
  import Toolbar from './lib/components/Toolbar.svelte';
  import ProjectSidebar from './lib/components/ProjectSidebar.svelte';
  import SchemaExplorer from './lib/components/SchemaExplorer.svelte';
  import WelcomePage from './lib/components/WelcomePage.svelte';
  import { queryState } from './lib/stores/query.svelte';
  import { projectState } from './lib/stores/project.svelte';
  import { updateSchemaCompletions } from './lib/editor/sqg-autocomplete';
  import { trpc } from './lib/trpc';

  let schemaExplorer: SchemaExplorer;
  let showWelcome = $state(false);
  let engine = $state('duckdb');
  let watchStatus = $state<{ watching: boolean; fileCount: number; lastChangeFile: string | null }>({
    watching: false, fileCount: 0, lastChangeFile: null,
  });
  let lastChangeCounter = 0;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  function handleRun() {
    queryState.execute();
  }

  async function loadSchema() {
    try {
      const tables = await trpc.getSchema.query();
      updateSchemaCompletions(tables);
      schemaExplorer?.refresh();
    } catch {
      // Schema not available yet
    }
  }

  async function pollWatchStatus() {
    try {
      const status = await trpc.watchStatus.query();
      watchStatus = status;

      // If files changed, reload project + schema
      if (status.changeCounter > lastChangeCounter) {
        lastChangeCounter = status.changeCounter;
        projectState.loadProject();
        loadSchema();
      }
    } catch {
      // Server not reachable
    }
  }

  async function handleProjectLoaded() {
    showWelcome = false;
    await projectState.loadProject();
    await loadSchema();

    // Start watching
    try {
      const status = await trpc.startWatching.mutate();
      watchStatus = status;
    } catch { /* watch not available */ }
  }

  onMount(async () => {
    await projectState.loadProject();

    if (!projectState.hasProject) {
      showWelcome = true;
    } else {
      engine = projectState.project?.engine || 'duckdb';
      loadSchema();

      // Start watch polling
      pollWatchStatus();
      pollInterval = setInterval(pollWatchStatus, 2000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  });
</script>

<div class="h-screen flex flex-col bg-gray-900">
  {#if showWelcome}
    <WelcomePage onProjectLoaded={handleProjectLoaded} />
  {:else}
    <Toolbar onRun={handleRun} {engine} {watchStatus} />

    <div class="flex-1 min-h-0 flex">
      <!-- Sidebar: Project tree + Schema browser -->
      <div class="w-64 flex-shrink-0 flex flex-col border-r border-gray-700">
        {#if projectState.hasProject}
          <div class="flex-1 min-h-0 overflow-auto">
            <ProjectSidebar />
          </div>
          <div class="border-t border-gray-700 h-64 min-h-[8rem] overflow-auto">
            <SchemaExplorer bind:this={schemaExplorer} />
          </div>
        {:else}
          <SchemaExplorer bind:this={schemaExplorer} />
        {/if}
      </div>

      <!-- Main content area -->
      <div class="flex-1 min-w-0">
        <SplitPane initialSplit={33} minSize={20}>
          {#snippet first()}
            <Editor />
          {/snippet}
          {#snippet second()}
            <SplitPane horizontal initialSplit={50} minSize={15}>
              {#snippet first()}
                <CTEGraph />
              {/snippet}
              {#snippet second()}
                <SplitPane horizontal initialSplit={25} minSize={10}>
                  {#snippet first()}
                    <SchemaView />
                  {/snippet}
                  {#snippet second()}
                    <ResultsTable />
                  {/snippet}
                </SplitPane>
              {/snippet}
            </SplitPane>
          {/snippet}
        </SplitPane>
      </div>
    </div>
  {/if}
</div>
