package benchmark;

import benchmark.SensorDataGenerator.RowData;
import org.duckdb.DuckDBColumnType;
import org.duckdb.DuckDBFunctions;
import org.duckdb.DuckDBTableFunction;
import org.duckdb.DuckDBTableFunctionBindInfo;
import org.duckdb.DuckDBTableFunctionCallInfo;
import org.duckdb.DuckDBTableFunctionInitInfo;
import org.duckdb.DuckDBDataChunkWriter;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.Iterator;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static benchmark.UpdateMethods.bumpTemp;

public class TableFunctionMethods {

    private final AtomicReference<Iterator<RowData>> insertHolder = new AtomicReference<>();
    private final AtomicReference<Iterator<RowData>> deleteHolder = new AtomicReference<>();
    private final AtomicReference<Iterator<RowData>> updateHolder = new AtomicReference<>();

    /**
     * Register all three table functions on the connection. Call once at startup.
     */
    public void register(Connection conn) throws SQLException {
        registerInsertFunction(conn);
        registerDeleteFunction(conn);
        registerUpdateFunction(conn);
    }

    // ==================== INSERT ====================

    private void registerInsertFunction(Connection conn) throws SQLException {
        DuckDBFunctions.tableFunction()
            .withName("_bench_insert_rows")
            .withFunction(new DuckDBTableFunction<Iterator<RowData>, Object, Object>() {
                @Override
                public Iterator<RowData> bind(DuckDBTableFunctionBindInfo info) {
                    info.addResultColumn("device_id", DuckDBColumnType.VARCHAR);
                    info.addResultColumn("timestamp", DuckDBColumnType.TIMESTAMP_WITH_TIME_ZONE);
                    info.addResultColumn("temperature", DuckDBColumnType.DOUBLE);
                    info.addResultColumn("humidity", DuckDBColumnType.DOUBLE);
                    info.addResultColumn("pressure", DuckDBColumnType.DECIMAL);
                    info.addResultColumn("battery_level", DuckDBColumnType.SMALLINT);
                    info.addResultColumn("is_anomaly", DuckDBColumnType.BOOLEAN);
                    info.addResultColumn("location", DuckDBColumnType.VARCHAR);
                    info.addResultColumn("tags", DuckDBColumnType.VARCHAR);
                    return insertHolder.get();
                }

                @Override
                public Object init(DuckDBTableFunctionInitInfo info) {
                    return null;
                }

                @Override
                public long apply(DuckDBTableFunctionCallInfo info, DuckDBDataChunkWriter output) {
                    Iterator<RowData> iter = info.getBindData();
                    int capacity = (int) output.capacity();
                    var vDeviceId  = output.vector(0);
                    var vTimestamp = output.vector(1);
                    var vTemp      = output.vector(2);
                    var vHumidity  = output.vector(3);
                    var vPressure  = output.vector(4);
                    var vBattery   = output.vector(5);
                    var vAnomaly   = output.vector(6);
                    var vLocation  = output.vector(7);
                    var vTags      = output.vector(8);

                    int written = 0;
                    while (written < capacity && iter.hasNext()) {
                        var r = iter.next();
                        vDeviceId.setString(written, r.deviceId().toString());
                        vTimestamp.setOffsetDateTime(written, r.timestamp());
                        if (r.temperature() != null) vTemp.setDouble(written, r.temperature()); else vTemp.setNull(written);
                        if (r.humidity() != null) vHumidity.setDouble(written, r.humidity()); else vHumidity.setNull(written);
                        if (r.pressure() != null) vPressure.setBigDecimal(written, r.pressure()); else vPressure.setNull(written);
                        if (r.batteryLevel() != null) vBattery.setShort(written, r.batteryLevel()); else vBattery.setNull(written);
                        if (r.isAnomaly() != null) vAnomaly.setBoolean(written, r.isAnomaly()); else vAnomaly.setNull(written);
                        vLocation.setString(written, r.location());
                        vTags.setString(written, formatDuckDBList(r.tags()));
                        written++;
                    }
                    return written;
                }
            })
            .register(conn);
    }

    public void insertViaTableFunction(Connection conn, Iterable<RowData> rows) throws Exception {
        insertHolder.set(rows.iterator());
        try (var stmt = conn.createStatement()) {
            stmt.execute("""
                INSERT INTO sensor_readings
                    (device_id, timestamp, temperature, humidity, pressure,
                     battery_level, is_anomaly, location, tags)
                SELECT device_id::UUID, timestamp, temperature, humidity, pressure,
                       battery_level, is_anomaly, location, tags::VARCHAR[]
                FROM _bench_insert_rows()
            """);
        } finally {
            insertHolder.set(null);
        }
    }

    // ==================== DELETE ====================

    private void registerDeleteFunction(Connection conn) throws SQLException {
        DuckDBFunctions.tableFunction()
            .withName("_bench_delete_keys")
            .withFunction(new DuckDBTableFunction<Iterator<RowData>, Object, Object>() {
                @Override
                public Iterator<RowData> bind(DuckDBTableFunctionBindInfo info) {
                    info.addResultColumn("device_id", DuckDBColumnType.VARCHAR);
                    info.addResultColumn("timestamp", DuckDBColumnType.TIMESTAMP_WITH_TIME_ZONE);
                    return deleteHolder.get();
                }

                @Override
                public Object init(DuckDBTableFunctionInitInfo info) {
                    return null;
                }

                @Override
                public long apply(DuckDBTableFunctionCallInfo info, DuckDBDataChunkWriter output) {
                    Iterator<RowData> iter = info.getBindData();
                    int capacity = (int) output.capacity();
                    var vDeviceId  = output.vector(0);
                    var vTimestamp = output.vector(1);

                    int written = 0;
                    while (written < capacity && iter.hasNext()) {
                        var r = iter.next();
                        vDeviceId.setString(written, r.deviceId().toString());
                        vTimestamp.setOffsetDateTime(written, r.timestamp());
                        written++;
                    }
                    return written;
                }
            })
            .register(conn);
    }

    public void deleteViaTableFunction(Connection conn, Iterable<RowData> rows) throws Exception {
        deleteHolder.set(rows.iterator());
        try (var stmt = conn.createStatement()) {
            stmt.execute("""
                DELETE FROM sensor_readings s
                USING _bench_delete_keys() k
                WHERE s.device_id = k.device_id::UUID AND s.timestamp = k.timestamp
            """);
        } finally {
            deleteHolder.set(null);
        }
    }

    // ==================== UPDATE ====================

    private void registerUpdateFunction(Connection conn) throws SQLException {
        DuckDBFunctions.tableFunction()
            .withName("_bench_update_keys")
            .withFunction(new DuckDBTableFunction<Iterator<RowData>, Object, Object>() {
                @Override
                public Iterator<RowData> bind(DuckDBTableFunctionBindInfo info) {
                    info.addResultColumn("device_id", DuckDBColumnType.VARCHAR);
                    info.addResultColumn("timestamp", DuckDBColumnType.TIMESTAMP_WITH_TIME_ZONE);
                    info.addResultColumn("temperature", DuckDBColumnType.DOUBLE);
                    return updateHolder.get();
                }

                @Override
                public Object init(DuckDBTableFunctionInitInfo info) {
                    return null;
                }

                @Override
                public long apply(DuckDBTableFunctionCallInfo info, DuckDBDataChunkWriter output) {
                    Iterator<RowData> iter = info.getBindData();
                    int capacity = (int) output.capacity();
                    var vDeviceId  = output.vector(0);
                    var vTimestamp = output.vector(1);
                    var vTemp      = output.vector(2);

                    int written = 0;
                    while (written < capacity && iter.hasNext()) {
                        var r = iter.next();
                        vDeviceId.setString(written, r.deviceId().toString());
                        vTimestamp.setOffsetDateTime(written, r.timestamp());
                        Double bumped = bumpTemp(r.temperature());
                        if (bumped != null) vTemp.setDouble(written, bumped);
                        else vTemp.setNull(written);
                        written++;
                    }
                    return written;
                }
            })
            .register(conn);
    }

    public void updateViaTableFunction(Connection conn, Iterable<RowData> rows) throws Exception {
        updateHolder.set(rows.iterator());
        try (var stmt = conn.createStatement()) {
            stmt.execute("""
                UPDATE sensor_readings s
                SET temperature = k.temperature
                FROM _bench_update_keys() k
                WHERE s.device_id = k.device_id::UUID AND s.timestamp = k.timestamp
            """);
        } finally {
            updateHolder.set(null);
        }
    }

    // ==================== Helpers ====================

    /** Format a Java list as a DuckDB list literal: ['a','b'] */
    static String formatDuckDBList(List<String> items) {
        if (items == null || items.isEmpty()) return "[]";
        var sb = new StringBuilder("[");
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append('\'').append(items.get(i).replace("'", "''")).append('\'');
        }
        sb.append(']');
        return sb.toString();
    }
}
