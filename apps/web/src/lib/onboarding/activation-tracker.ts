import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

/**
 * Activation event types that mark progression through the onboarding checklist.
 *
 * Each event corresponds to a real product action taken by the owner/tenant,
 * not a manual "mark done" step. Events are fired automatically from server
 * actions and API route handlers.
 */
export type ActivationEventType =
  | 'first_real_truck'
  | 'first_real_driver'
  | 'first_real_client'
  | 'first_load_in_transit';

/**
 * Maps each ActivationEventType to its corresponding ActivationProgress field name.
 */
const FIELD_MAP: Record<ActivationEventType, string> = {
  first_real_truck: 'firstRealTruckAt',
  first_real_driver: 'firstRealDriverAt',
  first_real_client: 'firstRealClientAt',
  first_load_in_transit: 'firstLoadInTransitAt',
};

/**
 * Record an activation event for a tenant.
 *
 * - Updates ActivationProgress (idempotent — only sets each field once)
 * - Recalculates completionPct (20 * (1 + count of completed steps))
 * - Writes an AppEvent for the activation step
 * - If completionPct reaches 100, writes a tenant.activated AppEvent
 * - NEVER propagates errors — the caller's user action must succeed regardless
 *
 * All DB writes use bypass_rls to operate outside tenant RLS context, which is
 * required because some callers (e.g. accept-invitation) have no active session.
 *
 * ─── THE $transaction IS LOAD-BEARING TWICE OVER (quick-596) ──────────────────
 * 1. BYPASS SCOPE. `set_config(..., TRUE)` is transaction-local, so the
 *    transaction is what confines the bypass to these statements. Both
 *    `ActivationProgress` and `AppEvent` are FORCE-RLS, and sessionless callers
 *    have no tenant GUC, so without the bypass the writes are rejected outright.
 * 2. REAL ATOMICITY. This is the one helper in its family where the writes must
 *    also succeed or fail together, and the reason is the idempotency: the
 *    progress update sets a step timestamp AND recomputes completionPct, then an
 *    AppEvent is written for that step. Because each timestamp is written only
 *    once, a partial failure between the two leaves completionPct advanced with
 *    NO event recorded — and the retry takes the idempotent early-exit and never
 *    writes the missing event. The activation funnel loses that step
 *    permanently, and tenant.activated can fire against a progress row whose
 *    events do not add up. Only a manual backfill recovers it.
 *
 * So do not remove this transaction to reduce the withTenantContext deadlock
 * count, and do not replace it with an optional client parameter that sets the
 * bypass on a caller's transaction (that leaks the bypass across the caller's
 * whole unit of work). Five call-chain units reach a transaction through this
 * function; closing them needs a privileged connection.
 */
export async function recordActivationEvent(
  tenantId: string,
  event: ActivationEventType
): Promise<void> {
  try {
    const field = FIELD_MAP[event];
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Idempotency: only update if this field is not yet set.
      // Fetch all relevant fields with explicit (non-dynamic) keys so TypeScript
      // can correctly infer the shape of `current`.
      let current = await tx.activationProgress.findUnique({
        where: { tenantId },
        select: {
          firstRealTruckAt: true,
          firstRealDriverAt: true,
          firstRealClientAt: true,
          firstLoadInTransitAt: true,
          isActivated: true,
          accountCreatedAt: true,
        },
      });

      if (!current) {
        // ActivationProgress row missing — auto-create it and log a warning so
        // we can detect future provisioning drift (e.g. provision-tenant.ts skipped).
        logger.warn(
          'ActivationProgress row missing during recordActivationEvent — auto-creating',
          { tenantId, event }
        );
        await tx.activationProgress.create({
          data: { tenantId, accountCreatedAt: new Date() },
        });
        current = await tx.activationProgress.findUnique({
          where: { tenantId },
          select: {
            firstRealTruckAt: true,
            firstRealDriverAt: true,
            firstRealClientAt: true,
            firstLoadInTransitAt: true,
            isActivated: true,
            accountCreatedAt: true,
          },
        });
        if (!current) {
          // Truly defensive — if create+refetch still returns null something is very wrong
          logger.error(
            'ActivationProgress row still missing after auto-create — aborting',
            undefined,
            { tenantId, event }
          );
          return;
        }
      }

      // Skip if this event was already recorded (idempotency)
      const currentFieldValue = current[field as keyof typeof current];
      if (currentFieldValue !== null && currentFieldValue !== undefined) return;

      // Build the update — set this field to now
      const updateData: Record<string, unknown> = {
        [field]: now,
        updatedAt: now,
      };

      // Compute new completionPct based on which steps are now complete
      const truckDone = field === 'firstRealTruckAt' ? true : current.firstRealTruckAt !== null;
      const driverDone = field === 'firstRealDriverAt' ? true : current.firstRealDriverAt !== null;
      const clientDone = field === 'firstRealClientAt' ? true : current.firstRealClientAt !== null;
      const transitDone = field === 'firstLoadInTransitAt' ? true : current.firstLoadInTransitAt !== null;

      const newPct = 20 * (
        1 +
        (truckDone ? 1 : 0) +
        (driverDone ? 1 : 0) +
        (clientDone ? 1 : 0) +
        (transitDone ? 1 : 0)
      );
      updateData.completionPct = newPct;

      // NOTE: isActivated is set here via the shared update path for ALL events including
      // first_load_in_transit. The idempotency guard (!current.isActivated) ensures the
      // tenant.activated AppEvent fires exactly once even if this event is re-replayed.
      const nowActivated = newPct === 100;
      if (nowActivated) {
        updateData.isActivated = true;
      }

      await tx.activationProgress.update({
        where: { tenantId },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: updateData as any,
      });

      // Write AppEvent for this activation step
      await tx.appEvent.create({
        data: {
          tenantId,
          eventType: `activation.${event}`,
          properties: { tenantId, event, completionPct: newPct },
        },
      });

      // Write tenant.activated event if we just crossed 100% for the first time
      if (nowActivated && !current.isActivated) {
        // Fetch owner email for the tenant
        const owner = await tx.user.findFirst({
          where: { tenantId, role: 'OWNER' },
          select: { email: true },
        });
        const daysToActivate = Math.ceil(
          (now.getTime() - current.accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        console.warn('[activation-tracker] tenant.activated firing', { tenantId, daysToActivate });
        await tx.appEvent.create({
          data: {
            tenantId,
            eventType: 'tenant.activated',
            properties: {
              tenantId,
              ownerEmail: owner?.email ?? '',
              completionPct: 100,
              daysToActivate,
            },
          },
        });
      }
    }, TX_OPTIONS);
  } catch (err) {
    // NEVER propagate — user action must succeed regardless of tracker outcome
    console.error('[activation-tracker] recordActivationEvent failed', { tenantId, event, err });

    // Best-effort: write error event (separate connection, bypass_rls)
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        await tx.appEvent.create({
          data: {
            tenantId,
            eventType: 'activation.tracker.error',
            properties: {
              tenantId,
              intendedEvent: event,
              errorMessage: err instanceof Error ? err.message : String(err),
            },
          },
        });
      }, TX_OPTIONS);
    } catch {
      // Truly silent — if even the error event fails, swallow it
    }
  }
}
