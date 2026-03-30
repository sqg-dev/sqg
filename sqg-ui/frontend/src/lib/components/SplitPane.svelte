<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    horizontal?: boolean;
    initialSplit?: number;
    minSize?: number;
    first: Snippet;
    second: Snippet;
  }

  let { horizontal = false, initialSplit = 50, minSize = 10, first, second }: Props = $props();

  // svelte-ignore state_referenced_locally
  let splitPercent = $state(initialSplit);
  let container: HTMLDivElement;
  let isDragging = $state(false);

  function onMouseDown(e: MouseEvent) {
    e.preventDefault();
    isDragging = true;

    const onMouseMove = (e: MouseEvent) => {
      if (!container) return;

      const rect = container.getBoundingClientRect();
      let percent: number;

      if (horizontal) {
        percent = ((e.clientY - rect.top) / rect.height) * 100;
      } else {
        percent = ((e.clientX - rect.left) / rect.width) * 100;
      }

      splitPercent = Math.max(minSize, Math.min(100 - minSize, percent));
    };

    const onMouseUp = () => {
      isDragging = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
</script>

<div
  bind:this={container}
  class="split-container"
  class:horizontal
  class:dragging={isDragging}
>
  <div class="pane first" style="{horizontal ? 'height' : 'width'}: {splitPercent}%">
    {@render first()}
  </div>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="splitter"
    class:horizontal
    onmousedown={onMouseDown}
    role="separator"
    aria-orientation={horizontal ? 'horizontal' : 'vertical'}
    tabindex="0"
  ></div>

  <div class="pane second" style="{horizontal ? 'height' : 'width'}: {100 - splitPercent}%">
    {@render second()}
  </div>
</div>

<style>
  .split-container {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .split-container.horizontal {
    flex-direction: column;
  }

  .pane {
    overflow: hidden;
    min-width: 0;
    min-height: 0;
  }

  .splitter {
    flex-shrink: 0;
    background-color: #313244;
    transition: background-color 0.15s;
    cursor: col-resize;
    width: 4px;
  }

  .splitter.horizontal {
    cursor: row-resize;
    width: 100%;
    height: 4px;
  }

  .splitter:hover,
  .dragging .splitter {
    background-color: #89b4fa;
  }

  .dragging {
    cursor: col-resize;
    user-select: none;
  }

  .dragging.horizontal {
    cursor: row-resize;
  }
</style>
