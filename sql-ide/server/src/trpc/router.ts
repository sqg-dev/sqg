import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { Context } from './context';
import { getProjectPath, setProjectPath } from './context';
import { getAdapter, getCurrentEngine, resetAdapter } from '../db/index';
import { parseProject } from '../sqg/parser';
import { getWatchStatus, startWatching } from '../watcher';
import type { SqgProject } from '@sql-ide/shared';

const t = initTRPC.context<Context>().create();

let dbInitialized = false;

export interface ValidateAnnotation {
  id: string;
  type: 'QUERY' | 'EXEC' | 'MIGRATE' | 'TESTDATA' | 'TABLE';
  line: number;
  one: boolean;
  pluck: boolean;
  sql: string;
}

export interface ValidateDiagnostic {
  line: number;
  column?: number;
  endColumn?: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export const appRouter = t.router({
  // Execute a query in read-only mode (savepoint + rollback)
  // This keeps the DB in its post-migration state
  executeQuery: t.procedure
    .input(z.object({ sql: z.string() }))
    .mutation(async ({ input }) => {
      const adapter = await getAdapter(getProjectEngine());
      return adapter.executeSQLReadOnly(input.sql);
    }),

  // Execute a specific CTE
  executeCTE: t.procedure
    .input(z.object({ fullSql: z.string(), cteName: z.string() }))
    .mutation(async ({ input }) => {
      const adapter = await getAdapter(getProjectEngine());
      return adapter.executeCTE(input.fullSql, input.cteName);
    }),

  // Preview all CTEs in a query
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

  // Get loaded SQG project and auto-initialize the database
  getProject: t.procedure.query(async () => {
    const projectPath = getProjectPath();
    if (!projectPath) return null;

    try {
      const project = parseProject(projectPath);

      // Auto-initialize: run migrations + testdata on first load
      if (!dbInitialized) {
        const adapter = await getAdapter(project.engine);
        const migrations = project.migrations.map(m => m.sql);
        try {
          const result = await adapter.initialize(migrations, project.testdata);
          console.log(`[getProject] Initialized DB: ${result.migrationsRun} migrations, ${result.testdataRun} testdata`);
          dbInitialized = true;
        } catch (e) {
          console.error('[getProject] DB initialization failed:', e);
          // Still return project — let user see the error
          return { ...project, initError: (e as Error).message };
        }
      }

      return project;
    } catch (error) {
      console.error('[getProject] Error loading project:', error);
      throw error;
    }
  }),

  // Validate SQL content using SQG's real Lezer parser.
  // Returns parsed annotations + any errors.
  validateSQL: t.procedure
    .input(z.object({ content: z.string(), fileName: z.string().optional() }))
    .mutation(async ({ input }) => {
      const tmpPath = `/tmp/sqg-validate-${Date.now()}.sql`;

      const annotations: ValidateAnnotation[] = [];
      const diagnostics: ValidateDiagnostic[] = [];

      try {
        writeFileSync(tmpPath, input.content);
        const { parseSQLQueries } = await import('@sqg/sqg');
        const result = parseSQLQueries(tmpPath, []);
        const lines = input.content.split('\n');

        // Map parsed queries to annotations with line numbers
        for (const q of result.queries) {
          // Find the annotation line in the source
          const pattern = new RegExp(`^--\\s+${q.type}\\s+${q.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
          let line = 1;
          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) { line = i + 1; break; }
          }

          const vars = Object.fromEntries(q.variables);
          const resolvedSql = q.rawQuery.replace(/\$\{(\w+)\}/g, (_: string, v: string) => vars[v] ?? `\${${v}}`);

          annotations.push({
            id: q.id,
            type: q.type,
            line,
            one: q.isOne,
            pluck: q.isPluck,
            sql: resolvedSql,
          });
        }

        // Map tables
        for (const t of result.tables) {
          const pattern = new RegExp(`^--\\s+TABLE\\s+${t.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
          let line = 1;
          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) { line = i + 1; break; }
          }
          annotations.push({ id: t.id, type: 'TABLE', line, one: false, pluck: false, sql: '' });
        }

        // Check for unknown modifiers
        const validModifiers = [':one', ':pluck', ':all', ':appender'];
        for (let i = 0; i < lines.length; i++) {
          const annMatch = lines[i].match(/^--\s+(QUERY|EXEC|MIGRATE|TESTDATA|TABLE)\s+\S+((?:\s+:\w+(?:\([^)]*\))?)*)/);
          if (annMatch && annMatch[2]) {
            const mods = annMatch[2].trim().match(/:\w+(?:\([^)]*\))?/g) || [];
            for (const mod of mods) {
              const baseMod = mod.replace(/\([^)]*\)/, '');
              if (!validModifiers.includes(baseMod)) {
                const col = lines[i].indexOf(baseMod);
                diagnostics.push({
                  line: i + 1,
                  column: col,
                  endColumn: col + baseMod.length,
                  message: `Unknown modifier "${baseMod}". Valid: ${validModifiers.join(', ')}`,
                  severity: 'error',
                });
              }
            }
          }

          // Check undefined variables
          const varRegex = /\$\{(\w+)\}/g;
          let varMatch;
          while ((varMatch = varRegex.exec(lines[i])) !== null) {
            const varName = varMatch[1];
            // Check if there's a @set for this variable earlier in the file
            const setPattern = new RegExp(`@set\\s+${varName}\\s*=`);
            const hasDef = lines.some(l => setPattern.test(l));
            if (!hasDef) {
              diagnostics.push({
                line: i + 1,
                column: varMatch.index,
                endColumn: varMatch.index + varMatch[0].length,
                message: `Variable "${varName}" is used but not defined with @set`,
                severity: 'warning',
              });
            }
          }
        }

        // Check for TABLE without :appender
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(/^--\s+TABLE\s+\S+((?:\s+:\w+)*)/);
          if (m && !(m[1] || '').includes(':appender')) {
            diagnostics.push({
              line: i + 1,
              message: 'TABLE without :appender — no code will be generated',
              severity: 'warning',
            });
          }
        }

        // Detect near-miss annotations (typos, wrong case, extra spaces)
        const validTypes = ['QUERY', 'EXEC', 'MIGRATE', 'TESTDATA', 'TABLE'];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Skip lines that are already valid annotations
          if (/^--\s+(QUERY|EXEC|MIGRATE|TESTDATA|TABLE)\s+/.test(line)) continue;

          // Check for common mistakes
          const nearMiss = line.match(/^--\s+([A-Z][A-Z\s]*[A-Z])\s+\S/);
          if (nearMiss) {
            const word = nearMiss[1].replace(/\s+/g, '');
            for (const valid of validTypes) {
              if (word !== valid && levenshtein(word, valid) <= 2) {
                const col = line.indexOf(nearMiss[1]);
                diagnostics.push({
                  line: i + 1,
                  column: col,
                  endColumn: col + nearMiss[1].length,
                  message: `Did you mean "-- ${valid}"? ("${nearMiss[1]}" is not a valid annotation)`,
                  severity: 'warning',
                });
                break;
              }
            }
          }

          // Check for lowercase annotations
          const lowerMatch = line.match(/^--\s+(query|exec|migrate|testdata|table)\s+\S/i);
          if (lowerMatch && !validTypes.includes(lowerMatch[1])) {
            const upper = lowerMatch[1].toUpperCase();
            if (validTypes.includes(upper)) {
              const col = line.indexOf(lowerMatch[1]);
              diagnostics.push({
                line: i + 1,
                column: col,
                endColumn: col + lowerMatch[1].length,
                message: `Annotation types must be uppercase: use "${upper}" instead of "${lowerMatch[1]}"`,
                severity: 'error',
              });
            }
          }
        }

      } catch (e: unknown) {
        const msg = (e as Error).message;
        // Try to extract line number from SQG error messages
        const lineMatch = msg.match(/line (\d+)/i);
        diagnostics.push({
          line: lineMatch ? parseInt(lineMatch[1]) : 1,
          message: msg,
          severity: 'error',
        });
      } finally {
        try { unlinkSync(tmpPath); } catch { /* ignore */ }
      }

      return { annotations, diagnostics };
    }),

  // Save file contents back to disk
  saveFile: t.procedure
    .input(z.object({ fileName: z.string(), content: z.string() }))
    .mutation(({ input }) => {
      const projectPath = getProjectPath();
      if (!projectPath) throw new Error('No project loaded');

      const projectDir = dirname(projectPath);
      const filePath = join(projectDir, input.fileName);
      const resolved = resolve(filePath);
      if (!resolved.startsWith(resolve(projectDir))) {
        throw new Error('File path outside project directory');
      }

      writeFileSync(resolved, input.content, 'utf-8');
      return { saved: true };
    }),

  // Read a SQL file's contents
  readFile: t.procedure
    .input(z.object({ fileName: z.string() }))
    .query(({ input }) => {
      const projectPath = getProjectPath();
      if (!projectPath) throw new Error('No project loaded');

      const projectDir = dirname(projectPath);
      const filePath = join(projectDir, input.fileName);

      // Security: ensure the file is within the project directory
      const resolved = resolve(filePath);
      if (!resolved.startsWith(resolve(projectDir))) {
        throw new Error('File path outside project directory');
      }

      return { content: readFileSync(resolved, 'utf-8'), fileName: input.fileName };
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

      await resetAdapter();
      dbInitialized = false;
      const configPath = resolve(dir, 'sqg.yaml');
      setProjectPath(configPath);
      return parseProject(configPath);
    }),

  // Open an existing SQG project
  openProject: t.procedure
    .input(z.object({ configPath: z.string() }))
    .mutation(async ({ input }) => {
      const configPath = resolve(input.configPath);
      await resetAdapter(); // Close old DB connection
      dbInitialized = false; // Reset so new project gets initialized
      setProjectPath(configPath);
      return parseProject(configPath);
    }),

  // List available example projects
  listExamples: t.procedure.query(() => {
    const examples: Array<{ name: string; path: string; engine: string }> = [];

    // Search relative to CWD, project path, and common repo layouts
    const roots = [
      process.cwd(),
      getProjectPath() ? dirname(dirname(getProjectPath()!)) : null,
      resolve(dirname(fileURLToPath(import.meta.url)), '../../../..'), // trpc/ -> src/ -> server/ -> sql-ide/ -> repo root
    ].filter(Boolean) as string[];

    const searchDirs = [...new Set(roots.flatMap(root => [
      join(root, 'examples'),
      join(root, 'sqg/tests'),
    ]))];

    for (const dir of searchDirs) {
      if (!existsSync(dir)) continue;

      try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const yamlPath = entry.isDirectory()
            ? join(dir, entry.name, 'sqg.yaml')
            : entry.name.endsWith('.yaml')
              ? join(dir, entry.name)
              : null;

          if (!yamlPath || !existsSync(yamlPath)) continue;

          try {
            const project = parseProject(yamlPath);
            examples.push({
              name: project.name,
              path: yamlPath,
              engine: project.engine || 'unknown',
            });
          } catch { /* skip invalid configs */ }
        }
      } catch { /* skip unreadable dirs */ }
    }

    return examples;
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

/** Simple Levenshtein distance for typo detection */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}
