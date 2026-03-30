import { exit } from "node:process";
import { Command } from "commander";
import consola, { LogLevels } from "consola";
import updateNotifier from "update-notifier";
import pc from "picocolors";
import { formatGeneratorsHelp, SHORT_GENERATOR_NAMES, SQL_SYNTAX_REFERENCE } from "./constants.js";
import { formatErrorForOutput, SqgError } from "./errors.js";
import { initProject } from "./init.js";
import { startMcpServer } from "./mcp-server.js";
import {
  buildProjectFromCliOptions,
  processProject,
  processProjectFromConfig,
  validateProject,
  validateProjectFromConfig,
} from "./sqltool.js";
import { UI } from "./ui.js";

declare const __SQG_VERSION__: string;
declare const __SQG_DESCRIPTION__: string;

const version =
  process.env.npm_package_version ??
  (typeof __SQG_VERSION__ !== "undefined" ? __SQG_VERSION__ : "0.0.0");

updateNotifier({ pkg: { name: "@sqg/sqg", version } }).notify({
  message: "Update available {currentVersion} → {latestVersion}",
});

const description =
  process.env.npm_package_description ??
  (typeof __SQG_DESCRIPTION__ !== "undefined" ? __SQG_DESCRIPTION__ : "SQG - SQL Query Generator");

// Default: quiet — only warnings and errors from consola (UI module handles user-facing output)
consola.level = LogLevels.warn;

/** Output format for CLI */
export type OutputFormat = "text" | "json";

/** Global CLI options */
export interface CliOptions {
  verbose?: boolean;
  format?: OutputFormat;
  validate?: boolean;
  generator?: string;
  file?: string[];
  output?: string;
  name?: string;
}

const BRANDING = `\n ${pc.bold(pc.blue("SQG"))} ${pc.dim(`v${version}`)}\n`;

const program = new Command()
  .name("sqg")
  .description(
    `${description}

Generate type-safe database access code from annotated SQL files.

Supported Generators:
${formatGeneratorsHelp()}`,
  )
  .version(version, "-v, --version", "output the version number")
  .option("--verbose", "Enable debug logging (shows SQL execution details)")
  .option("--format <format>", "Output format: text (default) or json", "text")
  .option("--validate", "Validate configuration without generating code")
  .option(
    "--generator <generator>",
    `Code generation generator (${SHORT_GENERATOR_NAMES.join(", ")})`,
  )
  .option("--file <file>", "SQL file path (can be repeated)", (val, prev: string[] = []) => {
    prev.push(val);
    return prev;
  })
  .option(
    "--output <path>",
    "Output file or directory path (optional, if omitted writes to stdout)",
  )
  .option("--name <name>", "Project name (optional, defaults to 'generated')")
  .addHelpText("before", BRANDING)
  .showHelpAfterError()
  .showSuggestionAfterError();

// Main generate command (default)
program
  .argument("[project]", "Path to the project YAML config (sqg.yaml) or omit to use CLI options")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts<CliOptions>();
    if (opts.verbose) {
      consola.level = LogLevels.debug;
    }
    if (opts.format === "json") {
      // Suppress consola output in JSON mode
      consola.level = LogLevels.silent;
    }
  })
  .action(async (projectPath: string | undefined, options: CliOptions) => {
    const writeToStdout = !projectPath && !options.output;
    const ui = new UI({
      format: options.format,
      verbose: options.verbose,
      isStdout: writeToStdout,
      version,
    });
    ui.header();

    try {
      // Determine if using YAML config or CLI options
      const useCliOptions = !projectPath;

      if (useCliOptions) {
        // Validate required CLI options
        if (!options.generator) {
          throw new SqgError(
            "Missing required option: --generator",
            "CONFIG_VALIDATION_ERROR",
            `Specify a code generation generator: ${SHORT_GENERATOR_NAMES.join(", ")}`,
          );
        }
        if (!options.file || options.file.length === 0) {
          throw new SqgError(
            "Missing required option: --file",
            "CONFIG_VALIDATION_ERROR",
            "Specify at least one SQL file with --file <path>",
          );
        }

        // Build project from CLI options
        const project = buildProjectFromCliOptions({
          generator: options.generator,
          files: options.file,
          output: options.output,
          name: options.name,
        });
        const projectDir = process.cwd();

        if (options.validate) {
          const result = await validateProjectFromConfig(project, projectDir);
          if (options.format === "json") {
            console.log(JSON.stringify(result, null, 2));
          } else {
            if (result.valid) {
              consola.success("Configuration is valid");
              consola.info(`Project: ${result.project?.name}`);
              consola.info(`SQL files: ${result.sqlFiles?.join(", ")}`);
              consola.info(`Generators: ${result.generators?.join(", ")}`);
            } else {
              consola.error("Validation failed");
              for (const error of result.errors || []) {
                consola.error(`  ${error.message}`);
                if (error.suggestion) {
                  consola.info(`    Suggestion: ${error.suggestion}`);
                }
              }
            }
          }
          exit(result.valid ? 0 : 1);
        }

        const files = await processProjectFromConfig(project, projectDir, writeToStdout, ui);
        // When writing to stdout, don't output JSON status - the generated code is the output
        if (options.format === "json" && !writeToStdout) {
          console.log(
            JSON.stringify({
              status: "success",
              generatedFiles: files,
            }),
          );
        }
      } else {
        // Use YAML config file
        if (options.validate) {
          const result = await validateProject(projectPath);
          if (options.format === "json") {
            console.log(JSON.stringify(result, null, 2));
          } else {
            if (result.valid) {
              consola.success("Configuration is valid");
              consola.info(`Project: ${result.project?.name}`);
              consola.info(`SQL files: ${result.sqlFiles?.join(", ")}`);
              consola.info(`Generators: ${result.generators?.join(", ")}`);
            } else {
              consola.error("Validation failed");
              for (const error of result.errors || []) {
                consola.error(`  ${error.message}`);
                if (error.suggestion) {
                  consola.info(`    Suggestion: ${error.suggestion}`);
                }
              }
            }
          }
          exit(result.valid ? 0 : 1);
        }

        const files = await processProject(projectPath, ui);
        if (options.format === "json") {
          console.log(
            JSON.stringify({
              status: "success",
              generatedFiles: files,
            }),
          );
        }
      }
    } catch (err) {
      if (options.format === "json") {
        console.log(JSON.stringify(formatErrorForOutput(err)));
      } else {
        if (err instanceof SqgError) {
          ui.error(err);
        } else if (err instanceof Error) {
          ui.error(err);
        } else {
          consola.error(err);
        }
      }
      exit(1);
    }
  });

// Init subcommand
program
  .command("init")
  .description("Initialize a new SQG project with example configuration")
  .option(
    "-t, --generator <generator>",
    `Code generation generator (${SHORT_GENERATOR_NAMES.join(", ")}). Omit for interactive mode`,
  )
  .option("-o, --output <dir>", "Output directory for generated files", "./generated")
  .option("-f, --force", "Overwrite existing files")
  .action(async (options) => {
    const parentOpts = program.opts<CliOptions>();
    try {
      await initProject(options);
      if (parentOpts.format === "json") {
        console.log(JSON.stringify({ status: "success", message: "Project initialized" }));
      }
    } catch (err) {
      if (parentOpts.format === "json") {
        console.log(JSON.stringify(formatErrorForOutput(err)));
      } else {
        const ui = new UI({ format: parentOpts.format, verbose: parentOpts.verbose });
        if (err instanceof SqgError) {
          ui.error(err);
        } else if (err instanceof Error) {
          ui.error(err);
        } else {
          consola.error(err);
        }
      }
      exit(1);
    }
  });

// Syntax reference command
program
  .command("syntax")
  .description("Show SQL annotation syntax reference")
  .action(() => {
    console.log(SQL_SYNTAX_REFERENCE);
  });

// UI command
program
  .command("ui")
  .description("Start the SQG UI — interactive SQL development environment")
  .argument("[project]", "Path to sqg.yaml project config")
  .option("-p, --port <port>", "Server port", "3000")
  .action(async (project: string | undefined, options: { port: string }) => {
    const { startUi } = await import("./start-ui.js");
    await startUi({ project, port: parseInt(options.port, 10) });
  });

// MCP server command
program
  .command("mcp")
  .description("Start MCP (Model Context Protocol) server for AI assistants")
  .action(async () => {
    try {
      await startMcpServer();
    } catch (error) {
      consola.error("Fatal error in MCP server:", error);
      exit(1);
    }
  });

if (process.argv.length <= 2) {
  program.outputHelp();
  exit(1);
}

try {
  await program.parseAsync(process.argv);
} catch (err) {
  consola.error(err);
  exit(1);
}
