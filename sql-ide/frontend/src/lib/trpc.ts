import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@sql-ide/server/trpc';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/trpc',
    }),
  ],
});
