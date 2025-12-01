package sqg;

import org.apache.arrow.vector.table.Table;
import org.duckdb.DuckDBConnection;
import org.junit.jupiter.api.Test;
import sqg.generated.TestDuckDbArrow;
import sqg.generated.TestDuckdb;

import java.io.IOException;
import java.lang.reflect.Modifier;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class DuckDbArrowTest {
    private static final Class<?> driver = org.duckdb.DuckDBDriver.class;


    DuckDbArrowTest() throws SQLException {
    }

    private final DuckDBConnection conn = (DuckDBConnection) DriverManager.getConnection("jdbc:duckdb:");
    private final TestDuckDbArrow duckdb = new TestDuckDbArrow(conn);


    @Test
    void test() throws SQLException {

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
}
