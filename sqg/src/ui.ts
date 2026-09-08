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
  private skipped = false;
  private projects: number;
  private quiet: boolean;
  private currentProject = "";
  /** Header withheld in quiet mode until something is actually worth printing. */
  private pendingHeader: string | null = null;

  constructor(options: {
    format?: OutputFormat;
    verbose?: boolean;
    isStdout?: boolean;
    version?: string;
    /** How many projects this process will run; more than one get labelled. */
    projects?: number;
    /** Say nothing when there is nothing to do. */
    quiet?: boolean;
  }) {
    this.silent = options.format === "json" || options.isStdout === true;
    this.verbose = options.verbose === true;
    this.version = options.version || "";
    this.projects = options.projects ?? 1;
    this.quiet = options.quiet === true;
  }

  /** Start a project, resetting the per-project state a batch run reads back */
  startProject(name: string) {
    this.skipped = false;
    this.currentProject = name;
    if (this.silent || this.projects < 2 || this.quiet) return;
    this.stopSpinner();
    this.log("");
    this.log(` ${pc.bold(name)}`);
  }

  /** Print colored header */
  header() {
    if (this.silent) return;
    const logo = pc.bold(pc.blue("SQG"));
    const ver = this.version ? ` ${pc.dim(`v${this.version}`)}` : "";
    const header = `\n ${logo}${ver}\n`;
    // Quiet runs that turn out to have nothing to do print nothing at all, so
    // the banner waits until there is a first real line to go above.
    if (this.quiet) {
      this.pendingHeader = header;
      return;
    }
    this.log(header);
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
    this.flushHeader();
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
    // A quiet batch prints nothing for skipped projects, so a project that did
    // work still needs to say which one it was.
    if (this.quiet && this.projects > 1) {
      this.log("");
      this.log(` ${pc.bold(this.currentProject)}`);
    }
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

  /** True when the project was skipped by `--if-stale` (nothing had changed) */
  get wasUpToDate(): boolean {
    return this.skipped;
  }

  /** Report that `--if-stale` found nothing to do */
  upToDate(outputs: string[]) {
    this.skipped = true;
    if (this.silent || this.quiet) return;
    this.stopSpinner();
    const count = `${outputs.length} generated ${outputs.length === 1 ? "file" : "files"}`;
    this.log("");
    this.log(` ${pc.green("up to date")} ${pc.dim(`— ${count}, nothing to regenerate`)}`);
  }

  /** Explain why `--if-stale` did not skip (verbose only — normally just noise) */
  cacheMiss(reason: string) {
    if (this.silent || !this.verbose) return;
    this.log(`  ${pc.dim(`regenerating: ${reason}`)}`);
  }

  /** Warn that `--if-stale` cannot apply to this project */
  cacheDisabled(reason: string) {
    if (this.silent) return;
    this.log(` ${pc.yellow(pc.bold("note"))}  --if-stale ignored: ${reason}`);
  }

  /** Display an info-level hint (e.g. "these queries could share a row type") */
  hint(message: string) {
    if (this.silent) return;
    this.stopSpinner();
    this.log(` ${pc.cyan(pc.bold("hint"))}  ${message}`);
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

  /** Emit the withheld banner, now that there is real output to put under it. */
  private flushHeader() {
    if (this.pendingHeader === null) return;
    const header = this.pendingHeader;
    this.pendingHeader = null;
    process.stderr.write(`${header}\n`);
  }

  private log(msg: string) {
    this.flushHeader();
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
