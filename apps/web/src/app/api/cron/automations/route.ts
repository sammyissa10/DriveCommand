/**
 * Cron endpoint — Automation Evaluator
 *
 * Schedule: Every 5 minutes (every-5-min cron expression: slash-5 star star star star)
 * Authentication: CRON_SECRET bearer token
 *
 * Calls runEvaluator() which:
 *   1. Scans new AppEvents and schedules PENDING AutomationRun rows
 *   2. Executes PENDING runs whose scheduledAt <= now()
 *   3. For cron-driven rules (no_progress_nudge, add_driver_nudge,
 *      dispatch_load_nudge, trial_ending_soon): directly scans tenant
 *      state and creates PENDING runs before calling runEvaluator()
 *
 * Returns JSON: { pendingCreated, executed, failed }
 */

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { runEvaluator } from '@/lib/automations/evaluator';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

export async function GET(request: NextRequest) {
  // Verify CRON_SECRET
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  console.log('[cron/automations] Starting evaluator run');

  try {
    // ── Cron-driven rule: no_progress_nudge ──────────────────────────────────
    // Fires for tenants created >23h ago with completionPct = 20 (only account_created done).
    // runOncePerTenant = true → check for existing run before creating.
    // windowHours is unused for runOncePerTenant=true rules (dedup is lifetime, not windowed).
    await scheduleCronDrivenRule({
      ruleKey: 'no_progress_nudge',
      candidateQuery: async () => {
        const threshold = new Date(Date.now() - 23 * 60 * 60 * 1000);
        return prisma.activationProgress.findMany({
          where: {
            completionPct: 20,
            accountCreatedAt: { lte: threshold },
            isActivated: false,
          },
          select: { tenantId: true },
        });
      },
    });

    // ── Cron-driven rule: add_driver_nudge ───────────────────────────────────
    // Fires for tenants that added their first real truck but have no driver yet.
    // runOncePerTenant = true.
    // windowHours is unused for runOncePerTenant=true rules (dedup is lifetime, not windowed).
    await scheduleCronDrivenRule({
      ruleKey: 'add_driver_nudge',
      candidateQuery: async () => {
        return prisma.activationProgress.findMany({
          where: {
            firstRealTruckAt: { not: null },
            firstRealDriverAt: null,
            isActivated: false,
          },
          select: { tenantId: true },
        });
      },
    });

    // ── Cron-driven rule: dispatch_load_nudge ─────────────────────────────────
    // Fires for tenants that have a driver but no load in transit yet.
    // runOncePerTenant = true.
    // windowHours is unused for runOncePerTenant=true rules (dedup is lifetime, not windowed).
    await scheduleCronDrivenRule({
      ruleKey: 'dispatch_load_nudge',
      candidateQuery: async () => {
        return prisma.activationProgress.findMany({
          where: {
            firstRealDriverAt: { not: null },
            firstLoadInTransitAt: null,
            isActivated: false,
          },
          select: { tenantId: true },
        });
      },
    });

    // ── Cron-driven rule: trial_ending_soon ───────────────────────────────────
    // Fires for tenants whose trial ends in 3-5 days and haven't received
    // this email within the last 20 hours.
    // runOncePerTenant = false → dedup by (tenantId, ruleKey, 20h window).
    await scheduleCronDrivenRule({
      ruleKey: 'trial_ending_soon',
      windowHours: 20,
      runOncePerTenant: false,
      candidateQuery: async () => {
        const trialEndMin = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        const trialEndMax = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
        return prisma.subscription.findMany({
          where: {
            trialEndsAt: { gte: trialEndMin, lte: trialEndMax },
            status: 'TRIALING',
          },
          select: { tenantId: true },
        });
      },
    });

    // ── Run the evaluator (executes all PENDING due runs) ─────────────────────
    const result = await runEvaluator();

    console.log('[cron/automations] Complete', result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/automations] Unhandled error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

// ── Helper: schedule a cron-driven rule for eligible tenants ─────────────────

interface CronRuleOptions {
  ruleKey: string;
  windowHours?: number;        // only used when runOncePerTenant=false
  runOncePerTenant?: boolean;  // defaults to true
  candidateQuery: () => Promise<Array<{ tenantId: string }>>;
}

async function scheduleCronDrivenRule(opts: CronRuleOptions): Promise<void> {
  const { ruleKey, windowHours, candidateQuery, runOncePerTenant = true } = opts;

  const rule = await prisma.automationRule.findUnique({
    where: { key: ruleKey },
    select: { id: true, isActive: true },
  });

  if (!rule || !rule.isActive) {
    console.log(`[cron] Rule '${ruleKey}' not found or inactive — skipping`);
    return;
  }

  const candidates = await candidateQuery();
  console.log(`[cron] Rule '${ruleKey}' — ${candidates.length} candidate tenant(s)`);

  for (const { tenantId } of candidates) {
    // Dedup check
    if (runOncePerTenant) {
      // Lifetime dedup: skip if this tenant has any run ever for this rule
      const existing = await prisma.automationRun.findFirst({
        where: { ruleId: rule.id, tenantId },
        select: { id: true },
      });
      if (existing) continue;
    } else {
      // Time-window dedup: skip if a run was fired OR is in-flight PENDING within windowHours.
      // Covers both executed runs (firedAt) and PENDING runs that haven't fired yet
      // (scheduledAt), to prevent duplicates if the evaluator is delayed.
      const wh = windowHours ?? 20;
      const windowStart = new Date(Date.now() - wh * 60 * 60 * 1000);
      const recentRun = await prisma.automationRun.findFirst({
        where: {
          ruleId: rule.id,
          tenantId,
          OR: [
            { firedAt: { gte: windowStart } },
            { status: 'PENDING', scheduledAt: { gte: windowStart } },
          ],
        },
        select: { id: true },
      });
      if (recentRun) continue;
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        await tx.automationRun.create({
          data: {
            ruleId: rule.id,
            tenantId,
            triggeredBy: `cron:${ruleKey}`,
            status: 'PENDING',
            scheduledAt: new Date(),
          },
        });
      }, TX_OPTIONS);
      console.log(`[cron] Scheduled PENDING run for ruleKey=${ruleKey} tenantId=${tenantId}`);
    } catch (err) {
      console.error(`[cron] Failed to schedule run for ruleKey=${ruleKey} tenantId=${tenantId}:`, err);
    }
  }
}
