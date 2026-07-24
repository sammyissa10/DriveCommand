import { after } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import { recordActivationEvent } from '@/lib/onboarding/activation-tracker';
import { generateDriverPayRecords } from '@/lib/carrier/pay-calculator';
import { sendDispatchAssignedNotification } from '@/lib/carrier/notifications';
import { sendPushToUser } from '@/lib/notifications/send-push';
import { createNotification } from '@/lib/carrier/in-app-notifications';
import { computeNextOccurrence } from '@/lib/carrier/route-templates';
import { fireEvent } from '@/server/services/workflows/fireEvent';
import { dispatchFieldEditability, lockedDispatchUpdateFields } from '@/lib/dispatch/dispatch-field-editability';

// Helper: convert Prisma Decimal | null to string | null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const decStr = (d: any): string | null => (d != null ? String(d) : null);
void decStr; // used in future serialization; suppress unused warning

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListTripsFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  driverId?: string;
  routeTemplateId?: string;
  needsAssignment?: boolean;
  page?: number;
  pageSize?: number;
}

export interface TripCreateInput {
  primaryDriverId: string;
  truckId: string;
  coDriverId?: string;
  trailerId?: string;
  dispatcherId?: string;
  routeTemplateId?: string;
  scheduledDeparture?: string;
  scheduledArrival?: string;
  plannedMiles?: number;
  hosCycle?: string;
  notes?: string;
  // Dispatch enforcement (Phase 45)
  overrideReason?: string;
  overrideForEntityType?: 'DRIVER';
  overrideForEntityId?: string;
  currentUserId?: string;
}

export type TripUpdateInput = Partial<Omit<TripCreateInput, 'primaryDriverId' | 'truckId' | 'coDriverId'>> & {
  primaryDriverId?: string;
  truckId?: string;
  coDriverId?: string | null;
  trailerId?: string;
  routeTemplateId?: string;
  notes?: string;
  plannedMiles?: number;
  actualMiles?: number;
};

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export async function listTrips(orgId: string, filters: ListTripsFilters = {}) {
  const tenantPrisma = await getTenantPrisma();
  const {
    status,
    dateFrom,
    dateTo,
    driverId,
    routeTemplateId,
    needsAssignment,
    page = 1,
    pageSize = 50,
  } = filters;
  const skip = (page - 1) * pageSize;

  // Default date range: today 00:00 to tomorrow 23:59
  let dateFromResolved: Date;
  let dateToResolved: Date;

  if (dateFrom) {
    dateFromResolved = new Date(dateFrom);
  } else {
    dateFromResolved = new Date();
    dateFromResolved.setHours(0, 0, 0, 0);
  }

  if (dateTo) {
    dateToResolved = new Date(dateTo);
  } else {
    dateToResolved = new Date();
    dateToResolved.setDate(dateToResolved.getDate() + 1);
    dateToResolved.setHours(23, 59, 59, 999);
  }

  // Only the DEFAULT window (no explicit date range from the caller) pins in-progress trips
  // in regardless of date: an actively-running trip must never fall out of the Trips list
  // just because its scheduled departure day has passed. Callers that pass an explicit
  // date range (e.g. the dashboard "Today's Dispatches" widget) keep strict date filtering.
  const usingDefaultWindow = !dateFrom && !dateTo;
  const dateWindowClause = { scheduledDeparture: { gte: dateFromResolved, lte: dateToResolved } };

  const where: Record<string, unknown> = {
    orgId,
    deletedAt: null,
    // When filtering by routeTemplateId, skip the date filter so all related dispatches are returned.
    ...(routeTemplateId
      ? {}
      : usingDefaultWindow
        ? { OR: [dateWindowClause, { status: 'in_progress' }] }
        : dateWindowClause),
    ...(status ? { status } : {}),
    ...(driverId ? { primaryDriverId: driverId } : {}),
    ...(routeTemplateId ? { routeTemplateId } : {}),
    ...(needsAssignment ? { notes: { contains: 'needs_assignment=true' } } : {}),
  };

  const [items, total] = await Promise.all([
    tenantPrisma.trip.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { scheduledDeparture: 'asc' },
      include: {
        primaryDriver: {
          select: { firstName: true, lastName: true },
        },
        truck: {
          select: { unitNumber: true },
        },
        _count: {
          select: { stops: true },
        },
      },
    }),
    tenantPrisma.trip.count({ where }),
  ]);

  // Attach completed/skipped stop count to each dispatch
  const itemsWithProgress = await Promise.all(
    items.map(async (dispatch) => {
      const completedStops = await tenantPrisma.carrierStop.count({
        where: {
          dispatchId: dispatch.id,
          status: { in: ['completed', 'skipped'] },
        },
      });
      return { ...dispatch, completedStopsCount: completedStops };
    })
  );

  return { items: itemsWithProgress, total };
}

export async function getTrip(orgId: string, id: string) {
  const tenantPrisma = await getTenantPrisma();
  const dispatch = await tenantPrisma.trip.findFirst({
    where: { id, orgId },
    include: {
      stops: { orderBy: { sequenceOrder: 'asc' } },
      carrierLoads: {
        include: {
          client: { select: { name: true } },
        },
      },
      expenses: true,
      driverPayRecords: true,
    },
  });

  return dispatch ?? null;
}

export async function createTrip(orgId: string, data: TripCreateInput) {
  const tenantPrisma = await getTenantPrisma();

  // Verify primary driver belongs to this org
  const driver = await tenantPrisma.carrierDriver.findFirst({
    where: { id: data.primaryDriverId, orgId },
  });
  if (!driver) {
    throw new Error('Invalid driver');
  }

  // Verify truck belongs to this org
  const truck = await tenantPrisma.carrierTruck.findFirst({
    where: { id: data.truckId, orgId },
  });
  if (!truck) {
    throw new Error('Invalid truck');
  }

  // Verify co-driver belongs to this org (if provided)
  if (data.coDriverId) {
    const coDriver = await tenantPrisma.carrierDriver.findFirst({
      where: { id: data.coDriverId, orgId },
    });
    if (!coDriver) {
      throw new Error('Invalid co-driver');
    }
  }

  // --- Phase 45 Dispatch Enforcement: DRIVER readiness check ---
  // Truck-level enforcement is Phase 6 tech-debt (no isDispatchReady on CarrierTruck).
  if (driver.userId) {
    const driverUser = await prisma.user.findUnique({
      where: { id: driver.userId },
      select: { isDispatchReady: true },
    });

    if (driverUser && !driverUser.isDispatchReady && !data.overrideReason) {
      throw new Error('DRIVER_NOT_DISPATCH_READY');
    }

    // If override was provided, verify the current user is admin (OWNER or MANAGER)
    if (data.overrideReason && data.currentUserId) {
      const currentUser = await prisma.user.findUnique({
        where: { id: data.currentUserId },
        select: { role: true },
      });
      if (currentUser?.role !== 'OWNER' && currentUser?.role !== 'MANAGER') {
        throw new Error('OVERRIDE_REQUIRES_ADMIN');
      }
    }
  }
  // --- End dispatch enforcement ---

  // Auto-generate dispatch number as DC-YYYY-NNNNN, stored in notes
  const year = new Date().getFullYear();
  const lastDispatch = await tenantPrisma.trip.findFirst({
    where: { orgId, notes: { contains: `DC-${year}-` } },
    orderBy: { createdAt: 'desc' },
    select: { notes: true },
  });
  let lastSeq = 0;
  if (lastDispatch?.notes) {
    const match = lastDispatch.notes.match(/\[DISPATCH_NUMBER=DC-\d{4}-(\d{5})\]/);
    if (match) lastSeq = parseInt(match[1], 10);
  }
  const dispatchNumber = `DC-${year}-${String(lastSeq + 1).padStart(5, '0')}`;
  const dispatchNumberTag = `[DISPATCH_NUMBER=${dispatchNumber}]`;

  const userNotes = data.notes ?? '';
  const notes = userNotes
    ? `${dispatchNumberTag} ${userNotes}`
    : dispatchNumberTag;

  // If template provided, look up to auto-populate planned miles and append template tag to notes
  let resolvedPlannedMiles = data.plannedMiles ?? null;
  let resolvedNotes = notes;

  if (data.routeTemplateId) {
    const template = await tenantPrisma.routeTemplate.findFirst({
      where: { id: data.routeTemplateId, orgId, active: true },
      select: { estimatedMiles: true, templateName: true },
    });
    if (template) {
      if (resolvedPlannedMiles == null && template.estimatedMiles != null) {
        resolvedPlannedMiles = template.estimatedMiles;
      }
      // Append template tag to notes
      resolvedNotes = `${resolvedNotes} [Template: ${template.templateName}]`.trim();
    }
  }

  const dispatch = await tenantPrisma.trip.create({
    data: {
      orgId,
      primaryDriverId: data.primaryDriverId,
      truckId: data.truckId,
      coDriverId: data.coDriverId ?? null,
      trailerId: data.trailerId ?? null,
      dispatcherId: data.dispatcherId ?? null,
      routeTemplateId: data.routeTemplateId ?? null,
      scheduledDeparture: data.scheduledDeparture
        ? new Date(data.scheduledDeparture)
        : new Date(),
      scheduledArrival: data.scheduledArrival
        ? new Date(data.scheduledArrival)
        : null,
      plannedMiles: resolvedPlannedMiles,
      hosCycle: data.hosCycle ?? 'us_70',
      status: 'planned',
      notes: resolvedNotes,
    },
  });

  logger.info('createDispatch: created', { orgId, dispatchId: dispatch.id, dispatchNumber });

  // Write dispatch override audit row (Phase 45 enforcement)
  if (data.overrideReason && data.overrideForEntityId && data.overrideForEntityType && data.currentUserId) {
    await tenantPrisma.dispatchOverrideAudit.create({
      data: {
        tenantId: orgId,
        dispatchId: dispatch.id,
        userId: data.currentUserId,
        reason: data.overrideReason,
        entityType: data.overrideForEntityType,
        entityId: data.overrideForEntityId,
      },
    }).catch((err) => logger.error('createDispatch: failed to write DispatchOverrideAudit', err));
  }

  // If routeTemplateId is set, inherit stops from template
  if (data.routeTemplateId) {
    const templateStops = await tenantPrisma.routeTemplateStop.findMany({
      where: { routeTemplateId: data.routeTemplateId },
      orderBy: { sequenceOrder: 'asc' },
      include: { facility: true },
    });

    for (const ts of templateStops) {
      // Compute appointment times from scheduled departure + offset
      let appointmentStart: Date | null = null;
      let appointmentEnd: Date | null = null;
      const depTime = dispatch.scheduledDeparture;

      if (ts.apptWindowStartOffsetMin != null) {
        appointmentStart = new Date(depTime.getTime() + ts.apptWindowStartOffsetMin * 60000);
      }
      if (ts.apptWindowEndOffsetMin != null) {
        appointmentEnd = new Date(depTime.getTime() + ts.apptWindowEndOffsetMin * 60000);
      }

      // Address snapshot in notes — same pattern as dispatch-generator.ts
      const stopNotes = JSON.stringify({
        address_snapshot: {
          address_line1: ts.facility.addressLine1,
          city: ts.facility.city,
          state: ts.facility.state,
          zip: ts.facility.zip,
          lat: ts.facility.latitude,
          lng: ts.facility.longitude,
        },
      });

      await tenantPrisma.carrierStop.create({
        data: {
          dispatchId: dispatch.id,
          sequenceOrder: ts.sequenceOrder,
          stopType: ts.stopType,
          facilityId: ts.facilityId,
          contactName: ts.contactName,
          contactPhone: ts.contactPhone,
          appointmentStart,
          appointmentEnd,
          commodityDescription: ts.commodityDescription,
          specialInstructions: ts.specialInstructions,
          bolRequired: ts.bolRequired,
          podRequired: ts.podRequired,
          notes: stopNotes,
        },
      });
    }

    logger.info('createDispatch: inherited stops from template', {
      orgId,
      dispatchId: dispatch.id,
      routeTemplateId: data.routeTemplateId,
      stopCount: templateStops.length,
    });
  }

  // Schedule notification to run after the HTTP response is sent.
  // after() guarantees the async work completes even in serverless environments
  // where the execution context is frozen once the response is delivered.
  after(() =>
    sendDispatchAssignedNotification(orgId, dispatch.id, data.primaryDriverId)
  );

  // Spawn any ON_DISPATCH_CREATE playbooks (e.g. pre-trip inspection) per spec Section 6.5
  after(() =>
    fireEvent({
      event: 'ON_DISPATCH_CREATE',
      entityData: { ...dispatch, id: dispatch.id },
      tenantId: orgId,
    }).catch((err) => logger.error('[createDispatch] fireEvent ON_DISPATCH_CREATE failed', err))
  );

  return dispatch;
}

export async function updateTrip(
  orgId: string,
  id: string,
  data: TripUpdateInput
): Promise<{ error: string } | Record<string, unknown> | null> {
  const tenantPrisma = await getTenantPrisma();
  const existing = await tenantPrisma.trip.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  const editability = dispatchFieldEditability(existing.status);
  if (!editability.canEdit) {
    return { error: editability.lockReason ?? 'This trip can no longer be edited' };
  }

  // Tenant isolation: validate driver/truck belong to this org
  if (data.primaryDriverId && data.primaryDriverId !== existing.primaryDriverId) {
    const driver = await tenantPrisma.carrierDriver.findFirst({
      where: { id: data.primaryDriverId, orgId },
    });
    if (!driver) return { error: 'Invalid driver' };
  }

  if (data.coDriverId) {
    const coDriver = await tenantPrisma.carrierDriver.findFirst({
      where: { id: data.coDriverId, orgId },
    });
    if (!coDriver) return { error: 'Invalid co-driver' };

    const effectivePrimaryId = data.primaryDriverId ?? existing.primaryDriverId;
    if (data.coDriverId === effectivePrimaryId) {
      return { error: 'Co-driver cannot be the same as primary driver' };
    }
  }

  if (data.truckId && data.truckId !== existing.truckId) {
    const truck = await tenantPrisma.carrierTruck.findFirst({
      where: { id: data.truckId, orgId },
    });
    if (!truck) return { error: 'Invalid truck' };
  }

  // Drop any field that isn't editable at this status (in_progress: routeTemplateId only).
  const updateData = { ...data };
  for (const field of lockedDispatchUpdateFields(existing.status)) {
    delete updateData[field];
  }

  // Only allow template changes when the helper says routeTemplateId is editable (planned only).
  const routeTemplateId = editability.fields.routeTemplateId.editable ? data.routeTemplateId : undefined;
  delete updateData.routeTemplateId;

  // If template is being changed on a planned dispatch, look up estimatedMiles
  let templatePlannedMiles: number | null = null;
  let templateName: string | null = null;
  if (routeTemplateId && existing.status === 'planned') {
    const template = await tenantPrisma.routeTemplate.findFirst({
      where: { id: routeTemplateId, orgId, active: true },
      select: { estimatedMiles: true, templateName: true },
    });
    if (template) {
      templatePlannedMiles = template.estimatedMiles ?? null;
      templateName = template.templateName;
    }
  }

  const updated = await tenantPrisma.trip.update({
    where: { id },
    data: {
      ...updateData,
      ...(routeTemplateId !== undefined ? { routeTemplateId } : {}),
      scheduledDeparture: updateData.scheduledDeparture
        ? new Date(updateData.scheduledDeparture)
        : undefined,
      scheduledArrival: updateData.scheduledArrival
        ? new Date(updateData.scheduledArrival)
        : undefined,
      // If template provides estimatedMiles and payload doesn't override plannedMiles, apply it
      ...(routeTemplateId && templatePlannedMiles != null && updateData.plannedMiles == null
        ? { plannedMiles: templatePlannedMiles }
        : {}),
    },
  });

  // If template changed on a planned dispatch, replace stops
  if (routeTemplateId && existing.status === 'planned') {
    // Delete existing stops
    await tenantPrisma.carrierStop.deleteMany({ where: { dispatchId: id } });

    // Re-create stops from new template
    const templateStops = await tenantPrisma.routeTemplateStop.findMany({
      where: { routeTemplateId },
      orderBy: { sequenceOrder: 'asc' },
      include: { facility: true },
    });

    const scheduledDeparture = updateData.scheduledDeparture
      ? new Date(updateData.scheduledDeparture)
      : existing.scheduledDeparture;

    for (const ts of templateStops) {
      let appointmentStart: Date | null = null;
      let appointmentEnd: Date | null = null;

      if (ts.apptWindowStartOffsetMin != null) {
        appointmentStart = new Date(scheduledDeparture.getTime() + ts.apptWindowStartOffsetMin * 60000);
      }
      if (ts.apptWindowEndOffsetMin != null) {
        appointmentEnd = new Date(scheduledDeparture.getTime() + ts.apptWindowEndOffsetMin * 60000);
      }

      const stopNotes = JSON.stringify({
        address_snapshot: {
          address_line1: ts.facility.addressLine1,
          city: ts.facility.city,
          state: ts.facility.state,
          zip: ts.facility.zip,
          lat: ts.facility.latitude,
          lng: ts.facility.longitude,
        },
      });

      await tenantPrisma.carrierStop.create({
        data: {
          dispatchId: id,
          sequenceOrder: ts.sequenceOrder,
          stopType: ts.stopType,
          facilityId: ts.facilityId,
          contactName: ts.contactName,
          contactPhone: ts.contactPhone,
          appointmentStart,
          appointmentEnd,
          commodityDescription: ts.commodityDescription,
          specialInstructions: ts.specialInstructions,
          bolRequired: ts.bolRequired,
          podRequired: ts.podRequired,
          notes: stopNotes,
        },
      });
    }

    logger.info('updateDispatch: replaced stops from new template', {
      orgId,
      dispatchId: id,
      routeTemplateId,
      templateName,
      stopCount: templateStops.length,
    });
  }

  // Notify new driver if primaryDriverId changed — compare against updateData (what was
  // actually persisted), not the raw request body, so a stripped/locked field never
  // triggers a false "you've been assigned" notification.
  if (updateData.primaryDriverId && updateData.primaryDriverId !== existing.primaryDriverId) {
    after(() =>
      sendDispatchAssignedNotification(orgId, id, updateData.primaryDriverId!)
    );
  }

  return updated;
}

export async function transitionTripStatus(
  orgId: string,
  id: string,
  newStatus: string,
  notes?: string
): Promise<
  | { error: string; details?: { from: string; to: string } }
  | { id: string; status: string; notes?: string | null }
  | null
> {
  const tenantPrisma = await getTenantPrisma();
  const dispatch = await tenantPrisma.trip.findFirst({ where: { id, orgId } });
  if (!dispatch) return null;

  const currentStatus = dispatch.status;

  // Validate state machine transitions
  const validTransitions: Record<string, string[]> = {
    planned: ['in_progress', 'cancelled', 'tonu'],
    in_progress: ['completed'],
  };

  const allowed = validTransitions[currentStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    return {
      error: 'Invalid status transition',
      details: { from: currentStatus, to: newStatus },
    };
  }

  if (currentStatus === 'planned' && newStatus === 'in_progress') {
    const updated = await tenantPrisma.trip.update({
      where: { id },
      data: {
        status: 'in_progress',
        actualDeparture: new Date(),
        ...(notes ? { notes: dispatch.notes ? `${dispatch.notes} ${notes}` : notes } : {}),
      },
    });

    // Notify driver that their trip has started
    const driver = await tenantPrisma.carrierDriver.findFirst({
      where: { id: dispatch.primaryDriverId },
      select: { userId: true },
    });
    const dispatchNumberMatch = dispatch.notes?.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);
    const dispatchNumber = dispatchNumberMatch ? dispatchNumberMatch[1] : id.slice(0, 8);
    if (driver?.userId) {
      after(() =>
        sendPushToUser(driver.userId!, {
          title: 'Trip Started',
          body: `${dispatchNumber} is now in progress`,
          data: { type: 'dispatch_in_progress', dispatchId: id },
        })
      );
      after(() =>
        createNotification({
          orgId,
          userId: driver.userId!,
          type: 'dispatch_assigned',
          title: 'Trip Started',
          message: `Your dispatch ${dispatchNumber} has been started. Head to your first stop.`,
          entityType: 'dispatch',
          entityId: id,
        })
      );
    }

    // Spawn any ON_DISPATCH_DEPART playbooks per spec Section 6.5
    after(() =>
      fireEvent({
        event: 'ON_DISPATCH_DEPART',
        entityData: { ...updated, id: updated.id },
        tenantId: orgId,
      }).catch((err) => logger.error('[transitionTripStatus] fireEvent ON_DISPATCH_DEPART failed', err))
    );

    // Activation tracker: first real load moved to in_transit
    // Guard: skip if all loads on this dispatch are sample data (user playing with seeds, not real onboarding)
    after(async () => {
      try {
        const realLoadCount = await tenantPrisma.carrierLoad.count({
          where: { dispatchId: id, isSample: false },
        });
        if (realLoadCount > 0) {
          await recordActivationEvent(orgId, 'first_load_in_transit');
        }
      } catch (err) {
        logger.error('[transitionTripStatus] activation tracker failed', { dispatchId: id, err });
      }
    });

    return { id: updated.id, status: updated.status, notes: updated.notes };
  }

  if (currentStatus === 'in_progress' && newStatus === 'completed') {
    // Verify all stops are completed or skipped
    const stops = await tenantPrisma.carrierStop.findMany({
      where: { dispatchId: id },
      select: { status: true },
    });

    const allDone = stops.every((s) => s.status === 'completed' || s.status === 'skipped');
    if (!allDone) {
      return { error: 'All stops must be completed or skipped' };
    }

    const updated = await tenantPrisma.trip.update({
      where: { id },
      data: {
        status: 'completed',
        actualArrival: new Date(), // actualArrival used as completion timestamp
        ...(notes ? { notes: dispatch.notes ? `${dispatch.notes} ${notes}` : notes } : {}),
      },
    });

    try {
      await generateDriverPayRecords(orgId, id);
    } catch (err) {
      logger.error('transitionTripStatus: generateDriverPayRecords failed', err);
    }
    logger.info('transitionTripStatus: completed dispatch', { orgId, dispatchId: id });

    // Auto-generate next recurring dispatch if this dispatch has a template
    if (dispatch.routeTemplateId) {
      after(async () => {
        try {
          const template = await tenantPrisma.routeTemplate.findFirst({
            where: { id: dispatch.routeTemplateId!, active: true },
            select: {
              id: true,
              recurrenceRule: true,
              recurrenceTimezone: true,
              scheduledDepartureTime: true,
              templateName: true,
              defaultDriverId: true,
              defaultTruckId: true,
              estimatedMiles: true,
              stops: {
                orderBy: { sequenceOrder: 'asc' },
                include: { facility: true },
              },
            },
          });

          if (!template || !template.recurrenceRule) return;

          const nextDateStr = computeNextOccurrence(template.recurrenceRule, template.recurrenceTimezone);
          if (!nextDateStr) return;

          // Check if dispatch already exists for that date + template (dedup)
          const dayStart = new Date(`${nextDateStr}T00:00:00`);
          const dayEnd = new Date(`${nextDateStr}T23:59:59`);
          const existingNext = await tenantPrisma.trip.findFirst({
            where: {
              routeTemplateId: template.id,
              orgId,
              scheduledDeparture: { gte: dayStart, lt: dayEnd },
            },
          });
          if (existingNext) {
            logger.info('transitionTripStatus: next recurring dispatch already exists, skipping', {
              orgId,
              completedDispatchId: id,
              existingNextId: existingNext.id,
              nextDate: nextDateStr,
            });
            return;
          }

          // Generate dispatch number
          const year = new Date().getFullYear();
          const lastDispatchForNumber = await tenantPrisma.trip.findFirst({
            where: { orgId, notes: { contains: `DC-${year}-` } },
            orderBy: { createdAt: 'desc' },
            select: { notes: true },
          });
          let lastSeq = 0;
          if (lastDispatchForNumber?.notes) {
            const match = lastDispatchForNumber.notes.match(/\[DISPATCH_NUMBER=DC-\d{4}-(\d{5})\]/);
            if (match) lastSeq = parseInt(match[1], 10);
          }
          const nextDispatchNumber = `DC-${year}-${String(lastSeq + 1).padStart(5, '0')}`;

          // Compute scheduled departure for next date using template departure time
          const [h, m] = (template.scheduledDepartureTime ?? '08:00').split(':').map(Number);
          const scheduledDeparture = new Date(`${nextDateStr}T00:00:00`);
          scheduledDeparture.setHours(h ?? 8, m ?? 0, 0, 0);

          // Use driver/truck from completed dispatch (carry-forward assignment)
          const driverId = dispatch.primaryDriverId;
          const truckId = dispatch.truckId;

          const nextDispatch = await tenantPrisma.trip.create({
            data: {
              orgId,
              routeTemplateId: template.id,
              primaryDriverId: driverId,
              truckId: truckId,
              scheduledDeparture,
              status: 'planned',
              plannedMiles: template.estimatedMiles ?? null,
              notes: `[DISPATCH_NUMBER=${nextDispatchNumber}] [Template: ${template.templateName}]`,
            },
          });

          // Clone stops from template
          for (const ts of template.stops) {
            let appointmentStart: Date | null = null;
            let appointmentEnd: Date | null = null;

            if (ts.apptWindowStartOffsetMin != null) {
              appointmentStart = new Date(scheduledDeparture.getTime() + ts.apptWindowStartOffsetMin * 60000);
            }
            if (ts.apptWindowEndOffsetMin != null) {
              appointmentEnd = new Date(scheduledDeparture.getTime() + ts.apptWindowEndOffsetMin * 60000);
            }

            const stopNotes = JSON.stringify({
              address_snapshot: {
                address_line1: ts.facility.addressLine1,
                city: ts.facility.city,
                state: ts.facility.state,
                zip: ts.facility.zip,
                lat: ts.facility.latitude,
                lng: ts.facility.longitude,
              },
            });

            await tenantPrisma.carrierStop.create({
              data: {
                dispatchId: nextDispatch.id,
                sequenceOrder: ts.sequenceOrder,
                stopType: ts.stopType,
                facilityId: ts.facilityId,
                contactName: ts.contactName,
                contactPhone: ts.contactPhone,
                appointmentStart,
                appointmentEnd,
                commodityDescription: ts.commodityDescription,
                specialInstructions: ts.specialInstructions,
                bolRequired: ts.bolRequired,
                podRequired: ts.podRequired,
                notes: stopNotes,
              },
            });
          }

          // Notify driver about next scheduled dispatch
          const driver = await tenantPrisma.carrierDriver.findFirst({
            where: { id: driverId },
            select: { userId: true },
          });
          if (driver?.userId) {
            await sendPushToUser(driver.userId, {
              title: 'Next Recurring Dispatch',
              body: `${nextDispatchNumber} has been scheduled for ${nextDateStr}`,
              data: { type: 'dispatch_assigned', dispatchId: nextDispatch.id },
            });
            await createNotification({
              orgId,
              userId: driver.userId,
              type: 'dispatch_assigned',
              title: 'Next Recurring Dispatch Scheduled',
              message: `Your next recurring dispatch ${nextDispatchNumber} has been automatically scheduled for ${nextDateStr}.`,
              entityType: 'dispatch',
              entityId: nextDispatch.id,
            });
          }

          logger.info('transitionTripStatus: auto-generated next recurring dispatch', {
            orgId,
            completedDispatchId: id,
            nextDispatchId: nextDispatch.id,
            nextDispatchNumber,
            nextDate: nextDateStr,
          });
        } catch (err) {
          logger.error('transitionTripStatus: auto-generate next dispatch failed', { dispatchId: id, err });
        }
      });
    }

    // Spawn any ON_DISPATCH_DELIVER playbooks (e.g. post-trip inspection) per spec Section 6.5
    after(() =>
      fireEvent({
        event: 'ON_DISPATCH_DELIVER',
        entityData: { ...updated, id: updated.id },
        tenantId: orgId,
      }).catch((err) => logger.error('[transitionTripStatus] fireEvent ON_DISPATCH_DELIVER failed', err))
    );

    return { id: updated.id, status: updated.status, notes: updated.notes };
  }

  if (currentStatus === 'planned' && newStatus === 'cancelled') {
    // Cancel all pending loads attached to this dispatch
    await tenantPrisma.carrierLoad.updateMany({
      where: { dispatchId: id, orgId, status: 'pending' },
      data: { status: 'cancelled' },
    });

    const updated = await tenantPrisma.trip.update({
      where: { id },
      data: {
        status: 'cancelled',
        ...(notes ? { notes: dispatch.notes ? `${dispatch.notes} ${notes}` : notes } : {}),
      },
    });
    return { id: updated.id, status: updated.status, notes: updated.notes };
  }

  if (currentStatus === 'planned' && newStatus === 'tonu') {
    // Prepend [TONU] to notes; also store transition notes
    const existingNotes = dispatch.notes ?? '';
    const newNotes = notes
      ? `[TONU] ${existingNotes} ${notes}`.trim()
      : `[TONU] ${existingNotes}`.trim();

    const updated = await tenantPrisma.trip.update({
      where: { id },
      data: {
        status: 'tonu',
        notes: newNotes,
      },
    });
    return { id: updated.id, status: updated.status, notes: updated.notes };
  }

  // Fallback (should not reach here given validTransitions check above)
  return {
    error: 'Invalid status transition',
    details: { from: currentStatus, to: newStatus },
  };
}

/**
 * Reorder stops within a trip (drag-drop in trip plan UI)
 * Only allowed on planned trips
 */
export async function reorderTripStops(
  orgId: string,
  tripId: string,
  stopOrder: string[]  // Array of stop IDs in new order
): Promise<{ success: boolean } | { error: string }> {
  const tenantPrisma = await getTenantPrisma();
  const trip = await tenantPrisma.trip.findFirst({ where: { id: tripId, orgId } });
  if (!trip) return { error: 'Trip not found' };
  if (trip.status !== 'planned') return { error: 'Can only reorder stops on planned trips' };

  // Validate all stopIds belong to this trip
  const existingStops = await tenantPrisma.carrierStop.findMany({
    where: { dispatchId: tripId },
    select: { id: true },
  });
  const existingIds = new Set(existingStops.map(s => s.id));
  for (const id of stopOrder) {
    if (!existingIds.has(id)) return { error: `Stop ${id} does not belong to this trip` };
  }

  // Update sequence_order for each stop in transaction
  await prisma.$transaction(
    stopOrder.map((stopId, index) =>
      prisma.carrierStop.update({
        where: { id: stopId },
        data: { sequenceOrder: index + 1 },
      })
    )
  );

  logger.info('reorderTripStops: reordered stops', { orgId, tripId, stopCount: stopOrder.length });
  return { success: true };
}

/**
 * Add a load to an existing trip
 * Persists any pendingStopsJson as CarrierStop records
 */
export async function addLoadToTrip(
  orgId: string,
  tripId: string,
  loadId: string
): Promise<{ error: string } | { success: boolean; trip: unknown }> {
  const tenantPrisma = await getTenantPrisma();

  // Validate trip exists and is planned
  const trip = await tenantPrisma.trip.findFirst({ where: { id: tripId, orgId } });
  if (!trip) return { error: 'Trip not found' };
  if (trip.status !== 'planned') return { error: 'Can only add loads to planned trips' };

  // Validate load exists
  const load = await tenantPrisma.carrierLoad.findFirst({ where: { id: loadId, orgId } });
  if (!load) return { error: 'Load not found' };

  // Update load.dispatchId
  await tenantPrisma.carrierLoad.update({
    where: { id: loadId },
    data: { dispatchId: tripId },
  });

  // Persist pendingStopsJson if set
  if (load.pendingStopsJson) {
    try {
      const pendingStops = JSON.parse(load.pendingStopsJson);

      // Get current max sequenceOrder for this trip
      const maxStop = await tenantPrisma.carrierStop.findFirst({
        where: { dispatchId: tripId },
        orderBy: { sequenceOrder: 'desc' },
        select: { sequenceOrder: true },
      });
      const offsetSeq = (maxStop?.sequenceOrder ?? 0);

      for (const stop of pendingStops) {
        await tenantPrisma.carrierStop.create({
          data: {
            dispatchId: tripId,
            loadId: loadId,
            facilityId: stop.facility_id,
            sequenceOrder: offsetSeq + stop.sequence_order,
            stopType: stop.stop_type,
            contactName: stop.contact_name ?? null,
            contactPhone: stop.contact_phone ?? null,
            commodityDescription: stop.commodity_description ?? null,
            pieces: stop.pieces ?? null,
            weightLbs: stop.weight_lbs ?? null,
            bolRequired: stop.bol_required ?? true,
            podRequired: stop.pod_required ?? true,
            specialInstructions: stop.special_instructions ?? null,
            appointmentStart: stop.appointment_start ? new Date(stop.appointment_start) : null,
            appointmentEnd: stop.appointment_end ? new Date(stop.appointment_end) : null,
          },
        });
      }

      // Clear pendingStopsJson now that stops are persisted
      await tenantPrisma.carrierLoad.update({
        where: { id: loadId },
        data: { pendingStopsJson: null },
      });

      logger.info('addLoadToTrip: persisted pending stops', { orgId, tripId, loadId, stopCount: pendingStops.length });
    } catch (err) {
      logger.error('addLoadToTrip: failed to parse pendingStopsJson', { loadId, err });
    }
  }

  // Fetch updated trip with stops
  const updatedTrip = await getTrip(orgId, tripId);
  return { success: true, trip: updatedTrip };
}

// Export type alias for trip detail
export type Trip = Awaited<ReturnType<typeof getTrip>>;
