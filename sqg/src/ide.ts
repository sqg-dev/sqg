import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface IdeOptions {
	project?: string;
	port?: number;
}

export async function startIde(options: IdeOptions): Promise<void> {
	const port = options.port ?? 3000;

	// Find the IDE server — try bundled first, then dev source
	const bundledServer = join(__dirname, "ide-server.mjs");
	const devServer = join(__dirname, "../../sql-ide/server/src/index.ts");

	let serverPath: string;
	let args: string[];

	if (existsSync(bundledServer)) {
		// Production: use bundled server (no tsx needed)
		serverPath = bundledServer;
		args = [serverPath];
	} else if (existsSync(devServer)) {
		// Development: use tsx to run TypeScript source
		serverPath = devServer;
		args = ["--import", "tsx/esm", serverPath];
	} else {
		console.error("SQL IDE server not found.");
		console.error("Expected bundled server at:", bundledServer);
		console.error("Or dev server at:", devServer);
		process.exit(1);
	}

	if (options.project) {
		args.push(`--project=${resolve(options.project)}`);
	}

	const env = { ...process.env, PORT: String(port) };

	console.log(`Starting SQG IDE on http://localhost:${port}`);
	if (options.project) {
		console.log(`Project: ${resolve(options.project)}`);
	}

	const child = spawn("node", args, {
		stdio: "inherit",
		env,
	});

	// Open browser after server starts
	setTimeout(() => {
		const url = `http://localhost:${port}`;
		try {
			const platform = process.platform;
			if (platform === "darwin") {
				spawn("open", [url], { stdio: "ignore", detached: true }).unref();
			} else if (platform === "win32") {
				spawn("cmd", ["/c", "start", url], { stdio: "ignore", detached: true }).unref();
			} else {
				spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
			}
		} catch {
			console.log(`Open ${url} in your browser`);
		}
	}, 1500);

	// Forward signals
	process.on("SIGINT", () => {
		child.kill("SIGINT");
		process.exit(0);
	});
	process.on("SIGTERM", () => {
		child.kill("SIGTERM");
		process.exit(0);
	});

	await new Promise<void>((resolve, reject) => {
		child.on("exit", (code) => {
			if (code === 0 || code === null) resolve();
			else reject(new Error(`IDE server exited with code ${code}`));
		});
		child.on("error", reject);
	});
}
