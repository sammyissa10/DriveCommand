/**
 * Aggregate workflows router.
 * Mounted as `workflows` in appRouter (root.ts).
 */
import { router } from '@/server/api/trpc';
import { stepTemplateRouter } from './stepTemplate';
import { playbookRouter } from './playbook';
import { instanceRouter } from './instance';
import { stepInstanceRouter } from './stepInstance';
import { triggerRouter } from './trigger';
import { analyticsRouter } from './analytics';

export const workflowsRouter = router({
  stepTemplate: stepTemplateRouter,
  playbook: playbookRouter,
  instance: instanceRouter,
  stepInstance: stepInstanceRouter,
  trigger: triggerRouter,
  analytics: analyticsRouter,
});
