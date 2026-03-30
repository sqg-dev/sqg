import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  target: 'node20',
  deps: {
    alwaysBundle: [/.*/],
    // We intentionally bundle all JS deps (Fastify, tRPC, etc.) into a single file.
    // Only native modules are excluded. Suppress the "unintended bundling" hint.
    onlyBundle: false,
    neverBundle: [
      // Native/binary modules — can't be bundled, resolved at runtime
      '@duckdb/node-api',
      '@duckdb/node-bindings-linux-x64',
      'better-sqlite3',
      'pg',
      'pg-native',
      'pg-cloudflare',
      // SQG library — already bundled in the parent package
      '@sqg/sqg',
    ],
  },
});
