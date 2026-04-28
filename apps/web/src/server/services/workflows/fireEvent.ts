/**
 * Service: fireEvent
 *
 * Dispatches a lifecycle TriggerEvent to all matching active PlaybookTriggers
 * for the given tenant. Matching uses flat key-value equality only — no
 * expression language, no JSONLogic, no regex (spec Section 6.5).
 *
 * Best-effort: a single trigger failure is logged but does not propagate.
 * Callers use after() from next/server so this runs outside the triggering
 * mutation's transaction (see spec Section 6.5 research Pitfall 5).
 */
import { prisma } from '@/lib/db/prisma';
import { generatePlaybookInstance } from './generatePlaybookInstance';
import { logger } from '@/lib/logger';
import type { PlaybookEntityType, TriggerEvent } from '@/generated/prisma';

const EVENT_TO_ENTITY_TYPE: Partial<Record<TriggerEvent, PlaybookEntityType>> = {
  ON_DRIVER_CREATE: 'DRIVER',
  ON_VEHICLE_CREATE: 'VEHICLE',
  ON_DISPATCH_CREATE: 'DISPATCH',
  ON_DISPATCH_DEPART: 'DISPATCH',
  ON_DISPATCH_DELIVER: 'DISPATCH',
  ON_PARTNER_CREATE: 'PARTNER',
};

export async function fireEvent(args: {
  event: TriggerEvent;
  entityData: Record<string, unknown>;
  tenantId: string;
}): Promise<void> {
  const { event, entityData, tenantId } = args;

  const entityType = EVENT_TO_ENTITY_TYPE[event];
  if (!entityType) {
    // MANUAL_ONLY and RECURRING are not lifecycle events; fireEvent is a no-op for them
    return;
  }

  if (!entityData.id || typeof entityData.id !== 'string') {
    logger.warn('[fireEvent] skipping — entityData.id is missing or not a string', {
      event,
      tenantId,
    });
    return;
  }

  let triggers;
  try {
    triggers = await prisma.playbookTrigger.findMany({
      where: { tenantId, triggerEvent: event, isActive: true },
    });
  } catch (err) {
    logger.error('[fireEvent] failed to load triggers', { event, tenantId, err });
    return; // best-effort — do not throw
  }

  for (const trigger of triggers) {
    // Flat key-value equality match — spec Section 6.5
    // Empty/null conditions = match everything
    const conditions = (trigger.conditions ?? {}) as Record<string, unknown>;
    const matches = Object.entries(conditions).every(([key, value]) => entityData[key] === value);
    if (!matches) continue;

    try {
      await generatePlaybookInstance({
        playbookId: trigger.playbookId,
        entityType,
        entityId: String(entityData.id),
        tenantId,
        triggeredBy: 'trigger',
        triggeredEvent: event,
      });
    } catch (err) {
      // Per-trigger best-effort — one failing trigger must not block other triggers
      logger.error('[fireEvent] generatePlaybookInstance failed', {
        event,
        triggerId: trigger.id,
        playbookId: trigger.playbookId,
        err,
      });
    }
  }
}
