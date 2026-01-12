package sqg;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.lang.reflect.Modifier;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

import org.duckdb.DuckDBConnection;
import org.junit.jupiter.api.Test;

import sqg.generated.TestDuckDbArrow;
import sqg.generated.TestDuckdb;

class DuckDbArrowTest {
    private static final Class<?> driver = org.duckdb.DuckDBDriver.class;

    DuckDbArrowTest() throws SQLException {
    }

    private final DuckDBConnection conn = (DuckDBConnection) DriverManager.getConnection(
        "jdbc:duckdb:");
    private final TestDuckDbArrow duckdb = new TestDuckDbArrow(conn);

    @Test
    void test() {

        TestDuckdb.getMigrations().forEach(m -> {
            try (var stmt = conn.createStatement()) {
                stmt.execute(m);
            } catch (SQLException e) {
                throw new RuntimeException(e);
            }
        });

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
    void test2() throws SQLException, IOException {
        var stmt = conn.createStatement();
        conn.setAutoCommit(true);
        for (var migration : TestDuckDbArrow.getMigrations()) {
            stmt.execute(migration);
        }
        for (int i = 0; i < 100; i++) {
            duckdb.insert("name" + i, "email" + i);
        }

        try (var result = duckdb.all()) {
            result.loadNextBatch();
            assertThat(result.getRowCount()).isEqualTo(100);
            assertThat(result.email().getObject(5).toString()).isEqualTo("email5");
        }

        try (var result = duckdb.test5()) {
            result.loadNextBatch();
            assertThat(result.getRowCount()).isEqualTo(1);
            assertThat(result.x().getObject(0).toString()).isEqualTo("a \t");
        }

    }

    @Test
    void testListTypes() throws SQLException, IOException {
        var stmt = conn.createStatement();
        conn.setAutoCommit(true);

        // Run migrations (includes events table with varchar[] column)
        for (var migration : TestDuckDbArrow.getMigrations()) {
            stmt.execute(migration);
        }

        // Insert test data with array values
        stmt.execute(
            "INSERT INTO events (id, name, tags) VALUES (1, 'pageview', ['web', 'mobile'])");
        stmt.execute("INSERT INTO events (id, name, tags) VALUES (2, 'click', ['web'])");

        // Test all_events query with list column
        try (var result = duckdb.allEvents()) {
            result.loadNextBatch();
            assertThat(result.getRowCount()).isEqualTo(2);
            assertThat(result.name().getObject(0).toString()).isEqualTo("pageview");
            // Verify tags column exists and is a ListVector
            assertThat(result.tags()).isNotNull();
        }

        // Test events_with_tag query filtering by list contents
        try (var result = duckdb.eventsWithTag("web")) {
            result.loadNextBatch();
            assertThat(result.getRowCount()).isEqualTo(2); // Both events have 'web' tag
        }

        try (var result = duckdb.eventsWithTag("mobile")) {
            result.loadNextBatch();
            assertThat(result.getRowCount()).isEqualTo(1); // Only pageview has 'mobile' tag
            assertThat(result.tags().getObject(0)).isInstanceOfAny(ArrayList.class);
            assertThat(result.tags().getObject(0).size()).isEqualTo(2);
            assertThat(result.tags().getObject(0).get(0)).isInstanceOf(
                org.apache.arrow.vector.util.Text.class);
            assertThat(result.tags().getObject(0).get(0).toString()).isEqualTo("web");
            assertThat(result.tags().getObject(0).get(1).toString()).isEqualTo("mobile");
        }
    }
}
