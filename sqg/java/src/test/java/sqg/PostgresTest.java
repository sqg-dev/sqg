package sqg;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Modifier;
import java.sql.Connection;
import java.sql.SQLException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import sqg.generated.TestPg;

@Testcontainers
class PostgresTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("sqg-db")
            .withUsername("sqg")
            .withPassword("secret");

    @BeforeEach
    void setUp() throws SQLException {
        // Clean up database before each test
        try (Connection conn = postgres.createConnection("")) {
            try (var stmt = conn.createStatement()) {
                stmt.execute("DROP TABLE IF EXISTS tasks CASCADE");
                stmt.execute("DROP TABLE IF EXISTS users CASCADE");
                stmt.execute("DROP TYPE IF EXISTS task_status CASCADE");
            }
        }
    }

    @Test
    void testAllQueries() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);

            // Run migrations
            TestPg.getMigrations().forEach(m -> {
                try (var stmt = conn.createStatement()) {
                    stmt.execute(m);
                } catch (SQLException e) {
                    throw new RuntimeException(e);
                }
            });

            // Insert test data
            try (var stmt = conn.createStatement()) {
                stmt.execute("""
                    INSERT INTO tasks (title, status, tags, priority_scores) VALUES
                        ('Task 1', 'active', ARRAY['urgent', 'backend'], ARRAY[10, 20, 30]),
                        ('Task 2', 'pending', ARRAY['frontend'], ARRAY[5, 15])
                    """);
            }

            // Test all no-arg public methods via reflection
            for (var method : pg.getClass().getMethods()) {
                if (method.getParameterCount() == 0 && Modifier.isPublic(method.getModifiers())
                        && !Modifier.isStatic(method.getModifiers())
                        && method.getDeclaringClass() == pg.getClass()) {
                    try {
                        var result = method.invoke(pg);
                        System.out.println("Calling: " + method.getName() + " -> " + result);
                    } catch (Exception e) {
                        System.err.println("Error calling: " + method.getName() + " -> " + e.getCause());
                    }
                }
            }
        }
    }

    @Test
    void testEnumAndArrayTypes() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);

            // Run migrations
            TestPg.getMigrations().forEach(m -> {
                try (var stmt = conn.createStatement()) {
                    stmt.execute(m);
                } catch (SQLException e) {
                    throw new RuntimeException(e);
                }
            });

            // Insert test data
            try (var stmt = conn.createStatement()) {
                stmt.execute("""
                    INSERT INTO tasks (title, status, tags, priority_scores) VALUES
                        ('Task 1', 'active', ARRAY['urgent', 'backend'], ARRAY[10, 20, 30]),
                        ('Task 2', 'pending', ARRAY['frontend'], ARRAY[5, 15])
                    """);
            }

            // Test ENUM type query
            var tasksByStatus = pg.getTasksByStatus("active");
            assertThat(tasksByStatus).hasSize(1);
            assertThat(tasksByStatus.getFirst().title()).isEqualTo("Task 1");
            assertThat(tasksByStatus.getFirst().status()).isEqualTo("active");

            // Test array columns
            assertThat(tasksByStatus.getFirst().tags()).containsExactly("urgent", "backend");
            assertThat(tasksByStatus.getFirst().priorityScores()).containsExactly(10, 20, 30);

            // Test get all tasks
            var allTasks = pg.getAllTasks();
            assertThat(allTasks).hasSize(2);

            // Test pluck array column
            var tags = pg.getTaskTags();
            assertThat(tags).containsExactly("urgent", "backend");

            var priorities = pg.getTaskPriorities();
            assertThat(priorities).containsExactly(10, 20, 30);
        }
    }
}
