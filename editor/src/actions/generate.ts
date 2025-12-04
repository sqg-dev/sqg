import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import Docker from 'dockerode';
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import YAML from 'yaml';
import { randomUUID } from 'node:crypto';
import { createHighlighter } from 'shiki';
import { cachified } from './cache';

const docker = new Docker();
const IMAGE_NAME = 'sqg:latest';

// Initialize shiki highlighter lazily
let highlighterPromise: Promise<Awaited<ReturnType<typeof createHighlighter>>> | null = null;

async function getHighlighterInstance() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['github-dark'],
      langs: ['java', 'typescript'],
    });
  }
  return highlighterPromise;
}

// Map language to generator format and determine output filename
function getGeneratorInfo(language: string, database: string) {
  let generator: string;
  let sqlFileName: string;
  let outputFileName: string;

  if (language === 'java-jdbc') {
    generator = 'java/jdbc';
    sqlFileName = 'query';
    outputFileName = 'Query.java';
  } else if (language === 'java-arrow') {
    if (database !== 'duckdb') {
      throw new Error('Java Arrow generator only works with DuckDB');
    }
    generator = 'java/duckdb-arrow';
    sqlFileName = 'query';
    outputFileName = 'Query.java';
  } else {
    // typescript
    if (database === 'sqlite') {
      generator = 'typescript/better-sqlite3';
    } else {
      generator = 'typescript/duckdb';
    }
    sqlFileName = 'query';
    outputFileName = 'query.ts';
  }

  return { generator, sqlFileName, outputFileName };
}

async function generateWithDocker(sql: string, database: string, language: string, generator: string, sqlFileName: string, outputFileName: string) {

      // Create temporary directory for this request
      const tempDir = join(tmpdir(), `sqg-${randomUUID()}`);
      const inputDir = join(tempDir, 'input');
      const outputDir = join(tempDir, 'output');

      try {
        // Create directories
        mkdirSync(inputDir, { recursive: true });
        mkdirSync(outputDir, { recursive: true });
        // Set permissions so Docker container can write
        chmodSync(outputDir, 0o777);

        // Create SQL file
        const sqlFile = join(inputDir, `${sqlFileName}.sql`);
        writeFileSync(sqlFile, sql, 'utf-8');

        // Create project.yaml
        const genConfig: any = {
          generator,
          output: '/output/',
        };

        // Add package config for Java generators
        if (generator.startsWith('java/')) {
          genConfig.config = {
            package: 'sqg.generated',
          };
        }

        const projectYaml = {
          version: 1,
          name: 'generated',
          sql: [
            {
              engine: database,
              files: [`${sqlFileName}.sql`],
              gen: [genConfig],
            },
          ],
        };
        const projectFile = join(inputDir, 'project.yaml');
        writeFileSync(projectFile, YAML.stringify(projectYaml), 'utf-8');

        console.log('input dir:', inputDir);
        console.log('output dir:', outputDir);
        console.log('project file:',  YAML.stringify(projectYaml));

        // Create and start Docker container
        const container = await docker.createContainer({
          Image: IMAGE_NAME,
          Cmd: ['/input/project.yaml'],
          WorkingDir: '/input',
          User: '1000:1000',
          NetworkDisabled: true,
          ReadonlyRootfs: true,
          SecurityOpts: ['no-new-privileges:true'],
          CapDrop: ['ALL'],
          HostConfig: {
            CpuQuota: 200000, // 2 CPUs (in microseconds per 100ms period)
            CpuPeriod: 100000,
            Memory: 1024 * 1024 * 1024, // 1GB
            Tmpfs: {
              '/tmp': 'noexec,nosuid,size=100m',
              '/app/sqg/node_modules/.cache': 'noexec,nosuid,size=50m',
            },
            Binds: [`${inputDir}:/input:ro`, `${outputDir}:/output:rw`],
          },
        } as any);

        try {
          // Start container
          await container.start();

          // Wait for container to finish
          const status = await container.wait();

          if (status.StatusCode !== 0) {
            // Get logs for error information
            const logs = await container.logs({ stdout: true, stderr: true });
            const logOutput = logs.toString('utf-8');
            const errorMessage = `Container exited with code ${status.StatusCode}\n\nContainer logs:\n${logOutput}`;
            throw new Error(errorMessage);
          }

          // Read generated file
          const outputFile = join(outputDir, outputFileName);
          let generatedCode: string;

          try {
            generatedCode = readFileSync(outputFile, 'utf-8');
          } catch (error) {
            // If file doesn't exist, list output directory for debugging
            const outputFiles = readdirSync(outputDir);
            const errorMessage = `Generated file not found: ${outputFileName}\n\nOutput directory contains:\n${outputFiles.join('\n')}`;
            throw new Error(errorMessage);
          }

          // Generate syntax highlighted HTML for Java and TypeScript
          let highlightedCode = '';
          if (language === 'typescript' || language === 'java-jdbc' || language === 'java-arrow') {
            const shiki = await getHighlighterInstance();
            const lang = language === 'typescript' ? 'typescript' : 'java';
            highlightedCode = shiki.codeToHtml(generatedCode, {
              lang,
              theme: 'github-dark',
            });
          }

          return {
            code: generatedCode,
            highlightedCode,
            generator,
            database,
          };
        } finally {
          // Clean up container
          try {
            await container.remove({ force: true });
          } catch (error) {
            // Ignore errors during cleanup
            console.error('Error removing container:', error);
          }
        }
      } catch (error) {
        // Preserve the original error message with newlines
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(errorMessage);
      } finally {
        // Clean up temporary directory
        try {
          rmSync(tempDir, { recursive: true, force: true });
        } catch (error) {
          // Ignore errors during cleanup
          console.error('Error cleaning up temp directory:', error);
        }
      }
}

export const server = {
  generateCode: defineAction({
    accept: 'json',
    input: z.object({
      sql: z.string(),
      database: z.enum(['sqlite', 'duckdb']),
      language: z.enum(['java-jdbc', 'java-arrow', 'typescript']),
    }),
    handler: async ({ sql, database, language }) => {
      const { generator, sqlFileName, outputFileName } = getGeneratorInfo(language, database);

      return await cachified({
        key: `generate-${sql}-${database}-${language}`,
        ttl: 60 * 60 * 24 * 1000, // 24 hours
        getFreshValue: async () => await generateWithDocker(sql, database, language, generator, sqlFileName, outputFileName),
      });
      
    },
  }),
};
