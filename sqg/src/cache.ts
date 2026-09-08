/**
 * Staleness tracking for `--if-stale`.
 *
 * Generating is expensive (schema introspection, sometimes a Docker container);
 * deciding whether it is *needed* is not. A stamp file next to the project
 * config records a fingerprint of every input plus the hashes of the files last
 * written, so an unchanged project is skipped in a few milliseconds.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { getGenerator } from "./generators/index.js";
import { resolveSourcePath } from "./sources.js";
import type { Project } from "./sqltool.js";
import { SQG_VERSION } from "./version.js";

/** Stamp file, written next to the project's sqg.yaml. */
export const CACHE_FILE = ".sqg-cache.json";

/** Bumped when the stamp layout changes; older stamps are then ignored. */
const CACHE_FORMAT = 1;

/** Recorded for an input that could not be read — never matches a real hash. */
const MISSING = "<missing>";

export interface Fingerprint {
  /** Generated output changes between releases, so the version is an input. */
  sqg: string;
  /** Hash of the parsed config: key order and YAML formatting are normalized away. */
  config: string;
  /** SQL files and Handlebars templates: path -> content hash. */
  inputs: Record<string, string>;
  /**
   * File sources: path -> "size:mtimeMs". Deliberately not a content hash —
   * these are the databases and parquet files being introspected, which run to
   * gigabytes; hashing one costs far more than regenerating. Only their schema
   * reaches the output, and a schema change rewrites the file. The blind spot
   * is a rewrite that keeps the size and lands within the same filesystem
   * timestamp tick (~1ms) — drop `--if-stale` to force a run.
   */
  sources: Record<string, string>;
}

interface Stamp {
  format: number;
  fingerprint: Fingerprint;
  /** Generated file (relative to the project dir) -> content hash. */
  outputs: Record<string, string>;
}

export type CacheState =
  | { upToDate: true; outputs: string[] }
  | { upToDate: false; reason: string };

/**
 * Why this project cannot be cached, if it cannot.
 *
 * A postgres source with `url` introspects a live database, whose schema can
 * change with no local signal at all — there is nothing to fingerprint.
 */
export function cacheBlocker(project: Project): string | undefined {
  const live = (project.sources ?? []).find((s) => s.type === "postgres" && s.url);
  if (live) {
    return `postgres source '${live.name}' introspects a live database, which can change with no local signal`;
  }
  return undefined;
}

/** Fingerprint every input that can affect the generated output. */
export function computeFingerprint(project: Project, projectDir: string): Fingerprint {
  const inputs: Record<string, string> = {};
  for (const sql of project.sql) {
    for (const file of sql.files) {
      inputs[file] = hashFile(join(projectDir, file));
    }
    for (const gen of sql.gen) {
      const template = resolveTemplatePath(gen);
      if (template) {
        inputs[`template:${template}`] = hashFile(template);
      }
    }
  }

  const sources: Record<string, string> = {};
  for (const source of project.sources ?? []) {
    // Postgres sources carry no local file: a container source's schema comes
    // from its `:source=` BASELINE blocks (already hashed with the SQL) and its
    // image name is part of the config hash; a `url` source blocks caching.
    if (source.type === "postgres" || !source.path) {
      continue;
    }
    const path = resolveSourcePath(source.path);
    sources[path] = statStamp(path);
  }

  return { sqg: SQG_VERSION, config: hash(stableStringify(project)), inputs, sources };
}

/** Decide whether the last generated output is still current. */
export function checkUpToDate(projectDir: string, fingerprint: Fingerprint): CacheState {
  const stamp = readStamp(projectDir);
  if (!stamp) {
    return { upToDate: false, reason: `no ${CACHE_FILE}` };
  }

  const changed = describeChange(stamp.fingerprint, fingerprint);
  if (changed) {
    return { upToDate: false, reason: changed };
  }

  // The inputs match, but the output itself may have been edited by hand,
  // deleted, or reverted by a checkout — none of which an input-only check
  // would notice.
  const outputs = Object.entries(stamp.outputs);
  if (outputs.length === 0) {
    return { upToDate: false, reason: "no generated files recorded" };
  }
  const paths: string[] = [];
  for (const [rel, recorded] of outputs) {
    const path = join(projectDir, rel);
    if (hashFile(path) !== recorded) {
      return { upToDate: false, reason: `${rel} was modified` };
    }
    paths.push(path);
  }
  return { upToDate: true, outputs: paths };
}

/** Record the inputs and the files just generated from them. */
export function writeStamp(projectDir: string, fingerprint: Fingerprint, files: string[]): void {
  const outputs: Record<string, string> = {};
  for (const file of files) {
    outputs[relative(projectDir, file)] = hashFile(file);
  }
  const stamp: Stamp = { format: CACHE_FORMAT, fingerprint, outputs };
  writeFileSync(join(projectDir, CACHE_FILE), `${JSON.stringify(stamp, null, 2)}\n`);
}

function readStamp(projectDir: string): Stamp | undefined {
  const path = join(projectDir, CACHE_FILE);
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const stamp = JSON.parse(readFileSync(path, "utf-8")) as Stamp;
    return stamp?.format === CACHE_FORMAT ? stamp : undefined;
  } catch {
    // A truncated or hand-mangled stamp just means "regenerate".
    return undefined;
  }
}

/** First difference between two fingerprints, phrased for `--verbose`. */
function describeChange(prev: Fingerprint, next: Fingerprint): string | undefined {
  if (prev.sqg !== next.sqg) {
    return `sqg version changed (${prev.sqg} -> ${next.sqg})`;
  }
  if (prev.config !== next.config) {
    return "project config changed";
  }
  return diffMap(prev.inputs, next.inputs, "") ?? diffMap(prev.sources, next.sources, "source ");
}

function diffMap(
  prev: Record<string, string>,
  next: Record<string, string>,
  label: string,
): string | undefined {
  for (const [key, value] of Object.entries(next)) {
    if (!(key in prev)) {
      return `${label}${key} added`;
    }
    if (prev[key] !== value) {
      return `${label}${key} changed`;
    }
  }
  for (const key of Object.keys(prev)) {
    if (!(key in next)) {
      return `${label}${key} removed`;
    }
  }
  return undefined;
}

/**
 * Where `writeGeneratedFile` will look for this generator's template: built-in
 * templates ship next to the module, and a `template:` override is resolved the
 * same way. Hashing it means editing a template invalidates the cache even
 * without a version bump.
 */
function resolveTemplatePath(gen: { generator: string; template?: string }): string | undefined {
  try {
    const templateDir = dirname(fileURLToPath(import.meta.url));
    return join(templateDir, gen.template ?? getGenerator(gen.generator).template);
  } catch {
    // An unknown generator is reported properly by the pipeline further down.
    return undefined;
  }
}

function statStamp(path: string): string {
  try {
    const stat = statSync(path);
    return `${stat.size}:${stat.mtimeMs}`;
  } catch {
    return MISSING;
  }
}

function hashFile(path: string): string {
  try {
    return hash(readFileSync(path));
  } catch {
    return MISSING;
  }
}

function hash(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/** JSON with object keys sorted, so key order in the YAML is not an input. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
