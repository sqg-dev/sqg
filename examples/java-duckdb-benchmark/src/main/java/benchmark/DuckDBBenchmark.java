package benchmark;

import generated.Queries;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.List;

import static benchmark.BenchmarkHarness.*;

public class DuckDBBenchmark {

    static final int[] SIZES = {1_000, 5_000, 10_000, 50_000, 100_000, 500_000, 1_000_000};

    // Skip slow row-by-row methods above these thresholds
    static final int MAX_INDIVIDUAL = 100_000;
    static final int MAX_BATCH = 100_000;

    public static void main(String[] args) throws Exception {
        var argList = List.of(args);
        boolean runAll = argList.contains("--all");
        // --only=Arrow filters to methods whose name contains the value (case-insensitive)
        String onlyFilter = argList.stream()
            .filter(a -> a.startsWith("--only="))
            .map(a -> a.substring(7).toLowerCase())
            .findFirst().orElse(null);

        System.out.println("DuckDB Insert / Update / Delete Benchmark");
        System.out.println("=========================================");
        if (runAll) {
            System.out.println("Mode: --all (including slow methods at every size)");
        }
        if (onlyFilter != null) {
            System.out.println("Filter: --only=" + onlyFilter);
        }

        int maxIndividual = runAll ? Integer.MAX_VALUE : MAX_INDIVIDUAL;
        int maxBatch      = runAll ? Integer.MAX_VALUE : MAX_BATCH;

        var dbPath = Path.of(System.getProperty("java.io.tmpdir"), "sqg_benchmark.duckdb");
        Files.deleteIfExists(dbPath);
        Files.deleteIfExists(Path.of(dbPath + ".wal"));
        System.out.println("Database: " + dbPath);

        try (var insertMethods = new InsertMethods();
             var conn = DriverManager.getConnection("jdbc:duckdb:" + dbPath)) {

            Queries.applyMigrations(conn);

            var deleteMethods = new DeleteMethods();
            var updateMethods = new UpdateMethods();
            var tableFnMethods = new TableFunctionMethods();
            tableFnMethods.register(conn);

            var allInserts = new ArrayList<List<MethodResult>>();
            var allUpdates = new ArrayList<List<MethodResult>>();
            var allDeletes = new ArrayList<List<MethodResult>>();

            for (int size : SIZES) {
                System.out.printf("%nGenerating %,d rows...%n", size);
                var rows = SensorDataGenerator.generate(size);

                // ---- INSERT ----
                var insertResults = new ArrayList<MethodResult>();
                if (size <= maxIndividual && match("Individual INSERT", onlyFilter)) {
                    insertResults.add(measureInsert("Individual INSERT", conn, rows, insertMethods::insertIndividual));
                }
                if (size <= maxBatch && match("Batch", onlyFilter)) {
                    insertResults.add(measureInsert("Batch (:batch)",       conn, rows, insertMethods::insertBatch));
                }
                if (size <= maxBatch && match("Multi-value", onlyFilter)) {
                    insertResults.add(measureInsert("Multi-value INSERT",   conn, rows, insertMethods::insertMultiValue));
                }
                if (match("Appender", onlyFilter))
                    insertResults.add(measureInsert("Appender (:appender)", conn, rows, insertMethods::insertAppender));
                if (match("Arrow", onlyFilter))
                    insertResults.add(measureInsert("Arrow stream",         conn, rows, insertMethods::insertArrow));
                if (match("Table function", onlyFilter))
                    insertResults.add(measureInsert("Table function",       conn, rows, tableFnMethods::insertViaTableFunction));
                if (!insertResults.isEmpty()) {
                    printResults("INSERT", size, insertResults);
                    allInserts.add(insertResults);
                }

                // ---- UPDATE ----
                var updateResults = new ArrayList<MethodResult>();
                if (size <= maxIndividual && match("Individual UPDATE", onlyFilter)) {
                    updateResults.add(measureUpdate("Individual UPDATE", conn, rows,
                        (c, r) -> updateMethods.updateIndividual(c, r), insertMethods));
                }
                if (size <= maxBatch && match("Batch", onlyFilter)) {
                    updateResults.add(measureUpdate("Batch (:batch)", conn, rows,
                        (c, r) -> updateMethods.updateBatch(c, r), insertMethods));
                }
                if (match("UNNEST", onlyFilter))
                    updateResults.add(measureUpdate("UNNEST list params", conn, rows,
                        (c, r) -> updateMethods.updateUnnest(c, r), insertMethods));
                if (match("Arrow", onlyFilter))
                    updateResults.add(measureUpdate("Arrow stream join", conn, rows,
                        (c, r) -> updateMethods.updateViaArrow(c, r, insertMethods), insertMethods));
                if (match("Temp table", onlyFilter))
                    updateResults.add(measureUpdate("Temp table join", conn, rows,
                        (c, r) -> updateMethods.updateViaTempTable(c, r), insertMethods));
                if (match("Table function", onlyFilter))
                    updateResults.add(measureUpdate("Table function", conn, rows,
                        (c, r) -> tableFnMethods.updateViaTableFunction(c, r), insertMethods));
                if (!updateResults.isEmpty()) {
                    printResults("UPDATE", size, updateResults);
                    allUpdates.add(updateResults);
                }

                // ---- DELETE ----
                var deleteResults = new ArrayList<MethodResult>();
                if (size <= maxIndividual && match("Individual DELETE", onlyFilter)) {
                    deleteResults.add(measureDelete("Individual DELETE", conn, rows,
                        (c, r) -> deleteMethods.deleteIndividual(c, r), insertMethods));
                }
                if (size <= maxBatch && match("Batch", onlyFilter)) {
                    deleteResults.add(measureDelete("Batch (:batch)", conn, rows,
                        (c, r) -> deleteMethods.deleteBatch(c, r), insertMethods));
                }
                if (match("UNNEST", onlyFilter))
                    deleteResults.add(measureDelete("UNNEST list params", conn, rows,
                        (c, r) -> deleteMethods.deleteUnnest(c, r), insertMethods));
                if (match("Arrow", onlyFilter))
                    deleteResults.add(measureDelete("Arrow stream join", conn, rows,
                        (c, r) -> deleteMethods.deleteViaArrow(c, r, insertMethods), insertMethods));
                if (match("Temp table", onlyFilter))
                    deleteResults.add(measureDelete("Temp table join", conn, rows,
                        (c, r) -> deleteMethods.deleteViaTempTable(c, r), insertMethods));
                if (match("Table function", onlyFilter))
                    deleteResults.add(measureDelete("Table function", conn, rows,
                        (c, r) -> tableFnMethods.deleteViaTableFunction(c, r), insertMethods));
                if (!deleteResults.isEmpty()) {
                    printResults("DELETE", size, deleteResults);
                    allDeletes.add(deleteResults);
                }
            }

            // Pad result columns so every size has the same method set for the chart
            normalize(allInserts);
            normalize(allUpdates);
            normalize(allDeletes);

            generateReport(conn,
                "DuckDB Insert / Update / Delete Benchmark",
                "Comparing JDBC :batch, appender, Arrow, UNNEST list params, and temp-table join",
                allInserts, SIZES,
                allUpdates, SIZES,
                allDeletes, SIZES
            );
        } finally {
            Files.deleteIfExists(dbPath);
            Files.deleteIfExists(Path.of(dbPath + ".wal"));
        }
    }

    private static boolean match(String methodName, String filter) {
        return filter == null || methodName.toLowerCase().contains(filter);
    }

    /**
     * Ensures every size in the batch list has the same set of method names,
     * in the same order, padding missing ones with NaN results.
     */
    private static void normalize(List<List<MethodResult>> runs) {
        // Collect union of method names in insertion order (first-seen wins)
        var orderedNames = new ArrayList<String>();
        for (var run : runs) {
            for (var r : run) {
                if (!orderedNames.contains(r.name())) orderedNames.add(r.name());
            }
        }
        for (int i = 0; i < runs.size(); i++) {
            var run = runs.get(i);
            var patched = new ArrayList<MethodResult>(orderedNames.size());
            for (var name : orderedNames) {
                MethodResult hit = null;
                for (var r : run) if (r.name().equals(name)) { hit = r; break; }
                patched.add(hit != null ? hit : new MethodResult(name, Double.NaN, 0));
            }
            runs.set(i, patched);
        }
    }
}
