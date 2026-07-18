import { prisma } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DispatchNotificationParams {
  orgId: string;
  dispatchId: string;
  templateName: string;
  dispatchNumber: string;
  needsAssignment: boolean;
}

export interface GenerationResult {
  dispatchesCreated: number;
  skippedExisting: number;
  loadsCreated: number;
  stopsCreated: number;
  errors: string[];
  notifications: DispatchNotificationParams[];
}

// ---------------------------------------------------------------------------
// RRULE expansion helper
// ---------------------------------------------------------------------------

/**
 * Expand all dates matching an iCal RRULE between fromDate and toDate (inclusive).
 * Supports: FREQ=DAILY, FREQ=WEEKLY with BYDAY, FREQ=MONTHLY with BYMONTHDAY.
 * Returns array of ISO date strings (YYYY-MM-DD).
 */
function expandSchedule(
  rule: string,
  _timezone: string,
  fromDate: string,
  toDate: string
): string[] {
  const dates: string[] = [];

  try {
    const parts: Record<string, string> = {};
    for (const segment of rule.split(';')) {
      const eq = segment.indexOf('=');
      if (eq === -1) continue;
      parts[segment.slice(0, eq).toUpperCase()] = segment.slice(eq + 1);
    }

    const freq = parts['FREQ'];
    if (!freq) return dates;

    const interval = parseInt(parts['INTERVAL'] ?? '1', 10);
    const until = parts['UNTIL'] ? parts['UNTIL'].slice(0, 8) : null; // YYYYMMDD
    const countMax = parts['COUNT'] ? parseInt(parts['COUNT'], 10) : null;

    const from = parseISODate(fromDate);
    const to = parseISODate(toDate);
    const untilDate = until ? parseISODate(`${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}`) : null;

    const DAY_MAP: Record<string, number> = {
      SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
    };

    let count = 0;

    if (freq === 'DAILY') {
      let cursor = new Date(from);
      // Advance cursor to first occurrence >= from with correct interval alignment
      while (cursor <= to) {
        if (cursor >= from) {
          if (untilDate && cursor > untilDate) break;
          count++;
          if (countMax != null && count > countMax) break;
          dates.push(toISODate(cursor));
        }
        cursor = new Date(cursor);
        cursor.setDate(cursor.getDate() + interval);
      }
      return dates;
    }

    if (freq === 'WEEKLY') {
      const byday = parts['BYDAY'];
      const targetDays = byday
        ? byday.split(',').map((d) => DAY_MAP[d.trim().toUpperCase()]).filter((d) => d != null)
        : [];
      if (targetDays.length === 0) return dates;

      // Walk day by day through range
      let cursor = new Date(from);
      const weekBase = new Date(from);
      // Align week tracking from the from date's week
      while (cursor <= to) {
        const weeksSinceBase = Math.floor(
          (cursor.getTime() - weekBase.getTime()) / (7 * 24 * 60 * 60 * 1000)
        );
        if (targetDays.includes(cursor.getDay())) {
          if (weeksSinceBase % interval === 0) {
            if (untilDate && cursor > untilDate) break;
            count++;
            if (countMax != null && count > countMax) break;
            dates.push(toISODate(cursor));
          }
        }
        cursor = new Date(cursor);
        cursor.setDate(cursor.getDate() + 1);
      }
      return dates;
    }

    if (freq === 'MONTHLY') {
      const bymonthday = parts['BYMONTHDAY'];
      const targetDays = bymonthday
        ? bymonthday.split(',').map((d) => parseInt(d.trim(), 10)).filter((d) => !isNaN(d))
        : [];
      if (targetDays.length === 0) return dates;

      // Iterate through each month in range
      let year = from.getFullYear();
      let month = from.getMonth();
      const toYear = to.getFullYear();
      const toMonth = to.getMonth();
      let monthOffset = 0;

      while (year < toYear || (year === toYear && month <= toMonth)) {
        if (monthOffset % interval === 0) {
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          for (const day of targetDays.sort((a, b) => a - b)) {
            if (day < 1 || day > daysInMonth) continue;
            const candidate = new Date(year, month, day);
            if (candidate >= from && candidate <= to) {
              if (untilDate && candidate > untilDate) break;
              count++;
              if (countMax != null && count > countMax) return dates;
              dates.push(toISODate(candidate));
            }
          }
        }
        monthOffset++;
        month++;
        if (month > 11) { month = 0; year++; }
      }
      return dates;
    }

    logger.warn('expandSchedule: unsupported FREQ', { rule, freq });
    return dates;
  } catch (err) {
    logger.warn('expandSchedule: failed to parse RRULE', { rule, err });
    return dates;
  }
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** Apply a HH:MM time string to a date, returning a Date with that local time */
function applyTimeToDate(dateStr: string, timeStr: string | null): Date {
  const base = parseISODate(dateStr);
  if (!timeStr) {
    base.setHours(8, 0, 0, 0); // Default 08:00 local
    return base;
  }
  const [h, min] = timeStr.split(':').map(Number);
  base.setHours(h ?? 8, min ?? 0, 0, 0);
  return base;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Generate dispatches from a route template for all scheduled dates up to and
 * including generateThroughDate.
 *
 * Each scheduled date creates dispatch + load (if clientId present) + stops in a
 * single prisma.$transaction. If any create inside the transaction fails, the
 * entire date is rolled back (no orphaned dispatches).
 *
 * Schema limitation notes:
 * - CarrierDispatch lacks `dispatchNumber`, `isAutoGenerated`, `needsAssignment` columns.
 *   These are stored as prefixed strings in the `notes` field as a workaround.
 *   Format: "[DISPATCH_NUMBER=DC-YYYY-NNNNN] [AUTO-GENERATED] [needs_assignment=true]"
 *   RECOMMENDATION: Migration 015 (or 016) should add these columns to `dispatches`
 *   and backfill from the notes prefix so this logic can be simplified.
 *
 * NOTE: This function is a pure data function — it does NOT fire notifications.
 * Callers (cron route, manual generate endpoint) handle notifications via after().
 * Notification params are returned in result.notifications.
 */
export async function generateDispatches(
  orgId: string,
  templateId: string,
  generateThroughDate: string
): Promise<GenerationResult> {
  const result: GenerationResult = {
    dispatchesCreated: 0,
    skippedExisting: 0,
    loadsCreated: 0,
    stopsCreated: 0,
    errors: [],
    notifications: [],
  };

  const tenantPrisma = await getTenantPrisma();
  // 1. Load template
  const template = await tenantPrisma.routeTemplate.findFirst({
    where: { id: templateId, orgId, active: true },
    include: {
      stops: {
        orderBy: { sequenceOrder: 'asc' },
        include: { facility: true },
      },
      contract: true,
    },
  });

  if (!template) {
    throw new Error(`Route template ${templateId} not found or inactive`);
  }

  // 2. Expand scheduled dates from today through generateThroughDate
  const today = toISODate(new Date());

  if (!template.recurrenceRule) {
    result.errors.push('Template has no recurrenceRule — nothing to generate');
    return result;
  }

  const scheduledDates = expandSchedule(
    template.recurrenceRule,
    template.recurrenceTimezone ?? 'America/Chicago',
    today,
    generateThroughDate
  );

  if (scheduledDates.length === 0) {
    logger.info('generateDispatches: no dates to generate in range', { templateId, today, generateThroughDate });
    return result;
  }

  // Pre-fetch total dispatch count for this org to derive the next sequential number.
  // NOTE: This is a workaround because the schema lacks a `dispatchNumber` column.
  // We count ALL org dispatches (manual + auto) so that auto-generated numbers never
  // collide with manually created dispatch numbers. Migration should add a proper
  // `dispatchNumber` column and backfill from the notes prefix.
  const existingCount = await tenantPrisma.trip.count({ where: { orgId } });
  let dispatchCounter = existingCount;

  for (const dateStr of scheduledDates) {
    try {
      // 3. Skip if dispatch already exists for this date (outside transaction — read-only check)
      const dayStart = applyTimeToDate(dateStr, '00:00');
      const dayEnd = applyTimeToDate(dateStr, '23:59');

      const existingDispatch = await tenantPrisma.trip.findFirst({
        where: {
          routeTemplateId: templateId,
          orgId,
          scheduledDeparture: { gte: dayStart, lt: dayEnd },
        },
      });

      if (existingDispatch) {
        result.skippedExisting++;
        continue;
      }

      // 4a. Validate required FKs — primaryDriverId and truckId are non-nullable on CarrierDispatch
      if (!template.defaultDriverId) {
        const msg = `Skipped ${dateStr}: template has no defaultDriverId (required for dispatch.primaryDriverId)`;
        logger.warn('generateDispatches: ' + msg, { templateId, dateStr });
        result.errors.push(msg);
        continue;
      }
      if (!template.defaultTruckId) {
        const msg = `Skipped ${dateStr}: template has no defaultTruckId (required for dispatch.truckId)`;
        logger.warn('generateDispatches: ' + msg, { templateId, dateStr });
        result.errors.push(msg);
        continue;
      }

      // 4b. Conflict detection for driver and truck (outside transaction — read-only check)
      const [driverConflict, truckConflict] = await Promise.all([
        tenantPrisma.trip.findFirst({
          where: {
            primaryDriverId: template.defaultDriverId,
            orgId,
            scheduledDeparture: { gte: dayStart, lt: dayEnd },
          },
        }),
        tenantPrisma.trip.findFirst({
          where: {
            truckId: template.defaultTruckId,
            orgId,
            scheduledDeparture: { gte: dayStart, lt: dayEnd },
          },
        }),
      ]);

      const hasConflict = !!(driverConflict || truckConflict);
      const needsAssignment = hasConflict || !template.clientId;

      // 4c. Generate dispatch number in notes (schema workaround)
      // NOTE: [AUTO-GENERATED] prefix is used to identify auto-generated dispatches since
      // the schema lacks `isAutoGenerated` and `dispatchNumber` boolean/string columns.
      // Migration 015/016 should add: isAutoGenerated Boolean @default(false),
      // dispatchNumber String?, needsAssignment Boolean @default(false)
      dispatchCounter++;
      const year = new Date().getFullYear();
      const dispatchNumber = `DC-${year}-${String(dispatchCounter).padStart(5, '0')}`;
      const autoNotes = needsAssignment
        ? `[DISPATCH_NUMBER=${dispatchNumber}] [AUTO-GENERATED] needs_assignment=true`
        : `[DISPATCH_NUMBER=${dispatchNumber}] [AUTO-GENERATED]`;

      const scheduledDeparture = applyTimeToDate(dateStr, template.scheduledDepartureTime);

      // 4d. Wrap dispatch + load + stops in a single transaction per date
      const { newDispatch, loadCreated, stopsCreatedCount } = await prisma.$transaction(async (tx) => {
        // Create dispatch
        const dispatch = await tx.trip.create({
          data: {
            orgId,
            routeTemplateId: templateId,
            primaryDriverId: template.defaultDriverId!,
            truckId: template.defaultTruckId!,
            scheduledDeparture,
            status: 'planned',
            plannedMiles: template.estimatedMiles != null ? template.estimatedMiles : null,
            notes: autoNotes,
          },
        });

        // Auto-generate load referenceNumber (same pattern as loads.ts line 184-194)
        const loadYear = new Date().getFullYear();
        let loadId: string | null = null;
        let didCreateLoad = false;

        if (template.clientId) {
          const lastLoad = await tx.carrierLoad.findFirst({
            where: { orgId, referenceNumber: { startsWith: `LD-${loadYear}-` } },
            orderBy: { referenceNumber: 'desc' },
            select: { referenceNumber: true },
          });
          const lastSeq = lastLoad?.referenceNumber ? parseInt(lastLoad.referenceNumber.slice(-5), 10) : 0;
          const referenceNumber = `LD-${loadYear}-${String(lastSeq + 1).padStart(5, '0')}`;

          // Compute FSC from contract
          let fuelSurchargeAmount: number | null = null;
          if (
            template.contract &&
            template.contract.fuelSurchargeMethod !== 'none' &&
            template.contract.fuelSurchargeRate != null &&
            template.contract.baseRate != null
          ) {
            fuelSurchargeAmount =
              parseFloat(String(template.contract.baseRate)) *
              parseFloat(String(template.contract.fuelSurchargeRate));
          }

          const newLoad = await tx.carrierLoad.create({
            data: {
              orgId,
              dispatchId: dispatch.id,
              contractId: template.contractId ?? undefined,
              clientId: template.clientId,
              loadType: 'ftl',
              referenceNumber,
              commodityDescription: template.commodityDescription,
              rateType: template.contract?.rateType ?? 'flat',
              rateAmount: template.contract?.baseRate ?? undefined,
              fuelSurcharge: fuelSurchargeAmount != null ? fuelSurchargeAmount : undefined,
              status: 'assigned',
            },
          });
          loadId = newLoad.id;
          didCreateLoad = true;
        }

        // Create stops from template stops
        let stopCount = 0;
        for (const stop of template.stops) {
          const facility = stop.facility;

          // Compute appointment times from scheduledDeparture + offset_min
          const appointmentStart =
            stop.apptWindowStartOffsetMin != null
              ? new Date(scheduledDeparture.getTime() + stop.apptWindowStartOffsetMin * 60000)
              : null;
          const appointmentEnd =
            stop.apptWindowEndOffsetMin != null
              ? new Date(scheduledDeparture.getTime() + stop.apptWindowEndOffsetMin * 60000)
              : null;

          // address_snapshot stored in notes as JSON — facility data at time of generation.
          // This snapshot NEVER mutates even if the facility record is later updated.
          const stopNotes = JSON.stringify({
            address_snapshot: {
              address_line1: facility.addressLine1,
              city: facility.city,
              state: facility.state,
              zip: facility.zip,
              lat: facility.latitude,
              lng: facility.longitude,
            },
          });

          await tx.carrierStop.create({
            data: {
              dispatchId: dispatch.id,
              loadId: loadId ?? undefined,
              sequenceOrder: stop.sequenceOrder,
              stopType: stop.stopType,
              facilityId: stop.facilityId,
              contactName: stop.contactName,
              contactPhone: stop.contactPhone,
              commodityDescription: stop.commodityDescription,
              specialInstructions: stop.specialInstructions,
              bolRequired: stop.bolRequired,
              podRequired: stop.podRequired,
              appointmentStart: appointmentStart ?? undefined,
              appointmentEnd: appointmentEnd ?? undefined,
              status: 'pending',
              notes: stopNotes,
            },
          });
          stopCount++;
        }

        return { newDispatch: dispatch, loadCreated: didCreateLoad, stopsCreatedCount: stopCount };
      });

      result.dispatchesCreated++;
      if (loadCreated) result.loadsCreated++;
      result.stopsCreated += stopsCreatedCount;

      // Collect notification params for callers (do NOT fire here — callers use after())
      result.notifications.push({
        orgId,
        dispatchId: newDispatch.id,
        templateName: template.templateName,
        dispatchNumber,
        needsAssignment,
      });

      logger.info('generateDispatches: created dispatch + load + stops in transaction', {
        templateId,
        dateStr,
        dispatchId: newDispatch.id,
        loadId: loadCreated ? 'created' : null,
        stopCount: stopsCreatedCount,
        dispatchNumber,
        hasConflict,
        needsAssignment,
      });
    } catch (err) {
      const msg = `Error generating dispatch for ${dateStr}: ${err instanceof Error ? err.message : String(err)}`;
      logger.error('generateDispatches: per-date error', { templateId, dateStr, err });
      result.errors.push(msg);
    }
  }

  return result;
}
