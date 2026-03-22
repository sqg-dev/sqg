import type { CreateFastifyContextOptions } from '@trpc/server/adapters/fastify';

// Module-level project path storage
let projectPath: string | null = null;

export function setProjectPath(path: string) {
  projectPath = path;
}

export function getProjectPath(): string | null {
  return projectPath;
}

export function createContext({ req, res }: CreateFastifyContextOptions) {
  return { req, res, projectPath };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
