import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  target: 'node20',
  noExternal: [/.*/],
  external: [
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
});
