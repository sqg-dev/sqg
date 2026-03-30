<script lang="ts">
  import { statusState } from '../stores/status.svelte';
</script>

{#if statusState.message}
  <div class="flex items-center px-3 py-1 text-xs border-t border-gray-700
    {statusState.level === 'error' ? 'bg-red-900/30 text-red-400' :
     statusState.level === 'warning' ? 'bg-yellow-900/30 text-yellow-400' :
     'bg-gray-800 text-gray-400'}">
    <span class="truncate">{statusState.message}</span>
    <button
      onclick={() => statusState.clear()}
      class="ml-auto pl-2 text-gray-500 hover:text-gray-300 flex-shrink-0"
    >✕</button>
  </div>
{/if}
