package sqg;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Modifier;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.UUID;
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
                stmt.execute("DROP TABLE IF EXISTS uuid_test CASCADE");
                stmt.execute("DROP TABLE IF EXISTS tricky_test CASCADE");
                stmt.execute("DROP TYPE IF EXISTS task_status CASCADE");
                stmt.execute("DROP TYPE IF EXISTS tricky_enum CASCADE");
            }
        }
    }

    private void applyMigrationsAndInsertTasks(Connection conn) throws SQLException {
        TestPg pg = new TestPg(conn);
        TestPg.applyMigrations(conn);

        pg.insertTask("Task 1", TestPg.TaskStatus.ACTIVE,
                List.of("urgent", "backend"), List.of(10, 20, 30));
        pg.insertTask("Task 2", TestPg.TaskStatus.PENDING,
                List.of("frontend"), List.of(5, 15));
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

            // Test ENUM type query with enum parameter
            var tasksByStatus = pg.getTasksByStatus(TestPg.TaskStatus.ACTIVE);
            assertThat(tasksByStatus).hasSize(1);
            assertThat(tasksByStatus.getFirst().title()).isEqualTo("Task 1");
            assertThat(tasksByStatus.getFirst().status()).isEqualTo(TestPg.TaskStatus.ACTIVE);

            // Test array columns
            assertThat(tasksByStatus.getFirst().tags()).containsExactly("urgent", "backend");
            assertThat(tasksByStatus.getFirst().priorityScores()).containsExactly(10, 20, 30);

            // Test get all tasks - enum columns are properly typed
            var allTasks = pg.getAllTasks();
            assertThat(allTasks).hasSize(2);
            assertThat(allTasks.get(0).status()).isEqualTo(TestPg.TaskStatus.ACTIVE);
            assertThat(allTasks.get(1).status()).isEqualTo(TestPg.TaskStatus.PENDING);

            // Test pluck array column
            var tags = pg.getTaskTags();
            assertThat(tags).containsExactly("urgent", "backend");

            var priorities = pg.getTaskPriorities();
            assertThat(priorities).containsExactly(10, 20, 30);
        }
    }

    @Test
    void testEnumInsertAndRoundTrip() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            // Insert with enum parameter
            pg.insertTask("My Task", TestPg.TaskStatus.COMPLETED,
                    List.of("tag1"), List.of(42));

            // Read back and verify enum round-trips
            var tasks = pg.getTasksByStatus(TestPg.TaskStatus.COMPLETED);
            assertThat(tasks).hasSize(1);
            assertThat(tasks.getFirst().title()).isEqualTo("My Task");
            assertThat(tasks.getFirst().status()).isEqualTo(TestPg.TaskStatus.COMPLETED);
        }
    }

    @Test
    void testEnumAllValues() {
        // Verify all enum values exist and map correctly
        assertThat(TestPg.TaskStatus.values()).hasSize(4);
        assertThat(TestPg.TaskStatus.fromValue("pending")).isEqualTo(TestPg.TaskStatus.PENDING);
        assertThat(TestPg.TaskStatus.fromValue("active")).isEqualTo(TestPg.TaskStatus.ACTIVE);
        assertThat(TestPg.TaskStatus.fromValue("completed")).isEqualTo(TestPg.TaskStatus.COMPLETED);
        assertThat(TestPg.TaskStatus.fromValue("cancelled")).isEqualTo(TestPg.TaskStatus.CANCELLED);

        // getValue round-trips
        for (var v : TestPg.TaskStatus.values()) {
            assertThat(TestPg.TaskStatus.fromValue(v.getValue())).isEqualTo(v);
        }
    }

    @Test
    void testEnumFromValueThrowsOnUnknown() {
        assertThatThrownBy(() -> TestPg.TaskStatus.fromValue("nonexistent"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Unknown value: nonexistent");
    }

    @Test
    void testTrickyEnumIdentifiers() {
        // Values that collide when sanitized to Java identifiers
        var values = TestPg.TrickyEnum.values();
        assertThat(values).hasSize(5);

        // Each fromValue returns the correct constant
        assertThat(TestPg.TrickyEnum.fromValue("hello")).isEqualTo(TestPg.TrickyEnum.HELLO);
        assertThat(TestPg.TrickyEnum.fromValue("hello").getValue()).isEqualTo("hello");

        assertThat(TestPg.TrickyEnum.fromValue("HELLO")).isEqualTo(TestPg.TrickyEnum.HELLO_2);
        assertThat(TestPg.TrickyEnum.fromValue("HELLO").getValue()).isEqualTo("HELLO");

        assertThat(TestPg.TrickyEnum.fromValue(" hello")).isEqualTo(TestPg.TrickyEnum._HELLO);
        assertThat(TestPg.TrickyEnum.fromValue(" hello").getValue()).isEqualTo(" hello");

        assertThat(TestPg.TrickyEnum.fromValue(" hello ")).isEqualTo(TestPg.TrickyEnum._HELLO_);
        assertThat(TestPg.TrickyEnum.fromValue(" hello ").getValue()).isEqualTo(" hello ");

        assertThat(TestPg.TrickyEnum.fromValue("hello_1")).isEqualTo(TestPg.TrickyEnum.HELLO_1);
        assertThat(TestPg.TrickyEnum.fromValue("hello_1").getValue()).isEqualTo("hello_1");

        // All values are distinct
        assertThat(values).doesNotHaveDuplicates();
    }

    @Test
    void testTrickyEnumRoundTrip() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            // Insert all tricky values via SQG-generated method and read them back
            pg.insertTricky(TestPg.TrickyEnum.HELLO);
            pg.insertTricky(TestPg.TrickyEnum.HELLO_2);
            pg.insertTricky(TestPg.TrickyEnum._HELLO);
            pg.insertTricky(TestPg.TrickyEnum._HELLO_);
            pg.insertTricky(TestPg.TrickyEnum.HELLO_1);

            var results = pg.getTrickyValues();
            assertThat(results).hasSize(5);
            assertThat(results.stream().map(TestPg.GetTrickyValuesResult::val).toList())
                    .containsExactly(
                            TestPg.TrickyEnum.HELLO,
                            TestPg.TrickyEnum.HELLO_2,
                            TestPg.TrickyEnum._HELLO,
                            TestPg.TrickyEnum._HELLO_,
                            TestPg.TrickyEnum.HELLO_1);
        }
    }

    @Test
    void testUuidColumnAndParameter() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            UUID id = UUID.fromString("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
            pg.insertUuid(id, "test-label");

            var result = pg.getUuidById(id);
            assertThat(result).isNotNull();
            assertThat(result.id()).isEqualTo(id);
            assertThat(result.label()).isEqualTo("test-label");
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

            // Stream with enum parameters
            List<TestPg.GetTasksByStatusResult> listByStatus = pg.getTasksByStatus(TestPg.TaskStatus.ACTIVE);
            List<TestPg.GetTasksByStatusResult> streamByStatus;
            try (Stream<TestPg.GetTasksByStatusResult> stream = pg.getTasksByStatusStream(TestPg.TaskStatus.ACTIVE)) {
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
