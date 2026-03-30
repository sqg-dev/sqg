<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorState, Prec } from '@codemirror/state';
  import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
  import { sql } from '@codemirror/lang-sql';
  import { oneDark } from '@codemirror/theme-one-dark';
  import { queryState } from '../stores/query.svelte';
  import { tabsState } from '../stores/tabs.svelte';
  import { sqgAutocompletion } from '../editor/sqg-autocomplete';
  import { sqgLinter, sqgHoverTooltip, setAnnotationsCallback } from '../editor/sqg-lint';

  let container: HTMLDivElement;
  let view: EditorView;
  let lastContent = '';
  let lastTabId = '';

  onMount(() => {
    // Wire up server annotations to the query store
    setAnnotationsCallback((annotations) => {
      queryState.setAnnotations(annotations);
    });

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newDoc = update.state.doc.toString();
        lastContent = newDoc;
        // Update both the tab content and the query state (for CTE parsing)
        tabsState.updateContent(newDoc);
        queryState.setSQL(newDoc);
      }
    });

    const runKeymap = keymap.of([
      {
        key: 'Ctrl-Enter',
        mac: 'Cmd-Enter',
        run: () => {
          document.dispatchEvent(new CustomEvent('sqg-run-query'));
          return true;
        },
      },
      {
        key: 'Ctrl-s',
        mac: 'Cmd-s',
        run: () => {
          document.dispatchEvent(new CustomEvent('sqg-save-file'));
          return true;
        },
      },
    ]);

    const state = EditorState.create({
      doc: tabsState.activeTab.content,
      extensions: [
        Prec.highest(runKeymap),
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        sql(),
        sqgAutocompletion(),
        sqgLinter(),
        sqgHoverTooltip(),
        oneDark,
        updateListener,
        EditorView.theme({
          '&': { height: '100%' },
          '.cm-scroller': { overflow: 'auto' },
        }),
      ],
    });

    lastContent = tabsState.activeTab.content;
    lastTabId = tabsState.activeTabId;
    queryState.setSQL(lastContent);

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

    // Listen for scroll-to-line events from sidebar
    const handleScrollToLine = (e: Event) => {
      const lineNum = (e as CustomEvent).detail as number;
      if (view && lineNum > 0 && lineNum <= view.state.doc.lines) {
        const line = view.state.doc.line(lineNum);
        view.dispatch({
          selection: { anchor: line.from },
          effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 50 }),
        });
        view.focus();
      }
    };
    document.addEventListener('sqg-scroll-to-line', handleScrollToLine);

    return () => {
      document.removeEventListener('sqg-insert-text', handleInsert);
      document.removeEventListener('sqg-scroll-to-line', handleScrollToLine);
      view?.destroy();
    };
  });

  // When active tab changes, load its content into the editor
  $effect(() => {
    const tab = tabsState.activeTab;
    if (!view || !tab) return;

    if (tab.id !== lastTabId) {
      lastTabId = tab.id;
      lastContent = tab.content;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: tab.content },
      });
      queryState.setSQL(tab.content);
    }
  });

  // When tab content changes externally (e.g., file reload from watch mode)
  $effect(() => {
    const tab = tabsState.activeTab;
    if (!view || !tab || tab.id !== lastTabId) return;

    if (tab.content !== lastContent && !tab.dirty) {
      lastContent = tab.content;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: tab.content },
      });
      queryState.setSQL(tab.content);
    }
  });


</script>

<div class="h-full w-full" bind:this={container}></div>
