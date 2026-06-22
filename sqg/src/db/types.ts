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
