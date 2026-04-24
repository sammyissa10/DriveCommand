/**
 * Aggregate workflows router.
 * Mounted as `workflows` in appRouter (root.ts).
 */
import { router } from '@/server/api/trpc';
import { stepTemplateRouter } from './stepTemplate';
import { playbookRouter } from './playbook';

export const workflowsRouter = router({
  stepTemplate: stepTemplateRouter,
  playbook: playbookRouter,
});
