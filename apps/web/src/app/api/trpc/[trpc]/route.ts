import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { createTRPCContext } from '@/server/api/trpc';
import { appRouter } from '@/server/api/root';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: '/api/trpc',
    req,
    router: appRouter,
    createContext: () => createTRPCContext({ headers: req.headers }),
    onError: ({ error, path }) => {
      console.error(`[tRPC] ${path} ->`, error.message);
    },
  });

export { handler as GET, handler as POST };
