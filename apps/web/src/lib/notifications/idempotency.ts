/**
 * Idempotency primitives for the notification dispatcher.
 *
 * Keys are deterministic per (triggerKey, entity, userId, time-scope) so that
 * the dispatcher can skip duplicate sends within the same window.
 */

import type { PrismaClient } from '@/generated/prisma/client';

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
