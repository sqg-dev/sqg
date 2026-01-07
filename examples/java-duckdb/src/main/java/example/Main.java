package example;

import generated.Queries;

import java.sql.DriverManager;
import java.sql.SQLException;

public class Main {
    public static void main(String[] args) throws SQLException {
        // Create an in-memory DuckDB database
        try (var connection = DriverManager.getConnection("jdbc:duckdb:")) {

            // Run migrations to create tables
            System.out.println("Running migrations...");
            for (String migration : Queries.getMigrations()) {
                try (var stmt = connection.createStatement()) {
                    stmt.execute(migration);
                }
            }
            System.out.println("Migrations complete.\n");

            // Create the type-safe queries instance
            var queries = new Queries(connection);

            // Insert some users
            System.out.println("Inserting users...");
            queries.insertUser("Alice", "alice@example.com");
            queries.insertUser("Bob", "bob@example.com");
            queries.insertUser("Charlie", "charlie@example.com");

            // Query all users
            System.out.println("\nAll users:");
            for (var user : queries.getUsers()) {
                System.out.printf("  [%d] %s <%s>%n", user.id(), user.name(), user.email());
            }

            // Get a specific user
            var alice = queries.getUserById(1);
            System.out.printf("%nUser with ID 1: %s%n", alice.name());

            // Count users (demonstrates :pluck modifier)
            var count = queries.countUsers();
            System.out.printf("Total users: %d%n", count);

            // Insert some posts
            System.out.println("\nInserting posts...");
            queries.insertPost(1, "Hello World", "My first post!", true);
            queries.insertPost(1, "Draft Post", "Work in progress...", false);
            queries.insertPost(2, "Bob's Blog", "Hello from Bob!", true);

            // Get posts by user (demonstrates array types)
            System.out.println("\nAlice's posts:");
            for (var post : queries.getPostsByUser(1)) {
                System.out.printf("  [%d] %s (tags: %s)%n",
                    post.id(), post.title(), post.tags());
            }

            // Get published posts with author (demonstrates JOIN)
            System.out.println("\nPublished posts:");
            for (var post : queries.getPublishedPosts()) {
                System.out.printf("  \"%s\" by %s%n", post.title(), post.authorName());
            }

            System.out.println("\nDone!");
        }
    }
}
