package sqg;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Modifier;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;

import sqg.generated.TestDuckdb;

class DuckDbTest {
    private static final Class<?> driver = org.duckdb.DuckDBDriver.class;

    @Test
    void test() throws SQLException {
        Connection conn = DriverManager.getConnection("jdbc:duckdb:");
        TestDuckdb duckdb = new TestDuckdb(conn);
        TestDuckdb.applyMigrations(conn);

        for (var method : duckdb.getClass().getMethods()) {
            if (method.getParameterCount() == 0 && Modifier.isPublic(method.getModifiers())
                && !Modifier.isStatic(method.getModifiers())
                && method.getDeclaringClass() == duckdb.getClass()) {
                try {
                    var result = method.invoke(duckdb);
                    System.out.println("Calling: " + method.getName() + " -> " + result);
                } catch (Exception e) {
                    System.err.println(
                        "Error calling: " + method.getName() + " -> " + e.getCause());
                }
            }
        }

    }

    @Test
    void test2() throws SQLException {
        Connection conn = DriverManager.getConnection("jdbc:duckdb:");
        TestDuckdb duckdb = new TestDuckdb(conn);

        assertThat(duckdb.testNested3().toString()).isEqualTo(
            "TestNested3Result[a=[1, 2, 3], b=2, c=CResult[x=[XResult[a=1]], y=YResult[z=3]]]");

    }

    @Test
    void streamReturnsAllRows() throws SQLException {
        Connection conn = DriverManager.getConnection("jdbc:duckdb:");
        TestDuckdb duckdb = new TestDuckdb(conn);
        TestDuckdb.applyMigrations(conn);

        // Compare stream results with list results
        List<TestDuckdb.AllResult> listResult = duckdb.all();
        List<TestDuckdb.AllResult> streamResult;
        try (Stream<TestDuckdb.AllResult> stream = duckdb.allStream()) {
            streamResult = stream.toList();
        }
        assertThat(streamResult).isEqualTo(listResult);
    }

    @Test
    void streamSupportsLazyOperations() throws SQLException {
        Connection conn = DriverManager.getConnection("jdbc:duckdb:");
        TestDuckdb duckdb = new TestDuckdb(conn);
        TestDuckdb.applyMigrations(conn);

        // Stream with filter and limit - exercises lazy evaluation
        try (Stream<TestDuckdb.AllResult> stream = duckdb.allStream()) {
            List<String> names = stream
                .map(TestDuckdb.AllResult::name)
                .limit(2)
                .toList();
            assertThat(names).hasSize(Math.min(2, duckdb.all().size()));
        }
    }

    @Test
    void insertEventWithArrayParam() throws SQLException {
        Connection conn = DriverManager.getConnection("jdbc:duckdb:");
        TestDuckdb duckdb = new TestDuckdb(conn);
        TestDuckdb.applyMigrations(conn);

        // Insert rows using setArray for TEXT[] parameter
        duckdb.insertEvent(1, "event1", List.of("tag1", "tag2"));
        duckdb.insertEvent(2, "event2", List.of());

        List<TestDuckdb.AllEventsResult> events = duckdb.allEvents();
        assertThat(events).hasSize(2);

        assertThat(events.get(0).id()).isEqualTo(1);
        assertThat(events.get(0).name()).isEqualTo("event1");
        assertThat(events.get(0).tags()).containsExactly("tag1", "tag2");

        assertThat(events.get(1).id()).isEqualTo(2);
        assertThat(events.get(1).name()).isEqualTo("event2");
        assertThat(events.get(1).tags()).isEmpty();
    }

    @Test
    void appenderWithTimestamptz() throws SQLException {
        Connection conn = DriverManager.getConnection("jdbc:duckdb:");
        TestDuckdb duckdb = new TestDuckdb(conn);
        TestDuckdb.applyMigrations(conn);

        // Appender accepts OffsetDateTime for TIMESTAMPTZ columns
        var ts1 = OffsetDateTime.of(2025, 1, 15, 10, 30, 0, 0, ZoneOffset.UTC);
        var ts2 = OffsetDateTime.of(2025, 6, 1, 0, 0, 0, 0, ZoneOffset.UTC);
        try (var appender = duckdb.createLogEntriesAppender()) {
            appender.append(1, "hello", ts1);
            appender.append(new TestDuckdb.LogEntriesRow(2, "world", ts2));
        }

        // Verify data was inserted and read back as OffsetDateTime via generated query
        var rows = duckdb.allLogEntries();
        assertThat(rows).hasSize(2);
        assertThat(rows.get(0).id()).isEqualTo(1);
        assertThat(rows.get(0).message()).isEqualTo("hello");
        assertThat(rows.get(0).createdAt()).isEqualTo(ts1);
        assertThat(rows.get(1).id()).isEqualTo(2);
        assertThat(rows.get(1).message()).isEqualTo("world");
        assertThat(rows.get(1).createdAt()).isEqualTo(ts2);
    }

    @Test
    void queryTimestamptzReturnsOffsetDateTime() throws SQLException {
        Connection conn = DriverManager.getConnection("jdbc:duckdb:");
        TestDuckdb duckdb = new TestDuckdb(conn);
        TestDuckdb.applyMigrations(conn);

        var ts = OffsetDateTime.of(2025, 3, 20, 14, 0, 0, 0, ZoneOffset.UTC);
        try (var appender = duckdb.createLogEntriesAppender()) {
            appender.append(1, "test", ts);
        }

        // Read back via generated query and verify the type is OffsetDateTime
        var rows = duckdb.allLogEntries();
        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).createdAt()).isInstanceOf(OffsetDateTime.class);
        assertThat(rows.get(0).createdAt()).isEqualTo(ts);
    }

    @Test
    void enumInsertAndRoundTrip() throws SQLException {
        Connection conn = DriverManager.getConnection("jdbc:duckdb:");
        TestDuckdb duckdb = new TestDuckdb(conn);
        TestDuckdb.applyMigrations(conn);

        // Insert with enum parameter
        duckdb.insertTask(1, "Important Task", TestDuckdb.TaskPriority.HIGH);
        duckdb.insertTask(2, "Minor Task", TestDuckdb.TaskPriority.LOW);

        // Read back all tasks
        var allTasks = duckdb.getAllTasks();
        assertThat(allTasks).hasSize(2);
        assertThat(allTasks.get(0).priority()).isEqualTo(TestDuckdb.TaskPriority.HIGH);
        assertThat(allTasks.get(1).priority()).isEqualTo(TestDuckdb.TaskPriority.LOW);

        // Query by enum parameter
        var highTasks = duckdb.getTasksByPriority(TestDuckdb.TaskPriority.HIGH);
        assertThat(highTasks).hasSize(1);
        assertThat(highTasks.getFirst().title()).isEqualTo("Important Task");
        assertThat(highTasks.getFirst().priority()).isEqualTo(TestDuckdb.TaskPriority.HIGH);
    }

    @Test
    void enumAllValues() {
        // Verify all enum values exist and map correctly
        assertThat(TestDuckdb.TaskPriority.values()).hasSize(4);
        assertThat(TestDuckdb.TaskPriority.fromValue("low")).isEqualTo(TestDuckdb.TaskPriority.LOW);
        assertThat(TestDuckdb.TaskPriority.fromValue("medium")).isEqualTo(TestDuckdb.TaskPriority.MEDIUM);
        assertThat(TestDuckdb.TaskPriority.fromValue("high")).isEqualTo(TestDuckdb.TaskPriority.HIGH);
        assertThat(TestDuckdb.TaskPriority.fromValue("critical")).isEqualTo(TestDuckdb.TaskPriority.CRITICAL);

        // getValue round-trips
        for (var v : TestDuckdb.TaskPriority.values()) {
            assertThat(TestDuckdb.TaskPriority.fromValue(v.getValue())).isEqualTo(v);
        }
    }

    @Test
    void enumFromValueThrowsOnUnknown() {
        org.assertj.core.api.Assertions.assertThatThrownBy(
                () -> TestDuckdb.TaskPriority.fromValue("nonexistent"))
            .isInstanceOf(IllegalArgumentException.class)
            .hasMessageContaining("Unknown value: nonexistent");
    }

    @Test
    void streamClosesResources() throws SQLException {
        Connection conn = DriverManager.getConnection("jdbc:duckdb:");
        TestDuckdb duckdb = new TestDuckdb(conn);
        TestDuckdb.applyMigrations(conn);

        // Verify stream can be closed without consuming all rows
        Stream<TestDuckdb.AllResult> stream = duckdb.allStream();
        stream.close(); // should not throw

        // Verify pluck stream works too
        try (Stream<String> emailStream = duckdb.allEmailsStream()) {
            List<String> emails = emailStream.toList();
            assertThat(emails).isEqualTo(duckdb.allEmails());
        }
    }
}
