package benchmark;

import benchmark.SensorDataGenerator.RowData;
import generated.Queries;
import generated.Queries.UpdateReadingParams;

import org.apache.arrow.c.ArrowArrayStream;
import org.apache.arrow.c.Data;
import org.apache.arrow.vector.Float8Vector;
import org.apache.arrow.vector.TimeStampMicroTZVector;
import org.apache.arrow.vector.VarCharVector;
import org.apache.arrow.vector.VectorSchemaRoot;
import org.apache.arrow.vector.types.FloatingPointPrecision;
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

public class UpdateMethods {

    private static final Schema UPDATE_ARROW_SCHEMA = new Schema(List.of(
        new Field("device_id", FieldType.notNullable(new ArrowType.Utf8()), null),
        new Field("timestamp", FieldType.notNullable(new ArrowType.Timestamp(TimeUnit.MICROSECOND, "UTC")), null),
        new Field("temperature", FieldType.nullable(new ArrowType.FloatingPoint(FloatingPointPrecision.DOUBLE)), null)
    ));

    /** One UPDATE per row via the generated single-row method. */
    public void updateIndividual(Connection conn, Iterable<RowData> rows) throws Exception {
        inTransaction(conn, () -> {
            var queries = new Queries(conn);
            for (var r : rows) {
                queries.updateReading(bumpTemp(r.temperature()), r.deviceId(), r.timestamp());
            }
        });
    }

    /** Generated `:batch` method — one round trip per chunk. */
    public void updateBatch(Connection conn, Iterable<RowData> rows) throws Exception {
        inTransaction(conn, () -> {
            var queries = new Queries(conn);
            var chunk = new ArrayList<UpdateReadingParams>(CHUNK_SIZE);
            for (var r : rows) {
                chunk.add(new UpdateReadingParams(
                    bumpTemp(r.temperature()), r.deviceId(), r.timestamp()));
                if (chunk.size() == CHUNK_SIZE) {
                    queries.updateReadingBatch(chunk);
                    chunk.clear();
                }
            }
            if (!chunk.isEmpty()) queries.updateReadingBatch(chunk);
        });
    }

    /** UPDATE ... FROM (UNNEST ...) with three list parameters, chunked. */
    public void updateUnnest(Connection conn, Iterable<RowData> rows) throws Exception {
        var queries = new Queries(conn);
        var ids = new ArrayList<UUID>(CHUNK_SIZE);
        var ts = new ArrayList<OffsetDateTime>(CHUNK_SIZE);
        var temps = new ArrayList<Double>(CHUNK_SIZE);
        for (var r : rows) {
            ids.add(r.deviceId());
            ts.add(r.timestamp());
            temps.add(bumpTemp(r.temperature()));
            if (ids.size() == CHUNK_SIZE) {
                queries.updateReadingsUnnest(ids, ts, temps);
                ids.clear(); ts.clear(); temps.clear();
            }
        }
        if (!ids.isEmpty()) queries.updateReadingsUnnest(ids, ts, temps);
    }

    /** Stage (key, new_value) as Arrow batches and UPDATE with a join. */
    public void updateViaArrow(Connection conn, Iterable<RowData> rows, InsertMethods im) throws Exception {
        var duckConn = (org.duckdb.DuckDBConnection) conn;
        try (var root = VectorSchemaRoot.create(UPDATE_ARROW_SCHEMA, im.arrowAllocator)) {
            chunked(rows, CHUNK_SIZE, chunk -> {
                root.allocateNew();
                var idVec = (VarCharVector) root.getVector("device_id");
                var tsVec = (TimeStampMicroTZVector) root.getVector("timestamp");
                var tempVec = (Float8Vector) root.getVector("temperature");
                for (int i = 0; i < chunk.size(); i++) {
                    var r = chunk.get(i);
                    idVec.setSafe(i, r.deviceId().toString().getBytes(StandardCharsets.UTF_8));
                    tsVec.setSafe(i, r.timestamp().toInstant().toEpochMilli() * 1000);
                    Double bumped = bumpTemp(r.temperature());
                    if (bumped != null) tempVec.setSafe(i, bumped);
                    else tempVec.setNull(i);
                }
                root.setRowCount(chunk.size());

                String name = "arrow_upd_" + (im.arrowStreamCounter++);
                try (var stream = ArrowArrayStream.allocateNew(im.arrowAllocator)) {
                    var reader = new InsertMethods.VectorSchemaRootReader(im.arrowAllocator, root);
                    Data.exportArrayStream(im.arrowAllocator, reader, stream);
                    duckConn.registerArrowStream(name, stream);
                    try (var stmt = duckConn.createStatement()) {
                        stmt.execute(String.format("""
                            UPDATE sensor_readings s
                            SET temperature = k.temperature
                            FROM %s k
                            WHERE s.device_id = k.device_id::UUID AND s.timestamp = k.timestamp
                        """, name));
                    }
                }
                root.clear();
            });
        }
    }

    /** Stage new values in a temp table via generated Appender and UPDATE with a generated join. */
    public void updateViaTempTable(Connection conn, Iterable<RowData> rows) throws Exception {
        inTransaction(conn, () -> {
            var queries = new Queries(conn);
            queries.createUpdateKeys();
            try (var appender = queries.createUpdateKeysAppender()) {
                for (var r : rows) {
                    appender.append(r.deviceId(), r.timestamp(), bumpTemp(r.temperature()));
                }
            }
            queries.updateViaStaging();
            try (var stmt = conn.createStatement()) {
                stmt.execute("DROP TABLE _update_keys");
            }
        });
    }

    static Double bumpTemp(Double t) {
        return t == null ? null : t + 1.0;
    }
}
