import { DuckDBInstance, DuckDBTimestampValue } from "@duckdb/node-api";
import { Queries } from "./db.js";

async function main() {
  // Create an in-memory database
  const instance = await DuckDBInstance.create(":memory:");
  const conn = await instance.connect();

  // Initialize the queries class
  const queries = new Queries(conn);

  // Run migrations
  console.log("Running migrations...");
  for (const migration of Queries.getMigrations()) {
    await conn.run(migration);
  }
  console.log("Migrations complete!\n");

  // Insert some users
  console.log("Inserting users...");
  await queries.insertUser("Alice", "alice@example.com");
  await queries.insertUser("Bob", "bob@example.com");
  await queries.insertUser("Charlie", "charlie@example.com");

  // Get all users
  console.log("\nAll users:");
  const users = await queries.getUsers();
  for (const user of users) {
    console.log(`  - ${user.name} (${user.email})`);
  }

  // Get a specific user by ID
  console.log("\nUser with ID 1:");
  const alice = await queries.getUserById(1);
  if (alice) {
    console.log(`  Found: ${alice.name}`);
  }

  // Get a user by email
  console.log("\nUser by email 'bob@example.com':");
  const bob = await queries.getUserByEmail("bob@example.com");
  if (bob) {
    console.log(`  Found: ${bob.name} (ID: ${bob.id})`);
  }

  // Insert some posts
  console.log("\nInserting posts...");
  await queries.insertPost(1, "Hello World", "This is my first post!", true);
  await queries.insertPost(1, "Draft Post", "This is a draft.", false);
  await queries.insertPost(2, "Bob's Post", "Hello from Bob!", true);

  // Get posts by user (demonstrates list and struct types)
  console.log("\nAlice's posts:");
  const alicePosts = await queries.getPostsByUser(1);
  for (const post of alicePosts) {
    // DuckDB returns list as { items: T[] } and struct as { entries: {...} }
    // These are now properly typed in the generated code
    const tags = post.tags.items;
    const metadata = post.metadata.entries;

    console.log(`  - ${post.title}`);
    console.log(`    published: ${post.published ? "yes" : "no"}`);
    console.log(`    tags: [${tags.join(", ")}]`);
    console.log(`    metadata: views=${metadata.views}, likes=${metadata.likes}, featured=${metadata.featured}`);
  }

  // Get all published posts with author names
  console.log("\nAll published posts:");
  const published = await queries.getPublishedPosts();
  for (const post of published) {
    console.log(`  - "${post.title}" by ${post.author_name}`);
  }

  // Count posts for a user
  console.log("\nPost counts:");
  for (const user of users) {
    const count = await queries.countUserPosts(user.id!);
    console.log(`  ${user.name}: ${count} posts`);
  }


  const topicsAppender = await queries.createTopicsAppender();
  for (let i = 0; i < 1000; i++) {
    topicsAppender.append({
      id: i,
      name: "Test Topic " + i,
      description: "Test Description " + i,
      created_at: new DuckDBTimestampValue(BigInt(Date.now() * 1000)),
    });
  }
  topicsAppender.flush();
  topicsAppender.close();


  const topics = await queries.getTopics().then((topics) => topics.slice(0, 10));
  for (const topic of topics) {
    console.log(`  - ${topic.name} (${topic.description}) created at ${topic.created_at?.toString()}`);
  }
  // Close the connection
  conn.closeSync();
  console.log("\nDone!");
}

main().catch(console.error);
