import consola from "consola";
import type { SQLQuery, TableInfo } from "../sql-query.js";
import type { ProgressReporter } from "../ui.js";

export interface DatabaseEngine {
  executeQueries(queries: SQLQuery[], reporter?: ProgressReporter): Promise<void> | void;
  initializeDatabase(queries: SQLQuery[], reporter?: ProgressReporter): Promise<void> | void;
  /** Introspect table schemas for appender generation */
  introspectTables(tables: TableInfo[], reporter?: ProgressReporter): Promise<void> | void;

  close(): Promise<void> | void;
}

export async function initializeDatabase(
  queries: SQLQuery[],
  execQueries: (query: SQLQuery) => Promise<void>,
  reporter?: ProgressReporter,
) {
  // BASELINE blocks describe schema owned outside SQG (e.g. created by an ETL job
  // or sibling service). They run first so that subsequent MIGRATE blocks can
  // reference those tables, and they are not tracked or emitted as migrations.
  const baselineQueries = queries.filter((q) => q.isBaseline);
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
