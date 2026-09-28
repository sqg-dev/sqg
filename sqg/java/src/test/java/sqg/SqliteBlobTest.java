package sqg;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import org.junit.jupiter.api.Test;
import sqg.generated.TestSqliteBlob;

class SqliteBlobTest {

    @Test
    void roundTripsBlobsAnd64BitIntegers() throws Exception {
        try (Connection conn = DriverManager.getConnection("jdbc:sqlite::memory:")) {
            TestSqliteBlob.applyMigrations(conn);
            var db = new TestSqliteBlob(conn);
            byte[] data = {0, (byte) 0xff, 0x10, 0x7f};
            long createdAt = 1_700_000_000_000L; // past Integer.MAX_VALUE
            db.putFile("a", 4L, createdAt, data);

            var file = db.getFile("a");
            assertThat(file.size()).isEqualTo(4L);
            assertThat(file.createdAt()).isEqualTo(createdAt);
            assertThat(file.data()).isEqualTo(data);
            assertThat(db.readSlice(2L, 2L, "a")).isEqualTo(new byte[] {(byte) 0xff, 0x10});
        }
    }
}
