/**
 * Bulk audit writer for NotificationSendLog.
 *
 * Writes all send/skip/fail records for a single dispatch() call in one
 * bypass_rls transaction. Failures are swallowed — audit must never break
 * the caller after the work has already been done.
 */

import type { PrismaClient } from '@/generated/prisma/client';

export type AuditLogEntry = {
  tenantId: string;
  triggerKey: string;
  recipientUserId?: string | null;
  recipientEmail?: string | null;
  channel: 'EMAIL' | 'IN_APP';
  subject?: string | null;
  status:
    | 'SENT'
    | 'FAILED'
    | 'SKIPPED_DISABLED'
    | 'SKIPPED_USER_PREF'
    | 'SKIPPED_IDEMPOTENT';
  errorMessage?: string | null;
  idempotencyKey: string;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
};

/**
 * Persist 0..N NotificationSendLog rows in a single bypass_rls transaction.
 *
 * No-op when entries array is empty.
 * Swallows all errors — never throws to the caller.
 */
export async function writeAuditLog(
  prisma: PrismaClient,
  entries: AuditLogEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT set_config('app.bypass_rls','on',true)",
      );
      await tx.notificationSendLog.createMany({
        data: entries.map((e) => ({
          tenantId: e.tenantId,
          triggerKey: e.triggerKey,
          recipientUserId: e.recipientUserId ?? null,
          recipientEmail: e.recipientEmail ?? null,
          channel: e.channel,
          subject: e.subject ?? null,
          status: e.status,
          errorMessage: e.errorMessage ?? null,
          idempotencyKey: e.idempotencyKey,
          relatedEntityType: e.relatedEntityType ?? null,
          relatedEntityId: e.relatedEntityId ?? null,
        })),
        skipDuplicates: false,
      });
    });
  } catch (err) {
    console.error('[notifications] audit log write failed — telemetry lost', err);
    // Swallow: the caller has already completed the work
  }
}
