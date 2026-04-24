import { router } from './trpc';

/**
 * Root tRPC router. Routers are mounted here.
 * Plan 42-04 adds workflowsRouter.
 */
export const appRouter = router({
  // workflows: workflowsRouter (added in Plan 42-04)
});

export type AppRouter = typeof appRouter;
