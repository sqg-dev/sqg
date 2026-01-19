import { Bench } from "tinybench";
import Database, { type Database as BetterSqlite3Database } from "better-sqlite3";
import { DatabaseSync } from "node:sqlite";
import { createClient, type Client as LibsqlClient } from "@libsql/client";
import { connect, type Database as TursoDatabase } from "@tursodatabase/database";
import { Queries as BetterSqlite3Queries } from "./db-better-sqlite3.js";
import { Queries as NodeSqliteQueries } from "./db-node-sqlite.js";
import { Queries as LibsqlQueries } from "./db-libsql.js";
import { Queries as TursoQueries } from "./db-turso.js";
import { unlinkSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus, totalmem, platform, arch } from "node:os";

const BETTER_SQLITE3_DB = "benchmark-better-sqlite3.db";
const NODE_SQLITE_DB = "benchmark-node-sqlite.db";
const LIBSQL_DB = "benchmark-libsql.db";
const TURSO_DB = "benchmark-turso.db";

// Number of users and posts to seed
const NUM_USERS = 10000;
const NUM_POSTS_PER_USER = 50;

// Recommended SQLite pragma settings for performance
const SQLITE_PRAGMAS = [
  "PRAGMA journal_mode = WAL",        // Write-Ahead Logging for better concurrency
  "PRAGMA synchronous = NORMAL",       // Balance between safety and speed
  "PRAGMA cache_size = -64000",        // 64MB cache (negative = KB)
  "PRAGMA temp_store = MEMORY",        // Store temp tables in memory
  "PRAGMA mmap_size = 268435456",      // 256MB memory-mapped I/O
];

// Test data types
interface UserData {
  id: number;
  name: string;
  email: string;
  age: number;
}

interface PostData {
  userId: number;
  title: string;
  content: string;
  published: number;
}

// XOR constant to make user IDs non-sequential but still unique
const USER_ID_XOR = 0x5A5A5A5A;

// Generator function to create consistent test data
function* generateTestData(): Generator<{ user: UserData; posts: PostData[] }, void, unknown> {
  for (let i = 0; i < NUM_USERS; i++) {
    // Use XOR to make user IDs non-sequential while ensuring uniqueness
    // XOR is a bijection, so (i + 1) ^ USER_ID_XOR will produce unique values
    const userId = (i + 1) ^ USER_ID_XOR;
    
    const user: UserData = {
      id: userId,
      name: `User ${i}`,
      email: `user${i}@example.com`,
      age: 20 + (i % 50),
    };

    const posts: PostData[] = [];
    for (let j = 0; j < NUM_POSTS_PER_USER; j++) {
      posts.push({
        userId,
        title: `Post ${j} by User ${i}`,
        content: `Content for post ${j} by user ${i}. This is some sample content.`,
        published: j % 2,
      });
    }

    yield { user, posts };
  }
}

type DriverName = "better-sqlite3" | "node:sqlite" | "libsql" | "turso";

interface DriverSetup {
  name: DriverName;
  queries: BetterSqlite3Queries | NodeSqliteQueries | LibsqlQueries | TursoQueries;
  cleanup: () => void | Promise<void>;
}

function setupBetterSqlite3(): { queries: BetterSqlite3Queries; db: BetterSqlite3Database } {
  if (existsSync(BETTER_SQLITE3_DB)) {
    unlinkSync(BETTER_SQLITE3_DB);
  }
  const db = new Database(BETTER_SQLITE3_DB);

  // Apply recommended pragma settings
  for (const pragma of SQLITE_PRAGMAS) {
    db.exec(pragma);
  }

  const queries = new BetterSqlite3Queries(db);

  // Run migrations
  for (const migration of BetterSqlite3Queries.getMigrations()) {
    db.exec(migration);
  }

  return { queries, db };
}

function setupNodeSqlite(): { queries: NodeSqliteQueries; db: DatabaseSync } {
  if (existsSync(NODE_SQLITE_DB)) {
    unlinkSync(NODE_SQLITE_DB);
  }
  const db = new DatabaseSync(NODE_SQLITE_DB);

  // Apply recommended pragma settings
  for (const pragma of SQLITE_PRAGMAS) {
    db.exec(pragma);
  }

  const queries = new NodeSqliteQueries(db);

  // Run migrations
  for (const migration of NodeSqliteQueries.getMigrations()) {
    db.exec(migration);
  }

  return { queries, db };
}

async function setupLibsql(): Promise<{ queries: LibsqlQueries; client: LibsqlClient }> {
  if (existsSync(LIBSQL_DB)) {
    unlinkSync(LIBSQL_DB);
  }

  const client = createClient({
    url: `file:${LIBSQL_DB}`,
  });

  // Apply recommended pragma settings
  for (const pragma of SQLITE_PRAGMAS) {
    await client.execute(pragma);
  }

  const queries = new LibsqlQueries(client);

  // Run migrations
  for (const migration of LibsqlQueries.getMigrations()) {
    await client.execute(migration);
  }

  return { queries, client };
}

async function setupTurso(): Promise<{ queries: TursoQueries; db: TursoDatabase }> {
  if (existsSync(TURSO_DB)) {
    unlinkSync(TURSO_DB);
  }

  const db = await connect(TURSO_DB);

  // Apply recommended pragma settings (turso/limbo may not support all)
  for (const pragma of SQLITE_PRAGMAS) {
    try {
      const stmt = await db.prepare(pragma);
      await stmt.run();
    } catch {
      // Some pragmas may not be supported
    }
  }

  const queries = new TursoQueries(db);

  // Run migrations
  for (const migration of TursoQueries.getMigrations()) {
    const stmt = await db.prepare(migration);
    await stmt.run();
  }

  return { queries, db };
}

function seedBetterSqlite3(queries: BetterSqlite3Queries, db: BetterSqlite3Database) {
  db.transaction(() => {
    for (const { user, posts } of generateTestData()) {
      queries.insertUser(user.id, user.name, user.email, user.age);
      for (const post of posts) {
        queries.insertPost(post.userId, post.title, post.content, post.published);
      }
    }
  })();
}

function seedNodeSqlite(queries: NodeSqliteQueries, db: DatabaseSync) {
  db.exec("BEGIN");
  try {
    for (const { user, posts } of generateTestData()) {
      queries.insertUser(user.id, user.name, user.email, user.age);
      for (const post of posts) {
        queries.insertPost(post.userId, post.title, post.content, post.published);
      }
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

async function seedLibsql(queries: LibsqlQueries, client: LibsqlClient) {
  // Use batch for better performance
  const statements: { sql: string; args: (string | number)[] }[] = [];

  for (const { user, posts } of generateTestData()) {
    // Use the generated insertUser method signature
    statements.push({
      sql: "INSERT INTO users (id, name, email, age) VALUES (?, ?, ?, ?)",
      args: [user.id, user.name, user.email, user.age]
    });
    for (const post of posts) {
      // Use the generated insertPost method signature
      statements.push({
        sql: "INSERT INTO posts (user_id, title, content, published) VALUES (?, ?, ?, ?)",
        args: [post.userId, post.title, post.content, post.published]
      });
    }
  }

  // Batch in chunks to avoid memory issues
  const CHUNK_SIZE = 1000;
  for (let i = 0; i < statements.length; i += CHUNK_SIZE) {
    const chunk = statements.slice(i, i + CHUNK_SIZE);
    await client.batch(chunk, "write");
  }
}

async function seedTurso(queries: TursoQueries, db: TursoDatabase) {
  await db.transaction(async () => {
    for (const { user, posts } of generateTestData()) {
      await queries.insertUser(user.id, user.name, user.email, user.age);
      for (const post of posts) {
        await queries.insertPost(post.userId, post.title, post.content, post.published);
      }
    }
  })();
}

interface SystemInfo {
  nodeVersion: string;
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCount: number;
  totalMemory: string;
}

function getSystemInfo(): SystemInfo {
  const cpuInfo = cpus();
  const totalMemGB = (totalmem() / (1024 * 1024 * 1024)).toFixed(2);

  return {
    nodeVersion: process.version,
    platform: platform(),
    arch: arch(),
    cpuModel: cpuInfo[0]?.model || "Unknown",
    cpuCount: cpuInfo.length,
    totalMemory: `${totalMemGB} GB`,
  };
}

interface BenchmarkResult {
  operation: string;
  results: Record<DriverName, number>;
  winner: DriverName;
  multiplier: number; // winner ops/s divided by baseline (node:sqlite) ops/s
}

const BASELINE_DRIVER: DriverName = "node:sqlite";

function generateHtmlReport(
  benchmarkResults: BenchmarkResult[],
  systemInfo: SystemInfo
) {
  const drivers: DriverName[] = ["better-sqlite3", "node:sqlite", "libsql", "turso"];

  const summaryRows = benchmarkResults.map(r => {
    const cells = drivers.map(driver => {
      const ops = r.results[driver];
      const isWinner = driver === r.winner;
      return `<td class="${isWinner ? 'winner' : ''}">${ops.toLocaleString(undefined, { maximumFractionDigits: 0 })} ops/s</td>`;
    }).join('\n          ');

    return `
    <tr>
      <td>${r.operation}</td>
      ${cells}
      <td class="winner">${r.winner}</td>
      <td>${r.multiplier.toFixed(2)}x</td>
    </tr>`;
  }).join('');

  // Load template
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const templatePath = join(__dirname, "report-template.html");
  const template = readFileSync(templatePath, "utf-8");

  // System info HTML
  const systemInfoHtml = `
    <div class="system-info">
      <h3>System Information</h3>
      <table class="system-table">
        <tr><td>Node.js Version</td><td>${systemInfo.nodeVersion}</td></tr>
        <tr><td>Platform</td><td>${systemInfo.platform}</td></tr>
        <tr><td>Architecture</td><td>${systemInfo.arch}</td></tr>
        <tr><td>CPU</td><td>${systemInfo.cpuModel}</td></tr>
        <tr><td>CPU Cores</td><td>${systemInfo.cpuCount}</td></tr>
        <tr><td>Total Memory</td><td>${systemInfo.totalMemory}</td></tr>
      </table>
    </div>
  `;

  // Replace placeholders
  const html = template
    .replace("{{SUMMARY_ROWS}}", summaryRows)
    .replace("{{SYSTEM_INFO}}", systemInfoHtml);

  return html;
}

async function runBenchmarks(
  betterSqlite3: BetterSqlite3Queries,
  nodeSqlite: NodeSqliteQueries,
  libsql: LibsqlQueries,
  turso: TursoQueries
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const drivers: DriverName[] = ["better-sqlite3", "node:sqlite", "libsql", "turso"];

  // Helper to run a single operation benchmark across all drivers
  async function benchmarkOperation(
    name: string,
    ops: {
      "better-sqlite3": () => void;
      "node:sqlite": () => void;
      "libsql": () => Promise<void>;
      "turso": () => Promise<void>;
    }
  ) {
    const bench = new Bench({ time: 1000 });

    bench
      .add("better-sqlite3", ops["better-sqlite3"])
      .add("node:sqlite", ops["node:sqlite"])
      .add("libsql", ops["libsql"])
      .add("turso", ops["turso"]);

    await bench.run();

    const opsPerSec: Record<DriverName, number> = {
      "better-sqlite3": 0,
      "node:sqlite": 0,
      "libsql": 0,
      "turso": 0,
    };

    for (const task of bench.tasks) {
      if (task.result && 'throughput' in task.result) {
        opsPerSec[task.name as DriverName] = task.result.throughput.mean;
      }
    }

    // Find winner
    let maxOps = 0;
    let winner: DriverName | undefined;

    for (const driver of drivers) {
      if (opsPerSec[driver] > maxOps) {
        maxOps = opsPerSec[driver];
        winner = driver;
      }
    }

    // Calculate multiplier: winner vs baseline (node:sqlite)
    const baselineOps = opsPerSec[BASELINE_DRIVER];
    const multiplier = baselineOps > 0 ? maxOps / baselineOps : 1;

    results.push({
      operation: name,
      results: opsPerSec,
      winner: winner!,
      multiplier,
    });

    // Print progress
    console.log(`  ${name}: ${winner} wins (${multiplier.toFixed(2)}x vs ${BASELINE_DRIVER})`);
  }

  console.log("Running benchmarks...\n");

  // Benchmark: Get all users
  await benchmarkOperation("getAllUsers", {
    "better-sqlite3": () => { betterSqlite3.getAllUsers(); },
    "node:sqlite": () => { nodeSqlite.getAllUsers(); },
    "libsql": async () => { await libsql.getAllUsers(); },
    "turso": async () => { await turso.getAllUsers(); },
  });

  // Benchmark: Get user by ID (single row)
  await benchmarkOperation("getUserById", {
    "better-sqlite3": () => { betterSqlite3.getUserById(Math.floor(Math.random() * NUM_USERS) + 1); },
    "node:sqlite": () => { nodeSqlite.getUserById(Math.floor(Math.random() * NUM_USERS) + 1); },
    "libsql": async () => { await libsql.getUserById(Math.floor(Math.random() * NUM_USERS) + 1); },
    "turso": async () => { await turso.getUserById(Math.floor(Math.random() * NUM_USERS) + 1); },
  });

  // Benchmark: Get user by email (single row with index)
  await benchmarkOperation("getUserByEmail", {
    "better-sqlite3": () => {
      const i = Math.floor(Math.random() * NUM_USERS);
      betterSqlite3.getUserByEmail(`user${i}@example.com`);
    },
    "node:sqlite": () => {
      const i = Math.floor(Math.random() * NUM_USERS);
      nodeSqlite.getUserByEmail(`user${i}@example.com`);
    },
    "libsql": async () => {
      const i = Math.floor(Math.random() * NUM_USERS);
      await libsql.getUserByEmail(`user${i}@example.com`);
    },
    "turso": async () => {
      const i = Math.floor(Math.random() * NUM_USERS);
      await turso.getUserByEmail(`user${i}@example.com`);
    },
  });

  // Benchmark: Count users (pluck)
  await benchmarkOperation("countUsers (pluck)", {
    "better-sqlite3": () => { betterSqlite3.countUsers(); },
    "node:sqlite": () => { nodeSqlite.countUsers(); },
    "libsql": async () => { await libsql.countUsers(); },
    "turso": async () => { await turso.countUsers(); },
  });

  // Benchmark: Get posts by user
  await benchmarkOperation("getPostsByUser", {
    "better-sqlite3": () => { betterSqlite3.getPostsByUser(Math.floor(Math.random() * NUM_USERS) + 1); },
    "node:sqlite": () => { nodeSqlite.getPostsByUser(Math.floor(Math.random() * NUM_USERS) + 1); },
    "libsql": async () => { await libsql.getPostsByUser(Math.floor(Math.random() * NUM_USERS) + 1); },
    "turso": async () => { await turso.getPostsByUser(Math.floor(Math.random() * NUM_USERS) + 1); },
  });

  // Benchmark: Get published posts (JOIN query)
  await benchmarkOperation("getPublishedPosts (JOIN)", {
    "better-sqlite3": () => { betterSqlite3.getPublishedPosts(100); },
    "node:sqlite": () => { nodeSqlite.getPublishedPosts(100); },
    "libsql": async () => { await libsql.getPublishedPosts(100); },
    "turso": async () => { await turso.getPublishedPosts(100); },
  });

  // Benchmark: Get post with author (JOIN, single row)
  await benchmarkOperation("getPostWithAuthor (JOIN :one)", {
    "better-sqlite3": () => {
      const postId = Math.floor(Math.random() * NUM_USERS * NUM_POSTS_PER_USER) + 1;
      betterSqlite3.getPostWithAuthor(postId);
    },
    "node:sqlite": () => {
      const postId = Math.floor(Math.random() * NUM_USERS * NUM_POSTS_PER_USER) + 1;
      nodeSqlite.getPostWithAuthor(postId);
    },
    "libsql": async () => {
      const postId = Math.floor(Math.random() * NUM_USERS * NUM_POSTS_PER_USER) + 1;
      await libsql.getPostWithAuthor(postId);
    },
    "turso": async () => {
      const postId = Math.floor(Math.random() * NUM_USERS * NUM_POSTS_PER_USER) + 1;
      await turso.getPostWithAuthor(postId);
    },
  });

  // Benchmark: Count posts by user (pluck)
  await benchmarkOperation("countPostsByUser (pluck)", {
    "better-sqlite3": () => { betterSqlite3.countPostsByUser(Math.floor(Math.random() * NUM_USERS) + 1); },
    "node:sqlite": () => { nodeSqlite.countPostsByUser(Math.floor(Math.random() * NUM_USERS) + 1); },
    "libsql": async () => { await libsql.countPostsByUser(Math.floor(Math.random() * NUM_USERS) + 1); },
    "turso": async () => { await turso.countPostsByUser(Math.floor(Math.random() * NUM_USERS) + 1); },
  });

  // Benchmark: Insert user
  let betterInsertCounter = NUM_USERS;
  let nodeInsertCounter = NUM_USERS;
  let libsqlInsertCounter = NUM_USERS;
  let tursoInsertCounter = NUM_USERS;

  await benchmarkOperation("insertUser", {
    "better-sqlite3": () => {
      betterInsertCounter++;
      // Generate a unique ID using XOR (same pattern as test data)
      const newUserId = (NUM_USERS + betterInsertCounter) ^ USER_ID_XOR;
      betterSqlite3.insertUser(newUserId, `NewUser ${betterInsertCounter}`, `newuser${betterInsertCounter}@example.com`, 25);
    },
    "node:sqlite": () => {
      nodeInsertCounter++;
      const newUserId = (NUM_USERS + nodeInsertCounter) ^ USER_ID_XOR;
      nodeSqlite.insertUser(newUserId, `NewUser ${nodeInsertCounter}`, `newuser${nodeInsertCounter}@example.com`, 25);
    },
    "libsql": async () => {
      libsqlInsertCounter++;
      const newUserId = (NUM_USERS + libsqlInsertCounter) ^ USER_ID_XOR;
      await libsql.insertUser(newUserId, `NewUser ${libsqlInsertCounter}`, `newuser${libsqlInsertCounter}@example.com`, 25);
    },
    "turso": async () => {
      tursoInsertCounter++;
      const newUserId = (NUM_USERS + tursoInsertCounter) ^ USER_ID_XOR;
      await turso.insertUser(newUserId, `NewUser ${tursoInsertCounter}`, `newuser${tursoInsertCounter}@example.com`, 25);
    },
  });

  // Benchmark: Update post views
  await benchmarkOperation("updatePostViews", {
    "better-sqlite3": () => {
      const postId = Math.floor(Math.random() * NUM_USERS * NUM_POSTS_PER_USER) + 1;
      betterSqlite3.updatePostViews(postId, Math.floor(Math.random() * 1000));
    },
    "node:sqlite": () => {
      const postId = Math.floor(Math.random() * NUM_USERS * NUM_POSTS_PER_USER) + 1;
      nodeSqlite.updatePostViews(postId, Math.floor(Math.random() * 1000));
    },
    "libsql": async () => {
      const postId = Math.floor(Math.random() * NUM_USERS * NUM_POSTS_PER_USER) + 1;
      await libsql.updatePostViews(postId, Math.floor(Math.random() * 1000));
    },
    "turso": async () => {
      const postId = Math.floor(Math.random() * NUM_USERS * NUM_POSTS_PER_USER) + 1;
      await turso.updatePostViews(postId, Math.floor(Math.random() * 1000));
    },
  });

  return results;
}

async function main() {
  console.log("SQLite TypeScript Generators Benchmark");
  console.log("======================================\n");
  console.log("Comparing: better-sqlite3 vs node:sqlite vs libsql vs turso\n");

  console.log("SQLite configuration:");
  for (const pragma of SQLITE_PRAGMAS) {
    console.log(`  ${pragma}`);
  }
  console.log();

  const systemInfo = getSystemInfo();

  // Print system info
  console.log("System Information:");
  console.log("==================");
  console.log(`Node.js: ${systemInfo.nodeVersion}`);
  console.log(`Platform: ${systemInfo.platform} (${systemInfo.arch})`);
  console.log(`CPU: ${systemInfo.cpuModel}`);
  console.log(`CPU Cores: ${systemInfo.cpuCount}`);
  console.log(`Total Memory: ${systemInfo.totalMemory}`);
  console.log();

  // Setup all drivers
  console.log("Setting up databases...");
  const { queries: betterSqlite3, db: betterDb } = setupBetterSqlite3();
  const { queries: nodeSqlite, db: nodeDb } = setupNodeSqlite();
  const { queries: libsql, client: libsqlClient } = await setupLibsql();
  const { queries: turso, db: tursoDb } = await setupTurso();
  console.log("Databases setup complete.\n");

  // Seed all databases
  console.log(`Seeding ${NUM_USERS} users with ${NUM_POSTS_PER_USER} posts each...`);

  console.log("  Seeding better-sqlite3...");
  seedBetterSqlite3(betterSqlite3, betterDb);

  console.log("  Seeding node:sqlite...");
  seedNodeSqlite(nodeSqlite, nodeDb);

  console.log("  Seeding libsql...");
  await seedLibsql(libsql, libsqlClient);

  console.log("  Seeding turso...");
  await seedTurso(turso, tursoDb);

  console.log("Seeding complete.\n");

  const benchmarkResults = await runBenchmarks(betterSqlite3, nodeSqlite, libsql, turso);

  // Print summary
  console.log("\nResults Summary:");
  console.log("================\n");
  console.log(`Baseline: ${BASELINE_DRIVER}\n`);

  console.log("Operation".padEnd(35) + "Winner".padEnd(15) + "vs Baseline");
  console.log("-".repeat(60));

  for (const result of benchmarkResults) {
    console.log(
      result.operation.padEnd(35) +
      result.winner.padEnd(15) +
      `${result.multiplier.toFixed(2)}x`
    );
  }

  // Generate HTML report
  const htmlReport = generateHtmlReport(benchmarkResults, systemInfo);
  writeFileSync("benchmark-report.html", htmlReport);
  console.log("\nHTML report saved to: benchmark-report.html");

  // Cleanup
  const dbFiles = [
    BETTER_SQLITE3_DB,
    NODE_SQLITE_DB,
    LIBSQL_DB,
    TURSO_DB,
  ];

  for (const dbFile of dbFiles) {
    if (existsSync(dbFile)) {
      try {
        unlinkSync(dbFile);
      } catch {
        // Ignore cleanup errors
      }
    }
    // Also try to clean up WAL and SHM files
    for (const suffix of ["-wal", "-shm"]) {
      const walFile = dbFile + suffix;
      if (existsSync(walFile)) {
        try {
          unlinkSync(walFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  console.log("\nBenchmark complete. Database files cleaned up.");
}

main().catch(console.error);
