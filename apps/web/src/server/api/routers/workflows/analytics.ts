/**
 * Analytics tRPC router for Workflow Engine.
 *
 * All procedures are tenant-scoped via ctx.tenantId.
 * No cross-tenant data is returned.
 *
 * Procedures:
 *   getPlaybookStats     — completion rate per playbook
 *   getAvgCompletionTime — average startedAt→completedAt delta per playbook
 *   getStepDropOff       — step-level status counts for a given playbook
 */
import { z } from 'zod';
import { router, tenantMemberProcedure } from '@/server/api/trpc';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

const daysInput = z.number().int().min(1).max(365).default(30);

// ─── getPlaybookStats ─────────────────────────────────────────────────────────
const getPlaybookStats = tenantMemberProcedure
  .input(z.object({ days: daysInput }))
  .query(async ({ ctx, input }) => {
    const since = new Date(Date.now() - input.days * 86_400_000);

    const [total, completed, playbooks] = await Promise.all([
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.playbookInstance.groupBy({
          by: ['playbookId'],
          where: { tenantId: ctx.tenantId, createdAt: { gte: since } },
          _count: { id: true },
        });
      }, TX_OPTIONS),
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.playbookInstance.groupBy({
          by: ['playbookId'],
          where: { tenantId: ctx.tenantId, status: 'COMPLETED', createdAt: { gte: since } },
          _count: { id: true },
        });
      }, TX_OPTIONS),
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.playbook.findMany({
          where: { tenantId: ctx.tenantId, deletedAt: null },
          select: { id: true, name: true },
        });
      }, TX_OPTIONS),
    ]);

    return total.map((t) => {
      const c = completed.find((x) => x.playbookId === t.playbookId);
      const pb = playbooks.find((p) => p.id === t.playbookId);
      const completionRate = t._count.id > 0 ? (c?._count.id ?? 0) / t._count.id : 0;
      return {
        playbookId: t.playbookId,
        playbookName: pb?.name ?? 'Unknown',
        total: t._count.id,
        completed: c?._count.id ?? 0,
        completionRate: Math.round(completionRate * 100), // 0–100 integer for chart
      };
    });
  });

// ─── getAvgCompletionTime ─────────────────────────────────────────────────────
const getAvgCompletionTime = tenantMemberProcedure
  .input(z.object({ days: daysInput }))
  .query(async ({ ctx, input }) => {
    const since = new Date(Date.now() - input.days * 86_400_000);

    const completed = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.playbookInstance.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: 'COMPLETED',
          completedAt: { not: null },
          startedAt: { not: null },
          createdAt: { gte: since },
        },
        select: { playbookId: true, startedAt: true, completedAt: true },
      });
    }, TX_OPTIONS);

    // Group and compute mean duration per playbook
    const byPlaybook: Record<string, number[]> = {};
    for (const inst of completed) {
      if (!inst.startedAt || !inst.completedAt) continue;
      const hours = (inst.completedAt.getTime() - inst.startedAt.getTime()) / 3_600_000;
      if (!byPlaybook[inst.playbookId]) byPlaybook[inst.playbookId] = [];
      byPlaybook[inst.playbookId].push(hours);
    }

    return Object.entries(byPlaybook).map(([playbookId, durations]) => ({
      playbookId,
      avgHours:
        Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10,
      sampleCount: durations.length,
    }));
  });

// ─── getStepDropOff ───────────────────────────────────────────────────────────
const getStepDropOff = tenantMemberProcedure
  .input(z.object({ playbookId: z.string().uuid(), days: daysInput }))
  .query(async ({ ctx, input }) => {
    const since = new Date(Date.now() - input.days * 86_400_000);

    // Step 1: get instance IDs scoped to this tenant + playbook + time range
    // (Avoids Prisma groupBy cross-tenant issue — prefetch IDs then filter)
    const instanceIds = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      const rows = await tx.playbookInstance.findMany({
        where: {
          tenantId: ctx.tenantId,
          playbookId: input.playbookId,
          createdAt: { gte: since },
        },
        select: { id: true },
      });
      return rows.map((r) => r.id);
    }, TX_OPTIONS);

    if (instanceIds.length === 0) return [];

    // Step 2: count StepInstances by stepTemplateId + status
    const stepCounts = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.stepInstance.groupBy({
        by: ['stepTemplateId', 'status'],
        where: { playbookInstanceId: { in: instanceIds } },
        _count: { id: true },
      });
    }, TX_OPTIONS);

    // Step 3: fetch step names for display
    const stepTemplateIds = [
      ...new Set(stepCounts.map((s) => s.stepTemplateId).filter(Boolean)),
    ] as string[];

    const stepTemplates =
      stepTemplateIds.length > 0
        ? await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
            return tx.stepTemplate.findMany({
              where: { id: { in: stepTemplateIds } },
              select: { id: true, name: true },
            });
          }, TX_OPTIONS)
        : [];

    // Aggregate: one entry per stepTemplate, with counts per status
    type StepRow = {
      stepName: string;
      NOT_STARTED: number;
      IN_PROGRESS: number;
      SKIPPED: number;
      FAILED: number;
      COMPLETED: number;
    };
    const byStep: Record<string, StepRow> = {};

    for (const row of stepCounts) {
      const id = row.stepTemplateId ?? 'unknown';
      if (!byStep[id]) {
        const tmpl = stepTemplates.find((t) => t.id === id);
        byStep[id] = {
          stepName: tmpl?.name ?? id.slice(0, 8),
          NOT_STARTED: 0,
          IN_PROGRESS: 0,
          SKIPPED: 0,
          FAILED: 0,
          COMPLETED: 0,
        };
      }
      const status = row.status as keyof StepRow;
      if (status in byStep[id]) {
        (byStep[id] as Record<string, number | string>)[status] = row._count.id;
      }
    }

    // Sort descending by total incomplete (NOT_STARTED + SKIPPED + FAILED) — highest drop-off first
    return Object.values(byStep).sort(
      (a, b) =>
        b.NOT_STARTED + b.SKIPPED + b.FAILED - (a.NOT_STARTED + a.SKIPPED + a.FAILED),
    );
  });

export const analyticsRouter = router({
  getPlaybookStats,
  getAvgCompletionTime,
  getStepDropOff,
});
