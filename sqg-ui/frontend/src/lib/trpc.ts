import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@sqg-ui/server/trpc';

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: '/trpc',
    }),
  ],
});
