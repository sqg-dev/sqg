#!/usr/bin/env npx tsx

/**
 * Generates code from example SQL files using SQG.
 *
 * Run with: pnpm generate-examples
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

const WEBSITE_ROOT = resolve(import.meta.dirname, "..");
const EXAMPLES_DIR = join(WEBSITE_ROOT, "src/content/examples");
const GENERATED_DIR = join(WEBSITE_ROOT, "src/content/generated");
const TEMP_DIR = join(WEBSITE_ROOT, ".temp-generate");
const SQG_BIN = resolve(WEBSITE_ROOT, "../sqg/dist/sqg.mjs");

interface ExampleFrontmatter {
  id: string;
  title?: string;
  description?: string;
  sql: string;
  engine: "sqlite" | "duckdb";
  language: "java-jdbc" | "java-arrow" | "typescript";
}

// Map engine + language to generator name
function getGeneratorName(engine: string, language: string): string {
  if (language === "typescript") {
    return engine === "duckdb" ? "typescript/duckdb" : "typescript/sqlite";
  }
  if (language === "java-arrow") {
    return "java/duckdb/arrow";
  }
  // For java-jdbc, use the engine-specific generator
  return `java/${engine}`;
}

function parseFrontmatter(content: string): ExampleFrontmatter | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  return parseYaml(match[1]) as ExampleFrontmatter;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function cleanDir(dir: string): void {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true });
  }
  mkdirSync(dir, { recursive: true });
}

async function generateExample(exampleFile: string): Promise<void> {
  const content = readFileSync(join(EXAMPLES_DIR, exampleFile), "utf-8");
  const frontmatter = parseFrontmatter(content);

  if (!frontmatter) {
    console.warn(`  Skipping ${exampleFile}: no frontmatter found`);
    return;
  }

  const { id, sql, engine, language } = frontmatter;
  const generatorName = getGeneratorName(engine, language);

  console.log(`  ${id}: ${engine} -> ${generatorName}`);

  // Create temp directory for this example
  const tempExampleDir = join(TEMP_DIR, id);
  cleanDir(tempExampleDir);

  // Write SQL file
  const sqlFile = join(tempExampleDir, "queries.sql");
  writeFileSync(sqlFile, sql);

  // Create output directory
  const outputDir = join(tempExampleDir, "output");
  ensureDir(outputDir);

  // Build config based on generator type
  const isJava = language.startsWith("java");
  const config: Record<string, unknown> = {
    version: 1,
    name: id,
    sql: [
      {
        files: ["queries.sql"],
        gen: [
          {
            generator: generatorName,
            output: "./output/",
            ...(isJava && { config: { package: "generated" } }),
          },
        ],
      },
    ],
  };

  // Write config
  const configFile = join(tempExampleDir, "sqg.yaml");
  writeFileSync(configFile, JSON.stringify(config, null, 2));

  // Run SQG
  try {
    execSync(`node ${SQG_BIN} ${configFile}`, {
      cwd: tempExampleDir,
      stdio: "pipe",
    });
  } catch (error) {
    const execError = error as { stderr?: Buffer; stdout?: Buffer };
    const sourceFile = join(EXAMPLES_DIR, exampleFile);
    console.error(`  Error generating ${id}:`);
    console.error(`  Source file: ${sourceFile}`);
    if (execError.stderr) console.error(execError.stderr.toString());
    if (execError.stdout) console.error(execError.stdout.toString());
    return;
  }

  // Find and copy the generated file
  const outputFiles = readdirSync(outputDir);
  if (outputFiles.length === 0) {
    console.warn(`  No output files generated for ${id}`);
    return;
  }

  // Copy to final destination as {id}.txt
  const srcPath = join(outputDir, outputFiles[0]);
  const destPath = join(GENERATED_DIR, `${id}.txt`);
  const generatedContent = readFileSync(srcPath, "utf-8");
  writeFileSync(destPath, generatedContent);
}

async function main(): Promise<void> {
  console.log("Generating code from examples...\n");

  // Ensure SQG is built
  if (!existsSync(SQG_BIN)) {
    console.error(`SQG not found at ${SQG_BIN}`);
    console.error("Run 'pnpm build' in the sqg/ directory first.");
    process.exit(1);
  }

  // Clean generated directory
  cleanDir(GENERATED_DIR);
  cleanDir(TEMP_DIR);

  // Process all examples
  const exampleFiles = readdirSync(EXAMPLES_DIR).filter((f) => f.endsWith(".md"));

  for (const file of exampleFiles) {
    await generateExample(file);
  }

  // Clean up temp directory
  rmSync(TEMP_DIR, { recursive: true });

  console.log("\nDone!");
}

main().catch(console.error);
