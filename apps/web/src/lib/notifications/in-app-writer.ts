/**
 * In-App notification writer.
 *
 * Inserts a single InAppNotification row with a mapped InAppNotificationType enum value.
 * The mapping uses trigger key prefixes to the closest existing enum value.
 *
 * NOTE: The InAppNotification table uses `orgId` (legacy naming) for what the
 * rest of the notification system calls `tenantId`. The mapping is transparent.
 */

import type { PrismaClient, InAppNotificationType } from '@/generated/prisma/client';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Map a trigger key to the closest InAppNotificationType enum value.
 *
 * Prefix mapping:
 *   load.*          -> load_delivered
 *   dispatch.*      -> dispatch_assigned
 *   pay.* / payroll.* -> pay_record_ready
 *   invoice.*       -> invoice_generated
 *   compliance.* / document.* / truck.* / driver.license* / driver.hos* -> compliance_alert
 *   stop.*          -> stop_completed
 *   assignment.*    -> needs_assignment
 *   message.* / fleet.* / route.* / user.* / digest.* / customer.* -> fleet_message / compliance_alert
 *   (unmatched)     -> compliance_alert (catch-all)
 */
function mapTriggerToType(triggerKey: string): InAppNotificationType {
  if (triggerKey.startsWith('load.')) return 'load_delivered' as InAppNotificationType;
  if (triggerKey.startsWith('dispatch.')) return 'dispatch_assigned' as InAppNotificationType;
  if (triggerKey.startsWith('pay.') || triggerKey.startsWith('payroll.'))
    return 'pay_record_ready' as InAppNotificationType;
  if (triggerKey.startsWith('invoice.')) return 'invoice_generated' as InAppNotificationType;
  if (
    triggerKey.startsWith('compliance.') ||
    triggerKey.startsWith('document.') ||
    triggerKey.startsWith('truck.') ||
    triggerKey.startsWith('driver.')
  )
    return 'compliance_alert' as InAppNotificationType;
  if (triggerKey.startsWith('stop.')) return 'stop_completed' as InAppNotificationType;
  if (triggerKey.startsWith('assignment.')) return 'needs_assignment' as InAppNotificationType;
  if (triggerKey.startsWith('message.') || triggerKey.startsWith('fleet.'))
    return 'fleet_message' as InAppNotificationType;
  // Catch-all for route.*, user.*, digest.*, customer.*, and unknown prefixes
  return 'compliance_alert' as InAppNotificationType;
}

type WriteArgs = {
  tenantId: string;
  userId: string;
  triggerKey: string;
  title: string;
  message: string;
  relatedEntity?: { type: string; id: string };
};

/**
 * Insert a single InAppNotification row.
 *
 * - orgId maps to tenantId (legacy column name)
 * - entityType + entityId are required — falls back to triggerKey + ZERO_UUID
 * - title is hard-capped to 200 chars (matches schema VarChar(200))
 * - No bypass_rls — orgId filter already scopes the row to the correct tenant
 */
export async function writeInAppNotification(
  prisma: PrismaClient,
  args: WriteArgs,
): Promise<void> {
  await prisma.$transaction(
    [
      prisma.inAppNotification.create({
        data: {
          orgId: args.tenantId,
          userId: args.userId,
          type: mapTriggerToType(args.triggerKey),
          title: args.title.slice(0, 200),
          message: args.message,
          entityType: args.relatedEntity?.type ?? args.triggerKey,
          entityId: args.relatedEntity?.id ?? ZERO_UUID,
          read: false,
        },
      }),
    ],
    { isolationLevel: 'ReadCommitted' },
  );
}
