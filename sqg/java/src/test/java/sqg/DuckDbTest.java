package sqg;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Modifier;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
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
