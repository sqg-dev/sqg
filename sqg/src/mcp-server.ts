import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import YAML from "yaml";
import {
  DB_ENGINES,
  GENERATORS,
  getGeneratorEngine,
  SHORT_GENERATOR_NAMES,
  SQL_SYNTAX_REFERENCE,
} from "./constants.js";
import { processProject, validateProject } from "./sqltool.js";

declare const __SQG_VERSION__: string;

const version =
  process.env.npm_package_version ??
  (typeof __SQG_VERSION__ !== "undefined" ? __SQG_VERSION__ : "0.0.0");

const server = new Server(
  {
    name: "sqg-mcp",
    version,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

// Build generator list from constants
function formatGeneratorListWithDescriptions(): string {
  const lines: string[] = [];
  const seen = new Set<string>();

  // First, add short names with their default driver descriptions
  for (const shortName of SHORT_GENERATOR_NAMES) {
    const fullName = Object.keys(GENERATORS).find((g) => g.startsWith(`${shortName}/`));
    if (fullName) {
      const info = GENERATORS[fullName];
      lines.push(`- ${shortName} - ${info.description}`);
      seen.add(fullName);
    }
  }

  // Add non-default drivers (like java/duckdb/arrow)
  for (const [fullName, info] of Object.entries(GENERATORS)) {
    if (!seen.has(fullName)) {
      lines.push(`- ${fullName} - ${info.description}`);
    }
  }

  return lines.join("\n");
}

function formatGeneratorListSimple(): string {
  const generators = [...SHORT_GENERATOR_NAMES];
  // Add non-default drivers
  const seen = new Set(
    SHORT_GENERATOR_NAMES.map((s) => Object.keys(GENERATORS).find((g) => g.startsWith(`${s}/`))),
  );
  for (const fullName of Object.keys(GENERATORS)) {
    if (!seen.has(fullName)) {
      generators.push(fullName);
    }
  }
  return generators.join(", ");
}

// Helper function to create a temporary project and generate code
async function generateCode(
  sql: string,
  generator: string,
): Promise<{ code: string; error?: string }> {
  // Get engine from generator
  const engine = getGeneratorEngine(generator);
  const tempDir = join(tmpdir(), `sqg-mcp-${randomUUID()}`);
  const sqlFile = join(tempDir, "queries.sql");
  const configFile = join(tempDir, "sqg.yaml");

  try {
    // Create temp directory
    mkdirSync(tempDir, { recursive: true });

    // Write SQL file
    writeFileSync(sqlFile, sql, "utf-8");

    // Create project config
    const genConfig: any = {
      generator,
      output: "./generated/",
    };

    // Add package config for Java generators
    if (generator.startsWith("java/")) {
      genConfig.config = {
        package: "sqg.generated",
      };
    }

    const projectYaml = {
      version: 1,
      name: "generated",
      sql: [
        {
          engine,
          files: ["queries.sql"],
          gen: [genConfig],
        },
      ],
    };

    writeFileSync(configFile, YAML.stringify(projectYaml), "utf-8");

    // Generate code
    const files = await processProject(configFile);

    if (files.length === 0) {
      return { code: "", error: "No files were generated" };
    }

    // Read the first generated file
    const generatedCode = readFileSync(files[0], "utf-8");

    return { code: generatedCode };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { code: "", error: errorMessage };
  } finally {
    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}

// Comprehensive tool descriptions for AI agents (built from constants)
const GENERATE_CODE_DESCRIPTION = `Generate type-safe database access code from annotated SQL queries.

CRITICAL REQUIREMENTS:
1. MIGRATE statements MUST come BEFORE any QUERY/EXEC that references those tables
2. Each query block needs a unique name
3. Parameters require @set declarations with sample values

${SQL_SYNTAX_REFERENCE}

VALID GENERATORS (use short form):
${formatGeneratorListWithDescriptions()}

COMMON MISTAKES TO AVOID:
- Missing MIGRATE before QUERY (causes "no such table" error)
- Missing @set for parameters (causes "undefined variable" error)
- Duplicate query names (causes "duplicate query" error)
- Using :pluck with multiple columns (only works with 1 column)`;

const VALIDATE_SQL_DESCRIPTION = `Validate SQL queries with SQG annotations without generating code. Use this to check for errors before generating.

Returns JSON with validation results including:
- valid: boolean indicating success
- project: project metadata if valid
- sqlFiles: list of SQL files processed
- generators: list of generators used
- errors: array of error messages if invalid

See generate_code tool description for complete syntax reference.`;

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate_code",
        description: GENERATE_CODE_DESCRIPTION,
        inputSchema: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description:
                "Complete SQL file content with SQG annotations. IMPORTANT: Include MIGRATE statements first to create tables before QUERY statements that use them.",
            },
            generator: {
              type: "string",
              description: `Code generator to use. Valid options: ${formatGeneratorListSimple()}`,
            },
          },
          required: ["sql", "generator"],
        },
      } as Tool,
      {
        name: "validate_sql",
        description: VALIDATE_SQL_DESCRIPTION,
        inputSchema: {
          type: "object",
          properties: {
            sql: {
              type: "string",
              description:
                "Complete SQL file content with SQG annotations to validate. Include MIGRATE statements before QUERY statements.",
            },
            generator: {
              type: "string",
              description: `Code generator for validation context. Valid options: ${formatGeneratorListSimple()}`,
            },
          },
          required: ["sql", "generator"],
        },
      } as Tool,
    ],
  };
});

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "sqg://documentation",
        name: "SQG Documentation",
        description:
          "Complete documentation for SQG (SQL Query Generator) including syntax, generators, and usage examples",
        mimeType: "text/markdown",
      },
    ],
  };
});

// Handle resource reads
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "sqg://documentation") {
    // Format generators for markdown (with backticks)
    const generatorListMarkdown = Object.entries(GENERATORS)
      .map(([name, info]) => {
        const shortName = `${info.language}/${info.engine}`;
        const isDefault =
          Object.keys(GENERATORS).find((g) => g.startsWith(`${shortName}/`)) === name;
        const displayName = isDefault ? shortName : name;
        return `- \`${displayName}\` - ${info.description}`;
      })
      .filter((line, index, arr) => arr.indexOf(line) === index) // dedupe
      .join("\n");

    const doc = `# SQG - SQL Query Generator

SQG is a type-safe SQL code generator that reads SQL queries from \`.sql\` files with special annotations and generates type-safe database access code in multiple target languages (TypeScript and Java).

## Overview

SQG introspects SQL queries at build time against real database engines to determine column types and generates strongly-typed wrapper functions.

**Website:** https://sqg.dev
**Repository:** https://github.com/sqg-dev/sqg

## Key Features

- **Type-safe by design** - Generates fully-typed code with accurate column types inferred from your database
- **Multiple database engines** - Supports ${DB_ENGINES.join(", ")}
- **Multiple language targets** - Generate TypeScript or Java code from the same SQL files
- **Arrow API support** - Can generate Apache Arrow API bindings for DuckDB (Java)
- **DBeaver compatible** - Works seamlessly with DBeaver for database development and testing
- **Complex type support** - DuckDB: Handles structs, lists, and maps
- **Migration management** - Built-in support for schema migrations and test data

## SQL Annotations

${SQL_SYNTAX_REFERENCE}

## Supported Generators

Valid generator strings:

${generatorListMarkdown}

## MCP Tools

### generate_code

Generate type-safe database access code from SQL queries with SQG annotations.

**Parameters:**
- \`sql\` (string, required): SQL queries with SQG annotations
- \`generator\` (string, required): Code generation generator (see supported generators above)

**Example:**
\`\`\`json
{
  "sql": "-- MIGRATE 1\\nCREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);\\n\\n-- QUERY getUsers\\nSELECT * FROM users;",
  "generator": "typescript/sqlite"
}
\`\`\`

### validate_sql

Validate SQL queries with SQG annotations without generating code.

**Parameters:**
- \`sql\` (string, required): SQL queries with SQG annotations to validate
- \`generator\` (string, required): Code generation generator to use for validation

**Example:**
\`\`\`json
{
  "sql": "-- QUERY getUsers\\nSELECT * FROM users;",
  "generator": "typescript/sqlite"
}
\`\`\`

## Generator Format

Generators follow the pattern \`<language>/<engine>[/<driver>]\`:

- **Short form**: \`typescript/sqlite\`, \`java/duckdb\` (uses default driver)
- **Full form**: \`typescript/sqlite/better-sqlite3\`, \`java/duckdb/arrow\` (specifies driver)

The MCP server accepts both short and full forms, but short forms are recommended.

## More Information

- Full documentation: https://sqg.dev
- GitHub: https://github.com/sqg-dev/sqg
- SQL Syntax Reference: Run \`sqg syntax\` command
`;

    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: doc,
        },
      ],
    };
  }

  return {
    contents: [],
    isError: true,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "generate_code") {
    const { sql, generator } = args as {
      sql: string;
      generator: string;
    };

    const result = await generateCode(sql, generator);

    if (result.error) {
      return {
        content: [
          {
            type: "text",
            text: `Error generating code: ${result.error}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: result.code,
        },
      ],
    };
  }

  if (name === "validate_sql") {
    const { sql, generator } = args as {
      sql: string;
      generator: string;
    };

    // Get engine from generator
    const engine = getGeneratorEngine(generator);

    const tempDir = join(tmpdir(), `sqg-mcp-validate-${randomUUID()}`);
    const sqlFile = join(tempDir, "queries.sql");
    const configFile = join(tempDir, "sqg.yaml");

    try {
      // Create temp directory
      mkdirSync(tempDir, { recursive: true });

      // Write SQL file
      writeFileSync(sqlFile, sql, "utf-8");

      // Create project config (using the provided generator for validation)
      const projectYaml = {
        version: 1,
        name: "validation",
        sql: [
          {
            engine,
            files: ["queries.sql"],
            gen: [
              {
                generator,
                output: "./generated/",
              },
            ],
          },
        ],
      };

      writeFileSync(configFile, YAML.stringify(projectYaml), "utf-8");

      // Validate
      const validation = await validateProject(configFile);

      if (validation.valid) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  valid: true,
                  project: validation.project,
                  sqlFiles: validation.sqlFiles,
                  generators: validation.generators,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                valid: false,
                errors: validation.errors,
              },
              null,
              2,
            ),
          },
        ],
        isError: true,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text",
            text: `Error validating SQL: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    } finally {
      // Clean up temp directory
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  }

  return {
    content: [
      {
        type: "text",
        text: `Unknown tool: ${name}`,
      },
    ],
    isError: true,
  };
});

// Start the server
export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SQG MCP server running on stdio");
}
