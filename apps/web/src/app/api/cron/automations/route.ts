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
import { prisma } from '@/lib/db/prisma';
import { getAdminDb } from '@/lib/db/admin-prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { CronFailures, cronStatus } from '@/lib/cron/failure-report';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';

export async function GET(request: NextRequest) {
  // Verify CRON_SECRET (timing-safe comparison)
  if (!verifyCronSecret(request)) {
    return cronUnauthorizedResponse();
  }

  console.log('[cron/automations] Starting evaluator run');

  /**
   * quick-603 — `scheduleCronDrivenRule`'s per-candidate catch used to
   * `console.error` and move on with NO counter of any kind, and the route then
   * returned `{ok:true, …}`. Every tenant's nudge could fail to schedule and the
   * response said the run was fine. `console.error` also means Sentry never saw
   * it. The accumulator is threaded through so a scheduling failure is named in
   * the body, reaches Sentry, and flips the status.
   */
  const failures = new CronFailures();

  try {
    /**
     * quick-615 — ROUTE. ONE acquisition serving all FOUR `candidateQuery`
     * closures below. Each of them answers "WHICH tenants are candidates" —
     * they run before any tenant is known, so there is no tenant client that
     * could serve them, and under `app_user` they raise `TC001` (or, with the
     * tripwire off, sweep nothing while reporting `ok: true`).
     *
     * It sits INSIDE this `try` on purpose: that is where the statements it
     * serves already are, so an acquisition failure lands in exactly the catch
     * a candidate-query failure lands in today. Control flow is unchanged.
     *
     * The per-candidate dedup reads inside `scheduleCronDrivenRule` are NOT on
     * this client — they hold the loop variable and go to
     * `getTenantPrismaForOrg`.
     */
    const adminDbCandidates = await getAdminDb('automation cron candidate sweep');

    // ── Cron-driven rule: no_progress_nudge ──────────────────────────────────
    // Fires for tenants created >23h ago with completionPct = 20 (only account_created done).
    // runOncePerTenant = true → check for existing run before creating.
    // windowHours is unused for runOncePerTenant=true rules (dedup is lifetime, not windowed).
    await scheduleCronDrivenRule(failures, {
      ruleKey: 'no_progress_nudge',
      candidateQuery: async () => {
        const threshold = new Date(Date.now() - 23 * 60 * 60 * 1000);
        return adminDbCandidates.activationProgress.findMany({
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
    await scheduleCronDrivenRule(failures, {
      ruleKey: 'add_driver_nudge',
      candidateQuery: async () => {
        return adminDbCandidates.activationProgress.findMany({
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
    await scheduleCronDrivenRule(failures, {
      ruleKey: 'dispatch_load_nudge',
      candidateQuery: async () => {
        return adminDbCandidates.activationProgress.findMany({
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
    await scheduleCronDrivenRule(failures, {
      ruleKey: 'trial_ending_soon',
      windowHours: 20,
      runOncePerTenant: false,
      candidateQuery: async () => {
        const trialEndMin = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        const trialEndMax = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
        return adminDbCandidates.subscription.findMany({
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
    if (result.failed > 0) {
      // `runEvaluator` returns counts only (`{pendingCreated, executed, failed}`)
      // and logs its own per-run detail. Recording it keeps the single
      // `failureCount` invariant true — otherwise `ok` could be `true` beside a
      // non-zero `failed`, which is the exact symptom this task exists to end.
      failures.record(
        `[cron/automations] ${result.failed} automation run(s) failed`,
        'evaluator',
        new Error(`${result.failed} automation run(s) failed`),
        { evaluator: result },
      );
    }

    const report = failures.report();
    console.log('[cron/automations] Complete', { ...result, ...report });
    return NextResponse.json(
      { ok: failures.ok, ...result, ...report },
      { status: cronStatus(failures) },
    );
  } catch (err) {
    console.error('[cron/automations] Unhandled error:', err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        ...failures.report(),
      },
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

async function scheduleCronDrivenRule(
  failures: CronFailures,
  opts: CronRuleOptions,
): Promise<void> {
  const { ruleKey, windowHours, candidateQuery, runOncePerTenant = true } = opts;

  // quick-615 — ROUTE. `AutomationRule` rows here are PLATFORM scope and this
  // read happens before any tenant is known — it is what decides whether the
  // sweep runs at all. Under `app_user` it raises, and with the tripwire off it
  // returns null, at which point the route logs "rule not found or inactive"
  // and skips every rule on the platform.
  const adminDbRule = await getAdminDb('automation cron candidate sweep');
  const rule = await adminDbRule.automationRule.findUnique({
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
      // quick-600 (B5) — CORRECT, not ROUTE. `tenantId` is the loop
      // variable, already known per candidate row — same shape as
      // workflow-notifications:81/:96 and evaluator.ts's optimistic status
      // update. Not in the design doc's original snapshot (Fact #9); see
      // ROUTING-MANIFEST.md §5.
      const tenantDb = await getTenantPrismaForOrg(tenantId);
      await tenantDb.automationRun.create({
        data: {
          ruleId: rule.id,
          tenantId,
          triggeredBy: `cron:${ruleKey}`,
          status: 'PENDING',
          scheduledAt: new Date(),
        },
      });
      console.log(`[cron] Scheduled PENDING run for ruleKey=${ruleKey} tenantId=${tenantId}`);
    } catch (err) {
      // The loop still continues — one tenant's scheduling failure must not
      // stop the rest. What changed is that it is now counted and named.
      failures.record(
        `[cron] Failed to schedule run for ruleKey=${ruleKey} tenantId=${tenantId}`,
        `tenant:${tenantId}:${ruleKey}`,
        err,
        { ruleKey },
      );
    }
  }
}
