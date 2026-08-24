import { after } from 'next/server';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import { sendTripChangeNotification } from '@/lib/carrier/notifications';
import { FacilityUnavailableError, diagnoseFacilityUnavailable } from '@/lib/carrier/facility-errors';

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
  loadId?: string | null;
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export async function listStops(orgId: string, filters: ListStopsFilters = {}) {
  const tenantPrisma = await getTenantPrisma();
  const { dispatchId, loadId, page = 1, pageSize = 50 } = filters;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {
    dispatch: { orgId },
    ...(dispatchId ? { dispatchId } : {}),
    ...(loadId ? { loadId } : {}),
  };

  const [items, total] = await Promise.all([
    tenantPrisma.carrierStop.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { sequenceOrder: 'asc' },
    }),
    tenantPrisma.carrierStop.count({ where }),
  ]);

  return { items, total };
}

export async function getStop(orgId: string, id: string) {
  const tenantPrisma = await getTenantPrisma();
  const stop = await tenantPrisma.carrierStop.findFirst({
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
  const tenantPrisma = await getTenantPrisma();
  // Verify the dispatch belongs to this org.
  // Genuine absence — this dispatch does not exist / is not ours. 404 is correct.
  const dispatch = await tenantPrisma.trip.findFirst({
    where: { id: data.dispatchId, orgId },
  });
  if (!dispatch) {
    return null;
  }

  // Verify loadId belongs to this org (if supplied).
  // Genuine absence — this load does not exist / is not ours. 404 is correct.
  if (data.loadId) {
    const load = await tenantPrisma.carrierLoad.findFirst({
      where: { id: data.loadId, orgId },
      select: { id: true },
    });
    if (!load) {
      return null;
    }
  }

  // Verify clientId belongs to this org (if supplied).
  // Genuine absence — this client does not exist / is not ours. 404 is correct.
  if (data.clientId) {
    const clientRecord = await tenantPrisma.carrierClient.findFirst({
      where: { id: data.clientId, orgId },
      select: { id: true },
    });
    if (!clientRecord) {
      return null;
    }
  }

  // Fetch facility to build address_snapshot.
  // Unlike dispatch/load/client above, a bad facility here is NOT a genuine
  // absence from the route's point of view — it may exist but be deleted or
  // cross-tenant, and the two need different messages (quick-531). Hence the
  // asymmetry: this branch throws through the shared diagnosis instead of
  // returning null/404 like its siblings above.
  const facility = await tenantPrisma.carrierFacility.findFirst({
    where: { id: data.facilityId, orgId, deletedAt: null },
  });
  if (!facility) {
    throw new FacilityUnavailableError(
      await diagnoseFacilityUnavailable(tenantPrisma, data.facilityId, orgId),
      data.facilityId,
    );
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

  const stop = await tenantPrisma.carrierStop.create({
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

  // Notify driver of new stop (only for in_progress trips)
  const facilityName = facility.name;
  const stopTypeLabel = data.stopType === 'pickup' ? 'Pickup' : data.stopType === 'delivery' ? 'Delivery' : data.stopType;
  after(() =>
    sendTripChangeNotification(
      orgId,
      data.dispatchId,
      'stop_added',
      `${stopTypeLabel} at ${facilityName} added`
    )
  );

  return stop;
}

export async function updateStop(orgId: string, id: string, data: StopUpdateInput) {
  const tenantPrisma = await getTenantPrisma();
  const existing = await tenantPrisma.carrierStop.findFirst({
    where: { id, dispatch: { orgId } },
    include: {
      dispatch: { select: { id: true, status: true } },
      facility: { select: { name: true } },
    },
  });
  if (!existing) return null;

  // Verify loadId belongs to this org (if supplied as a non-empty string)
  if (data.loadId) {
    const load = await tenantPrisma.carrierLoad.findFirst({
      where: { id: data.loadId, orgId },
      select: { id: true },
    });
    if (!load) return null;
  }

  const updated = await tenantPrisma.carrierStop.update({
    where: { id },
    data: {
      contactName: data.contactName,
      contactPhone: data.contactPhone,
      appointmentStart: data.appointmentStart ? new Date(data.appointmentStart) : undefined,
      appointmentEnd: data.appointmentEnd ? new Date(data.appointmentEnd) : undefined,
      specialInstructions: data.specialInstructions,
      arrivedAt: data.arrivedAt ? new Date(data.arrivedAt) : undefined,
      departedAt: data.departedAt ? new Date(data.departedAt) : undefined,
      loadId: data.loadId === undefined ? undefined : data.loadId,
    },
  });

  // Notify driver of stop update (only for in_progress trips where meaningful fields changed)
  const hasAddressChange = data.appointmentStart !== undefined || data.appointmentEnd !== undefined;
  if (hasAddressChange && existing.dispatch.status === 'in_progress') {
    const facilityName = existing.facility?.name ?? 'stop';
    after(() =>
      sendTripChangeNotification(
        orgId,
        existing.dispatch.id,
        'stop_updated',
        `Schedule updated for ${facilityName}`
      )
    );
  }

  return updated;
}
