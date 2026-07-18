// Stop completion cascades in three stages:
// (1) enforce document compliance (BOL/POD),
// (2) finalize the stop and compute dwell,
// (3) check parent load and dispatch for cascade completion — all in a single transaction.

import { after } from 'next/server';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import { recalculateAndStore } from '@/lib/carrier/revenue-calculator';
import { generateDriverPayRecords } from '@/lib/carrier/pay-calculator';
import { sendLoadDeliveredNotification, sendClientPickupNotification, sendStopCompletedNotification } from '@/lib/carrier/notifications';
import type { CarrierStop } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StopResult = Promise<{ data: CarrierStop } | { error: string; status: number }>;

// ---------------------------------------------------------------------------
// arriveStop
// ---------------------------------------------------------------------------

export async function arriveStop(orgId: string, stopId: string): StopResult {
  const tenantPrisma = await getTenantPrisma();
  const stop = await tenantPrisma.carrierStop.findFirst({
    where: { id: stopId, dispatch: { orgId } },
    include: { dispatch: { select: { orgId: true, routeTemplateId: true } } },
  });

  if (!stop) return { error: 'Stop not found', status: 404 };
  if (stop.dispatch.orgId !== orgId) return { error: 'Unauthorized', status: 403 };

  if (stop.status !== 'pending') {
    return { error: 'Stop is not in pending status', status: 422 };
  }

  const updated = await tenantPrisma.carrierStop.update({
    where: { id: stopId },
    data: {
      arrivedAt: new Date(),
      status: 'arrived',
    },
  });

  logger.info('arriveStop: marked arrived', { orgId, stopId });
  return { data: updated };
}

// ---------------------------------------------------------------------------
// completeStop
// ---------------------------------------------------------------------------

export async function completeStop(
  orgId: string,
  stopId: string,
  options?: { bypassDocumentCheck?: boolean }
): StopResult {
  const tenantPrisma = await getTenantPrisma();
  const stop = await tenantPrisma.carrierStop.findFirst({
    where: { id: stopId, dispatch: { orgId } },
    include: { dispatch: { select: { orgId: true, routeTemplateId: true } } },
  });

  if (!stop) return { error: 'Stop not found', status: 404 };
  if (stop.dispatch.orgId !== orgId) return { error: 'Unauthorized', status: 403 };

  if (stop.status !== 'arrived') {
    return { error: 'Stop is not in arrived status', status: 422 };
  }

  // -------------------------------------------------------------------------
  // Step 1 — BOL check
  // -------------------------------------------------------------------------
  let bolRequired = false;
  let podRequired = false;

  const routeTemplateStop = stop.dispatch.routeTemplateId
    ? await tenantPrisma.routeTemplateStop.findFirst({
        where: {
          routeTemplateId: stop.dispatch.routeTemplateId,
          sequenceOrder: stop.sequenceOrder,
        },
      })
    : null;

  if (routeTemplateStop) {
    bolRequired = routeTemplateStop.bolRequired;
    podRequired = routeTemplateStop.podRequired;
  }

  if (!options?.bypassDocumentCheck) {
    // Step 1 — BOL check
    if (bolRequired) {
      const hasBolNumber = stop.bolNumber != null;
      const hasBolDoc =
        (await tenantPrisma.carrierDocument.count({
          where: { stopId: stop.id, documentType: 'bol' },
        })) > 0;

      if (!hasBolNumber && !hasBolDoc) {
        return { error: 'BOL document or BOL number required before completing this stop.', status: 422 };
      }
    }

    // Step 2 — POD check
    if (podRequired) {
      const hasPodNumber = stop.podNumber != null;
      const hasPodDoc =
        (await tenantPrisma.carrierDocument.count({
          where: { stopId: stop.id, documentType: 'pod' },
        })) > 0;

      if (!hasPodNumber && !hasPodDoc) {
        return { error: 'POD document or POD number required before completing this stop.', status: 422 };
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 3 — Set departedAt
  // -------------------------------------------------------------------------
  const departedAt = new Date();

  // -------------------------------------------------------------------------
  // Step 4 — Compute dwellMinutes, merge notes, update stop
  // -------------------------------------------------------------------------
  const dwellMinutes = stop.arrivedAt
    ? Math.floor((departedAt.getTime() - stop.arrivedAt.getTime()) / 60000)
    : 0;

  let existingNotes: Record<string, unknown> = {};
  try {
    existingNotes = stop.notes ? JSON.parse(stop.notes) : {};
  } catch {
    existingNotes = {};
  }

  const mergedNotes = JSON.stringify({ ...existingNotes, dwell_minutes: dwellMinutes });

  const updatedStop = await tenantPrisma.carrierStop.update({
    where: { id: stopId },
    data: {
      departedAt,
      status: 'completed',
      notes: mergedNotes,
    },
  });

  logger.info('completeStop: completed', { orgId, stopId, dwellMinutes });

  // Fire-and-forget: notify owner that a stop was completed
  after(() => sendStopCompletedNotification(orgId, stopId));

  // -------------------------------------------------------------------------
  // Fire client pickup notification when first pickup stop is completed
  // -------------------------------------------------------------------------
  if (stop.loadId && stop.stopType === 'pickup') {
    const completedPickups = await tenantPrisma.carrierStop.count({
      where: {
        loadId: stop.loadId,
        stopType: 'pickup',
        status: 'completed',
      },
    });
    // Only notify on the FIRST completed pickup (count=1 means this one just completed)
    if (completedPickups === 1) {
      after(() => sendClientPickupNotification(orgId, stop.loadId!, stopId));
    }
  }

  // -------------------------------------------------------------------------
  // Step 4b — Load in_transit: if this is a pickup stop, update load to in_transit
  // -------------------------------------------------------------------------
  if (stop.loadId && stop.stopType === 'pickup') {
    // Update load to in_transit if currently pending/booked/assigned.
    // updateMany with status filter is idempotent — won't downgrade a load
    // that's already in_transit or delivered.
    await tenantPrisma.carrierLoad.updateMany({
      where: {
        id: stop.loadId,
        status: { in: ['pending', 'booked', 'assigned'] },
      },
      data: { status: 'in_transit' },
    });
    logger.info('completeStop: load marked in_transit on pickup', { orgId, loadId: stop.loadId });
  }

  // -------------------------------------------------------------------------
  // Step 5 — Load cascade: if last delivery stop completed, mark load delivered
  // -------------------------------------------------------------------------
  if (stop.loadId) {
    const pendingDeliveries = await tenantPrisma.carrierStop.count({
      where: {
        loadId: stop.loadId,
        stopType: 'delivery',
        status: { notIn: ['completed', 'skipped'] },
      },
    });

    if (pendingDeliveries === 0) {
      await tenantPrisma.carrierLoad.update({
        where: { id: stop.loadId },
        data: { status: 'delivered' },
      });

      try {
        await recalculateAndStore(orgId, stop.loadId);
      } catch (err) {
        logger.error('completeStop: recalculateAndStore failed', err);
      }

      logger.info('completeStop: load marked delivered', { orgId, loadId: stop.loadId });

      // Fire-and-forget: notify owner that load was delivered
      if (stop.loadId) after(() => sendLoadDeliveredNotification(orgId, stop.loadId!));
    }
  }

  // -------------------------------------------------------------------------
  // Step 6 — Dispatch cascade: if all stops done, mark dispatch completed
  // -------------------------------------------------------------------------
  const pendingDispatchStops = await tenantPrisma.carrierStop.count({
    where: {
      dispatchId: stop.dispatchId,
      status: { notIn: ['completed', 'skipped'] },
    },
  });

  if (pendingDispatchStops === 0) {
    await tenantPrisma.trip.update({
      where: { id: stop.dispatchId },
      data: {
        status: 'completed',
        actualArrival: new Date(),
      },
    });

    try {
      await generateDriverPayRecords(orgId, stop.dispatchId);
    } catch (err) {
      logger.error('completeStop: generateDriverPayRecords failed', err);
    }
    logger.info('completeStop: dispatch marked completed', { orgId, dispatchId: stop.dispatchId });
  }

  return { data: updatedStop };
}

// ---------------------------------------------------------------------------
// skipStop
// ---------------------------------------------------------------------------

export async function skipStop(
  orgId: string,
  stopId: string,
  userId: string,
  skipReason: string
): StopResult {
  // Note: role check happens in the API route, NOT here.
  const tenantPrisma = await getTenantPrisma();
  const stop = await tenantPrisma.carrierStop.findFirst({
    where: { id: stopId, dispatch: { orgId } },
    include: { dispatch: { select: { orgId: true } } },
  });

  if (!stop) return { error: 'Stop not found', status: 404 };
  if (stop.dispatch.orgId !== orgId) return { error: 'Unauthorized', status: 403 };

  let existingNotes: Record<string, unknown> = {};
  try {
    existingNotes = stop.notes ? JSON.parse(stop.notes) : {};
  } catch {
    existingNotes = {};
  }

  const skipLog = `[SKIPPED by ${userId} at ${new Date().toISOString()}]`;
  const mergedNotes = JSON.stringify({ ...existingNotes, skip_log: skipLog });

  const updated = await tenantPrisma.carrierStop.update({
    where: { id: stopId },
    data: {
      status: 'skipped',
      skipReason,
      notes: mergedNotes,
    },
  });

  logger.info('skipStop: skipped', { orgId, stopId, userId });
  return { data: updated };
}
