import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  parseProjectConfig,
  parseSQLQueries,
  createExtraVariables,
  getGeneratorEngine,
} from '@sqg/sqg';
import type { SqgProject, SqgQuery, SqgMigration, SqgTable } from '@sqg-ui/shared';

/**
 * Parse an SQG project from a YAML config file using the @sqg/sqg library.
 * Maps SQG's internal types to the IDE's shared types.
 */
export function parseProject(configPath: string): SqgProject {
  const absolutePath = configPath.startsWith('/') ? configPath : resolve(configPath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Config file not found: ${absolutePath}`);
  }

  const project = parseProjectConfig(absolutePath);
  const projectDir = dirname(absolutePath);

  const queries: SqgQuery[] = [];
  const migrations: SqgMigration[] = [];
  const testdata: string[] = [];
  const tables: SqgTable[] = [];
  const sqlFiles: string[] = [];

  // Detect engine from first generator
  let engine = 'duckdb';
  for (const sqlConfig of project.sql) {
    for (const gen of sqlConfig.gen) {
      try {
        engine = getGeneratorEngine(gen.generator);
        break;
      } catch {
        // ignore invalid generator
      }
    }
  }

  const extraVariables = createExtraVariables(project.sources ?? [], true);

  for (const sqlConfig of project.sql) {
    for (const file of sqlConfig.files) {
      const sqlPath = join(projectDir, file);
      sqlFiles.push(file);

      if (!existsSync(sqlPath)) {
        console.warn(`SQL file not found: ${sqlPath}`);
        continue;
      }

      const parsed = parseSQLQueries(sqlPath, extraVariables);

      // Map SQLQuery objects to IDE's SqgQuery interface
      for (const q of parsed.queries) {
        if (q.isMigrate) {
          migrations.push({
            id: q.id,
            order: parseInt(q.id.split('_')[1] || '0', 10) || 0,
            sql: q.rawQuery,
            file,
            line: q.line,
          });
        } else if (q.isTestdata) {
          testdata.push(q.rawQuery);
        } else {
          // Resolve ${var} placeholders with @set values
          const vars = Object.fromEntries(q.variables);
          const resolvedSql = q.rawQuery.replace(/\$\{(\w+)\}/g, (_, varName) => {
            return vars[varName] ?? `\${${varName}}`;
          });

          queries.push({
            id: q.id,
            type: q.isExec ? 'EXEC' : 'QUERY',
            sql: resolvedSql,
            rawSql: q.rawQuery,
            modifiers: {
              one: q.isOne,
              pluck: q.isPluck,
            },
            variables: vars,
            file,
            line: q.line,
          });
        }
      }

      // Map TableInfo objects
      for (const t of parsed.tables) {
        tables.push({
          id: t.id,
          tableName: t.tableName,
          hasAppender: t.hasAppender,
          file,
          line: t.line,
        });
      }
    }
  }

  // Sort migrations by order
  migrations.sort((a, b) => a.order - b.order);

  return {
    name: project.name,
    version: project.version,
    sqlFiles,
    queries,
    migrations,
    testdata,
    tables,
    engine,
  };
}
