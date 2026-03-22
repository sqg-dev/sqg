import { resolve } from 'node:path';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { Context } from './context';
import { getProjectPath, setProjectPath } from './context';
import { getAdapter, getCurrentEngine } from '../db/index';
import { parseProject } from '../sqg/parser';
import { getWatchStatus, startWatching } from '../watcher';
import type { SqgProject } from '@sql-ide/shared';

const t = initTRPC.context<Context>().create();

export const appRouter = t.router({
  // Execute a full SQL query
  executeQuery: t.procedure
    .input(z.object({ sql: z.string() }))
    .mutation(async ({ input }) => {
      const adapter = await getAdapter(getProjectEngine());
      return adapter.executeSQL(input.sql);
    }),

  // Execute a specific CTE from a query
  executeCTE: t.procedure
    .input(z.object({ fullSql: z.string(), cteName: z.string() }))
    .mutation(async ({ input }) => {
      const adapter = await getAdapter(getProjectEngine());
      return adapter.executeCTE(input.fullSql, input.cteName);
    }),

  // Preview all CTEs in a query (returns first few rows for each)
  previewAllCTEs: t.procedure
    .input(z.object({ sql: z.string() }))
    .mutation(async ({ input }) => {
      const adapter = await getAdapter(getProjectEngine());
      return adapter.previewAllCTEs(input.sql);
    }),

  // Get database schema (tables and columns)
  getSchema: t.procedure.query(async () => {
    const adapter = await getAdapter(getProjectEngine());
    return adapter.getSchema();
  }),

  // Health check
  health: t.procedure.query(() => {
    return { status: 'ok', engine: getCurrentEngine(), timestamp: new Date().toISOString() };
  }),

  // Get loaded SQG project (if any)
  getProject: t.procedure.query((): SqgProject | null => {
    const projectPath = getProjectPath();
    if (!projectPath) return null;

    try {
      return parseProject(projectPath);
    } catch (error) {
      console.error('[getProject] Error loading project:', error);
      throw error;
    }
  }),

  // Run migrations from the loaded project
  runMigrations: t.procedure.mutation(async () => {
    const projectPath = getProjectPath();
    if (!projectPath) throw new Error('No project loaded');

    const project = parseProject(projectPath);
    if (project.migrations.length === 0) {
      return { migrationsRun: 0 };
    }

    const adapter = await getAdapter(project.engine);
    let migrationsRun = 0;

    for (const migration of project.migrations) {
      try {
        await adapter.executeSQL(migration.sql, false);
        migrationsRun++;
      } catch (error) {
        throw new Error(`Migration ${migration.id} failed: ${(error as Error).message}`);
      }
    }

    return { migrationsRun };
  }),

  // Watch mode: get current status (polled by frontend)
  watchStatus: t.procedure.query(() => {
    return getWatchStatus();
  }),

  // Watch mode: start watching project files
  startWatching: t.procedure.mutation(() => {
    const projectPath = getProjectPath();
    if (!projectPath) throw new Error('No project loaded');
    return startWatching(projectPath);
  }),

  // Initialize a new SQG project
  initProject: t.procedure
    .input(z.object({
      directory: z.string(),
      name: z.string(),
      engine: z.enum(['sqlite', 'duckdb', 'postgres']),
      language: z.enum(['typescript', 'java', 'python']),
    }))
    .mutation(async ({ input }) => {
      const { initProject } = await import('@sqg/sqg');
      const dir = resolve(input.directory);
      const generator = `${input.language}/${input.engine}`;
      await initProject({ dir, generator });

      // Load the newly created project
      const configPath = resolve(dir, 'sqg.yaml');
      setProjectPath(configPath);
      return parseProject(configPath);
    }),

  // Open an existing SQG project
  openProject: t.procedure
    .input(z.object({ configPath: z.string() }))
    .mutation(({ input }) => {
      const configPath = resolve(input.configPath);
      setProjectPath(configPath);
      return parseProject(configPath);
    }),
});

/** Get the engine from the currently loaded project, defaulting to duckdb */
function getProjectEngine(): string {
  const projectPath = getProjectPath();
  if (!projectPath) return 'duckdb';

  try {
    const project = parseProject(projectPath);
    return project.engine || 'duckdb';
  } catch {
    return 'duckdb';
  }
}

export type AppRouter = typeof appRouter;
