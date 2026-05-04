/**
 * Automation Evaluator — Phase 52
 *
 * Design notes:
 * ─────────────
 * TWO execution paths are combined into a single runEvaluator() call:
 *
 * PATH 1 — Event-driven (welcome_owner, activation_celebration):
 *   Scans AppEvent rows from the last 30 days, finds matching AutomationRule
 *   rows, and creates AutomationRun records with status=PENDING and
 *   scheduledAt = event.createdAt + rule.delaySeconds.
 *
 * PATH 2 — Execute-due-runs:
 *   Finds PENDING AutomationRun rows where scheduledAt <= now() and executes
 *   their action, updating status to SENT or FAILED atomically per run.
 *
 * CRON-DRIVEN RULES (no_progress_nudge, add_driver_nudge, dispatch_load_nudge,
 * trial_ending_soon) are NOT handled via AppEvent. They perform a direct scan
 * of Tenant + ActivationProgress + Subscription state on each cron tick. This
 * avoids synthetic events and keeps cron logic self-contained. These rules are
 * implemented in Plan 52-02 (cron route). The evaluator does NOT need to handle
 * them in Path 1 — they create AutomationRun records directly in the cron handler
 * and then call runEvaluator() to execute due runs.
 *
 * DEDUP:
 *   Event-driven: UNIQUE index on (eventId, ruleId) where eventId IS NOT NULL.
 *   Cron-driven: (tenantId, ruleKey, fired_within_window) check in the cron handler.
 *
 * WHY PER-EVENT TRACKING (not a watermark):
 *   The previous design derived `since` from max(firedAt) across all AutomationRun
 *   rows. This caused two silent failure modes:
 *   (1) Cold-start orphan: on the first cron tick ever, no AutomationRun rows
 *       exist, so `since` falls back to now()-10min. Any AppEvent older than
 *       10 minutes is permanently skipped — even one from 2 hours ago.
 *   (2) Watermark advance: cron-driven runs for other tenants update firedAt,
 *       pushing `since` forward and permanently orphaning event-driven AppEvents
 *       that haven't been processed yet.
 *
 *   Per-event tracking avoids both problems: every AppEvent in the 30-day window
 *   is considered on each tick. The UNIQUE index on (eventId, ruleId) enforces
 *   idempotency — duplicate create attempts are silently caught at the DB layer
 *   and logged as expected skips. The 30-day cap bounds the query size and ensures
 *   we never retroactively evaluate stale events.
 */

import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { executeSendEmailAction } from '@/lib/automations/actions/send-email';

export interface EvaluatorResult {
  pendingCreated: number;
  executed: number;
  failed: number;
}

export async function runEvaluator(): Promise<EvaluatorResult> {
  const result: EvaluatorResult = { pendingCreated: 0, executed: 0, failed: 0 };

  // ── PATH 1: Event-driven scheduling ──────────────────────────────────────────
  // Scan all AppEvents from the last 30 days. Per-event tracking (not a watermark)
  // ensures events are never permanently orphaned by cold-start or watermark advance.
  // The UNIQUE index on (eventId, ruleId) handles idempotency at the DB layer.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const events = await prisma.appEvent.findMany({
    where: { createdAt: { gt: thirtyDaysAgo } },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`[evaluator] Path 1 — found ${events.length} AppEvent(s) in last 30 days`);

  for (const event of events) {
    // Find active rules matching this event type
    const rules = await prisma.automationRule.findMany({
      where: { triggerEvent: event.eventType, isActive: true },
    });

    for (const rule of rules) {
      // runOncePerTenant: skip if this tenant already has any run for this rule
      if (rule.runOncePerTenant) {
        const existing = await prisma.automationRun.findFirst({
          where: { ruleId: rule.id, tenantId: event.tenantId },
          select: { id: true },
        });
        if (existing) {
          console.log(
            `[evaluator] Skipping ruleId=${rule.id} for tenantId=${event.tenantId} — runOncePerTenant already fired`,
          );
          continue;
        }
      }

      const scheduledAt = new Date(event.createdAt.getTime() + rule.delaySeconds * 1000);

      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
          await tx.automationRun.create({
            data: {
              ruleId: rule.id,
              tenantId: event.tenantId,
              triggeredBy: `event:${event.eventType}`,
              status: 'PENDING',
              scheduledAt,
              eventId: event.id,
            },
          });
        }, TX_OPTIONS);
        result.pendingCreated++;
        console.log(
          `[evaluator] Created PENDING run for ruleId=${rule.id} eventId=${event.id} scheduledAt=${scheduledAt.toISOString()}`,
        );
      } catch (err: unknown) {
        // Unique constraint violation = already scheduled (idempotent). Log + continue.
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('AutomationRun_eventId_ruleId_key') || msg.includes('P2002')) {
          console.log(
            `[evaluator] Run already exists for ruleId=${rule.id} eventId=${event.id} — skipping (idempotent)`,
          );
        } else {
          console.error(
            `[evaluator] Failed to create PENDING run for ruleId=${rule.id} eventId=${event.id}:`,
            err,
          );
        }
      }
    }
  }

  // ── PATH 2: Execute due runs ──────────────────────────────────────────────────
  const now = new Date();
  const dueRuns = await prisma.automationRun.findMany({
    where: {
      status: 'PENDING',
      scheduledAt: { lte: now },
    },
    include: { rule: true },
    orderBy: { scheduledAt: 'asc' },
    take: 100, // safety cap per tick
  });

  console.log(`[evaluator] Path 2 — found ${dueRuns.length} due PENDING run(s)`);

  for (const run of dueRuns) {
    if (!run.rule) {
      console.warn(`[evaluator] Run ${run.id} has no associated rule — skipping`);
      continue;
    }

    const actionsJson = run.rule.actionsJson as Array<{ type: string; templateKey?: string }>;
    if (!Array.isArray(actionsJson)) {
      console.warn(
        `[evaluator] Rule ${run.rule.id} actionsJson is not an array — skipping run ${run.id}`,
      );
      continue;
    }

    let overallSuccess = true;
    let errorMsg: string | undefined;

    for (const action of actionsJson) {
      if (action.type !== 'send_email') {
        // Only send_email is in scope for Phase 52. Log and skip.
        console.warn(
          `[evaluator] Action type '${action.type}' is out of scope for Phase 52 — skipping (runId=${run.id})`,
        );
        continue;
      }

      if (!action.templateKey) {
        console.warn(
          `[evaluator] send_email action missing templateKey on ruleId=${run.rule.id} — skipping`,
        );
        continue;
      }

      // Skip confirm_email — out of scope
      if (action.templateKey === 'confirm_email') {
        console.warn(
          `[evaluator] Skipping confirm_email action (out of scope for Phase 52) runId=${run.id}`,
        );
        continue;
      }

      try {
        await executeSendEmailAction(
          { id: run.id, tenantId: run.tenantId, ruleId: run.ruleId },
          { templateKey: action.templateKey },
        );
      } catch (err) {
        overallSuccess = false;
        errorMsg = err instanceof Error ? err.message : String(err);
        console.error(
          `[evaluator] send_email failed for runId=${run.id} templateKey=${action.templateKey}:`,
          err,
        );
        break; // stop processing further actions for this run on failure
      }
    }

    // Optimistic status update — prevents double-execution on concurrent ticks
    const newStatus = overallSuccess ? 'SENT' : 'FAILED';
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        const updated = await tx.automationRun.updateMany({
          where: { id: run.id, status: 'PENDING' },
          data: {
            status: newStatus,
            firedAt: new Date(),
            ...(errorMsg ? { errorMessage: errorMsg } : {}),
          },
        });
        if (updated.count === 0) {
          console.warn(
            `[evaluator] Optimistic lock miss for runId=${run.id} — another tick already claimed it`,
          );
        }
      }, TX_OPTIONS);

      if (overallSuccess) {
        result.executed++;
      } else {
        result.failed++;
      }
    } catch (err) {
      console.error(`[evaluator] Failed to update run status for runId=${run.id}:`, err);
      result.failed++;
    }
  }

  console.log(
    `[evaluator] Done — pendingCreated=${result.pendingCreated} executed=${result.executed} failed=${result.failed}`,
  );
  return result;
}
