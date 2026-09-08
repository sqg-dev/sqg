/**
 * The running SQG version.
 *
 * `__SQG_VERSION__` is baked in at build time and is the authoritative value.
 * The `npm_package_version` fallback only applies when running from source
 * (`pnpm sqg`), where it is this package's own version — it is deliberately not
 * preferred, since a user running sqg through their own package's scripts would
 * otherwise see (and fingerprint on) *their* version.
 */

declare const __SQG_VERSION__: string;

export const SQG_VERSION: string =
  (typeof __SQG_VERSION__ !== "undefined" ? __SQG_VERSION__ : undefined) ??
  process.env.npm_package_version ??
  "0.0.0";
