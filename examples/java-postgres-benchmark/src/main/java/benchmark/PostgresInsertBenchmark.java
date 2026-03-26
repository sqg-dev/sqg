package benchmark;

import generated.Queries;
import org.testcontainers.postgresql.PostgreSQLContainer;

import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;

import static benchmark.BenchmarkHarness.*;

public class PostgresInsertBenchmark {

    static final int[] BATCH_SIZES = {100, 1_000, 10_000, 100_000, 1_000_000};
    static final int[] CHUNK_SIZES = {50, 100, 500, 1_000, 5_000, 10_000};
    static final int CHUNK_EXPERIMENT_TOTAL = 100_000;

    public static void main(String[] args) throws Exception {
        System.out.println("PostgreSQL Insert Benchmark");
        System.out.println("==========================");
        System.out.println("Starting PostgreSQL container...");

        try (var postgres = new PostgreSQLContainer("postgres:18-alpine")) {
            postgres.start();
            System.out.println("PostgreSQL ready.");

            try (var methods = new InsertMethods()) {
                methods.initRewriteConnection(
                    postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());

                String duckPgConn = String.format(
                    "dbname=%s user=%s password=%s host=%s port=%d",
                    postgres.getDatabaseName(), postgres.getUsername(),
                    postgres.getPassword(), postgres.getHost(),
                    postgres.getMappedPort(5432));
                System.out.println("Initializing DuckDB + postgres extension...");
                methods.initDuckDB(duckPgConn);
                System.out.println("DuckDB ready.\n");

                try (var conn = DriverManager.getConnection(
                        postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())) {

                    Queries.applyMigrations(conn);

                    // Phase 1: Main benchmark across total row counts
                    var allResults = new ArrayList<List<MethodResult>>();

                    for (int batchSize : BATCH_SIZES) {
                        System.out.printf("Generating %,d rows of test data...%n", batchSize);
                        var rows = SensorDataGenerator.generate(batchSize);

                        var results = new ArrayList<MethodResult>();
                        results.add(measure("Individual INSERT",      conn, rows, methods::insertIndividual));
                        results.add(measure("Batch INSERT",           conn, rows, methods::insertBatch));
                        results.add(measure("Batch (rewrite=true)",   conn, rows, methods::insertBatchRewrite));
                        results.add(measure("Multi-value INSERT",     conn, rows, methods::insertMultiValue));
                        results.add(measure("UNNEST",                 conn, rows, methods::insertUnnest));
                        results.add(measure("COPY CSV",               conn, rows, methods::insertCopyCsv));
                        results.add(measure("COPY BINARY",      conn, rows, methods::insertCopyBinary));
                        results.add(measure("DuckDB -> PostgreSQL",   conn, rows, methods::insertViaDuckDB));
                        results.add(measure("Arrow -> DuckDB -> PG",  conn, rows, methods::insertViaArrow));

                        printResults(batchSize, results);
                        System.out.printf("%n  DuckDB breakdown:  append %.1f ms + copy to PG %.1f ms%n",
                            methods.lastDuckAppendMs, methods.lastDuckCopyMs);
                        System.out.printf("  Arrow breakdown:   build  %.1f ms + copy to PG %.1f ms%n",
                            methods.lastArrowBuildMs, methods.lastArrowCopyMs);
                        allResults.add(results);
                    }

                    // Phase 2: Chunk size experiment (100K rows, vary internal batch/chunk size)
                    System.out.printf("%n%n=== Chunk Size Experiment (%,d rows) ===%n", CHUNK_EXPERIMENT_TOTAL);
                    var chunkRows = SensorDataGenerator.generate(CHUNK_EXPERIMENT_TOTAL);
                    var chunkExperiment = new LinkedHashMap<String, List<MethodResult>>();

                    var batchResults = new ArrayList<MethodResult>();
                    var multiValueResults = new ArrayList<MethodResult>();
                    for (int chunk : CHUNK_SIZES) {
                        System.out.printf("  chunk size = %,d ...%n", chunk);
                        batchResults.add(measure(
                            "Batch (chunk=" + chunk + ")", conn, chunkRows,
                            (c, r) -> methods.insertBatchWithSize(c, r, chunk)));
                        multiValueResults.add(measure(
                            "Multi-value (chunk=" + chunk + ")", conn, chunkRows,
                            (c, r) -> methods.insertMultiValueWithSize(c, r, chunk)));
                    }
                    chunkExperiment.put("Batch INSERT", batchResults);
                    chunkExperiment.put("Multi-value INSERT", multiValueResults);

                    // Print chunk experiment results
                    System.out.printf("%n%-26s", "Chunk size");
                    for (int c : CHUNK_SIZES) System.out.printf(" %10s", formatChunk(c));
                    System.out.println();
                    for (var entry : chunkExperiment.entrySet()) {
                        System.out.printf("%-26s", entry.getKey());
                        for (var r : entry.getValue()) {
                            System.out.printf(" %,10.0f", r.rowsPerSec());
                        }
                        System.out.println(" rows/sec");
                    }

                    generateReport(allResults, BATCH_SIZES, chunkExperiment, CHUNK_SIZES);
                }
            }
        }
    }

    private static String formatChunk(int n) {
        if (n >= 1_000) return n / 1_000 + "K";
        return String.valueOf(n);
    }
}
