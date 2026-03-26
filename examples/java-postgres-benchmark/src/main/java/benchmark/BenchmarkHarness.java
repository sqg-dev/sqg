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

    static final int WARMUP_RUNS = 2;
    static final int MEASUREMENT_RUNS = 5;

    // Chart.js color palette
    private static final String[] COLORS = {
        "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
        "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280"
    };

    @FunctionalInterface
    public interface InsertMethod {
        void insert(Connection conn, List<RowData> rows) throws Exception;
    }

    public record MethodResult(String name, double medianMs, long rowCount) {
        public double rowsPerSec() {
            return rowCount / (medianMs / 1000.0);
        }
    }

    public static MethodResult measure(String name, Connection conn, List<RowData> rows,
                                       InsertMethod method) throws Exception {
        for (int i = 0; i < WARMUP_RUNS; i++) {
            truncate(conn);
            method.insert(conn, rows);
        }

        double[] times = new double[MEASUREMENT_RUNS];
        for (int i = 0; i < MEASUREMENT_RUNS; i++) {
            truncate(conn);
            long start = System.nanoTime();
            method.insert(conn, rows);
            long elapsed = System.nanoTime() - start;
            times[i] = elapsed / 1_000_000.0;
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

    private static void verifyRow(String context, RowData expected, Object dbRow) {
        record DbFields(java.util.UUID deviceId, java.time.OffsetDateTime timestamp, Double temperature, String location) {}

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
            stmt.execute("TRUNCATE sensor_readings RESTART IDENTITY");
        }
    }

    public static void printResults(int batchSize, List<MethodResult> results) {
        double bestMs = results.stream().mapToDouble(MethodResult::medianMs).min().orElse(1);

        System.out.printf("%n--- %,d rows ---%n", batchSize);
        System.out.printf("%-26s %12s %14s %14s%n", "Method", "Time (ms)", "Rows/sec", "vs Best");
        System.out.printf("%-26s %12s %14s %14s%n", "-".repeat(26), "-".repeat(12), "-".repeat(14), "-".repeat(14));

        for (var r : results) {
            double ratio = r.medianMs / bestMs;
            String comparison = ratio < 1.01 ? "fastest" : String.format("%.1fx slower", ratio);
            System.out.printf("%-26s %,12.1f %,14.0f %14s%n",
                r.name, r.medianMs, r.rowsPerSec(), comparison);
        }
    }

    public static void generateReport(
            List<List<MethodResult>> allResults, int[] batchSizes,
            Map<String, List<MethodResult>> chunkExperiment, int[] chunkSizes
    ) throws IOException {
        var is = BenchmarkHarness.class.getResourceAsStream("/report-template.html");
        Objects.requireNonNull(is, "report-template.html not found on classpath");
        var template = new String(is.readAllBytes());

        var charts = new StringBuilder();

        // Chart 1: Scale chart (rows/sec vs total rows for each method)
        charts.append(buildScaleChart(allResults, batchSizes));

        // Chunk size experiment data is printed to console only, not included in the HTML report

        // Tables
        var sections = new StringBuilder();
        for (int i = 0; i < allResults.size(); i++) {
            sections.append(buildResultsTable(allResults.get(i), batchSizes[i]));
        }

        var sysInfo = new StringBuilder();
        sysInfo.append(sysRow("Java", System.getProperty("java.version") + " (" + System.getProperty("java.vendor") + ")"));
        sysInfo.append(sysRow("OS", System.getProperty("os.name") + " " + System.getProperty("os.version")));
        sysInfo.append(sysRow("Arch", System.getProperty("os.arch")));
        sysInfo.append(sysRow("CPUs", String.valueOf(Runtime.getRuntime().availableProcessors())));
        sysInfo.append(sysRow("Max Memory", String.format("%,d MB", Runtime.getRuntime().maxMemory() / 1024 / 1024)));
        sysInfo.append(sysRow("PostgreSQL", "18 (TestContainers)"));
        sysInfo.append(sysRow("Warmup Runs", String.valueOf(WARMUP_RUNS)));
        sysInfo.append(sysRow("Measurement Runs", String.valueOf(MEASUREMENT_RUNS)));

        var html = template
            .replace("{{CHARTS}}", charts.toString())
            .replace("{{RESULTS_SECTIONS}}", sections.toString())
            .replace("{{SYSTEM_INFO}}", sysInfo.toString());

        Files.writeString(Path.of("benchmark-report.html"), html);
        System.out.println("\nReport written to benchmark-report.html");
    }

    private static String buildScaleChart(List<List<MethodResult>> allResults, int[] batchSizes) {
        // Collect method names from first result set
        var methodNames = allResults.getFirst().stream().map(MethodResult::name).toList();

        var sb = new StringBuilder();
        sb.append("<div class=\"chart-section\">\n");
        sb.append("  <h2>Throughput vs Total Rows</h2>\n");
        sb.append("  <div class=\"chart-container\"><canvas id=\"scaleChart\"></canvas></div>\n");
        sb.append("  <script>\n");
        sb.append("  new Chart(document.getElementById('scaleChart'), {\n");
        sb.append("    type: 'line',\n");
        sb.append("    data: {\n");
        sb.append("      labels: [");
        for (int i = 0; i < batchSizes.length; i++) {
            if (i > 0) sb.append(", ");
            sb.append("'").append(formatLabel(batchSizes[i])).append("'");
        }
        sb.append("],\n");
        sb.append("      datasets: [\n");

        for (int m = 0; m < methodNames.size(); m++) {
            String name = methodNames.get(m);
            sb.append("        { label: '").append(name).append("',\n");
            sb.append("          borderColor: '").append(COLORS[m % COLORS.length]).append("',\n");
            sb.append("          backgroundColor: '").append(COLORS[m % COLORS.length]).append("22',\n");
            sb.append("          tension: 0,\n");
            sb.append("          data: [");
            for (int i = 0; i < allResults.size(); i++) {
                if (i > 0) sb.append(", ");
                sb.append(String.format("%.0f", allResults.get(i).get(m).rowsPerSec()));
            }
            sb.append("] },\n");
        }

        sb.append("      ]\n    },\n");
        sb.append("    options: {\n");
        sb.append("      responsive: true,\n");
        sb.append("      plugins: { legend: { position: 'right' } },\n");
        sb.append("      scales: {\n");
        sb.append("        y: { type: 'logarithmic', title: { display: true, text: 'Rows/sec (log scale)' } },\n");
        sb.append("        x: { title: { display: true, text: 'Total rows inserted' } }\n");
        sb.append("      }\n");
        sb.append("    }\n  });\n  </script>\n</div>\n");
        return sb.toString();
    }

    private static String buildChunkChart(Map<String, List<MethodResult>> experiment, int[] chunkSizes) {
        var sb = new StringBuilder();
        sb.append("<div class=\"chart-section\">\n");
        sb.append("  <h2>Effect of Batch/Chunk Size (100,000 rows total)</h2>\n");
        sb.append("  <div class=\"chart-container\"><canvas id=\"chunkChart\"></canvas></div>\n");
        sb.append("  <script>\n");
        sb.append("  new Chart(document.getElementById('chunkChart'), {\n");
        sb.append("    type: 'line',\n");
        sb.append("    data: {\n");
        sb.append("      labels: [");
        for (int i = 0; i < chunkSizes.length; i++) {
            if (i > 0) sb.append(", ");
            sb.append("'").append(formatLabel(chunkSizes[i])).append("'");
        }
        sb.append("],\n");
        sb.append("      datasets: [\n");

        int colorIdx = 0;
        for (var entry : experiment.entrySet()) {
            sb.append("        { label: '").append(entry.getKey()).append("',\n");
            sb.append("          borderColor: '").append(COLORS[colorIdx % COLORS.length]).append("',\n");
            sb.append("          backgroundColor: '").append(COLORS[colorIdx % COLORS.length]).append("22',\n");
            sb.append("          tension: 0,\n");
            sb.append("          data: [");
            var results = entry.getValue();
            for (int i = 0; i < results.size(); i++) {
                if (i > 0) sb.append(", ");
                sb.append(String.format("%.0f", results.get(i).rowsPerSec()));
            }
            sb.append("] },\n");
            colorIdx++;
        }

        sb.append("      ]\n    },\n");
        sb.append("    options: {\n");
        sb.append("      responsive: true,\n");
        sb.append("      plugins: { legend: { position: 'right' } },\n");
        sb.append("      scales: {\n");
        sb.append("        y: { title: { display: true, text: 'Rows/sec' } },\n");
        sb.append("        x: { title: { display: true, text: 'Batch/chunk size' } }\n");
        sb.append("      }\n");
        sb.append("    }\n  });\n  </script>\n</div>\n");
        return sb.toString();
    }

    private static String buildResultsTable(List<MethodResult> results, int batchSize) {
        double bestMs = results.stream().mapToDouble(MethodResult::medianMs).min().orElse(1);

        var sb = new StringBuilder();
        sb.append("<div class=\"batch-section\">\n");
        sb.append(String.format("  <h2>%,d rows</h2>\n", batchSize));
        sb.append("  <table class=\"results-table\">\n");
        sb.append("    <thead><tr><th>Method</th><th>Time (ms)</th><th>Rows/sec</th><th>vs Best</th></tr></thead>\n");
        sb.append("    <tbody>\n");

        for (var r : results) {
            double ratio = r.medianMs / bestMs;
            boolean isBest = ratio < 1.01;
            String comparison = isBest ? "fastest" : String.format("%.1fx slower", ratio);
            String cls = isBest ? " class=\"winner\"" : "";
            sb.append(String.format(
                "      <tr%s><td>%s</td><td class=\"number\">%,.1f</td><td class=\"number\">%,.0f</td><td>%s</td></tr>\n",
                cls, r.name, r.medianMs, r.rowsPerSec(), comparison));
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
