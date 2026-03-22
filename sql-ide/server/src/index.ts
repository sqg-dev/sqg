import { resolve } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import { appRouter } from './trpc/router';
import { createContext } from './trpc/context';
import { setProjectPath } from './trpc/context';
import { startWatching } from './watcher';

// Parse CLI arguments for --project=<path>
const projectArg = process.argv.find(arg => arg.startsWith('--project='));
const projectPathRaw = projectArg?.split('=')[1];

if (projectPathRaw) {
  const projectPath = resolve(process.cwd(), projectPathRaw);
  console.log(`Loading SQG project: ${projectPath}`);
  setProjectPath(projectPath);
  startWatching(projectPath);
}

const server = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
    },
  },
});

async function main() {
  // Register CORS
  await server.register(cors, {
    origin: ['http://localhost:5173', 'http://localhost:4173'],
  });

  // Register tRPC
  await server.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions: {
      router: appRouter,
      createContext,
    },
  });

  // Health check endpoint
  server.get('/health', async () => {
    return { status: 'ok' };
  });

  // Start server
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await server.listen({ port, host });
    console.log(`Server running at http://localhost:${port}`);
    console.log(`tRPC endpoint at http://localhost:${port}/trpc`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
