/**
 * Idempotency primitives for the notification dispatcher.
 *
 * Keys are deterministic per (triggerKey, entity, userId, time-scope) so that
 * the dispatcher can skip duplicate sends within the same window.
 */

import type { PrismaClient } from '@/generated/prisma/client';
import { logger, serializeError } from '@/lib/logger';

/**
 * Build a deterministic idempotency key.
 *
 * Format:
 *   Event scope: `{triggerKey}:{entityType}:{entityId}:{userId}:{ISO-to-second}`
 *   Digest scope: `{triggerKey}:{entityType}:{entityId}:{userId}:{YYYY-MM-DD}`
 *
 * Entity parts fall back to the literal string "none" when relatedEntity is omitted.
 *
 * When userId is null (external-email recipient), emailFallback is used in its place
 * formatted as `email:{address}` so the key remains unique per recipient.
 */
export function buildIdempotencyKey(
  triggerKey: string,
  relatedEntity: { type: string; id: string } | undefined,
  userId: string | null,
  isDigest: boolean,
  emailFallback?: string,
): string {
  const entityType = relatedEntity?.type ?? 'none';
  const entityId = relatedEntity?.id ?? 'none';
  const recipient = userId ?? `email:${emailFallback ?? 'unknown'}`;
  const prefix = `${triggerKey}:${entityType}:${entityId}:${recipient}`;

  if (isDigest) {
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    return `${prefix}:${dateStr}`;
  }

  // Event scope — deduplicate within the same second
  const isoToSecond = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return `${prefix}:${isoToSecond}`;
}

/**
 * Check whether a SENT row with the given idempotency key already exists.
 *
 * Returns `true` when a duplicate SENT row is found (caller should skip).
 * Returns `false` on any DB error so dispatch is never blocked by a probe failure.
 */
export async function checkIdempotency(
  prisma: PrismaClient,
  key: string,
): Promise<boolean> {
  try {
    const existing = await prisma.notificationSendLog.findFirst({
      where: { idempotencyKey: key, status: 'SENT' },
      select: { id: true },
    });
    return existing !== null;
  } catch (err) {
    console.error('[notifications] idempotency check failed, allowing send', err);
    return false;
  }
}

/**
 * Phase 10 — has this exact notification already gone out inside the window?
 *
 * A ROLLING LOOKBACK, not a bucketed key, and the distinction is the whole
 * point. `buildIdempotencyKey`'s event scope pins the key to an ISO second, so
 * two emits 1100 ms apart produce two different keys and both send — which fails
 * Section 13's "fire the same trigger twice fast, get one notification" outright.
 * The obvious repair, widening the key to `floor(now / WINDOW)`, trades one edge
 * for another: two emits 10 ms apart either side of a bucket boundary still both
 * send. That is quick-541's UTC-midnight bug wearing a different hat — an
 * arithmetic boundary with no relationship to the thing being measured.
 *
 * So this asks the only question that has no edge to land on: *did we send this
 * in the last N milliseconds?*
 *
 * Matched on the triple that defines "the same notification for the same thing"
 * — trigger, entity, recipient — plus the channel, because Section 13 gives some
 * triggers three channels and suppressing an email should not suppress the push
 * that accompanies it.
 *
 * Returns FALSE on any DB error, exactly like `checkIdempotency`: a probe
 * failure must never be the reason a driver is not told their brakes failed.
 * Failing open duplicates a notification; failing closed loses one.
 */
export async function wasSentWithinWindow(
  prisma: PrismaClient,
  args: {
    triggerKey: string;
    relatedEntity: { type: string; id: string } | undefined;
    recipientUserId: string | null;
    recipientEmail: string | null;
    channel: 'EMAIL' | 'IN_APP' | 'PUSH';
    windowMs: number;
    now?: Date;
  },
): Promise<boolean> {
  const now = args.now ?? new Date();
  const since = new Date(now.getTime() - args.windowMs);

  try {
    const existing = await prisma.notificationSendLog.findFirst({
      where: {
        triggerKey: args.triggerKey,
        channel: args.channel,
        status: 'SENT',
        createdAt: { gte: since },
        // An entity-less trigger would otherwise match every other entity-less
        // send of the same trigger. `relatedEntityId: null` is the honest
        // filter for that case, not "any".
        relatedEntityType: args.relatedEntity?.type ?? null,
        relatedEntityId: args.relatedEntity?.id ?? null,
        ...(args.recipientUserId !== null
          ? { recipientUserId: args.recipientUserId }
          : { recipientUserId: null, recipientEmail: args.recipientEmail }),
      },
      select: { id: true },
    });
    return existing !== null;
  } catch (err) {
    // Never a bare string, and the error goes in the ERROR slot —
    // `logger.error(message, error, context)`. Passing context there renders
    // `Error: [object Object]` and drops everything (DEC-11 §3).
    logger.error('[notifications] windowed dedup probe failed, allowing send', err, {
      triggerKey: args.triggerKey,
      channel: args.channel,
      error: serializeError(err),
    });
    return false;
  }
}
