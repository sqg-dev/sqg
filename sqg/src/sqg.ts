import { exit } from "node:process";
import { Command } from "commander";
import consola, { LogLevels } from "consola";
import { processProject } from "./sqltool.js";

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

const program = new Command()
  .name("sqg")
  .description(description)
  .version(version, "-v, --version", "output the version number")
  .option("--verbose", "Enable debug logging")
  .argument("<project>", "Path to the project YAML config")
  .showHelpAfterError()
  .showSuggestionAfterError()
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts<{ verbose?: boolean }>();
    if (opts.verbose) {
      // Show debug logs (and everything more important); still hide trace.
      consola.level = LogLevels.debug;
    }
  })
  .action(async (projectPath: string) => {
    await processProject(projectPath);
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
