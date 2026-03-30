import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  logger: false,
});

// Detect static frontend directory
const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir = [
  join(__dirname, 'ui-public'),       // bundled in sqg/dist/ui-public
  join(__dirname, '../ui-public'),     // alternative location
  join(__dirname, '../../frontend/dist'), // dev: sqg-ui/frontend/dist
].find(d => existsSync(join(d, 'index.html')));

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function main() {
  // Register CORS (only needed in dev mode with separate vite server)
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

  // Serve static frontend files if available
  if (staticDir) {
    console.log(`Serving frontend from: ${staticDir}`);

    server.get('/*', async (request, reply) => {
      const urlPath = request.url.split('?')[0];

      // Try the exact path first, then fall back to index.html (SPA routing)
      const candidates = [
        join(staticDir, urlPath),
        join(staticDir, 'index.html'),
      ];

      for (const filePath of candidates) {
        if (existsSync(filePath) && !filePath.endsWith('/')) {
          const ext = extname(filePath);
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          const content = readFileSync(filePath);
          return reply.type(contentType).send(content);
        }
      }

      return reply.code(404).send('Not found');
    });
  }

  // Start server
  const port = parseInt(process.env.PORT || '3000', 10);
  const host = process.env.HOST || '0.0.0.0';

  try {
    await server.listen({ port, host });
    console.log(`Server running at http://localhost:${port}`);
    if (staticDir) {
      console.log(`Frontend: http://localhost:${port}`);
    } else {
      console.log('No frontend build found. Run vite dev server separately.');
    }
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();
