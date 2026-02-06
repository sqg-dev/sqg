import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

let container: StartedPostgreSqlContainer | null = null;

/**
 * Start a PostgreSQL container for testing.
 * Sets SQG_POSTGRES_URL environment variable to the container's connection URI.
 */
export async function startPostgres(): Promise<StartedPostgreSqlContainer> {
  container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("sqg-db")
    .withUsername("sqg")
    .withPassword("secret")
    .start();

  process.env.SQG_POSTGRES_URL = container.getConnectionUri();
  return container;
}

/**
 * Stop the PostgreSQL container if running.
 */
export async function stopPostgres(): Promise<void> {
  if (container) {
    await container.stop();
    container = null;
  }
}
