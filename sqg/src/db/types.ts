import consola from "consola";
import type { SQLQuery, TableInfo } from "../sql-query.js";
import type { ProgressReporter } from "../ui.js";

/** An external database to ATTACH into the introspection connection (DuckDB only). */
export interface Attachment {
  /** Catalog alias used in the ATTACH statement (and referenced by queries). */
  alias: string;
  /** Connection string / URI passed to ATTACH (e.g. a postgres DSN). */
  connectionUri: string;
}

export interface InitDatabaseOptions {
  /** Catalogs to ATTACH before BASELINE/MIGRATE/TESTDATA run. Only DuckDB consumes this. */
  attachments?: Attachment[];
}

export interface DatabaseEngine {
  executeQueries(queries: SQLQuery[], reporter?: ProgressReporter): Promise<void> | void;
  initializeDatabase(
    queries: SQLQuery[],
    reporter?: ProgressReporter,
    options?: InitDatabaseOptions,
  ): Promise<void> | void;
  /** Introspect table schemas for appender generation */
  introspectTables(tables: TableInfo[], reporter?: ProgressReporter): Promise<void> | void;

  close(): Promise<void> | void;
}

/**
 * Whether an error is an integrity constraint violation (foreign key, unique,
 * check, not-null) rather than a problem with the statement itself.
 */
export function isConstraintViolation(error: unknown): boolean {
  const message = (error as Error)?.message ?? "";
  const code = String((error as { code?: unknown })?.code ?? "");
  return (
    code.startsWith("SQLITE_CONSTRAINT") || // better-sqlite3
    /^23/.test(code) || // postgres: SQLSTATE class 23 (integrity constraint violation)
    /^Constraint Error/i.test(message) || // duckdb
    /violates .* constraint|constraint failed/i.test(message)
  );
}

/**
 * Type introspection executes every EXEC statement against whatever data the
 * MIGRATE and TESTDATA blocks left behind, so a statement can fail purely
 * because a constraint has nothing to reference — a NOT NULL foreign key can
 * never be satisfied when no fixture created the parent row.
 *
 * Running an EXEC contributes nothing to the generated code (the prepared
 * statement already supplied the parameter types), so such a failure is
 * reported as a warning instead of aborting generation. Statements whose
 * result shape SQG needs (QUERY, including INSERT ... RETURNING) still fail.
 */
export function warnConstraintViolation(query: SQLQuery, error: unknown): void {
  consola.warn(
    `Skipped executing '${query.id}' in ${query.filename} during type introspection: ` +
      `${(error as Error).message}\n` +
      "  Introspection runs each statement against the TESTDATA fixtures only, so constraints " +
      "such as foreign keys may not be satisfiable. Code generation is unaffected — add a " +
      "TESTDATA block with the referenced rows to silence this warning.",
  );
}

export async function initializeDatabase(
  queries: SQLQuery[],
  execQueries: (query: SQLQuery) => Promise<void>,
  reporter?: ProgressReporter,
) {
  // BASELINE blocks describe schema owned outside SQG (e.g. created by an ETL job
  // or sibling service). They run first so that subsequent MIGRATE blocks can
  // reference those tables, and they are not tracked or emitted as migrations.
  // BASELINE blocks tagged with `:source=<name>` define the schema of an attached
  // postgres source and have already run natively against that source's container,
  // so they are skipped here.
  const baselineQueries = queries.filter((q) => q.isBaseline && !q.sourceTarget);
  for (const query of baselineQueries) {
    try {
      await execQueries(query);
    } catch (error) {
      consola.error(
        "Failed to apply baseline:" +
          (error as Error).message +
          " when running query:\n\n " +
          query.rawQuery,
      );
      throw error;
    }
  }

  // MIGRATE blocks run in source order. The migration name is an arbitrary
  // identifier (e.g. "1", "initial", "add_column") used for tracking which
  // migrations have been applied; it does not control execution order.
  const migrationQueries = queries.filter((q) => q.isMigrate);
  for (const query of migrationQueries) {
    try {
      await execQueries(query);
    } catch (error) {
      consola.error(
        "Failed to initialize database:" +
          (error as Error).message +
          " when running query:\n\n " +
          query.rawQuery,
      );
      throw error;
    }
  }

  const testdataQueries = queries.filter((q) => q.isTestdata);

  for (const query of testdataQueries) {
    try {
      await execQueries(query);
    } catch (error) {
      consola.error(
        "Failed to initialize testdata:" +
          (error as Error).message +
          " when running query:\n\n " +
          query.rawQuery,
      );
      throw error;
    }
  }

  if (baselineQueries.length + migrationQueries.length + testdataQueries.length === 0) {
    consola.warn("No baseline, migration or testdata queries found");
  }

  reporter?.onDatabaseInitialized?.();
}
