import { exit } from "node:process";
import { Command } from "commander";
import consola, { LogLevels } from "consola";
import {
  formatEnginesHelp,
  formatGeneratorsHelp,
  SQL_SYNTAX_REFERENCE,
  DB_ENGINES,
  GENERATOR_NAMES,
} from "./constants.js";
import { processProject, validateProject } from "./sqltool.js";
import { initProject } from "./init.js";
import { SqgError, formatErrorForOutput } from "./errors.js";

declare const __SQG_VERSION__: string;
declare const __SQG_DESCRIPTION__: string;

const version =
  process.env.npm_package_version ??
  (typeof __SQG_VERSION__ !== "undefined" ? __SQG_VERSION__ : "0.0.0");

const description =
  process.env.npm_package_description ??
  (typeof __SQG_DESCRIPTION__ !== "undefined" ? __SQG_DESCRIPTION__ : "SQG - SQL Query Generator");

// Default: show info/warn/error/fatal/log; hide success/debug/trace.
consola.level = LogLevels.info;

/** Output format for CLI */
export type OutputFormat = "text" | "json";

/** Global CLI options */
export interface CliOptions {
  verbose?: boolean;
  format?: OutputFormat;
  validate?: boolean;
}

const program = new Command()
  .name("sqg")
  .description(
    `${description}

Generate type-safe database access code from annotated SQL files.

Supported Engines:
${formatEnginesHelp()}

Supported Generators:
${formatGeneratorsHelp()}`,
  )
  .version(version, "-v, --version", "output the version number")
  .option("--verbose", "Enable debug logging (shows SQL execution details)")
  .option("--format <format>", "Output format: text (default) or json", "text")
  .option("--validate", "Validate configuration without generating code")
  .showHelpAfterError()
  .showSuggestionAfterError();

// Main generate command (default)
program
  .argument("<project>", "Path to the project YAML config (sqg.yaml)")
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
  .action(async (projectPath: string, options: CliOptions) => {
    try {
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

      const files = await processProject(projectPath);
      if (options.format === "json") {
        console.log(
          JSON.stringify({
            status: "success",
            generatedFiles: files,
          }),
        );
      }
    } catch (err) {
      if (options.format === "json") {
        console.log(JSON.stringify(formatErrorForOutput(err)));
      } else {
        if (err instanceof SqgError) {
          consola.error(err.message);
          if (err.suggestion) {
            consola.info(`Suggestion: ${err.suggestion}`);
          }
          if (err.context && options.verbose) {
            consola.debug("Context:", err.context);
          }
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
  .option("-e, --engine <engine>", `Database engine (${DB_ENGINES.join(", ")})`, "sqlite")
  .option("-g, --generator <generator>", `Code generator (${GENERATOR_NAMES.join(", ")})`)
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
        if (err instanceof SqgError) {
          consola.error(err.message);
          if (err.suggestion) {
            consola.info(`Suggestion: ${err.suggestion}`);
          }
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
