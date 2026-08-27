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
 * Outcome of an in-app write.
 *
 * `written` is the success case. `slot_taken` is a P2002 on
 * `in_app_notifications_org_id_entity_id_type_key` — a distinct fact from "the
 * write failed", and the two must not share a status. See the block comment on
 * `writeInAppNotification` for why the occupant is returned rather than the
 * error.
 *
 * Any OTHER error still throws. A returned result means the writer understood
 * what happened; a throw means it did not, and the caller must treat it as a
 * real failure.
 */
export type InAppWriteResult =
  | { outcome: 'written' }
  | {
      outcome: 'slot_taken';
      /** The row already occupying (org_id, entity_id, type). Null if it vanished between the failed insert and the read-back. */
      occupant: { id: string; userId: string | null; title: string; createdAt: Date } | null;
      /** True when the occupant is the same notification for the same person — a genuine duplicate. */
      isSameNotification: boolean;
    };

const UNIQUE_VIOLATION = 'P2002';

/**
 * Insert a single InAppNotification row.
 *
 * - orgId maps to tenantId (legacy column name)
 * - entityType + entityId are required — falls back to triggerKey + ZERO_UUID
 * - title is hard-capped to 200 chars (matches schema VarChar(200))
 * - No bypass_rls — orgId filter already scopes the row to the correct tenant
 *
 * ─── THE SLOT (quick-555) ───────────────────────────────────────────────────
 *
 * `in_app_notifications` carries `UNIQUE (org_id, entity_id, type)` — and that
 * key does NOT include `user_id`. At most one in-app row can therefore exist per
 * (tenant, entity, type) ACROSS ALL USERS.
 *
 * `mapTriggerToType` above has a catch-all, and all ten Phase 10 triggers land
 * in it: trip.assigned/reminder/started/completed,
 * inspection.passed/passed_with_defects/failed/overridden,
 * import.needs_review/failed — every one mapping to `compliance_alert`, and
 * every one scoped to the same trip. So per trip, only the FIRST of those ten
 * can ever write an in-app row, and it claims the slot for the whole tenant.
 *
 * That is what happened on trip 45a84a80: the DRIVER's `trip.assigned` row took
 * the slot at 02:13, and the OWNER's `inspection.failed` collided with it at
 * 02:23 and was logged FAILED with nobody watching.
 *
 * WHY THIS RETURNS INSTEAD OF THROWING. A P2002 here is not one fact, it is two,
 * and they deserve opposite treatment:
 *
 *   - the occupant is the same notification for the same person — the dedupe the
 *     constraint was built for, and entirely benign;
 *   - the occupant is somebody else's row, or a different notification — a
 *     notification was LOST, and on `inspection.failed` that is a blocked truck
 *     nobody was told about.
 *
 * Collapsing both into a thrown error is what made this invisible: the caller
 * could only record FAILED and move on. So the occupant is read back and handed
 * to the caller, which decides. Every other error still throws — a writer that
 * swallows what it does not understand is the defect, not the fix.
 *
 * DELIVERY IS NOT RESTORED HERE, and cannot be without DDL: `user_id` is absent
 * from the key, `InAppNotificationType` has nine values and no inspection
 * member, and `entity_id` must stay the real entity UUID because
 * `notification-center.tsx` deep-links from it. See 555-SUMMARY.md for the
 * migration.
 */
export async function writeInAppNotification(
  prisma: PrismaClient,
  args: WriteArgs,
): Promise<InAppWriteResult> {
  const type = mapTriggerToType(args.triggerKey);
  const entityId = args.relatedEntity?.id ?? ZERO_UUID;
  const title = args.title.slice(0, 200);

  try {
    await prisma.$transaction(
      [
        prisma.inAppNotification.create({
          data: {
            orgId: args.tenantId,
            userId: args.userId,
            type,
            title,
            message: args.message,
            entityType: args.relatedEntity?.type ?? args.triggerKey,
            entityId,
            read: false,
          },
        }),
      ],
      { isolationLevel: 'ReadCommitted' },
    );
    return { outcome: 'written' };
  } catch (err) {
    if ((err as { code?: string })?.code !== UNIQUE_VIOLATION) throw err;

    const occupant = await prisma.inAppNotification.findFirst({
      where: { orgId: args.tenantId, entityId, type },
      select: { id: true, userId: true, title: true, createdAt: true },
    });

    // Same person AND same subject line is the only combination that means "you
    // already have this". A different trigger renders a different subject — on
    // the incident that prompted this, the occupant read "New trip 45a84a80 — …"
    // against an incoming "Trip blocked — …", which is emphatically not a
    // duplicate. Title is the discriminator because a genuine re-send renders
    // the identical subject from the identical template.
    const isSameNotification =
      occupant !== null && occupant.userId === args.userId && occupant.title === title;

    return { outcome: 'slot_taken', occupant, isSameNotification };
  }
}
