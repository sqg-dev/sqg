package benchmark;

import benchmark.SensorDataGenerator.RowData;
import generated.Queries;
import generated.Queries.InsertReadingParams;

import org.apache.arrow.c.ArrowArrayStream;
import org.apache.arrow.c.Data;
import org.apache.arrow.memory.BufferAllocator;
import org.apache.arrow.memory.RootAllocator;
import org.apache.arrow.vector.BitVector;
import org.apache.arrow.vector.DecimalVector;
import org.apache.arrow.vector.Float8Vector;
import org.apache.arrow.vector.SmallIntVector;
import org.apache.arrow.vector.TimeStampMicroTZVector;
import org.apache.arrow.vector.VarCharVector;
import org.apache.arrow.vector.VectorSchemaRoot;
import org.apache.arrow.vector.complex.ListVector;
import org.apache.arrow.vector.complex.impl.UnionListWriter;
import org.apache.arrow.vector.ipc.ArrowReader;
import org.apache.arrow.vector.types.FloatingPointPrecision;
import org.apache.arrow.vector.types.TimeUnit;
import org.apache.arrow.vector.types.pojo.ArrowType;
import org.apache.arrow.vector.types.pojo.Field;
import org.apache.arrow.vector.types.pojo.FieldType;
import org.apache.arrow.vector.types.pojo.Schema;
import org.duckdb.DuckDBConnection;

import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

public class InsertMethods implements AutoCloseable {

    private static final String INSERT_SQL =
        "INSERT INTO sensor_readings (device_id, timestamp, temperature, humidity, pressure, battery_level, is_anomaly, location, tags) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

    static final int CHUNK_SIZE = 10_000;

    static final Schema FULL_ARROW_SCHEMA = new Schema(List.of(
        new Field("device_id", FieldType.notNullable(new ArrowType.Utf8()), null),
        new Field("timestamp", FieldType.notNullable(new ArrowType.Timestamp(TimeUnit.MICROSECOND, "UTC")), null),
        new Field("temperature", FieldType.nullable(new ArrowType.FloatingPoint(FloatingPointPrecision.DOUBLE)), null),
        new Field("humidity", FieldType.nullable(new ArrowType.FloatingPoint(FloatingPointPrecision.DOUBLE)), null),
        new Field("pressure", FieldType.nullable(new ArrowType.Decimal(10, 2, 128)), null),
        new Field("battery_level", FieldType.nullable(new ArrowType.Int(16, true)), null),
        new Field("is_anomaly", FieldType.nullable(new ArrowType.Bool()), null),
        new Field("location", FieldType.nullable(new ArrowType.Utf8()), null),
        new Field("tags", FieldType.nullable(new ArrowType.List()),
            List.of(new Field("item", FieldType.nullable(new ArrowType.Utf8()), null)))
    ));

    final BufferAllocator arrowAllocator = new RootAllocator();
    int arrowStreamCounter = 0;

    @Override
    public void close() {
        arrowAllocator.close();
    }

    // ==================== Helpers ====================

    private static void bindRow(PreparedStatement stmt, Connection conn, RowData row, int offset) throws SQLException {
        stmt.setObject(offset + 1, row.deviceId());
        stmt.setObject(offset + 2, row.timestamp());
        stmt.setObject(offset + 3, row.temperature());
        stmt.setObject(offset + 4, row.humidity());
        stmt.setBigDecimal(offset + 5, row.pressure());
        stmt.setObject(offset + 6, row.batteryLevel(), java.sql.Types.SMALLINT);
        stmt.setObject(offset + 7, row.isAnomaly());
        stmt.setString(offset + 8, row.location());
        stmt.setArray(offset + 9, conn.createArrayOf("VARCHAR", row.tags().toArray()));
    }

    static void inTransaction(Connection conn, SqlAction action) throws Exception {
        conn.setAutoCommit(false);
        try {
            action.run();
            conn.commit();
        } catch (Exception e) {
            conn.rollback();
            throw e;
        } finally {
            conn.setAutoCommit(true);
        }
    }

    @FunctionalInterface
    interface SqlAction {
        void run() throws Exception;
    }

    /** Drain an iterator into chunks, calling the action for each chunk. */
    static void chunked(Iterable<RowData> rows, int chunkSize, ChunkAction action) throws Exception {
        var chunk = new ArrayList<RowData>(chunkSize);
        for (var r : rows) {
            chunk.add(r);
            if (chunk.size() == chunkSize) {
                action.process(chunk);
                chunk.clear();
            }
        }
        if (!chunk.isEmpty()) action.process(chunk);
    }

    @FunctionalInterface
    interface ChunkAction {
        void process(List<RowData> chunk) throws Exception;
    }

    // ==================== Insert Methods ====================

    /** Individual INSERTs via the generated single-row method, one round trip per row. */
    public void insertIndividual(Connection conn, Iterable<RowData> rows) throws Exception {
        inTransaction(conn, () -> {
            var queries = new Queries(conn);
            for (var r : rows) {
                queries.insertReading(
                    r.deviceId(), r.timestamp(), r.temperature(), r.humidity(),
                    r.pressure(), r.batteryLevel(), r.isAnomaly(), r.location(), r.tags()
                );
            }
        });
    }

    /** Uses the generated `:batch` method — JDBC addBatch/executeBatch. */
    public void insertBatch(Connection conn, Iterable<RowData> rows) throws Exception {
        insertBatchWithSize(conn, rows, CHUNK_SIZE);
    }

    public void insertBatchWithSize(Connection conn, Iterable<RowData> rows, int chunkSize) throws Exception {
        inTransaction(conn, () -> {
            var queries = new Queries(conn);
            var chunk = new ArrayList<InsertReadingParams>(chunkSize);
            for (var r : rows) {
                chunk.add(new InsertReadingParams(
                    r.deviceId(), r.timestamp(), r.temperature(), r.humidity(),
                    r.pressure(), r.batteryLevel(), r.isAnomaly(), r.location(), r.tags()
                ));
                if (chunk.size() == chunkSize) {
                    queries.insertReadingBatch(chunk);
                    chunk.clear();
                }
            }
            if (!chunk.isEmpty()) queries.insertReadingBatch(chunk);
        });
    }

    /** Multi-value INSERT: INSERT ... VALUES (...), (...), ... */
    public void insertMultiValue(Connection conn, Iterable<RowData> rows) throws Exception {
        insertMultiValueWithSize(conn, rows, CHUNK_SIZE);
    }

    public void insertMultiValueWithSize(Connection conn, Iterable<RowData> rows, int chunkSize) throws Exception {
        inTransaction(conn, () -> {
            chunked(rows, chunkSize, chunk -> {
                var sb = new StringBuilder(INSERT_SQL.substring(0, INSERT_SQL.indexOf("VALUES ") + 7));
                for (int i = 0; i < chunk.size(); i++) {
                    if (i > 0) sb.append(',');
                    sb.append("(?,?,?,?,?,?,?,?,?)");
                }
                try (var stmt = conn.prepareStatement(sb.toString())) {
                    int idx = 0;
                    for (var row : chunk) {
                        bindRow(stmt, conn, row, idx);
                        idx += 9;
                    }
                    stmt.executeUpdate();
                }
            });
        });
    }

    /** DuckDB Appender API via generated `:appender` — bypasses the SQL parser. */
    public void insertAppender(Connection conn, Iterable<RowData> rows) throws Exception {
        var queries = new Queries(conn);
        try (var appender = queries.createSensorReadingsAppender()) {
            for (var r : rows) {
                appender.append(
                    r.deviceId(), r.timestamp(), r.temperature(), r.humidity(),
                    r.pressure(), r.batteryLevel(), r.isAnomaly(), r.location(), r.tags()
                );
            }
        }
    }

    /** Build Arrow batches and INSERT ... SELECT from each registered stream. */
    public void insertArrow(Connection conn, Iterable<RowData> rows) throws Exception {
        var duckConn = (DuckDBConnection) conn;
        try (var root = VectorSchemaRoot.create(FULL_ARROW_SCHEMA, arrowAllocator)) {
            chunked(rows, CHUNK_SIZE, chunk -> {
                root.allocateNew();
                fillArrowVectors(root, chunk);
                root.setRowCount(chunk.size());
                flushArrowInsert(duckConn, root);
                root.clear();
            });
        }
    }

    private void fillArrowVectors(VectorSchemaRoot root, List<RowData> chunk) {
        var deviceIdVec = (VarCharVector) root.getVector("device_id");
        var tsVec = (TimeStampMicroTZVector) root.getVector("timestamp");
        var tempVec = (Float8Vector) root.getVector("temperature");
        var humidVec = (Float8Vector) root.getVector("humidity");
        var pressureVec = (DecimalVector) root.getVector("pressure");
        var batteryVec = (SmallIntVector) root.getVector("battery_level");
        var anomalyVec = (BitVector) root.getVector("is_anomaly");
        var locationVec = (VarCharVector) root.getVector("location");
        var tagsVec = (ListVector) root.getVector("tags");
        UnionListWriter tagsWriter = tagsVec.getWriter();

        for (int i = 0; i < chunk.size(); i++) {
            var r = chunk.get(i);
            deviceIdVec.setSafe(i, r.deviceId().toString().getBytes(StandardCharsets.UTF_8));
            tsVec.setSafe(i, r.timestamp().toInstant().toEpochMilli() * 1000);
            if (r.temperature() != null) tempVec.setSafe(i, r.temperature()); else tempVec.setNull(i);
            if (r.humidity() != null) humidVec.setSafe(i, r.humidity()); else humidVec.setNull(i);
            if (r.pressure() != null) pressureVec.setSafe(i, r.pressure()); else pressureVec.setNull(i);
            if (r.batteryLevel() != null) batteryVec.setSafe(i, r.batteryLevel()); else batteryVec.setNull(i);
            if (r.isAnomaly() != null) anomalyVec.setSafe(i, r.isAnomaly() ? 1 : 0); else anomalyVec.setNull(i);
            locationVec.setSafe(i, r.location().getBytes(StandardCharsets.UTF_8));

            tagsWriter.setPosition(i);
            tagsWriter.startList();
            for (var tag : r.tags()) {
                byte[] tagBytes = tag.getBytes(StandardCharsets.UTF_8);
                try (var buf = arrowAllocator.buffer(tagBytes.length)) {
                    buf.writeBytes(tagBytes);
                    tagsWriter.varChar().writeVarChar(0, tagBytes.length, buf);
                }
            }
            tagsWriter.endList();
        }
    }

    private void flushArrowInsert(DuckDBConnection duckConn, VectorSchemaRoot root) throws Exception {
        String streamName = "arrow_sensor_" + (arrowStreamCounter++);
        try (var stream = ArrowArrayStream.allocateNew(arrowAllocator)) {
            var reader = new VectorSchemaRootReader(arrowAllocator, root);
            Data.exportArrayStream(arrowAllocator, reader, stream);
            duckConn.registerArrowStream(streamName, stream);
            try (var stmt = duckConn.createStatement()) {
                stmt.execute(String.format("""
                    INSERT INTO sensor_readings
                        (device_id, timestamp, temperature, humidity, pressure,
                         battery_level, is_anomaly, location, tags)
                    SELECT device_id::UUID, timestamp, temperature, humidity, pressure,
                           battery_level, is_anomaly, location, tags
                    FROM %s
                """, streamName));
            }
        }
    }

    static class VectorSchemaRootReader extends ArrowReader {
        private final VectorSchemaRoot root;
        private boolean consumed = false;

        VectorSchemaRootReader(BufferAllocator allocator, VectorSchemaRoot root) {
            super(allocator);
            this.root = root;
        }

        @Override
        public boolean loadNextBatch() {
            if (consumed) return false;
            consumed = true;
            return true;
        }

        @Override
        public VectorSchemaRoot getVectorSchemaRoot() {
            return root;
        }

        @Override
        protected Schema readSchema() {
            return root.getSchema();
        }

        @Override
        public long bytesRead() {
            return 0;
        }

        @Override
        protected void closeReadSource() {}
    }
}
