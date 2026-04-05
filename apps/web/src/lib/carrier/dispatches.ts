import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { generateDriverPayRecords } from '@/lib/carrier/pay-calculator';

// Helper: convert Prisma Decimal | null to string | null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const decStr = (d: any): string | null => (d != null ? String(d) : null);
void decStr; // used in future serialization; suppress unused warning

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListDispatchesFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  driverId?: string;
  routeTemplateId?: string;
  needsAssignment?: boolean;
  page?: number;
  pageSize?: number;
}

export interface DispatchCreateInput {
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
}

export type DispatchUpdateInput = Partial<Omit<DispatchCreateInput, 'primaryDriverId' | 'truckId'>> & {
  primaryDriverId?: string;
  truckId?: string;
  trailerId?: string;
  notes?: string;
  plannedMiles?: number;
};

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export async function listDispatches(orgId: string, filters: ListDispatchesFilters = {}) {
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

  const where: Record<string, unknown> = {
    orgId,
    // When filtering by routeTemplateId, skip the default date filter so all related dispatches are returned
    ...(routeTemplateId
      ? {}
      : { scheduledDeparture: { gte: dateFromResolved, lte: dateToResolved } }),
    ...(status ? { status } : {}),
    ...(driverId ? { primaryDriverId: driverId } : {}),
    ...(routeTemplateId ? { routeTemplateId } : {}),
    ...(needsAssignment ? { notes: { contains: 'needs_assignment=true' } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.carrierDispatch.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { scheduledDeparture: 'asc' },
      include: {
        _count: {
          select: { stops: true },
        },
      },
    }),
    prisma.carrierDispatch.count({ where }),
  ]);

  // Attach completed/skipped stop count to each dispatch
  const itemsWithProgress = await Promise.all(
    items.map(async (dispatch) => {
      const completedStops = await prisma.carrierStop.count({
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

export async function getDispatch(orgId: string, id: string) {
  const dispatch = await prisma.carrierDispatch.findFirst({
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

export async function createDispatch(orgId: string, data: DispatchCreateInput) {
  // Auto-generate dispatch number as DC-YYYY-NNNNN, stored in notes
  const existingCount = await prisma.carrierDispatch.count({ where: { orgId } });
  const year = new Date().getFullYear();
  const dispatchNumber = `DC-${year}-${String(existingCount + 1).padStart(5, '0')}`;
  const dispatchNumberTag = `[DISPATCH_NUMBER=${dispatchNumber}]`;

  const userNotes = data.notes ?? '';
  const notes = userNotes
    ? `${dispatchNumberTag} ${userNotes}`
    : dispatchNumberTag;

  const dispatch = await prisma.carrierDispatch.create({
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
      plannedMiles: data.plannedMiles ?? null,
      hosCycle: data.hosCycle ?? 'us_70',
      status: 'planned',
      notes,
    },
  });

  logger.info('createDispatch: created', { orgId, dispatchId: dispatch.id, dispatchNumber });
  return dispatch;
}

export async function updateDispatch(
  orgId: string,
  id: string,
  data: DispatchUpdateInput
): Promise<{ error: string } | Record<string, unknown> | null> {
  const existing = await prisma.carrierDispatch.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  if (existing.status === 'completed') {
    return { error: 'Cannot update completed dispatch' };
  }

  // Strip locked fields when in_progress
  const updateData = { ...data };
  if (existing.status === 'in_progress') {
    delete updateData.primaryDriverId;
    delete updateData.truckId;
  }

  return prisma.carrierDispatch.update({
    where: { id },
    data: {
      ...updateData,
      scheduledDeparture: updateData.scheduledDeparture
        ? new Date(updateData.scheduledDeparture)
        : undefined,
      scheduledArrival: updateData.scheduledArrival
        ? new Date(updateData.scheduledArrival)
        : undefined,
    },
  });
}

export async function transitionDispatchStatus(
  orgId: string,
  id: string,
  newStatus: string,
  notes?: string
): Promise<
  | { error: string; details?: { from: string; to: string } }
  | { id: string; status: string; notes?: string | null }
  | null
> {
  const dispatch = await prisma.carrierDispatch.findFirst({ where: { id, orgId } });
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
    const updated = await prisma.carrierDispatch.update({
      where: { id },
      data: {
        status: 'in_progress',
        actualDeparture: new Date(),
        ...(notes ? { notes: dispatch.notes ? `${dispatch.notes} ${notes}` : notes } : {}),
      },
    });
    return { id: updated.id, status: updated.status, notes: updated.notes };
  }

  if (currentStatus === 'in_progress' && newStatus === 'completed') {
    // Verify all stops are completed or skipped
    const stops = await prisma.carrierStop.findMany({
      where: { dispatchId: id },
      select: { status: true },
    });

    const allDone = stops.every((s) => s.status === 'completed' || s.status === 'skipped');
    if (!allDone) {
      return { error: 'All stops must be completed or skipped' };
    }

    const updated = await prisma.carrierDispatch.update({
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
      logger.error('transitionDispatchStatus: generateDriverPayRecords failed', err);
    }
    logger.info('transitionDispatchStatus: completed dispatch', { orgId, dispatchId: id });

    return { id: updated.id, status: updated.status, notes: updated.notes };
  }

  if (currentStatus === 'planned' && newStatus === 'cancelled') {
    // Cancel all pending loads attached to this dispatch
    await prisma.carrierLoad.updateMany({
      where: { dispatchId: id, orgId, status: 'pending' },
      data: { status: 'cancelled' },
    });

    const updated = await prisma.carrierDispatch.update({
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

    const updated = await prisma.carrierDispatch.update({
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
