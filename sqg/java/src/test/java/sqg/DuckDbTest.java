package sqg;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Modifier;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;

import org.junit.jupiter.api.Test;

import sqg.generated.TestDuckdb;

class DuckDbTest {
    private static final Class<?> driver = org.duckdb.DuckDBDriver.class;

    @Test
    void test() throws SQLException {
        Connection conn = DriverManager.getConnection("jdbc:duckdb:");
        TestDuckdb duckdb = new TestDuckdb(conn);

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
    void test2() throws SQLException {
        Connection conn = DriverManager.getConnection("jdbc:duckdb:");
        TestDuckdb duckdb = new TestDuckdb(conn);

        assertThat(duckdb.testNested3().toString()).isEqualTo(
            "TestNested3Result[a=[1, 2, 3], b=2, c=CResult[x=[XResult[a=1]], y=YResult[z=3]]]");

    }
}
