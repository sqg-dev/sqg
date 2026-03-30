import { trpc } from '../trpc';

export type TabType = 'editor' | 'schema';

export interface EditorTab {
  id: string;
  label: string;
  type: TabType;
  content: string;
  /** Original content when loaded — used to detect dirty state */
  originalContent: string;
  /** Which SQL file this tab represents, or null for scratch/schema */
  fileName: string | null;
  dirty: boolean;
}

class TabsState {
  tabs = $state<EditorTab[]>([
    { id: 'scratch', label: 'Scratch', type: 'editor', content: '', originalContent: '', fileName: null, dirty: false },
  ]);
  activeTabId = $state('scratch');

  activeTab = $derived(this.tabs.find(t => t.id === this.activeTabId) ?? this.tabs[0]);

  /** Whether the active tab is the schema view */
  isSchemaTab = $derived(this.activeTab?.type === 'schema');

  /** Open a SQL file tab. If already open, switch to it. */
  async openFile(fileName: string): Promise<string> {
    const existing = this.tabs.find(t => t.fileName === fileName);
    if (existing) {
      this.activeTabId = existing.id;
      return existing.id;
    }

    const { content } = await trpc.readFile.query({ fileName });
    const tab: EditorTab = {
      id: `file:${fileName}`,
      label: fileName,
      type: 'editor',
      content,
      originalContent: content,
      fileName,
      dirty: false,
    };

    this.tabs = [...this.tabs, tab];
    this.activeTabId = tab.id;
    return tab.id;
  }

  /** Open the schema tab. If already open, switch to it. */
  openSchema() {
    const existing = this.tabs.find(t => t.id === 'schema');
    if (existing) {
      this.activeTabId = 'schema';
      return;
    }

    const tab: EditorTab = {
      id: 'schema',
      label: 'Schema',
      type: 'schema',
      content: '',
      originalContent: '',
      fileName: null,
      dirty: false,
    };

    this.tabs = [...this.tabs, tab];
    this.activeTabId = 'schema';
  }

  switchTab(tabId: string) {
    this.activeTabId = tabId;
  }

  closeTab(tabId: string) {
    if (this.tabs.length <= 1) return;

    const idx = this.tabs.findIndex(t => t.id === tabId);
    this.tabs = this.tabs.filter(t => t.id !== tabId);

    if (this.activeTabId === tabId) {
      this.activeTabId = this.tabs[Math.min(idx, this.tabs.length - 1)].id;
    }
  }

  updateContent(content: string) {
    const tab = this.tabs.find(t => t.id === this.activeTabId);
    if (tab && tab.type === 'editor') {
      tab.content = content;
      tab.dirty = content !== tab.originalContent;
    }
  }

  setScratchContent(content: string) {
    const scratch = this.tabs.find(t => t.id === 'scratch');
    if (scratch) {
      scratch.content = content;
      this.activeTabId = 'scratch';
    }
  }
}

export const tabsState = new TabsState();
