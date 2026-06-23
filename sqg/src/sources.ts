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
  /**
   * Existing Postgres DSN to introspect against instead of starting a throwaway
   * container. When set, the live database's real schema is used and the
   * source's `:source=` BASELINE blocks are NOT applied (avoiding schema drift).
   */
  url?: string;
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
      // A `url` points at an existing database: introspect its real, live schema
      // (no container, no BASELINE DDL applied). This is the drift-free path.
      if (source.url) {
        attachments.push({ alias: source.name, connectionUri: source.url });
        continue;
      }

      reporter?.onContainerStarting?.();
      let container: StartedPostgreSqlContainer;
      try {
        container = await new PostgreSqlContainer(source.image)
          .withDatabase("sqg-db")
          .withUsername("sqg")
          .withPassword("secret")
          .start();
      } catch (e) {
        throw new DatabaseError(
          `Could not start a Postgres container for source '${source.name}': ${(e as Error).message}`,
          "postgres",
          "Postgres sources need Docker to introspect schema. Start Docker, or set 'url' on the source to point at an existing Postgres database (e.g. url: $DATABASE_URL).",
        );
      }
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
