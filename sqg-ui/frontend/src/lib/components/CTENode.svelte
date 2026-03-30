<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte';

  interface PreviewData {
    columns: { name: string; type: string }[];
    rows: Record<string, unknown>[];
  }

  interface Props {
    data: {
      label: string;
      rowCount?: number;
      status: 'pending' | 'running' | 'success' | 'error';
      error?: string;
      isMain?: boolean;
      preview?: PreviewData;
    };
  }

  let { data }: Props = $props();

  let statusColor = $derived(
    ({
      pending: 'border-gray-600 bg-gray-800',
      running: 'border-blue-500 bg-blue-900/50',
      success: 'border-green-500 bg-green-900/30',
      error: 'border-red-500 bg-red-900/30',
    } as const)[data.status]
  );

  function formatValue(value: unknown): string {
    if (value === null) return 'NULL';
    if (value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value).slice(0, 15);
    const str = String(value);
    return str.length > 12 ? str.slice(0, 10) + '..' : str;
  }

  function getExampleValues(colName: string): string {
    if (!data.preview) return '';
    const values = data.preview.rows
      .slice(0, 3)
      .map(row => formatValue(row[colName]))
      .filter((v, i, arr) => arr.indexOf(v) === i); // unique values
    return values.join(', ');
  }

  function formatType(type: string): string {
    // Shorten common type names
    return type
      .replace('VARCHAR', 'str')
      .replace('INTEGER', 'int')
      .replace('BIGINT', 'big')
      .replace('DOUBLE', 'dbl')
      .replace('BOOLEAN', 'bool')
      .replace('TIMESTAMP', 'ts')
      .replace('DATE', 'date');
  }
</script>

<div
  class="rounded-lg border-2 cursor-pointer transition-all hover:scale-[1.02] {statusColor}"
  class:min-w-[160px]={!data.preview}
  class:w-[480px]={data.preview}
  title={data.error || ''}
>
  <Handle type="target" position={Position.Left} class="!bg-gray-500" />

  <!-- Header -->
  <div class="px-4 py-3 text-center border-b border-gray-700/50">
    <div class="font-medium text-base text-gray-100 truncate">
      {data.label}
    </div>

    {#if data.status === 'running'}
      <div class="text-xs text-blue-400 mt-0.5 flex items-center justify-center gap-1">
        <svg class="animate-spin h-3 w-3" viewBox="0 0 24 24">
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
            fill="none"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        Running...
      </div>
    {:else if data.status === 'success' && data.rowCount !== undefined}
      <div class="text-xs text-green-400 mt-0.5">
        {data.rowCount.toLocaleString()} rows
      </div>
    {:else if data.status === 'error'}
      <div class="text-xs text-red-400 mt-0.5 truncate max-w-[120px]">
        Error
      </div>
    {:else}
      <div class="text-xs text-gray-500 mt-0.5">
        Click to run
      </div>
    {/if}
  </div>

  <!-- Preview Table: Field | Type | Examples -->
  {#if data.preview && data.preview.columns.length > 0}
    <div>
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-gray-900/50">
            <th class="px-3 py-2 text-left text-gray-400 font-medium">Field</th>
            <th class="px-3 py-2 text-left text-gray-400 font-medium">Type</th>
            <th class="px-3 py-2 text-left text-gray-400 font-medium">Examples</th>
          </tr>
        </thead>
        <tbody>
          {#each data.preview.columns as col}
            <tr class="border-t border-gray-700/30">
              <td class="px-3 py-1.5 text-gray-200 font-medium truncate max-w-[140px]">
                {col.name}
              </td>
              <td class="px-3 py-1.5 text-blue-400 font-mono text-xs whitespace-nowrap">
                {formatType(col.type)}
              </td>
              <td class="px-3 py-1.5 text-gray-400 font-mono truncate max-w-[180px]">
                {getExampleValues(col.name)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <Handle type="source" position={Position.Right} class="!bg-gray-500" />
</div>
