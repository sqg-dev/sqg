import { exit } from "node:process";
import consola from "consola";
import { processProject } from "./sqltool.js";

const args = process.argv.slice(2);
if (args.length === 0) {
  consola.error("Usage: sqg <project.yaml>");
  exit(1);
}

const projectPath = args[0];

await processProject(projectPath);
