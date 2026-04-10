package sqg;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.lang.reflect.Modifier;
import java.io.IOException;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
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
                stmt.execute("DROP TABLE IF EXISTS all_types_test CASCADE");
                stmt.execute("DROP TABLE IF EXISTS identity_test CASCADE");
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
    void testBulkInsertWithPgBulkInsert() throws SQLException, IOException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            // Bulk insert using PgBulkInsert COPY BINARY
            // serial_id (BIGSERIAL) is excluded — PostgreSQL auto-generates it
            var rows = List.of(
                    new TestPg.BigintTestRow(1L, (short) 42, 100, 9999999999L, "alice"),
                    new TestPg.BigintTestRow(2L, (short) -100, null, 0L, "bob"),
                    new TestPg.BigintTestRow(3L, null, 300, 123L, "carol"));

            pg.bulkInsertBigintTestRow(rows);

            // Verify all rows inserted correctly
            var r1 = pg.getBigintRecord(1L);
            assertThat(r1).isNotNull();
            assertThat(r1.smallId()).isEqualTo((short) 42);
            assertThat(r1.regularId()).isEqualTo(100);
            assertThat(r1.amount()).isEqualTo(9999999999L);
            assertThat(r1.name()).isEqualTo("alice");

            var r2 = pg.getBigintRecord(2L);
            assertThat(r2).isNotNull();
            assertThat(r2.smallId()).isEqualTo((short) -100);
            assertThat(r2.regularId()).isNull();
            assertThat(r2.amount()).isEqualTo(0L);

            var r3 = pg.getBigintRecord(3L);
            assertThat(r3).isNotNull();
            assertThat(r3.smallId()).isNull();
            assertThat(r3.regularId()).isEqualTo(300);
        }
    }

    @Test
    void testBulkInsertWithSpecialCharacters() throws SQLException, IOException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            // PgBulkInsert uses COPY BINARY — special characters are handled natively
            var rows = List.of(
                    new TestPg.BigintTestRow(1L, (short) 1, 1, 1L, "hello\tworld"),
                    new TestPg.BigintTestRow(2L, (short) 2, 2, 2L, "line1\nline2"),
                    new TestPg.BigintTestRow(3L, (short) 3, 3, 3L, "back\\slash"));

            pg.bulkInsertBigintTestRow(rows);

            assertThat(pg.getBigintRecord(1L).name()).isEqualTo("hello\tworld");
            assertThat(pg.getBigintRecord(2L).name()).isEqualTo("line1\nline2");
            assertThat(pg.getBigintRecord(3L).name()).isEqualTo("back\\slash");
        }
    }

    @Test
    void testBulkInsertMany() throws SQLException, IOException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            var rows = List.of(
                    new TestPg.BigintTestRow(1L, (short) 10, 100, 1000L, "row1"),
                    new TestPg.BigintTestRow(2L, (short) 20, 200, 2000L, "row2"),
                    new TestPg.BigintTestRow(3L, (short) 30, 300, 3000L, "row3"));

            pg.bulkInsertBigintTestRow(rows);

            assertThat(pg.countBigintTest()).isEqualTo(3L);
            assertThat(pg.getBigintRecord(2L).name()).isEqualTo("row2");
        }
    }

    @Test
    void testBulkInsertTasksWithArrays() throws SQLException, IOException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            // Bulk insert tasks with TEXT[] and INTEGER[] columns
            // SERIAL id is excluded — PostgreSQL auto-generates it
            var rows = List.of(
                    new TestPg.TasksRow("Task A", "active",
                            List.of("urgent", "backend"), List.of(10, 20, 30)),
                    new TestPg.TasksRow("Task B", "pending",
                            List.of("frontend"), List.of(5)),
                    new TestPg.TasksRow("Task C", "completed",
                            null, null));

            pg.bulkInsertTasksRow(rows);

            var allTasks = pg.getAllTasks();
            assertThat(allTasks).hasSize(3);
            assertThat(allTasks.get(0).tags()).containsExactly("urgent", "backend");
            assertThat(allTasks.get(0).priorityScores()).containsExactly(10, 20, 30);
            assertThat(allTasks.get(1).tags()).containsExactly("frontend");
            assertThat(allTasks.get(2).tags()).isNull();
            assertThat(allTasks.get(2).priorityScores()).isNull();
        }
    }

    @Test
    void testBulkInsertWithSerialColumn() throws SQLException, IOException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            // SERIAL column (id) is excluded from the row type — PostgreSQL auto-generates it
            var rows = List.of(
                    new TestPg.TasksRow("Task A", "active", null, null),
                    new TestPg.TasksRow("Task B", "pending", null, null));

            pg.bulkInsertTasksRow(rows);

            // INSERT after COPY — sequence is in sync since COPY didn't touch it
            pg.insertTask("Task C", TestPg.TaskStatus.COMPLETED, List.of("test"), List.of(1));

            var allTasks = pg.getAllTasks();
            assertThat(allTasks).hasSize(3);
            assertThat(allTasks.get(0).title()).isEqualTo("Task A");
            assertThat(allTasks.get(2).title()).isEqualTo("Task C");
        }
    }

    @Test
    void testBulkInsertWithIdentityColumn() throws SQLException, IOException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            // IDENTITY column (id) is excluded from the row type — PostgreSQL auto-generates it
            var rows = List.of(
                    new TestPg.IdentityTestRow("alice", 10),
                    new TestPg.IdentityTestRow("bob", 20),
                    new TestPg.IdentityTestRow("carol", null));

            pg.bulkInsertIdentityTestRow(rows);

            // Verify IDENTITY column was auto-generated
            var results = pg.getIdentityRecords();
            assertThat(results).hasSize(3);
            assertThat(results.get(0).id()).isEqualTo(1);
            assertThat(results.get(0).name()).isEqualTo("alice");
            assertThat(results.get(1).id()).isEqualTo(2);
            assertThat(results.get(2).id()).isEqualTo(3);
            assertThat(results.get(2).value()).isNull();
        }
    }

    @Test
    void testBulkInsertAllTypes() throws SQLException, IOException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            var uuid = UUID.fromString("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
            var now = OffsetDateTime.of(2025, 6, 15, 10, 30, 0, 0, ZoneOffset.UTC);
            // SERIAL id is excluded — PostgreSQL auto-generates it
            var rows = List.of(
                    new TestPg.AllTypesTestRow(
                            true,                          // bool_val
                            (short) 42,                    // small_val
                            12345,                         // int_val
                            9999999999L,                   // big_val
                            3.14f,                         // real_val
                            2.718281828,                   // double_val
                            new BigDecimal("99999.99"),    // numeric_val
                            "hello world",                 // text_val
                            "varchar value",               // varchar_val
                            LocalDate.of(2025, 6, 15),    // date_val
                            LocalDateTime.of(2025, 6, 15, 10, 30, 0),  // ts_val
                            now,                           // tstz_val
                            uuid,                          // uuid_val
                            "{\"key\": \"value\"}",        // json_val
                            List.of(1, 2, 3),              // int_arr
                            List.of("a", "b", "c"),        // text_arr
                            List.of(100L, 200L, 300L)      // big_arr
                    ),
                    new TestPg.AllTypesTestRow(
                            null, null, null, null, null, null,
                            null, null, null, null, null, null, null,
                            null, null, null, null  // all nullable columns null
                    ));

            pg.bulkInsertAllTypesTestRow(rows);

            // Verify first row with all types populated
            var r1 = pg.getAllTypesRecord(1);
            assertThat(r1).isNotNull();
            assertThat(r1.boolVal()).isTrue();
            assertThat(r1.smallVal()).isEqualTo((short) 42);
            assertThat(r1.intVal()).isEqualTo(12345);
            assertThat(r1.bigVal()).isEqualTo(9999999999L);
            assertThat(r1.realVal()).isEqualTo(3.14f);
            assertThat(r1.doubleVal()).isCloseTo(2.718281828, org.assertj.core.api.Assertions.within(0.000001));
            assertThat(r1.numericVal()).isEqualByComparingTo(new BigDecimal("99999.99"));
            assertThat(r1.textVal()).isEqualTo("hello world");
            assertThat(r1.varcharVal()).isEqualTo("varchar value");
            assertThat(r1.dateVal()).isEqualTo(LocalDate.of(2025, 6, 15));
            assertThat(r1.uuidVal()).isEqualTo(uuid);
            assertThat(r1.jsonVal()).isEqualTo("{\"key\": \"value\"}");
            assertThat(r1.intArr()).containsExactly(1, 2, 3);
            assertThat(r1.textArr()).containsExactly("a", "b", "c");
            assertThat(r1.bigArr()).containsExactly(100L, 200L, 300L);

            // Verify second row with all nulls
            var r2 = pg.getAllTypesRecord(2);
            assertThat(r2).isNotNull();
            assertThat(r2.boolVal()).isNull();
            assertThat(r2.smallVal()).isNull();
            assertThat(r2.intArr()).isNull();
            assertThat(r2.textArr()).isNull();
        }
    }

    @Test
    void testSmallintInsertAndSelect() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            // Insert a record with a smallint value
            pg.insertBigintRecord(1L, (short) 42, 100, 9999999999L, "test");

            // Select it back — this previously threw ClassCastException
            // because PostgreSQL JDBC returns Integer for smallint columns
            var result = pg.getBigintRecord(1L);
            assertThat(result).isNotNull();
            assertThat(result.smallId()).isEqualTo((short) 42);
            assertThat(result.regularId()).isEqualTo(100);
            assertThat(result.amount()).isEqualTo(9999999999L);
            assertThat(result.name()).isEqualTo("test");

            // Test null smallint
            pg.insertBigintRecord(2L, null, null, 0L, "null-test");
            var nullResult = pg.getBigintRecord(2L);
            assertThat(nullResult).isNotNull();
            assertThat(nullResult.smallId()).isNull();
            assertThat(nullResult.regularId()).isNull();
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
    void testBatchInsertMultipleParams() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            // Batch insert multiple users using the generated record
            var params = List.of(
                    new TestPg.InsertUserParams("1", "Alice", "alice@example.com"),
                    new TestPg.InsertUserParams("2", "Bob", "bob@example.com"),
                    new TestPg.InsertUserParams("3", "Carol", null));

            int[] results = pg.insertUserBatch(params);
            assertThat(results).hasSize(3);
            for (int r : results) {
                assertThat(r).isEqualTo(1);
            }

            // Verify all rows were inserted
            var users = pg.users1();
            assertThat(users).hasSize(3);
        }
    }

    @Test
    void testBatchInsertSingleEnumParam() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            // Batch insert with single enum parameter (no record, just Iterable<TrickyEnum>)
            int[] results = pg.insertTrickyBatch(
                    List.of(TestPg.TrickyEnum.HELLO, TestPg.TrickyEnum.HELLO_2, TestPg.TrickyEnum._HELLO));

            assertThat(results).hasSize(3);

            var values = pg.getTrickyValues();
            assertThat(values).hasSize(3);
            assertThat(values.stream().map(TestPg.GetTrickyValuesResult::val).toList())
                    .containsExactly(
                            TestPg.TrickyEnum.HELLO,
                            TestPg.TrickyEnum.HELLO_2,
                            TestPg.TrickyEnum._HELLO);
        }
    }

    @Test
    void testBatchInsertWithArraysAndEnum() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            // Batch insert tasks with array params (List<String>, List<Integer>) and enum param
            var params = List.of(
                    new TestPg.InsertTaskParams("Task A", TestPg.TaskStatus.ACTIVE,
                            List.of("urgent", "backend"), List.of(10, 20)),
                    new TestPg.InsertTaskParams("Task B", TestPg.TaskStatus.PENDING,
                            List.of("frontend"), List.of(5)));

            int[] results = pg.insertTaskBatch(params);
            assertThat(results).hasSize(2);

            var tasks = pg.getAllTasks();
            assertThat(tasks).hasSize(2);
            assertThat(tasks.get(0).title()).isEqualTo("Task A");
            assertThat(tasks.get(0).status()).isEqualTo(TestPg.TaskStatus.ACTIVE);
            assertThat(tasks.get(0).tags()).containsExactly("urgent", "backend");
            assertThat(tasks.get(0).priorityScores()).containsExactly(10, 20);
            assertThat(tasks.get(1).title()).isEqualTo("Task B");
            assertThat(tasks.get(1).tags()).containsExactly("frontend");
        }
    }

    @Test
    void testBatchInsertWithNumericTypes() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            // Batch insert with Long, Short, Integer params
            var params = List.of(
                    new TestPg.InsertBigintRecordParams(1L, (short) 42, 100, 9999999999L, "alice"),
                    new TestPg.InsertBigintRecordParams(2L, null, null, 0L, "bob"));

            int[] results = pg.insertBigintRecordBatch(params);
            assertThat(results).hasSize(2);

            var r1 = pg.getBigintRecord(1L);
            assertThat(r1).isNotNull();
            assertThat(r1.smallId()).isEqualTo((short) 42);
            assertThat(r1.regularId()).isEqualTo(100);
            assertThat(r1.amount()).isEqualTo(9999999999L);

            var r2 = pg.getBigintRecord(2L);
            assertThat(r2).isNotNull();
            assertThat(r2.smallId()).isNull();
            assertThat(r2.regularId()).isNull();
        }
    }

    @Test
    void testBatchInsertWithUuid() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            UUID id1 = UUID.fromString("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
            UUID id2 = UUID.fromString("b1ffcd00-1d1c-5ff9-cc7e-7ccaae491b22");

            var params = List.of(
                    new TestPg.InsertUuidParams(id1, "first"),
                    new TestPg.InsertUuidParams(id2, "second"));

            int[] results = pg.insertUuidBatch(params);
            assertThat(results).hasSize(2);

            assertThat(pg.getUuidById(id1).label()).isEqualTo("first");
            assertThat(pg.getUuidById(id2).label()).isEqualTo("second");
        }
    }

    @Test
    void testBatchUpdate() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            // Insert some users first
            pg.insertUserBatch(List.of(
                    new TestPg.InsertUserParams("1", "Alice", "alice@old.com"),
                    new TestPg.InsertUserParams("2", "Bob", "bob@old.com"),
                    new TestPg.InsertUserParams("3", "Carol", "carol@old.com")));

            // Batch update emails (record order matches @set declaration order: id, email)
            int[] results = pg.updateUserEmailBatch(List.of(
                    new TestPg.UpdateUserEmailParams("1", "alice@new.com"),
                    new TestPg.UpdateUserEmailParams("3", "carol@new.com")));

            assertThat(results).hasSize(2);
            assertThat(results).containsExactly(1, 1);

            var users = pg.users1();
            assertThat(users).hasSize(3);
            var byId = new java.util.HashMap<String, String>();
            for (var u : users) {
                byId.put(u.id(), u.email());
            }
            assertThat(byId.get("1")).isEqualTo("alice@new.com");
            assertThat(byId.get("2")).isEqualTo("bob@old.com");
            assertThat(byId.get("3")).isEqualTo("carol@new.com");
        }
    }

    @Test
    void testBatchDelete() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            // Insert some users first
            pg.insertUserBatch(List.of(
                    new TestPg.InsertUserParams("1", "Alice", null),
                    new TestPg.InsertUserParams("2", "Bob", null),
                    new TestPg.InsertUserParams("3", "Carol", null)));

            // Batch delete two of them
            int[] results = pg.deleteUserBatch(List.of("1", "3"));

            assertThat(results).hasSize(2);
            assertThat(results).containsExactly(1, 1);

            var users = pg.users1();
            assertThat(users).hasSize(1);
            assertThat(users.getFirst().id()).isEqualTo("2");
        }
    }

    @Test
    void testBatchInsertEmpty() throws SQLException {
        try (Connection conn = postgres.createConnection("")) {
            TestPg pg = new TestPg(conn);
            TestPg.applyMigrations(conn);

            // Batch insert with empty iterable should return empty array
            int[] results = pg.insertUserBatch(List.of());
            assertThat(results).isEmpty();

            assertThat(pg.users1()).isEmpty();
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
