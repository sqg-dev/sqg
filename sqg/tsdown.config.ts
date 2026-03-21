import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "tsdown";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf-8")) as {
	version: string;
	description?: string;
};

const sharedDefine = {
	__SQG_VERSION__: JSON.stringify(pkg.version),
	__SQG_DESCRIPTION__: JSON.stringify(pkg.description ?? "SQG - SQL Query Generator"),
};

export default defineConfig([
	{
		entry: ["src/sqg.ts"],
		format: "esm",
		define: sharedDefine,
		banner: {
			js: "#!/usr/bin/env node",
		},
	},
	{
		entry: ["src/index.ts"],
		format: "esm",
		define: sharedDefine,
	},
]);
