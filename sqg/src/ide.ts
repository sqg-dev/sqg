import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Find the sql-ide directory relative to the sqg package.
 * Works both in development (source) and when installed.
 */
function findIdeDir(): string | null {
	// Development: sqg/src/ide.ts → sqg/ → repo root → sql-ide/
	const devPath = join(__dirname, "../../sql-ide");
	if (existsSync(join(devPath, "server/src/index.ts"))) {
		return devPath;
	}

	// Installed: check sibling directory
	const installedPath = join(__dirname, "../sql-ide");
	if (existsSync(join(installedPath, "server/src/index.ts"))) {
		return installedPath;
	}

	return null;
}

export interface IdeOptions {
	project?: string;
	port?: number;
}

export async function startIde(options: IdeOptions): Promise<void> {
	const ideDir = findIdeDir();
	if (!ideDir) {
		console.error(
			"SQL IDE not found. The IDE requires the sql-ide directory in the SQG repository.",
		);
		console.error("Clone the full repo: git clone https://github.com/sqg-dev/sqg.git");
		process.exit(1);
	}

	const serverEntry = join(ideDir, "server/src/index.ts");
	const port = options.port ?? 3000;

	// Build args for the server process
	const args = ["--import", "tsx/esm", serverEntry];
	if (options.project) {
		const projectPath = resolve(options.project);
		args.push(`--project=${projectPath}`);
	}

	// Set environment
	const env = { ...process.env, PORT: String(port) };

	console.log(`Starting SQG IDE on http://localhost:${port}`);
	if (options.project) {
		console.log(`Project: ${resolve(options.project)}`);
	}

	const child = spawn("node", args, {
		stdio: "inherit",
		env,
		cwd: ideDir,
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

	// Wait for child to exit
	await new Promise<void>((resolve, reject) => {
		child.on("exit", (code) => {
			if (code === 0 || code === null) resolve();
			else reject(new Error(`IDE server exited with code ${code}`));
		});
		child.on("error", reject);
	});
}
