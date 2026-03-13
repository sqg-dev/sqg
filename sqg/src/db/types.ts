import consola from "consola";
import { sortBy } from "es-toolkit";
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
  // Find and run the setup query
  const migrationQueries = queries.filter((q) => q.isMigrate);

  sortBy(migrationQueries, [(q) => Number(q.id.split("_")[1])]);
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

  if (migrationQueries.length + testdataQueries.length === 0) {
    consola.warn("No migration or testdata queries found");
  }

  reporter?.onDatabaseInitialized?.();
}
