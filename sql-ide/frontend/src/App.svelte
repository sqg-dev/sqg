<script lang="ts">
  import { onMount } from 'svelte';
  import SplitPane from './lib/components/SplitPane.svelte';
  import Editor from './lib/components/Editor.svelte';
  import TabBar from './lib/components/TabBar.svelte';
  import CTEGraph from './lib/components/CTEGraph.svelte';
  import ResultsTable from './lib/components/ResultsTable.svelte';
  import SchemaView from './lib/components/SchemaView.svelte';
  import SchemaGraph from './lib/components/SchemaGraph.svelte';
  import Toolbar from './lib/components/Toolbar.svelte';
  import ProjectSidebar from './lib/components/ProjectSidebar.svelte';
  import WelcomePage from './lib/components/WelcomePage.svelte';
  import StatusBar from './lib/components/StatusBar.svelte';
  import { queryState } from './lib/stores/query.svelte';
  import { projectState } from './lib/stores/project.svelte';
  import { tabsState } from './lib/stores/tabs.svelte';
  import { updateSchemaCompletions } from './lib/editor/sqg-autocomplete';
  import { trpc } from './lib/trpc';
  import { statusState } from './lib/stores/status.svelte';

  let schemaGraph: SchemaGraph = $state(undefined!);
  let showWelcome = $state(false);
  let engine = $state('duckdb');
  let watchStatus = $state<{ watching: boolean; fileCount: number; fileNames?: string[]; lastChangeFile: string | null }>({
    watching: false, fileCount: 0, lastChangeFile: null,
  });
  let lastChangeCounter = 0;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Refresh schema graph when switching to schema tab
  $effect(() => {
    if (tabsState.isSchemaTab && schemaGraph) {
      schemaGraph.refresh();
    }
  });

  function handleRun() {
    // Re-extract query SQL from current editor content before running
    const selectedId = projectState.selectedQueryId;
    if (selectedId && tabsState.activeTab?.content) {
      const content = tabsState.activeTab.content;
      // Find the annotation line and extract the SQL block after it
      const lines = content.split('\n');
      const pattern = new RegExp(`^--\\s+(?:QUERY|EXEC)\\s+${selectedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      let startLine = -1;
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) { startLine = i; break; }
      }
      if (startLine >= 0) {
        // Collect lines until next annotation or end of file
        let endLine = lines.length;
        for (let i = startLine + 1; i < lines.length; i++) {
          if (/^--\s+(QUERY|EXEC|MIGRATE|TESTDATA|TABLE)\s+/.test(lines[i])) {
            endLine = i;
            break;
          }
        }
        // Extract SQL: skip annotation line and @set lines, resolve variables
        const block = lines.slice(startLine + 1, endLine);
        const vars: Record<string, string> = {};
        const sqlLines: string[] = [];
        for (const line of block) {
          const setMatch = line.match(/@set\s+(\w+)\s*=\s*(.+)/);
          if (setMatch) {
            vars[setMatch[1]] = setMatch[2].trim();
          } else if (line.trim()) {
            sqlLines.push(line);
          }
        }
        let sql = sqlLines.join('\n');
        sql = sql.replace(/\$\{(\w+)\}/g, (_, v) => vars[v] ?? `\${${v}}`);
        queryState.setSelectedQuery(sql);
      }
    }
    queryState.execute();
  }

  async function handleSave() {
    const tab = tabsState.activeTab;
    if (!tab?.fileName) return;

    try {
      await trpc.saveFile.mutate({ fileName: tab.fileName, content: tab.content });
      tab.dirty = false;
      tab.originalContent = tab.content;
      statusState.info(`Saved ${tab.fileName}`);
    } catch (e) {
      statusState.error(`Save failed: ${(e as Error).message}`);
    }
  }

  let canSave = $derived(!!tabsState.activeTab?.fileName && tabsState.activeTab.dirty);

  async function loadSchema() {
    try {
      const tables = await trpc.getSchema.query();
      updateSchemaCompletions(tables);
    } catch (e) {
      const msg = e instanceof TypeError ? 'Server not reachable' : (e as Error).message;
      statusState.error(`Schema: ${msg}`);
    }
  }

  async function pollWatchStatus() {
    try {
      const status = await trpc.watchStatus.query();
      watchStatus = status;

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
    engine = projectState.project?.engine || 'duckdb';

    if (projectState.project?.initError) {
      statusState.error(`Init: ${projectState.project.initError}`);
    }

    await loadSchema();

    if (projectState.project?.sqlFiles?.[0]) {
      await tabsState.openFile(projectState.project.sqlFiles[0]);
    }

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
      if (projectState.project?.initError) {
        statusState.error(`Init: ${projectState.project.initError}`);
      }
      loadSchema();

      if (projectState.project?.sqlFiles?.[0]) {
        await tabsState.openFile(projectState.project.sqlFiles[0]);
      }

      pollWatchStatus();
      pollInterval = setInterval(pollWatchStatus, 2000);
    }

    const handleSaveShortcut = () => handleSave();
    document.addEventListener('sqg-save-file', handleSaveShortcut);

    const handleCloseProject = () => {
      if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
      showWelcome = true;
    };
    document.addEventListener('sqg-close-project', handleCloseProject);

    return () => {
      if (pollInterval) clearInterval(pollInterval);
      document.removeEventListener('sqg-save-file', handleSaveShortcut);
      document.removeEventListener('sqg-close-project', handleCloseProject);
    };
  });
</script>

<div class="h-screen flex flex-col bg-gray-900">
  {#if showWelcome}
    <WelcomePage onProjectLoaded={handleProjectLoaded} />
  {:else}
    <Toolbar onRun={handleRun} onSave={handleSave} {engine} {canSave} {watchStatus} />

    <div class="flex-1 min-h-0 flex">
      <!-- Sidebar -->
      <div class="w-64 flex-shrink-0 border-r border-gray-700 overflow-auto">
        <ProjectSidebar />
      </div>

      <!-- Main content area -->
      <div class="flex-1 min-w-0 flex flex-col">
        <TabBar />

        <div class="flex-1 min-h-0">
          {#if tabsState.isSchemaTab}
            <!-- Schema tab: graph with results below -->
            <SplitPane horizontal initialSplit={60} minSize={20}>
              {#snippet first()}
                <SchemaGraph bind:this={schemaGraph} />
              {/snippet}
              {#snippet second()}
                <ResultsTable />
              {/snippet}
            </SplitPane>
          {:else if queryState.hasCTEs}
            <!-- Editor with CTEs: editor left, CTE graph + results right -->
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
          {:else}
            <!-- Editor without CTEs: editor top, results bottom -->
            <SplitPane horizontal initialSplit={60} minSize={20}>
              {#snippet first()}
                <Editor />
              {/snippet}
              {#snippet second()}
                <ResultsTable />
              {/snippet}
            </SplitPane>
          {/if}
        </div>
      </div>
    </div>
    <StatusBar />
  {/if}
</div>
