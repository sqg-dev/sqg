import Database from "better-sqlite3";
import { Queries } from "./db.js";

// Create an in-memory database (use a file path for persistence)
const db = new Database(":memory:");

// Initialize the queries class
const queries = new Queries(db);

// Run migrations
console.log("Running migrations...");
for (const migration of Queries.getMigrations()) {
  db.exec(migration);
}
console.log("Migrations complete!\n");

// Insert some users
console.log("Inserting users...");
queries.insertUser("Alice", "alice@example.com");
queries.insertUser("Bob", "bob@example.com");
queries.insertUser("Charlie", "charlie@example.com");

// Get all users
console.log("\nAll users:");
const users = queries.getUsers();
for (const user of users) {
  console.log(`  - ${user.name} (${user.email})`);
}

// Get a specific user by ID
console.log("\nUser with ID 1:");
const alice = queries.getUserById(1);
if (alice) {
  console.log(`  Found: ${alice.name}`);
}

// Get a user by email
console.log("\nUser by email 'bob@example.com':");
const bob = queries.getUserByEmail("bob@example.com");
if (bob) {
  console.log(`  Found: ${bob.name} (ID: ${bob.id})`);
}

// Insert some posts
console.log("\nInserting posts...");
queries.insertPost(1, "Hello World", "This is my first post!", 1);
queries.insertPost(1, "Draft Post", "This is a draft.", 0);
queries.insertPost(2, "Bob's Post", "Hello from Bob!", 1);

// Get posts by user
console.log("\nAlice's posts:");
const alicePosts = queries.getPostsByUser(1);
for (const post of alicePosts) {
  console.log(`  - ${post.title} (published: ${post.published ? "yes" : "no"})`);
}

// Get all published posts with author names
console.log("\nAll published posts:");
const published = queries.getPublishedPosts();
for (const post of published) {
  console.log(`  - "${post.title}" by ${post.author_name}`);
}

// Count posts for a user
console.log("\nPost counts:");
for (const user of users) {
  const count = queries.countUserPosts(user.id);
  console.log(`  ${user.name}: ${count} posts`);
}

// Close the database
db.close();
console.log("\nDone!");
