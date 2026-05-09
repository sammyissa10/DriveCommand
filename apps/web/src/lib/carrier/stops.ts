import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

// Helper: convert Prisma Decimal | null to string | null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const decStr = (d: any): string | null => (d != null ? String(d) : null);
void decStr; // used in future serialization; suppress unused warning

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListStopsFilters {
  dispatchId?: string;
  loadId?: string;
  page?: number;
  pageSize?: number;
}

export interface StopCreateInput {
  dispatchId: string;
  loadId?: string;
  sequenceOrder: number;
  stopType: string;
  facilityId: string;
  clientId?: string;
  appointmentStart?: string;
  appointmentEnd?: string;
  contactName?: string;
  contactPhone?: string;
  specialInstructions?: string;
  commodityDescription?: string;
  pieces?: number;
  weightLbs?: number;
  bolNumber?: string;
  podNumber?: string;
  sealNumber?: string;
}

export interface StopUpdateInput {
  contactName?: string;
  contactPhone?: string;
  appointmentStart?: string;
  appointmentEnd?: string;
  specialInstructions?: string;
  arrivedAt?: string;
  departedAt?: string;
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export async function listStops(orgId: string, filters: ListStopsFilters = {}) {
  const { dispatchId, loadId, page = 1, pageSize = 50 } = filters;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {
    dispatch: { orgId },
    ...(dispatchId ? { dispatchId } : {}),
    ...(loadId ? { loadId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.carrierStop.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { sequenceOrder: 'asc' },
    }),
    prisma.carrierStop.count({ where }),
  ]);

  return { items, total };
}

export async function getStop(orgId: string, id: string) {
  const stop = await prisma.carrierStop.findFirst({
    where: { id, dispatch: { orgId } },
    include: {
      documents: true,
      expenses: true,
      facility: true,
      dispatch: {
        select: { orgId: true, routeTemplateId: true },
      },
    },
  });

  return stop ?? null;
}

export async function createStop(orgId: string, data: StopCreateInput) {
  // Verify the dispatch belongs to this org
  const dispatch = await prisma.carrierDispatch.findFirst({
    where: { id: data.dispatchId, orgId },
  });
  if (!dispatch) {
    return null;
  }

  // Verify loadId belongs to this org (if supplied)
  if (data.loadId) {
    const load = await prisma.carrierLoad.findFirst({
      where: { id: data.loadId, orgId },
      select: { id: true },
    });
    if (!load) {
      return null;
    }
  }

  // Verify clientId belongs to this org (if supplied)
  if (data.clientId) {
    const clientRecord = await prisma.carrierClient.findFirst({
      where: { id: data.clientId, orgId },
      select: { id: true },
    });
    if (!clientRecord) {
      return null;
    }
  }

  // Fetch facility to build address_snapshot
  const facility = await prisma.carrierFacility.findFirst({
    where: { id: data.facilityId, orgId },
  });
  if (!facility) {
    return null;
  }

  const addressSnapshot = {
    address_snapshot: {
      address_line1: facility.addressLine1,
      city: facility.city,
      state: facility.state,
      zip: facility.zip,
      lat: facility.latitude,
      lng: facility.longitude,
    },
  };

  const stop = await prisma.carrierStop.create({
    data: {
      dispatchId: data.dispatchId,
      loadId: data.loadId ?? null,
      sequenceOrder: data.sequenceOrder,
      stopType: data.stopType,
      facilityId: data.facilityId,
      clientId: data.clientId ?? null,
      appointmentStart: data.appointmentStart ? new Date(data.appointmentStart) : null,
      appointmentEnd: data.appointmentEnd ? new Date(data.appointmentEnd) : null,
      contactName: data.contactName ?? null,
      contactPhone: data.contactPhone ?? null,
      specialInstructions: data.specialInstructions ?? null,
      commodityDescription: data.commodityDescription ?? null,
      pieces: data.pieces ?? null,
      weightLbs: data.weightLbs ?? null,
      bolNumber: data.bolNumber ?? null,
      podNumber: data.podNumber ?? null,
      sealNumber: data.sealNumber ?? null,
      notes: JSON.stringify(addressSnapshot),
    },
  });

  logger.info('createStop: created', { orgId, stopId: stop.id, dispatchId: data.dispatchId });
  return stop;
}

export async function updateStop(orgId: string, id: string, data: StopUpdateInput) {
  const existing = await prisma.carrierStop.findFirst({
    where: { id, dispatch: { orgId } },
  });
  if (!existing) return null;

  return prisma.carrierStop.update({
    where: { id },
    data: {
      contactName: data.contactName,
      contactPhone: data.contactPhone,
      appointmentStart: data.appointmentStart ? new Date(data.appointmentStart) : undefined,
      appointmentEnd: data.appointmentEnd ? new Date(data.appointmentEnd) : undefined,
      specialInstructions: data.specialInstructions,
      arrivedAt: data.arrivedAt ? new Date(data.arrivedAt) : undefined,
      departedAt: data.departedAt ? new Date(data.departedAt) : undefined,
    },
  });
}
