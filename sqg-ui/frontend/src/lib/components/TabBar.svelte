<script lang="ts">
  import { tabsState } from '../stores/tabs.svelte';
</script>

<div class="flex items-center bg-gray-900 border-b border-gray-700 overflow-x-auto">
  {#each tabsState.tabs as tab}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      onclick={() => tabsState.switchTab(tab.id)}
      onkeydown={(e) => { if (e.key === 'Enter') tabsState.switchTab(tab.id); }}
      role="tab"
      tabindex="0"
      aria-selected={tabsState.activeTabId === tab.id}
      class="group flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-gray-800 cursor-pointer transition-colors whitespace-nowrap select-none
        {tabsState.activeTabId === tab.id
          ? 'bg-gray-800 text-gray-200 border-b-2 border-b-blue-500'
          : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'}"
    >
      {#if tab.type === 'schema'}
        <svg class="w-3 h-3 text-green-400/70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
        </svg>
      {:else if tab.fileName}
        <svg class="w-3 h-3 text-blue-400/70 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      {:else}
        <svg class="w-3 h-3 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      {/if}

      <span>{tab.label}</span>

      {#if tab.dirty}
        <span class="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0"></span>
      {/if}

      {#if tabsState.tabs.length > 1}
        <button
          onclick={(e) => { e.stopPropagation(); tabsState.closeTab(tab.id); }}
          class="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-700 transition-opacity"
          title="Close tab"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      {/if}
    </div>
  {/each}
</div>
