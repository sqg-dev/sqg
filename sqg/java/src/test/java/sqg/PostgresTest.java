package sqg;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Modifier;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.stream.Stream;

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
        try (Connection conn = postgres.createConnection("")) {
            try (var stmt = conn.createStatement()) {
                stmt.execute("DROP TABLE IF EXISTS _sqg_migrations CASCADE");
                stmt.execute("DROP TABLE IF EXISTS tasks CASCADE");
                stmt.execute("DROP TABLE IF EXISTS users CASCADE");
                stmt.execute("DROP TABLE IF EXISTS bigint_test CASCADE");
                stmt.execute("DROP TYPE IF EXISTS task_status CASCADE");
            }
        }
    }

    private void applyMigrationsAndInsertTasks(Connection conn) throws SQLException {
        TestPg.applyMigrations(conn);

        try (var stmt = conn.createStatement()) {
            stmt.execute("""
                INSERT INTO tasks (title, status, tags, priority_scores) VALUES
                    ('Task 1', 'active', ARRAY['urgent', 'backend'], ARRAY[10, 20, 30]),
                    ('Task 2', 'pending', ARRAY['frontend'], ARRAY[5, 15])
                """);
        }
    }

    @Test
    void testAllQueries() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            applyMigrationsAndInsertTasks(conn);

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
            applyMigrationsAndInsertTasks(conn);

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

    @Test
    void testStreamReturnsAllRows() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            applyMigrationsAndInsertTasks(conn);

            // Stream should return same data as List
            List<TestPg.GetAllTasksResult> listResult = pg.getAllTasks();
            List<TestPg.GetAllTasksResult> streamResult;
            try (Stream<TestPg.GetAllTasksResult> stream = pg.getAllTasksStream()) {
                streamResult = stream.toList();
            }
            assertThat(streamResult).isEqualTo(listResult);
            assertThat(streamResult).hasSize(2);

            // Stream with parameters
            List<TestPg.GetTasksByStatusResult> listByStatus = pg.getTasksByStatus("active");
            List<TestPg.GetTasksByStatusResult> streamByStatus;
            try (Stream<TestPg.GetTasksByStatusResult> stream = pg.getTasksByStatusStream("active")) {
                streamByStatus = stream.toList();
            }
            assertThat(streamByStatus).isEqualTo(listByStatus);
            assertThat(streamByStatus).hasSize(1);
        }
    }

    @Test
    void testStreamClosesResources() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            // Closing a stream without consuming should not throw
            Stream<TestPg.GetAllTasksResult> stream = pg.getAllTasksStream();
            stream.close();
        }
    }
}
