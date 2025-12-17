<script lang="ts">
import { sql } from "@codemirror/lang-sql";
import { EditorState } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { onMount } from "svelte";

export let value = "";
export let onUpdate: ((value: string) => void) | undefined = undefined;

let editorContainer: HTMLDivElement;
let editorView: EditorView | null = null;

onMount(() => {
  const startState = EditorState.create({
    doc: value,
    extensions: [
      basicSetup,
      sql(),
      oneDark,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onUpdate) {
          const newValue = update.state.doc.toString();
          onUpdate(newValue);
        }
      }),
    ],
  });

  editorView = new EditorView({
    state: startState,
    parent: editorContainer,
  });

  return () => {
    editorView?.destroy();
  };
});

$: if (editorView && value !== editorView.state.doc.toString()) {
  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: value,
    },
  });
}
</script>

<div bind:this={editorContainer} class="w-full h-full"></div>

<style>
  /* CodeMirror requires custom CSS for proper height handling */
  :global(.cm-editor) {
    height: 100%;
  }

  :global(.cm-scroller) {
    height: 100%;
  }
</style>

