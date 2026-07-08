package sqg;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import sqg.generated.SqgObserver;
import sqg.generated.TestObserver;

/**
 * Runtime behavior of the {@code observer: true} instrumentation seam:
 * the observer is invoked around every QUERY/EXEC/:batch/stream, with the
 * logical query name, the affected/returned row count, and any error.
 */
class ObserverTest {

    /** Records "start:<name>" and "end:<name> rows=<n> err=<Type|none>" for each op. */
    private static final class Recorder implements SqgObserver {
        final List<String> events = new ArrayList<>();

        @Override
        public Scope start(String queryName) {
            events.add("start:" + queryName);
            return (rowCount, error) ->
                events.add("end:" + queryName + " rows=" + rowCount
                    + " err=" + (error == null ? "none" : error.getClass().getSimpleName()));
        }
    }

    private static Connection newDb() throws SQLException {
        Connection conn = DriverManager.getConnection("jdbc:duckdb:");
        TestObserver.applyMigrations(conn);
        return conn;
    }

    @Test
    void observesQueryExecBatchAndStream() throws SQLException {
        var rec = new Recorder();
        try (Connection conn = newDb()) {
            var db = new TestObserver(conn, rec);

            assertThat(db.insertUser(1, "alice", "a@b.c")).isEqualTo(1);
            assertThat(db.insertUserBatchBatch(List.of(
                new TestObserver.InsertUserBatchParams(2, "bob", "b@b.c"),
                new TestObserver.InsertUserBatchParams(3, "carol", "c@b.c")))).hasSize(2);

            assertThat(db.allUsers()).hasSize(3);
            assertThat(db.userById(1).name()).isEqualTo("alice");
            assertThat(db.userById(999)).isNull();
            assertThat(db.nameById(1)).isEqualTo("alice");

            try (var stream = db.allUsersStream()) {
                assertThat(stream.count()).isEqualTo(3);
            }
        }

        assertThat(rec.events).containsExactly(
            "start:insertUser",
            "end:insertUser rows=1 err=none",
            "start:insertUserBatchBatch",
            "end:insertUserBatchBatch rows=2 err=none",
            "start:allUsers",
            "end:allUsers rows=3 err=none",
            "start:userById",
            "end:userById rows=1 err=none",
            "start:userById",
            "end:userById rows=0 err=none",
            "start:nameById",
            "end:nameById rows=1 err=none",
            // stream end fires on close (after count()), timed to completion
            "start:allUsersStream",
            "end:allUsersStream rows=3 err=none");
    }

    @Test
    void reportsErrorAndStillEnds() throws SQLException {
        var rec = new Recorder();
        Connection conn = newDb();
        var db = new TestObserver(conn, rec);
        conn.close(); // force the next operation to fail

        assertThatThrownBy(db::allUsers).isInstanceOf(SQLException.class);

        assertThat(rec.events).containsExactly(
            "start:allUsers",
            "end:allUsers rows=-1 err=SQLException");
    }

    @Test
    void noObserverConstructorIsANoOp() throws SQLException {
        try (Connection conn = newDb()) {
            var db = new TestObserver(conn); // observer defaults to null
            assertThat(db.insertUser(1, "alice", "a@b.c")).isEqualTo(1);
            assertThat(db.allUsers()).hasSize(1);
        }
    }
}
