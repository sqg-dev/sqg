import { Bench } from "tinybench";
import Database, { type Database as BetterSqlite3Database } from "better-sqlite3";
import { DatabaseSync } from "node:sqlite";
import { Queries as BetterSqlite3Queries } from "./db-better-sqlite3.js";
import { Queries as NodeSqliteQueries } from "./db-node-sqlite.js";
import { unlinkSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus, totalmem, platform, arch } from "node:os";

const BETTER_SQLITE3_DB = "benchmark-better-sqlite3.db";
const NODE_SQLITE_DB = "benchmark-node-sqlite.db";

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

function seedData(
  betterSqlite3: BetterSqlite3Queries,
  betterDb: BetterSqlite3Database,
  nodeSqlite: NodeSqliteQueries,
  nodeDb: DatabaseSync
) {
  console.log(`Seeding ${NUM_USERS} users with ${NUM_POSTS_PER_USER} posts each...`);

  // Seed better-sqlite3 database in a transaction
  const betterTransaction = betterDb.transaction(() => {
    for (let i = 0; i < NUM_USERS; i++) {
      betterSqlite3.insertUser(`User ${i}`, `user${i}@example.com`, 20 + (i % 50));
      const userId = i + 1;
      for (let j = 0; j < NUM_POSTS_PER_USER; j++) {
        betterSqlite3.insertPost(
          userId,
          `Post ${j} by User ${i}`,
          `Content for post ${j} by user ${i}. This is some sample content.`,
          j % 2 // Half published, half not
        );
      }
    }
  });
  betterTransaction();

  // Seed node:sqlite database with same data in a transaction
  nodeDb.exec("BEGIN");
  try {
    for (let i = 0; i < NUM_USERS; i++) {
      nodeSqlite.insertUser(`User ${i}`, `user${i}@example.com`, 20 + (i % 50));
      const userId = i + 1;
      for (let j = 0; j < NUM_POSTS_PER_USER; j++) {
        nodeSqlite.insertPost(
          userId,
          `Post ${j} by User ${i}`,
          `Content for post ${j} by user ${i}. This is some sample content.`,
          j % 2
        );
      }
    }
    nodeDb.exec("COMMIT");
  } catch (error) {
    nodeDb.exec("ROLLBACK");
    throw error;
  }

  console.log("Seeding complete.\n");
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

function generateHtmlReport(
  comparisons: Array<{ operation: string; betterOps: number; nodeOps: number; multiplier: number; winner: string }>,
  systemInfo: SystemInfo
) {
  const summaryRows = comparisons.map(c => `
    <tr>
      <td>${c.operation}</td>
      <td>${c.betterOps.toLocaleString(undefined, { maximumFractionDigits: 0 })} ops/s</td>
      <td>${c.nodeOps.toLocaleString(undefined, { maximumFractionDigits: 0 })} ops/s</td>
      <td class="winner ${c.winner === 'better-sqlite3' ? 'better' : 'node'}">${c.winner}</td>
      <td>${c.multiplier.toFixed(2)}x</td>
    </tr>
  `).join('');

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
  nodeSqlite: NodeSqliteQueries
): Promise<Array<{ operation: string; betterOps: number; nodeOps: number; multiplier: number; winner: string }>> {
  const bench = new Bench({ time: 1000 });

  // Benchmark: Get all users
  bench
    .add("better-sqlite3: getAllUsers", () => {
      betterSqlite3.getAllUsers();
    })
    .add("node:sqlite: getAllUsers", () => {
      nodeSqlite.getAllUsers();
    });

  // Benchmark: Get user by ID (single row)
  bench
    .add("better-sqlite3: getUserById", () => {
      betterSqlite3.getUserById(Math.floor(Math.random() * NUM_USERS) + 1);
    })
    .add("node:sqlite: getUserById", () => {
      nodeSqlite.getUserById(Math.floor(Math.random() * NUM_USERS) + 1);
    });

  // Benchmark: Get user by email (single row with index)
  bench
    .add("better-sqlite3: getUserByEmail", () => {
      const i = Math.floor(Math.random() * NUM_USERS);
      betterSqlite3.getUserByEmail(`user${i}@example.com`);
    })
    .add("node:sqlite: getUserByEmail", () => {
      const i = Math.floor(Math.random() * NUM_USERS);
      nodeSqlite.getUserByEmail(`user${i}@example.com`);
    });

  // Benchmark: Count users (pluck)
  bench
    .add("better-sqlite3: countUsers (pluck)", () => {
      betterSqlite3.countUsers();
    })
    .add("node:sqlite: countUsers (pluck)", () => {
      nodeSqlite.countUsers();
    });

  // Benchmark: Get posts by user
  bench
    .add("better-sqlite3: getPostsByUser", () => {
      betterSqlite3.getPostsByUser(Math.floor(Math.random() * NUM_USERS) + 1);
    })
    .add("node:sqlite: getPostsByUser", () => {
      nodeSqlite.getPostsByUser(Math.floor(Math.random() * NUM_USERS) + 1);
    });

  // Benchmark: Get published posts (JOIN query)
  bench
    .add("better-sqlite3: getPublishedPosts (JOIN)", () => {
      betterSqlite3.getPublishedPosts(100);
    })
    .add("node:sqlite: getPublishedPosts (JOIN)", () => {
      nodeSqlite.getPublishedPosts(100);
    });

  // Benchmark: Get post with author (JOIN, single row)
  bench
    .add("better-sqlite3: getPostWithAuthor (JOIN :one)", () => {
      const postId = Math.floor(Math.random() * NUM_USERS * NUM_POSTS_PER_USER) + 1;
      betterSqlite3.getPostWithAuthor(postId);
    })
    .add("node:sqlite: getPostWithAuthor (JOIN :one)", () => {
      const postId = Math.floor(Math.random() * NUM_USERS * NUM_POSTS_PER_USER) + 1;
      nodeSqlite.getPostWithAuthor(postId);
    });

  // Benchmark: Count posts by user (pluck)
  bench
    .add("better-sqlite3: countPostsByUser (pluck)", () => {
      betterSqlite3.countPostsByUser(Math.floor(Math.random() * NUM_USERS) + 1);
    })
    .add("node:sqlite: countPostsByUser (pluck)", () => {
      nodeSqlite.countPostsByUser(Math.floor(Math.random() * NUM_USERS) + 1);
    });

  // Benchmark: Insert user
  let betterInsertCounter = NUM_USERS;
  let nodeInsertCounter = NUM_USERS;
  bench
    .add("better-sqlite3: insertUser", () => {
      betterInsertCounter++;
      betterSqlite3.insertUser(
        `NewUser ${betterInsertCounter}`,
        `newuser${betterInsertCounter}@example.com`,
        25
      );
    })
    .add("node:sqlite: insertUser", () => {
      nodeInsertCounter++;
      nodeSqlite.insertUser(
        `NewUser ${nodeInsertCounter}`,
        `newuser${nodeInsertCounter}@example.com`,
        25
      );
    });

  // Benchmark: Update post views
  bench
    .add("better-sqlite3: updatePostViews", () => {
      const postId = Math.floor(Math.random() * NUM_USERS * NUM_POSTS_PER_USER) + 1;
      betterSqlite3.updatePostViews(postId, Math.floor(Math.random() * 1000));
    })
    .add("node:sqlite: updatePostViews", () => {
      const postId = Math.floor(Math.random() * NUM_USERS * NUM_POSTS_PER_USER) + 1;
      nodeSqlite.updatePostViews(postId, Math.floor(Math.random() * 1000));
    });

  console.log("Running benchmarks...\n");
  await bench.run();

  // Print results
  console.log("Results:");
  console.log("========\n");

  const table = bench.table();
  console.table(table);

  // Print comparison summary
  console.log("\nComparison Summary:");
  console.log("===================\n");

  interface ComparisonResult {
    operation: string;
    betterOps: number;
    nodeOps: number;
    multiplier: number;
    winner: string;
  }

  const comparisons: ComparisonResult[] = [];
  const tasks = bench.tasks;
  for (let i = 0; i < tasks.length; i += 2) {
    const betterSqlite3Task = tasks[i];
    const nodeSqliteTask = tasks[i + 1];

    if (betterSqlite3Task?.result && nodeSqliteTask?.result) {
      // Check if results have statistics (completed tasks)
      if ('throughput' in betterSqlite3Task.result && 'throughput' in nodeSqliteTask.result) {
        const betterOps = betterSqlite3Task.result.throughput.mean;
        const nodeOps = nodeSqliteTask.result.throughput.mean;
        const multiplier = betterOps > nodeOps ? betterOps / nodeOps : nodeOps / betterOps;
        const winner = betterOps > nodeOps ? "better-sqlite3" : "node:sqlite";

        const operation = betterSqlite3Task.name.replace("better-sqlite3: ", "");
        const multiplierStr = multiplier.toFixed(2);
        console.log(
          `${operation.padEnd(35)} ${winner.padEnd(15)} (${multiplierStr}x faster)`
        );

        comparisons.push({
          operation,
          betterOps,
          nodeOps,
          multiplier,
          winner,
        });
      }
    }
  }

  return comparisons;
}

async function main() {
  console.log("SQLite TypeScript Generators Benchmark");
  console.log("======================================\n");
  console.log("Comparing: better-sqlite3 vs node:sqlite\n");

  console.log("SQLite configuration:");
  for (const pragma of SQLITE_PRAGMAS) {
    console.log(`  ${pragma}`);
  }
  console.log();

  const { queries: betterSqlite3, db: betterDb } = setupBetterSqlite3();
  const { queries: nodeSqlite, db: nodeDb } = setupNodeSqlite();

  seedData(betterSqlite3, betterDb, nodeSqlite, nodeDb);

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

  const comparisons = await runBenchmarks(betterSqlite3, nodeSqlite);

  // Generate HTML report
  const htmlReport = generateHtmlReport(comparisons, systemInfo);
  writeFileSync("benchmark-report.html", htmlReport);
  console.log("\nHTML report saved to: benchmark-report.html");

  // Cleanup
  if (existsSync(BETTER_SQLITE3_DB)) {
    unlinkSync(BETTER_SQLITE3_DB);
  }
  if (existsSync(NODE_SQLITE_DB)) {
    unlinkSync(NODE_SQLITE_DB);
  }

  console.log("\nBenchmark complete. Database files cleaned up.");
}

main().catch(console.error);
