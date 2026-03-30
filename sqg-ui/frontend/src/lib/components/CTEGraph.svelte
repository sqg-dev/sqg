<script lang="ts">
  import { SvelteFlow, Background, Controls, MarkerType, type Node, type Edge, type NodeMouseHandler } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import ELK from 'elkjs/lib/elk.bundled.js';
  import { queryState } from '../stores/query.svelte';
  import CTENode from './CTENode.svelte';

  const elk = new ELK();

  const nodeTypes = {
    cte: CTENode,
  };

  // Use $state.raw for better performance with xyflow
  let nodes = $state.raw<Node[]>([]);
  let edges = $state.raw<Edge[]>([]);

  // Layout nodes using ELK
  async function layoutGraph(
    cteNames: string[],
    dependencies: Map<string, string[]>,
    states: Map<string, { rowCount?: number; status: string; error?: string; preview?: { columns: { name: string; type: string }[]; rows: Record<string, unknown>[] } }>
  ): Promise<{ nodes: Node[]; edges: Edge[] }> {

    // Build ELK graph structure
    const elkNodes: { id: string; width: number; height: number }[] = [];
    const elkEdges: { id: string; sources: string[]; targets: string[] }[] = [];

    // Add CTE nodes
    for (const name of cteNames) {
      const state = states.get(name);
      const hasPreview = state?.preview && state.preview.columns.length > 0;
      const numColumns = state?.preview?.columns.length || 0;
      // Header ~60px, each row ~32px, table header ~40px
      const previewHeight = 70 + 40 + (numColumns * 32);
      elkNodes.push({
        id: name,
        width: hasPreview ? 500 : 170,
        height: hasPreview ? previewHeight : 70,
      });
    }

    // Add main query node
    elkNodes.push({ id: 'main', width: 170, height: 70 });

    // Add edges from dependencies
    for (const name of cteNames) {
      const deps = dependencies.get(name) || [];
      for (const dep of deps) {
        elkEdges.push({
          id: `${dep}-${name}`,
          sources: [dep],
          targets: [name],
        });
      }
    }

    // Connect CTEs that nothing depends on to main query
    const hasDependents = new Set<string>();
    for (const [_, deps] of dependencies) {
      for (const dep of deps) {
        hasDependents.add(dep);
      }
    }

    for (const name of cteNames) {
      if (!hasDependents.has(name)) {
        elkEdges.push({
          id: `${name}-main`,
          sources: [name],
          targets: ['main'],
        });
      }
    }

    // Run ELK layout
    const graph = await elk.layout({
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'RIGHT',
        'elk.spacing.nodeNode': '60',
        'elk.layered.spacing.nodeNodeBetweenLayers': '100',
        'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
      },
      children: elkNodes,
      edges: elkEdges,
    });

    // Convert ELK output to xyflow nodes
    const resultNodes: Node[] = [];
    const resultEdges: Edge[] = [];

    for (const elkNode of graph.children || []) {
      const state = states.get(elkNode.id);
      resultNodes.push({
        id: elkNode.id,
        type: 'cte',
        position: {
          x: elkNode.x || 0,
          y: elkNode.y || 0,
        },
        data: {
          label: elkNode.id === 'main' ? 'Result' : elkNode.id,
          rowCount: state?.rowCount,
          status: state?.status || 'pending',
          error: state?.error,
          isMain: elkNode.id === 'main',
          preview: state?.preview,
        },
      });
    }

    for (const elkEdge of graph.edges || []) {
      resultEdges.push({
        id: elkEdge.id,
        source: elkEdge.sources[0],
        target: elkEdge.targets[0],
        animated: false,
        style: 'stroke: #6b7280; stroke-width: 2px;',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#6b7280',
          width: 20,
          height: 20,
        },
      });
    }

    return { nodes: resultNodes, edges: resultEdges };
  }

  // Update graph when state changes (including when previews load)
  $effect(() => {
    const parsed = queryState.parsed;
    // Track hasPreview to re-layout when previews are loaded/cleared
    const _hasPreview = queryState.hasPreview;
    // Track nodeStates size to detect changes
    const _statesSize = queryState.nodeStates.size;

    if (parsed) {
      const cteNames = parsed.ctes.map((c) => c.name);
      // ELK is async, so we need to handle the promise
      layoutGraph(cteNames, queryState.dependencies, queryState.nodeStates).then((layout) => {
        nodes = layout.nodes;
        edges = layout.edges;
      });
    } else {
      nodes = [];
      edges = [];
    }
  });

  // In xyflow v1.x, the handler receives { node, event } directly
  const handleNodeClick: NodeMouseHandler = ({ node }) => {
    if (node.id === 'main') {
      queryState.execute();
    } else {
      queryState.executeCTE(node.id);
    }
  };
</script>

<div class="h-full w-full bg-gray-900">
  {#if nodes.length > 0}
    {#key queryState.hasPreview}
      <SvelteFlow
        {nodes}
        {edges}
        {nodeTypes}
        fitView
        fitViewOptions={{ minZoom: 0.6, maxZoom: 1.2, padding: 0.1 }}
        minZoom={0.3}
        maxZoom={1.5}
        onnodeclick={handleNodeClick}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#374151" gap={20} />
        <Controls />
      </SvelteFlow>
    {/key}
  {:else}
    <div class="h-full flex items-center justify-center text-gray-500">
      <p>Write a query with CTEs to see the dependency graph</p>
    </div>
  {/if}
</div>

<style>
  :global(.svelte-flow) {
    background-color: #111827 !important;
  }

  :global(.svelte-flow__controls) {
    background-color: #1f2937;
    border: 1px solid #374151;
    border-radius: 8px;
  }

  :global(.svelte-flow__controls-button) {
    background-color: #1f2937;
    border-bottom: 1px solid #374151;
    color: #9ca3af;
  }

  :global(.svelte-flow__controls-button:hover) {
    background-color: #374151;
  }
</style>
