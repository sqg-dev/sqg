<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorState } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { sql } from '@codemirror/lang-sql';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { queryState } from '../stores/query.svelte';
  import { sqgAutocompletion } from '../editor/sqg-autocomplete';
  import { sqgLinter } from '../editor/sqg-lint';

  let container: HTMLDivElement;
  let view: EditorView;
  let lastSetSql = '';

  onMount(() => {
    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newDoc = update.state.doc.toString();
        lastSetSql = newDoc;
        queryState.setSQL(newDoc);
      }
    });

    const runKeymap = keymap.of([
      {
        key: 'Ctrl-Enter',
        mac: 'Cmd-Enter',
        run: () => {
          queryState.execute();
          return true;
        },
      },
    ]);

    const state = EditorState.create({
      doc: queryState.sql,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        sql(),
        sqgAutocompletion(),
        sqgLinter(),
        oneDark,
        updateListener,
        runKeymap,
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    });

    lastSetSql = queryState.sql;

    view = new EditorView({
      state,
      parent: container,
    });

    // Listen for schema browser insert events
    const handleInsert = (e: Event) => {
      const text = (e as CustomEvent).detail as string;
      if (view) {
        const pos = view.state.selection.main.head;
        view.dispatch({ changes: { from: pos, insert: text } });
        view.focus();
      }
    };
    document.addEventListener('sqg-insert-text', handleInsert);

    return () => {
      document.removeEventListener('sqg-insert-text', handleInsert);
      view?.destroy();
    };
  });

  // Watch for external changes to queryState.sql and update the editor
  $effect(() => {
    const currentSql = queryState.sql;
    if (view && currentSql !== lastSetSql) {
      lastSetSql = currentSql;
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: currentSql,
        },
      });
    }
  });
</script>

<div class="h-full w-full" bind:this={container}></div>
