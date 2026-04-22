package benchmark;

import benchmark.SensorDataGenerator.RowData;
import generated.Queries;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.*;

public class BenchmarkHarness {

    static final int WARMUP_RUNS = 1;
    static final int MEASUREMENT_RUNS = 3;

    private static final String[] COLORS = {
        "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
        "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280"
    };

    @FunctionalInterface
    public interface Operation {
        void run(Connection conn, Iterable<RowData> rows) throws Exception;
    }

    public record MethodResult(String name, double medianMs, long rowCount) {
        public double rowsPerSec() {
            return rowCount / (medianMs / 1000.0);
        }
    }

    /** Measure an INSERT operation: truncate, time insert, verify count and row values. */
    public static MethodResult measureInsert(String name, Connection conn, List<RowData> rows,
                                             Operation op) throws Exception {
        for (int i = 0; i < WARMUP_RUNS; i++) {
            truncate(conn);
            op.run(conn, rows);
        }

        double[] times = new double[MEASUREMENT_RUNS];
        for (int i = 0; i < MEASUREMENT_RUNS; i++) {
            truncate(conn);
            long start = System.nanoTime();
            op.run(conn, rows);
            times[i] = (System.nanoTime() - start) / 1_000_000.0;
        }

        var queries = new Queries(conn);
        long count = queries.countReadings();
        if (count != rows.size()) {
            throw new AssertionError(name + ": expected " + rows.size() + " rows, got " + count);
        }
        verifyRow(name + " [first]", rows.getFirst(), queries.firstReading());
        var lastRows = queries.lastReadings();
        int expectedCount = Math.min(10, rows.size());
        if (lastRows.size() != expectedCount) {
            throw new AssertionError(name + ": expected " + expectedCount + " last rows, got " + lastRows.size());
        }
        for (int i = 0; i < lastRows.size(); i++) {
            verifyRow(name + " [last-" + i + "]", rows.get(rows.size() - 1 - i), lastRows.get(i));
        }

        Arrays.sort(times);
        return new MethodResult(name, times[MEASUREMENT_RUNS / 2], rows.size());
    }

    /** Measure a mutating operation on a pre-seeded table (UPDATE or DELETE). */
    public static MethodResult measureSeeded(String name, Connection conn, List<RowData> rows,
                                             Operation op, InsertMethods seeder,
                                             long expectedRowCountAfter) throws Exception {
        for (int i = 0; i < WARMUP_RUNS; i++) {
            truncate(conn);
            seeder.insertAppender(conn, rows);
            op.run(conn, rows);
        }

        double[] times = new double[MEASUREMENT_RUNS];
        for (int i = 0; i < MEASUREMENT_RUNS; i++) {
            truncate(conn);
            seeder.insertAppender(conn, rows);
            long start = System.nanoTime();
            op.run(conn, rows);
            times[i] = (System.nanoTime() - start) / 1_000_000.0;
        }

        long count = new Queries(conn).countReadings();
        if (count != expectedRowCountAfter) {
            throw new AssertionError(name + ": expected " + expectedRowCountAfter + " rows, got " + count);
        }

        Arrays.sort(times);
        return new MethodResult(name, times[MEASUREMENT_RUNS / 2], rows.size());
    }

    public static MethodResult measureDelete(String name, Connection conn, List<RowData> rows,
                                             Operation op, InsertMethods seeder) throws Exception {
        return measureSeeded(name, conn, rows, op, seeder, 0);
    }

    public static MethodResult measureUpdate(String name, Connection conn, List<RowData> rows,
                                             Operation op, InsertMethods seeder) throws Exception {
        var result = measureSeeded(name, conn, rows, op, seeder, rows.size());

        // Verify the first row's temperature was actually bumped by +1.0
        // rows are generated in timestamp order, so getFirst() is the earliest
        var queries = new Queries(conn);
        var first = queries.firstReading();
        if (first == null) throw new AssertionError(name + ": no rows after update");
        double expectedTemp = rows.getFirst().temperature() + 1.0;
        if (Math.abs(first.temperature() - expectedTemp) > 0.001) {
            throw new AssertionError(name + ": temperature not updated — expected "
                + expectedTemp + ", got " + first.temperature());
        }

        return result;
    }

    private static void verifyRow(String context, RowData expected, Object dbRow) {
        record DbFields(UUID deviceId, java.time.OffsetDateTime timestamp, Double temperature, String location) {}

        DbFields fields;
        if (dbRow instanceof Queries.FirstReadingResult r) {
            fields = new DbFields(r.deviceId(), r.timestamp(), r.temperature(), r.location());
        } else if (dbRow instanceof Queries.LastReadingsResult r) {
            fields = new DbFields(r.deviceId(), r.timestamp(), r.temperature(), r.location());
        } else {
            throw new AssertionError(context + ": unexpected row type " + dbRow.getClass());
        }

        if (!expected.deviceId().equals(fields.deviceId()))
            throw new AssertionError(context + ": device_id mismatch");
        if (!expected.timestamp().toInstant().equals(fields.timestamp().toInstant()))
            throw new AssertionError(context + ": timestamp mismatch");
        if (Math.abs(expected.temperature() - fields.temperature()) > 0.001)
            throw new AssertionError(context + ": temperature mismatch");
        if (!expected.location().equals(fields.location()))
            throw new AssertionError(context + ": location mismatch");
    }

    public static void truncate(Connection conn) throws SQLException {
        try (var stmt = conn.createStatement()) {
            stmt.execute("DELETE FROM sensor_readings");
        }
    }

    public static void printResults(String heading, int batchSize, List<MethodResult> results) {
        double bestMs = results.stream()
            .mapToDouble(MethodResult::medianMs)
            .filter(d -> !Double.isNaN(d))
            .min().orElse(1);

        System.out.printf("%n--- %s: %,d rows ---%n", heading, batchSize);
        System.out.printf("%-26s %12s %14s %14s%n", "Method", "Time (ms)", "Rows/sec", "vs Best");
        System.out.printf("%-26s %12s %14s %14s%n", "-".repeat(26), "-".repeat(12), "-".repeat(14), "-".repeat(14));

        for (var r : results) {
            if (Double.isNaN(r.medianMs())) {
                System.out.printf("%-26s %12s %14s %14s%n", r.name(), "-", "-", "skipped");
                continue;
            }
            double ratio = r.medianMs() / bestMs;
            String comparison = ratio < 1.05 ? "~same" : String.format("%.1fx slower", ratio);
            if (r.medianMs() == bestMs) comparison = "fastest";
            System.out.printf("%-26s %,12.1f %,14.0f %14s%n",
                r.name(), r.medianMs(), r.rowsPerSec(), comparison);
        }
    }

    public static void generateReport(
            Connection conn, String title, String subtitle,
            List<List<MethodResult>> insertResults, int[] insertSizes,
            List<List<MethodResult>> updateResults, int[] updateSizes,
            List<List<MethodResult>> deleteResults, int[] deleteSizes
    ) throws IOException, SQLException {
        var is = BenchmarkHarness.class.getResourceAsStream("/report-template.html");
        Objects.requireNonNull(is, "report-template.html not found on classpath");
        var template = new String(is.readAllBytes());

        var charts = new StringBuilder();
        charts.append(buildScaleChart("insertChart", "INSERT: Throughput vs Total Rows",
            insertResults, insertSizes));
        charts.append(buildScaleChart("updateChart", "UPDATE: Throughput vs Total Rows",
            updateResults, updateSizes));
        charts.append(buildScaleChart("deleteChart", "DELETE: Throughput vs Total Rows",
            deleteResults, deleteSizes));

        var sections = new StringBuilder();
        appendCollapsible(sections, "INSERT results", insertResults, insertSizes);
        appendCollapsible(sections, "UPDATE results", updateResults, updateSizes);
        appendCollapsible(sections, "DELETE results", deleteResults, deleteSizes);

        var sysInfo = new StringBuilder();
        sysInfo.append(sysRow("Java", System.getProperty("java.version") + " (" + System.getProperty("java.vendor") + ")"));
        sysInfo.append(sysRow("OS", System.getProperty("os.name") + " " + System.getProperty("os.version")));
        sysInfo.append(sysRow("Arch", System.getProperty("os.arch")));
        sysInfo.append(sysRow("CPUs", String.valueOf(Runtime.getRuntime().availableProcessors())));
        sysInfo.append(sysRow("Max Memory", String.format("%,d MB", Runtime.getRuntime().maxMemory() / 1024 / 1024)));
        String duckdbVersion;
        try (var stmt = conn.createStatement(); var rs = stmt.executeQuery("SELECT version()")) {
            duckdbVersion = rs.next() ? rs.getString(1) : "unknown";
        }
        sysInfo.append(sysRow("DuckDB", duckdbVersion));
        sysInfo.append(sysRow("Warmup Runs", String.valueOf(WARMUP_RUNS)));
        sysInfo.append(sysRow("Measurement Runs", String.valueOf(MEASUREMENT_RUNS)));

        var html = template
            .replace("{{TITLE}}", title)
            .replace("{{SUBTITLE}}", subtitle)
            .replace("{{CHARTS}}", charts.toString())
            .replace("{{RESULTS_SECTIONS}}", sections.toString())
            .replace("{{SYSTEM_INFO}}", sysInfo.toString());

        Files.writeString(Path.of("benchmark-report.html"), html);
        System.out.println("\nReport written to benchmark-report.html");
    }

    private static String buildScaleChart(String id, String heading,
                                          List<List<MethodResult>> allResults, int[] sizes) {
        var methodNames = allResults.getFirst().stream().map(MethodResult::name).toList();

        var sb = new StringBuilder();
        sb.append("<div class=\"chart-section\">\n");
        sb.append("  <h2>").append(heading).append("</h2>\n");
        sb.append("  <div class=\"chart-container\"><canvas id=\"").append(id).append("\"></canvas></div>\n");
        sb.append("  <script>\n");
        sb.append("  new Chart(document.getElementById('").append(id).append("'), {\n");
        sb.append("    type: 'line',\n    data: {\n      labels: [");
        for (int i = 0; i < sizes.length; i++) {
            if (i > 0) sb.append(", ");
            sb.append("'").append(formatLabel(sizes[i])).append("'");
        }
        sb.append("],\n      datasets: [\n");

        for (int m = 0; m < methodNames.size(); m++) {
            sb.append("        { label: '").append(methodNames.get(m)).append("',\n");
            sb.append("          borderColor: '").append(COLORS[m % COLORS.length]).append("',\n");
            sb.append("          backgroundColor: '").append(COLORS[m % COLORS.length]).append("22',\n");
            sb.append("          tension: 0,\n          data: [");
            for (int i = 0; i < allResults.size(); i++) {
                if (i > 0) sb.append(", ");
                double val = allResults.get(i).get(m).rowsPerSec();
                sb.append(Double.isNaN(val) ? "null" : String.format("%.0f", val));
            }
            sb.append("], spanGaps: true },\n");
        }

        sb.append("      ]\n    },\n");
        sb.append("    options: {\n");
        sb.append("      responsive: true,\n");
        sb.append("      plugins: { legend: { position: 'right' } },\n");
        sb.append("      scales: {\n");
        sb.append("        y: { type: 'logarithmic', title: { display: true, text: 'Rows/sec (log scale)' } },\n");
        sb.append("        x: { title: { display: true, text: 'Total rows' } }\n");
        sb.append("      }\n    }\n  });\n  </script>\n</div>\n");
        return sb.toString();
    }

    private static void appendCollapsible(StringBuilder sb, String title,
                                           List<List<MethodResult>> results, int[] sizes) {
        sb.append("<details style=\"margin-top:2rem\">\n");
        sb.append("<summary style=\"font-size:1.25rem;font-weight:600;cursor:pointer;padding:0.5rem 0\">")
          .append(title).append("</summary>\n");
        for (int i = 0; i < results.size(); i++) {
            sb.append(buildResultsTable(results.get(i), sizes[i]));
        }
        sb.append("</details>\n");
    }

    private static String buildResultsTable(List<MethodResult> results, int batchSize) {
        double bestMs = results.stream()
            .mapToDouble(MethodResult::medianMs)
            .filter(d -> !Double.isNaN(d))
            .min().orElse(1);

        var sb = new StringBuilder();
        sb.append("<div class=\"batch-section\">\n");
        sb.append(String.format("  <h3>%,d rows</h3>\n", batchSize));
        sb.append("  <table class=\"results-table\">\n");
        sb.append("    <thead><tr><th>Method</th><th>Time (ms)</th><th>Rows/sec</th><th>vs Best</th></tr></thead>\n");
        sb.append("    <tbody>\n");

        for (var r : results) {
            if (Double.isNaN(r.medianMs())) {
                sb.append(String.format(
                    "      <tr><td>%s</td><td class=\"number\">-</td><td class=\"number\">-</td><td>skipped</td></tr>\n",
                    r.name()));
                continue;
            }
            double ratio = r.medianMs() / bestMs;
            boolean isBest = ratio < 1.05;
            String comparison = isBest ? "~same" : String.format("%.1fx slower", ratio);
            if (r.medianMs() == bestMs) comparison = "fastest";
            String cls = isBest ? " class=\"winner\"" : "";
            sb.append(String.format(
                "      <tr%s><td>%s</td><td class=\"number\">%,.1f</td><td class=\"number\">%,.0f</td><td>%s</td></tr>\n",
                cls, r.name(), r.medianMs(), r.rowsPerSec(), comparison));
        }

        sb.append("    </tbody>\n  </table>\n</div>\n");
        return sb.toString();
    }

    private static String formatLabel(int n) {
        if (n >= 1_000_000) return n / 1_000_000 + "M";
        if (n >= 1_000) return n / 1_000 + "K";
        return String.valueOf(n);
    }

    static String sysRow(String label, String value) {
        return String.format("        <tr><td>%s</td><td>%s</td></tr>\n", label, value);
    }
}
