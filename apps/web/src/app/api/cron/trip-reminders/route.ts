/**
 * Document Import Phase 10 — `trip.reminder`, the one Section 13 trigger with no
 * emit point anywhere in phases 8 or 9.
 *
 * Section 13's first row reads "Trip assigned · reminder". The two halves look
 * like one row and are two triggers: `trip.assigned` fires from the commit, and
 * a reminder by definition fires later, from nothing. There was no scheduler for
 * it, so this route is it.
 *
 * ---------------------------------------------------------------------------
 * THE SCHEDULE IS DAILY, AND THAT IS A REAL LIMITATION
 * ---------------------------------------------------------------------------
 * This account is on the Vercel Hobby plan, which permits only once-daily cron
 * schedules — Phase 52 already hit and recorded this. A reminder that fires once
 * a day at 13:00 UTC is genuinely coarser than the feature wants: the ideal is
 * "a couple of hours before scheduled departure", which needs hourly at minimum.
 *
 * Stated here rather than shipped as an hourly `vercel.json` entry that would be
 * silently rejected at deploy and leave a trigger that never fires. The window
 * below is sized to the schedule that can actually run: every not-yet-started
 * trip departing in the next 24 hours gets exactly one reminder. On an upgraded
 * plan, narrow `REMINDER_WINDOW_HOURS` and change the schedule together — they
 * are two halves of one decision.
 *
 * ---------------------------------------------------------------------------
 * WHY THE DEDUP WINDOW IS NOT WHAT PREVENTS REPEATS HERE
 * ---------------------------------------------------------------------------
 * `NOTIFICATION_DEDUP_WINDOW_MS` is five minutes. Two cron runs are 24 hours
 * apart, so it does nothing across runs — and that is correct: a trip still
 * unstarted a day later legitimately deserves a second reminder. What the window
 * protects against is this route being invoked twice in quick succession (a
 * retry, a manual trigger beside the schedule), which it does.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger, serializeError } from '@/lib/logger';
import { emitNotification } from '@/lib/notifications/emit';
import { formatDateInTenantTimezone } from '@/lib/utils/date';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';

export const dynamic = 'force-dynamic';

/**
 * How far ahead to look for trips that have not been started.
 *
 * Matched to the daily schedule above: 24 hours means every planned trip is
 * covered by exactly one run, with no gap and no trip reminded twice for the
 * same departure. Shortening this without also shortening the cron interval
 * would create trips that fall between runs and are never reminded at all.
 */
const REMINDER_WINDOW_HOURS = 24;

/** Belt and braces against a runaway tenant; logged when hit, never silent. */
const MAX_TRIPS_PER_TENANT = 200;

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    logger.error('[CRON] trip-reminders: unauthorized request', new Error('Bad CRON_SECRET'));
    return cronUnauthorizedResponse();
  }

  const now = new Date();
  const until = new Date(now.getTime() + REMINDER_WINDOW_HOURS * 3_600_000);

  let tenantsProcessed = 0;
  let remindersSent = 0;
  let tenantsFailed = 0;

  try {
    const tenants = await prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    for (const tenant of tenants) {
      // Per-tenant isolation: one tenant's failure must never stop the rest.
      // Same shape as carrier-compliance-alerts.
      try {
        const db = await getTenantPrismaForOrg(tenant.id);

        const trips = await db.trip.findMany({
          where: {
            orgId: tenant.id,
            deletedAt: null,
            // Only trips that have NOT been started. A trip already in progress
            // does not need reminding, and a completed one certainly does not.
            status: 'planned',
            scheduledDeparture: { gte: now, lte: until },
          },
          select: {
            id: true,
            notes: true,
            scheduledDeparture: true,
            truck: { select: { unitNumber: true } },
            primaryDriver: { select: { firstName: true, lastName: true, userId: true } },
            stops: {
              orderBy: { sequenceOrder: 'asc' },
              take: 1,
              select: { facility: { select: { name: true, city: true } } },
            },
          },
          take: MAX_TRIPS_PER_TENANT,
          orderBy: { scheduledDeparture: 'asc' },
        });

        if (trips.length === MAX_TRIPS_PER_TENANT) {
          // No silent caps. If a tenant is truncated, say so — a bounded sweep
          // that reports "done" reads as full coverage when it is not.
          logger.warn('[CRON] trip-reminders: tenant hit the per-run cap', {
            tenantId: tenant.id,
            cap: MAX_TRIPS_PER_TENANT,
          });
        }

        for (const trip of trips) {
          // No linked User means no portal account and nowhere to deliver.
          const driverUserId = trip.primaryDriver?.userId;
          if (!driverUserId) continue;

          const first = trip.stops[0]?.facility;
          const match = trip.notes?.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);

          await emitNotification('trip.reminder', {
            tenantId: tenant.id,
            relatedEntity: { type: 'trip', id: trip.id },
            payload: {
              driverUserId,
              tripId: trip.id,
              tripNumber: match ? match[1] : trip.id.slice(0, 8),
              driverName:
                [trip.primaryDriver?.firstName, trip.primaryDriver?.lastName]
                  .filter(Boolean)
                  .join(' ') || 'Driver',
              truckUnit: trip.truck?.unitNumber ?? 'Truck',
              firstStop: first
                ? [first.name, first.city].filter(Boolean).join(', ')
                : 'No stops yet',
              // `scheduled_departure` is `@db.Timestamptz` — a real instant, so
              // local rendering is correct. quick-541's date-only helpers are
              // for `@db.Date` columns and would be the inverse bug here.
              scheduledDeparture: formatDateInTenantTimezone(trip.scheduledDeparture, 'UTC'),
            },
          });
          remindersSent++;
        }

        tenantsProcessed++;
      } catch (err) {
        tenantsFailed++;
        // `logger.error(message, error, context)` — error SECOND, and never a
        // bare string. A swallowed notification failure is invisible by
        // definition, which is this module's dominant defect mode.
        logger.error('[CRON] trip-reminders: tenant failed', err, {
          tenantId: tenant.id,
          error: serializeError(err),
        });
      }
    }

    logger.info('[CRON] trip-reminders: done', {
      tenantsProcessed,
      tenantsFailed,
      remindersSent,
    });

    return NextResponse.json({
      ok: true,
      tenantsProcessed,
      tenantsFailed,
      remindersSent,
      windowHours: REMINDER_WINDOW_HOURS,
    });
  } catch (err) {
    logger.error('[CRON] trip-reminders: run failed', err, { error: serializeError(err) });
    return NextResponse.json(
      { ok: false, error: 'Trip reminder run failed' },
      { status: 500 },
    );
  }
}
