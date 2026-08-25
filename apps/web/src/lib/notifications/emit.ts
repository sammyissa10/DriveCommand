/**
 * Document Import Phase 10 — the one way the Section 13 triggers are emitted.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS WRAPPER EXISTS AND NOT A BARE `dispatchNotification` CALL
 * ---------------------------------------------------------------------------
 *
 * Three rules apply to every one of the ten emits, and every one of the three
 * has already been broken at least once in this module:
 *
 *  1. **Never `getTenantPrisma()`.** That helper reads the `x-tenant-id` header
 *     and the session cookie; inside `after()` or after a response has been
 *     sent, `headers()` throws E251. `dispatchNotification` itself is already
 *     safe — it takes `tenantId` as an argument and uses the bare client — so
 *     the rule really binds the code that GATHERS the payload, which must run
 *     before the deferred closure and with an explicitly-resolved client.
 *
 *     This is not hypothetical. `sendDispatchAssignedNotification` opens with
 *     `await getTenantPrisma()` and Phase 8 called it from inside `after()`.
 *     The result was a notification that threw on every single commit and was
 *     swallowed by the surrounding guard — invisible unless you went looking in
 *     the logs. Phase 9's own file header recorded that it "still has that
 *     shape and still throws". Phase 10 replaces that call site.
 *
 *  2. **A notification may never affect the thing it is reporting.** Section 11
 *     is explicit that a slow or failing notification must not roll back or
 *     block a committed trip. So this never throws, whatever happens.
 *
 *  3. **No catch may swallow into a generic string.** `logger.error` takes the
 *     error SECOND (`message, error, context`); passing a context object into
 *     that slot renders `Error: [object Object]` and tells Sentry nothing.
 *     `serializeError` supplies the readable copy in the context.
 *
 * ---------------------------------------------------------------------------
 * DEDUPLICATION
 * ---------------------------------------------------------------------------
 * Every emit here passes `NOTIFICATION_DEDUP_WINDOW_MS`. That is the only thing
 * that turns the window on — `dispatchNotification` leaves it off unless asked,
 * so all 37 pre-existing triggers keep the behaviour they have always had.
 */

import { after } from 'next/server';
import { logger, serializeError } from '@/lib/logger';
import { dispatchNotification } from './dispatcher';
import { NOTIFICATION_DEDUP_WINDOW_MS } from './notification-constants';
import type { TriggerKey, NotificationPayload } from './types';

/**
 * Emit one Section 13 trigger. Never throws, never blocks the caller's result.
 *
 * `relatedEntity` is REQUIRED rather than optional, unlike the dispatcher's own
 * signature. The dedup window matches on it, and an emit that omitted it would
 * silently dedupe against every other entity-less send of the same trigger —
 * suppressing a real notification for a different trip. Making it mandatory
 * removes the chance to forget.
 */
export async function emitNotification<K extends TriggerKey>(
  triggerKey: K,
  args: {
    tenantId: string;
    payload: NotificationPayload[K];
    relatedEntity: { type: string; id: string };
  },
): Promise<void> {
  try {
    await dispatchNotification(triggerKey, {
      tenantId: args.tenantId,
      payload: args.payload,
      relatedEntity: args.relatedEntity,
      dedupWindowMs: NOTIFICATION_DEDUP_WINDOW_MS,
    });
  } catch (err) {
    // `dispatchNotification` is documented as never throwing, so reaching here
    // means something changed. Logged rather than trusted.
    logger.error('[notifications] emit failed', err, {
      triggerKey,
      tenantId: args.tenantId,
      entityId: args.relatedEntity.id,
      error: serializeError(err),
    });
  }
}

/**
 * Emit after the response, wherever we happen to be running.
 *
 * The same shape as `commit-service.ts`'s `afterResponse`, and for the same
 * reason: `after()` is correct inside a request and THROWS outside one (a cron
 * handler, a script, a test). A throw here would surface as a failed operation
 * for work that already succeeded — precisely the inversion Section 11 forbids.
 * So: try `after()`, fall back to detached.
 *
 * IMPORTANT — the payload must already be built when this is called. Everything
 * inside the closure runs after the response, where there is no header to read.
 * Gather first, defer second; that ordering is the whole of rule 1 above.
 */
export function emitNotificationAfterResponse<K extends TriggerKey>(
  triggerKey: K,
  args: {
    tenantId: string;
    payload: NotificationPayload[K];
    relatedEntity: { type: string; id: string };
  },
): void {
  const work = () => emitNotification(triggerKey, args);

  try {
    after(work);
  } catch {
    // No request scope. Run it detached — the operation being reported has
    // already happened and this work is not allowed to affect it either way.
    void work();
  }
}

