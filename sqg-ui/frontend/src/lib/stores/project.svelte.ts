import type { SqgProject } from '@sqg-ui/shared';
import { trpc } from '../trpc';

class ProjectState {
  project = $state<SqgProject | null>(null);
  isLoading = $state(false);
  error = $state<string | null>(null);
  selectedQueryId = $state<string | null>(null);
  migrationsRun = $state(false);

  // Derived state
  queries = $derived(this.project?.queries ?? []);
  migrations = $derived(this.project?.migrations ?? []);
  tables = $derived(this.project?.tables ?? []);
  hasProject = $derived(this.project !== null);

  selectedQuery = $derived.by(() => {
    if (!this.selectedQueryId || !this.project) return null;
    return this.project.queries.find(q => q.id === this.selectedQueryId) ?? null;
  });

  // Group queries by type for sidebar display
  queryGroups = $derived.by(() => {
    if (!this.project) return { queries: [], execs: [] };

    const queries = this.project.queries.filter(q => q.type === 'QUERY');
    const execs = this.project.queries.filter(q => q.type === 'EXEC');

    return { queries, execs };
  });

  async loadProject() {
    this.isLoading = true;
    this.error = null;

    try {
      const project = await trpc.getProject.query();
      this.project = project;

      if (project) {
        console.log('[ProjectState] Project loaded:', project.name);
        console.log('[ProjectState] Queries:', project.queries.length);
        console.log('[ProjectState] Migrations:', project.migrations.length);
      } else {
        console.log('[ProjectState] No project loaded');
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to load project';
      console.error('[ProjectState] Error loading project:', error);
      this.error = error;
    } finally {
      this.isLoading = false;
    }
  }

  async runMigrations() {
    if (!this.project || this.migrationsRun) return;

    this.isLoading = true;
    this.error = null;

    try {
      const result = await trpc.runMigrations.mutate();
      console.log('[ProjectState] Migrations run:', result.migrationsRun);
      this.migrationsRun = true;
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to run migrations';
      console.error('[ProjectState] Error running migrations:', error);
      this.error = error;
      throw e;
    } finally {
      this.isLoading = false;
    }
  }

  selectQuery(queryId: string) {
    this.selectedQueryId = queryId;
  }

  clearSelection() {
    this.selectedQueryId = null;
  }
}

export const projectState = new ProjectState();
