package benchmark;

import benchmark.SensorDataGenerator.RowData;
import generated.Queries;
import generated.QueriesDuckdb;
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
import org.postgresql.copy.CopyManager;
import org.postgresql.core.BaseConnection;

import java.io.IOException;
import java.io.StringReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class InsertMethods implements AutoCloseable {

    private static final String INSERT_SQL =
        "INSERT INTO sensor_readings (device_id, timestamp, temperature, humidity, pressure, battery_level, is_anomaly, location, tags) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)";

    static final int DEFAULT_CHUNK_SIZE = 1000;

    private Connection rewriteConn;
    private DuckDBConnection duckConn;
    private final BufferAllocator arrowAllocator = new RootAllocator();
    private int arrowStreamCounter = 0;

    // Timing breakdowns populated during measurement
    double lastDuckAppendMs;
    double lastDuckCopyMs;
    double lastArrowBuildMs;
    double lastArrowCopyMs;

    public void initRewriteConnection(String jdbcUrl, String user, String password) throws SQLException {
        rewriteConn = DriverManager.getConnection(jdbcUrl + "&reWriteBatchedInserts=true", user, password);
    }

    public void initDuckDB(String pgConnString) throws SQLException {
        if (duckConn != null) return;
        duckConn = (DuckDBConnection) DriverManager.getConnection("jdbc:duckdb:");
        try (var stmt = duckConn.createStatement()) {
            stmt.execute("INSTALL postgres");
            stmt.execute("LOAD postgres");
            stmt.execute("ATTACH '" + pgConnString + "' AS pg (TYPE POSTGRES)");
        }
        QueriesDuckdb.applyMigrations(duckConn, "duckdb-staging");
    }

    @Override
    public void close() throws SQLException {
        if (rewriteConn != null) rewriteConn.close();
        if (duckConn != null) duckConn.close();
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
        stmt.setArray(offset + 9, conn.createArrayOf("text", row.tags().toArray()));
    }

    private static void inTransaction(Connection conn, SqlAction action) throws Exception {
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
    private interface SqlAction {
        void run() throws Exception;
    }

    static String csvEscape(String value) {
        if (value == null) return "";
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    static String formatPgArray(List<String> tags) {
        if (tags == null || tags.isEmpty()) return "{}";
        var sb = new StringBuilder("{");
        for (int i = 0; i < tags.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append('"').append(tags.get(i).replace("\"", "\\\"")).append('"');
        }
        sb.append('}');
        return sb.toString();
    }

    // ==================== JDBC Methods ====================

    public void insertIndividual(Connection conn, List<RowData> rows) throws Exception {
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

    public void insertBatch(Connection conn, List<RowData> rows) throws Exception {
        insertBatchWith(conn, conn, rows, rows.size());
    }

    public void insertBatchRewrite(Connection conn, List<RowData> rows) throws Exception {
        insertBatchWith(conn, rewriteConn, rows, rows.size());
    }

    public void insertBatchWithSize(Connection conn, List<RowData> rows, int chunkSize) throws Exception {
        insertBatchWith(conn, conn, rows, chunkSize);
    }

    private void insertBatchWith(Connection pgConn, Connection batchConn, List<RowData> rows, int chunkSize) throws Exception {
        inTransaction(batchConn, () -> {
            try (var stmt = batchConn.prepareStatement(INSERT_SQL)) {
                int count = 0;
                for (var row : rows) {
                    bindRow(stmt, batchConn, row, 0);
                    stmt.addBatch();
                    if (++count % chunkSize == 0) {
                        stmt.executeBatch();
                    }
                }
                if (count % chunkSize != 0) {
                    stmt.executeBatch();
                }
            }
        });
    }

    public void insertMultiValue(Connection conn, List<RowData> rows) throws Exception {
        insertMultiValueWithSize(conn, rows, DEFAULT_CHUNK_SIZE);
    }

    public void insertMultiValueWithSize(Connection conn, List<RowData> rows, int chunkSize) throws Exception {
        // PostgreSQL has a 65,535 parameter limit; with 9 columns, max ~7,281 rows per statement
        int safeChunkSize = Math.min(chunkSize, 65_535 / 9);
        inTransaction(conn, () -> {
            for (int offset = 0; offset < rows.size(); offset += safeChunkSize) {
                int end = Math.min(offset + safeChunkSize, rows.size());
                var chunk = rows.subList(offset, end);

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
            }
        });
    }

    public void insertUnnest(Connection conn, List<RowData> rows) throws Exception {
        inTransaction(conn, () -> {
            var deviceIds = new ArrayList<UUID>(rows.size());
            var timestamps = new ArrayList<OffsetDateTime>(rows.size());
            var temperatures = new ArrayList<Double>(rows.size());
            var humidities = new ArrayList<Double>(rows.size());
            var pressures = new ArrayList<BigDecimal>(rows.size());
            var batteryLevels = new ArrayList<Short>(rows.size());
            var anomalies = new ArrayList<Boolean>(rows.size());
            var locations = new ArrayList<String>(rows.size());
            var tagLiterals = new ArrayList<String>(rows.size());

            for (var r : rows) {
                deviceIds.add(r.deviceId());
                timestamps.add(r.timestamp());
                temperatures.add(r.temperature());
                humidities.add(r.humidity());
                pressures.add(r.pressure());
                batteryLevels.add(r.batteryLevel());
                anomalies.add(r.isAnomaly());
                locations.add(r.location());
                tagLiterals.add(formatPgArray(r.tags()));
            }

            var queries = new Queries(conn);
            queries.insertReadingsUnnest(
                deviceIds, timestamps, temperatures, humidities, pressures,
                batteryLevels, anomalies, locations, tagLiterals
            );
        });
    }

    // ==================== COPY Methods ====================

    public void insertCopyCsv(Connection conn, List<RowData> rows) throws SQLException, IOException {
        CopyManager cm = conn.unwrap(BaseConnection.class).getCopyAPI();
        var sb = new StringBuilder(rows.size() * 200);
        for (var row : rows) {
            sb.append(row.deviceId()).append(',');
            sb.append(row.timestamp()).append(',');
            sb.append(row.temperature()).append(',');
            sb.append(row.humidity()).append(',');
            sb.append(row.pressure()).append(',');
            sb.append(row.batteryLevel()).append(',');
            sb.append(row.isAnomaly()).append(',');
            sb.append(csvEscape(row.location())).append(',');
            sb.append(csvEscape(formatPgArray(row.tags()))).append('\n');
        }
        cm.copyIn(
            "COPY sensor_readings (device_id, timestamp, temperature, humidity, pressure, battery_level, is_anomaly, location, tags) FROM STDIN WITH (FORMAT CSV)",
            new StringReader(sb.toString())
        );
    }

    public void insertCopyBinary(Connection conn, List<RowData> rows) throws SQLException, IOException {
        var queries = new Queries(conn);
        var sqgRows = rows.stream()
            .map(r -> new Queries.SensorReadingsRow(
                r.deviceId(), r.timestamp(), r.temperature(), r.humidity(),
                r.pressure(), r.batteryLevel(), r.isAnomaly(), r.location(), r.tags()
            ))
            .toList();
        queries.bulkInsertSensorReadingsRow(sqgRows);
    }

    // ==================== DuckDB Methods ====================

    public void insertViaDuckDB(Connection pgConn, List<RowData> rows) throws Exception {
        try (var stmt = duckConn.createStatement()) {
            stmt.execute("TRUNCATE sensor_readings");
        }
        long t0 = System.nanoTime();
        var duckQueries = new QueriesDuckdb(duckConn);
        try (var appender = duckQueries.createSensorReadingsAppender()) {
            for (var r : rows) {
                appender.append(
                    r.deviceId(), r.timestamp(), r.temperature(), r.humidity(),
                    r.pressure(), r.batteryLevel(), r.isAnomaly(), r.location(), r.tags()
                );
            }
        }
        long t1 = System.nanoTime();

        try (var stmt = duckConn.createStatement()) {
            stmt.execute("""
                INSERT INTO pg.public.sensor_readings
                    (device_id, timestamp, temperature, humidity, pressure,
                     battery_level, is_anomaly, location, tags)
                SELECT device_id, timestamp, temperature, humidity, pressure,
                       battery_level, is_anomaly, location, tags
                FROM sensor_readings
            """);
        }
        long t2 = System.nanoTime();
        lastDuckAppendMs = (t1 - t0) / 1_000_000.0;
        lastDuckCopyMs = (t2 - t1) / 1_000_000.0;
    }

    public void insertViaArrow(Connection pgConn, List<RowData> rows) throws Exception {
        long t0 = System.nanoTime();

        var schema = new Schema(List.of(
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

        try (var root = VectorSchemaRoot.create(schema, arrowAllocator)) {
            root.allocateNew();

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

            for (int i = 0; i < rows.size(); i++) {
                var r = rows.get(i);
                deviceIdVec.setSafe(i, r.deviceId().toString().getBytes(StandardCharsets.UTF_8));
                tsVec.setSafe(i, r.timestamp().toInstant().toEpochMilli() * 1000);
                tempVec.setSafe(i, r.temperature());
                humidVec.setSafe(i, r.humidity());
                pressureVec.setSafe(i, r.pressure());
                batteryVec.setSafe(i, r.batteryLevel());
                anomalyVec.setSafe(i, r.isAnomaly() ? 1 : 0);
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
            root.setRowCount(rows.size());

            long t1 = System.nanoTime();

            String streamName = "arrow_sensor_" + (arrowStreamCounter++);
            try (var stream = ArrowArrayStream.allocateNew(arrowAllocator)) {
                var reader = new VectorSchemaRootReader(arrowAllocator, root);
                Data.exportArrayStream(arrowAllocator, reader, stream);
                duckConn.registerArrowStream(streamName, stream);

                try (var stmt = duckConn.createStatement()) {
                    stmt.execute(String.format("""
                        INSERT INTO pg.public.sensor_readings
                            (device_id, timestamp, temperature, humidity, pressure,
                             battery_level, is_anomaly, location, tags)
                        SELECT device_id::UUID, timestamp, temperature, humidity, pressure,
                               battery_level, is_anomaly, location, tags
                        FROM %s
                    """, streamName));
                }
            }
            long t2 = System.nanoTime();

            lastArrowBuildMs = (t1 - t0) / 1_000_000.0;
            lastArrowCopyMs = (t2 - t1) / 1_000_000.0;
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
