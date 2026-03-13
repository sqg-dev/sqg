/**
 * SQG UI Module - Centralized terminal output with spinners, timing, and beautiful errors
 */

import { basename, dirname, relative } from "node:path";
import pc from "picocolors";
import yoctoSpinner, { type Spinner } from "yocto-spinner";
import type { SqgError } from "./errors.js";
import type { OutputFormat } from "./sqg.ts";

/** Progress reporter interface for DB adapters — keeps them decoupled from UI */
export interface ProgressReporter {
  onQueryStart?(id: string): void;
  onQueryComplete?(id: string): void;
  onTableStart?(name: string): void;
  onTableComplete?(name: string, columnCount: number): void;
  onContainerStarting?(): void;
  onContainerStarted?(uri: string): void;
  onDatabaseInitialized?(): void;
}

/** Result of generating a single file */
export interface GenerationResult {
  outputPath: string;
  queryCount: number;
  enumCount: number;
  sqlFile: string;
  generator: string;
  elapsedMs: number;
}

export class UI {
  private spinner: Spinner | null = null;
  private silent: boolean;
  private verbose: boolean;
  private phaseStart = 0;
  private version: string;

  constructor(options: {
    format?: OutputFormat;
    verbose?: boolean;
    isStdout?: boolean;
    version?: string;
  }) {
    this.silent = options.format === "json" || options.isStdout === true;
    this.verbose = options.verbose === true;
    this.version = options.version || "";
  }

  /** Print colored header */
  header() {
    if (this.silent) return;
    const logo = pc.bold(pc.blue("SQG"));
    const ver = this.version ? ` ${pc.dim(`v${this.version}`)}` : "";
    this.log(`\n ${logo}${ver}\n`);
  }

  /** Create a ProgressReporter for DB adapters */
  createReporter(): ProgressReporter {
    if (this.silent) {
      return {};
    }

    let queryCount = 0;
    let queryTotal = 0;

    return {
      onQueryStart: (id: string) => {
        queryCount++;
        if (this.verbose) {
          this.log(`  ${pc.dim(`Executing query: ${id}`)}`);
        } else if (this.spinner) {
          this.spinner.text = `Introspecting queries... (${queryCount}/${queryTotal || "?"})`;
        }
      },
      onQueryComplete: (id: string) => {
        if (this.verbose) {
          this.log(`  ${pc.green("+")} ${pc.dim(id)}`);
        }
      },
      onTableStart: (name: string) => {
        if (this.verbose) {
          this.log(`  ${pc.dim(`Introspecting table: ${name}`)}`);
        }
      },
      onTableComplete: (name: string, columnCount: number) => {
        if (this.verbose) {
          this.log(`  ${pc.green("+")} ${pc.dim(`${name} (${columnCount} columns)`)}`);
        }
      },
      onContainerStarting: () => {
        this.startPhase("Starting PostgreSQL container...");
      },
      onContainerStarted: (_uri: string) => {
        this.succeedPhase("PostgreSQL ready");
      },
      onDatabaseInitialized: () => {
        if (this.verbose) {
          this.log(`  ${pc.green("+")} ${pc.dim("Database initialized")}`);
        }
      },
      /** @internal — set expected query count for spinner */
      setQueryTotal: (total: number) => {
        queryTotal = total;
        queryCount = 0;
      },
    } as ProgressReporter & { setQueryTotal(total: number): void };
  }

  /** Start a phase with a spinner */
  startPhase(label: string) {
    if (this.silent) return;
    this.stopSpinner();
    this.phaseStart = performance.now();
    this.spinner = yoctoSpinner({ text: label }).start();
  }

  /** Complete a phase successfully */
  succeedPhase(label: string) {
    if (this.silent) return;
    const elapsed = this.phaseStart ? performance.now() - this.phaseStart : 0;
    const time = elapsed > 100 ? pc.dim(` (${formatMs(elapsed)})`) : "";
    if (this.spinner) {
      this.spinner.success(`${label}${time}`);
      this.spinner = null;
    } else {
      this.log(`${pc.green("+")} ${label}${time}`);
    }
  }

  /** Fail a phase */
  failPhase(label: string) {
    if (this.silent) return;
    if (this.spinner) {
      this.spinner.error(label);
      this.spinner = null;
    } else {
      this.log(`${pc.red("x")} ${label}`);
    }
  }

  /** Display generation summary */
  summary(results: GenerationResult[], totalMs: number) {
    if (this.silent || results.length === 0) return;
    this.log("");
    for (const r of results) {
      const parts = [];
      if (r.queryCount > 0)
        parts.push(`${r.queryCount} ${r.queryCount === 1 ? "query" : "queries"}`);
      if (r.enumCount > 0) parts.push(`${r.enumCount} ${r.enumCount === 1 ? "enum" : "enums"}`);
      this.log(`  ${pc.dim("->")} ${dimPath(r.outputPath)}  ${pc.dim(`(${parts.join(", ")})`)}`);
    }
    this.log("");
    this.log(` ${pc.green("done")} ${pc.dim(`in ${formatMs(totalMs)}`)}`);
  }

  /** Display a formatted error */
  error(err: SqgError | Error) {
    if (this.silent) return;
    this.stopSpinner();

    const isSqg = "code" in err && "suggestion" in err;
    const message = err.message;
    const suggestion = isSqg ? (err as SqgError).suggestion : undefined;
    const code = isSqg ? (err as SqgError).code : undefined;

    this.log("");
    this.log(` ${pc.red(pc.bold("ERROR"))}  ${message}`);
    if (suggestion) {
      this.log("");
      this.log(`   ${pc.dim("Suggestion:")} ${suggestion}`);
    }
    if (code && this.verbose) {
      this.log(`   ${pc.dim("Code:")} ${code}`);
    }
    this.log("");
  }

  private stopSpinner() {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  private log(msg: string) {
    process.stderr.write(`${msg}\n`);
  }
}

/** Format path with dim directory and bright filename, relative to cwd when it's a subpath */
function dimPath(fullPath: string): string {
  const rel = relative(process.cwd(), fullPath);
  const display = rel && !rel.startsWith("..") ? rel : fullPath;
  const dir = dirname(display);
  const file = basename(display);
  if (dir === ".") return file;
  return `${pc.dim(`${dir}/`)}${file}`;
}

/** Format milliseconds as human-readable */
function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
