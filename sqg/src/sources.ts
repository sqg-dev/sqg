import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import type { Attachment } from "./db/types.js";
import { DatabaseError } from "./errors.js";
import type { SQLQuery } from "./sql-query.js";
import type { ProgressReporter } from "./ui.js";

/** A `type: postgres` source resolved from the project config. */
export interface PostgresSourceSpec {
  /** Catalog alias (the source `name`), used as the DuckDB ATTACH alias. */
  name: string;
  /** Docker image to run the source's throwaway container. */
  image: string;
}

export interface PreparedSources {
  /** Catalogs to ATTACH into the DuckDB introspection connection. */
  attachments: Attachment[];
  /** Stop all started containers. Always call this once generation is done. */
  teardown: () => Promise<void>;
}

/**
 * For each `type: postgres` source: start a throwaway Postgres testcontainer,
 * run the source's schema (the BASELINE blocks tagged `:source=<name>`) natively
 * against it so introspection sees true Postgres types, and return the connection
 * info to ATTACH into DuckDB.
 *
 * The synthesized ATTACH (done by the DuckDB adapter) and these schema blocks are
 * not emitted into generated code — at runtime the application attaches the real
 * production database under the same alias.
 */
export async function preparePostgresSources(
  sources: PostgresSourceSpec[],
  queries: SQLQuery[],
  reporter?: ProgressReporter,
): Promise<PreparedSources> {
  const containers: StartedPostgreSqlContainer[] = [];
  const attachments: Attachment[] = [];

  const teardown = async () => {
    for (const container of containers) {
      try {
        await container.stop();
      } catch {
        // Best-effort cleanup; ignore stop errors.
      }
    }
  };

  try {
    for (const source of sources) {
      reporter?.onContainerStarting?.();
      const container = await new PostgreSqlContainer(source.image)
        .withDatabase("sqg-db")
        .withUsername("sqg")
        .withPassword("secret")
        .start();
      containers.push(container);
      const connectionUri = container.getConnectionUri();
      reporter?.onContainerStarted?.(connectionUri);

      // Apply the source's schema natively (true Postgres types), in source order.
      const schemaBlocks = queries.filter((q) => q.isBaseline && q.sourceTarget === source.name);
      const client = new Client({ connectionString: connectionUri });
      await client.connect();
      try {
        for (const block of schemaBlocks) {
          await client.query(block.rawQuery);
        }
      } catch (e) {
        throw new DatabaseError(
          `Failed to apply schema for postgres source '${source.name}': ${(e as Error).message}`,
          "postgres",
          `Check that the BASELINE blocks tagged ':source=${source.name}' are valid PostgreSQL.`,
        );
      } finally {
        await client.end();
      }

      attachments.push({ alias: source.name, connectionUri });
    }
  } catch (e) {
    await teardown();
    throw e;
  }

  return { attachments, teardown };
}
