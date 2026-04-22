package benchmark;

import benchmark.SensorDataGenerator.RowData;
import generated.Queries;
import generated.Queries.DeleteReadingParams;

import org.apache.arrow.c.ArrowArrayStream;
import org.apache.arrow.c.Data;
import org.apache.arrow.vector.TimeStampMicroTZVector;
import org.apache.arrow.vector.VarCharVector;
import org.apache.arrow.vector.VectorSchemaRoot;
import org.apache.arrow.vector.types.TimeUnit;
import org.apache.arrow.vector.types.pojo.ArrowType;
import org.apache.arrow.vector.types.pojo.Field;
import org.apache.arrow.vector.types.pojo.FieldType;
import org.apache.arrow.vector.types.pojo.Schema;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static benchmark.InsertMethods.*;

public class DeleteMethods {

    private static final Schema KEY_ARROW_SCHEMA = new Schema(List.of(
        new Field("device_id", FieldType.notNullable(new ArrowType.Utf8()), null),
        new Field("timestamp", FieldType.notNullable(new ArrowType.Timestamp(TimeUnit.MICROSECOND, "UTC")), null)
    ));

    /** One DELETE per row via generated single-row method. */
    public void deleteIndividual(Connection conn, Iterable<RowData> rows) throws Exception {
        inTransaction(conn, () -> {
            var queries = new Queries(conn);
            for (var r : rows) {
                queries.deleteReading(r.deviceId(), r.timestamp());
            }
        });
    }

    /** Generated `:batch` method — one round trip per chunk via addBatch/executeBatch. */
    public void deleteBatch(Connection conn, Iterable<RowData> rows) throws Exception {
        inTransaction(conn, () -> {
            var queries = new Queries(conn);
            var chunk = new ArrayList<DeleteReadingParams>(CHUNK_SIZE);
            for (var r : rows) {
                chunk.add(new DeleteReadingParams(r.deviceId(), r.timestamp()));
                if (chunk.size() == CHUNK_SIZE) {
                    queries.deleteReadingBatch(chunk);
                    chunk.clear();
                }
            }
            if (!chunk.isEmpty()) queries.deleteReadingBatch(chunk);
        });
    }

    /** Single DELETE with two UNNEST-ed list parameters, chunked. */
    public void deleteUnnest(Connection conn, Iterable<RowData> rows) throws Exception {
        var queries = new Queries(conn);
        var ids = new ArrayList<UUID>(CHUNK_SIZE);
        var ts = new ArrayList<OffsetDateTime>(CHUNK_SIZE);
        for (var r : rows) {
            ids.add(r.deviceId());
            ts.add(r.timestamp());
            if (ids.size() == CHUNK_SIZE) {
                queries.deleteReadingsUnnest(ids, ts);
                ids.clear(); ts.clear();
            }
        }
        if (!ids.isEmpty()) queries.deleteReadingsUnnest(ids, ts);
    }

    /** Stage keys as Arrow batches, DELETE with a join against each registered stream. */
    public void deleteViaArrow(Connection conn, Iterable<RowData> rows, InsertMethods im) throws Exception {
        var duckConn = (org.duckdb.DuckDBConnection) conn;
        try (var root = VectorSchemaRoot.create(KEY_ARROW_SCHEMA, im.arrowAllocator)) {
            chunked(rows, CHUNK_SIZE, chunk -> {
                root.allocateNew();
                var idVec = (VarCharVector) root.getVector("device_id");
                var tsVec = (TimeStampMicroTZVector) root.getVector("timestamp");
                for (int i = 0; i < chunk.size(); i++) {
                    var r = chunk.get(i);
                    idVec.setSafe(i, r.deviceId().toString().getBytes(StandardCharsets.UTF_8));
                    tsVec.setSafe(i, r.timestamp().toInstant().toEpochMilli() * 1000);
                }
                root.setRowCount(chunk.size());

                String name = "arrow_del_" + (im.arrowStreamCounter++);
                try (var stream = ArrowArrayStream.allocateNew(im.arrowAllocator)) {
                    var reader = new InsertMethods.VectorSchemaRootReader(im.arrowAllocator, root);
                    Data.exportArrayStream(im.arrowAllocator, reader, stream);
                    duckConn.registerArrowStream(name, stream);
                    try (var stmt = duckConn.createStatement()) {
                        stmt.execute(String.format("""
                            DELETE FROM sensor_readings s
                            USING %s k
                            WHERE s.device_id = k.device_id::UUID AND s.timestamp = k.timestamp
                        """, name));
                    }
                }
                root.clear();
            });
        }
    }

    /** Stage the keys in a temp table (via generated Appender) and DELETE with a generated join. */
    public void deleteViaTempTable(Connection conn, Iterable<RowData> rows) throws Exception {
        inTransaction(conn, () -> {
            var queries = new Queries(conn);
            queries.createDeleteKeys();
            try (var appender = queries.createDeleteKeysAppender()) {
                for (var r : rows) {
                    appender.append(r.deviceId(), r.timestamp());
                }
            }
            queries.deleteViaStaging();
            try (var stmt = conn.createStatement()) {
                stmt.execute("DROP TABLE _delete_keys");
            }
        });
    }
}
