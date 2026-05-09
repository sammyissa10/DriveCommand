import { router } from './trpc';
import { workflowsRouter } from './routers/workflows';

/**
 * Root tRPC router. All sub-routers are mounted here.
 */
export const appRouter = router({
  workflows: workflowsRouter,
});

export type AppRouter = typeof appRouter;
