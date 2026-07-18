import { after } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import type { PrismaClient } from '@/generated/prisma/client';
import { logger } from '@/lib/logger';
import { calculateRevenue, recalculateAndStore } from './revenue-calculator';
import { sendInvoiceGeneratedNotification, sendClientDeliveredNotification, sendClientInvoiceReadyNotification, sendTripChangeNotification } from '@/lib/carrier/notifications';

// Helper: convert Prisma Decimal | null to string | null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const decStr = (d: any): string | null => (d != null ? String(d) : null);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListLoadsFilters {
  clientId?: string;
  dispatchId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface StopInput {
  id?: string;
  facility_id: string;
  stop_type: 'pickup' | 'delivery' | 'fuel_stop' | 'layover';
  sequence_order: number;
  contact_name?: string | null;
  contact_phone?: string | null;
  commodity_description?: string | null;
  pieces?: number | null;
  weight_lbs?: number | null;
  bol_required?: boolean;
  pod_required?: boolean;
  special_instructions?: string | null;
  appointment_start?: string | null;
  appointment_end?: string | null;
}

export interface LoadCreateInput {
  clientId: string;
  dispatchId?: string;
  contractId?: string;
  loadType?: string;
  referenceNumber?: string;
  bolNumber?: string;
  proNumber?: string;
  poNumber?: string;
  commodityDescription?: string;
  commodityWeightLbs?: number;
  commodityPieces?: number;
  commodityPallets?: number;
  hazmat?: boolean;
  hazmatClass?: string;
  rateType?: string;
  rateAmount?: number;
  plannedMiles?: number;
  brokerFlag?: boolean;
  carrierCost?: number;
  specialInstructions?: string;
  notes?: string;
  otherCharges?: number;
  stops?: StopInput[];
}

export type LoadUpdateInput = Partial<Omit<LoadCreateInput, 'dispatchId'>> & {
  dispatchId?: string | null;
  status?: string;
  stops?: StopInput[];
};

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export async function listLoads(orgId: string, filters: ListLoadsFilters = {}) {
  const tenantPrisma = await getTenantPrisma();
  const { clientId, dispatchId, status, dateFrom, dateTo, page = 1, pageSize = 50 } = filters;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {
    orgId,
    deletedAt: null,
    ...(clientId ? { clientId } : {}),
    ...(dispatchId ? { dispatchId } : {}),
    ...(status ? { status } : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    tenantPrisma.carrierLoad.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { name: true } },
        dispatch: { select: { id: true, notes: true } },
      },
    }),
    tenantPrisma.carrierLoad.count({ where }),
  ]);

  return {
    items: items.map((load) => ({
      ...load,
      rateAmount: decStr(load.rateAmount),
      carrierCost: decStr(load.carrierCost),
      fuelSurcharge: decStr(load.fuelSurcharge),
      detentionAmount: decStr(load.detentionAmount),
      otherCharges: decStr(load.otherCharges),
      totalRevenue: decStr(load.totalRevenue),
      commodityWeightLbs: decStr(load.commodityWeightLbs),
    })),
    total,
  };
}

export async function getLoad(orgId: string, id: string) {
  const tenantPrisma = await getTenantPrisma();
  const load = await tenantPrisma.carrierLoad.findFirst({
    where: { id, orgId },
    include: {
      client: true,
      dispatch: true,
      contract: true,
      stops: {
        orderBy: { sequenceOrder: 'asc' },
        include: { facility: { select: { name: true, city: true, state: true } } },
      },
      expenses: true,
    },
  });

  if (!load) return null;

  return {
    ...load,
    financials: {
      totalRevenue: decStr(load.totalRevenue),
      fuelSurcharge: decStr(load.fuelSurcharge),
      otherCharges: decStr(load.otherCharges),
      carrierCost: decStr(load.carrierCost),
    },
  };
}

export async function createLoad(orgId: string, data: LoadCreateInput) {
  const tenantPrisma = await getTenantPrisma();

  if (!data.clientId) {
    throw new Error('client_id is required — every load must be attributed to a client.');
  }

  // Verify client belongs to this org (cross-tenant isolation)
  const client = await tenantPrisma.carrierClient.findFirst({
    where: { id: data.clientId, orgId },
  });
  if (!client) {
    throw new Error('Invalid client');
  }

  let rateType = data.rateType;
  let rateAmount = data.rateAmount;

  // Auto-populate rate fields from contract if contractId provided
  if (data.contractId) {
    const contract = await tenantPrisma.carrierContract.findFirst({
      where: { id: data.contractId, orgId },
    });
    if (!contract) {
      throw new Error('Invalid contract');
    }
    if (!rateType) rateType = contract.rateType;
    if (rateAmount == null && contract.baseRate != null) {
      rateAmount = Number(contract.baseRate);
    }
  }

  // Auto-generate referenceNumber as LD-YYYY-NNNNN if not provided
  let referenceNumber = data.referenceNumber;
  if (referenceNumber == null || referenceNumber === undefined) {
    const year = new Date().getFullYear();
    const lastLoad = await tenantPrisma.carrierLoad.findFirst({
      where: { orgId, referenceNumber: { startsWith: `LD-${year}-` } },
      orderBy: { referenceNumber: 'desc' },
      select: { referenceNumber: true },
    });
    const lastSeq = lastLoad?.referenceNumber ? parseInt(lastLoad.referenceNumber.slice(-5), 10) : 0;
    referenceNumber = `LD-${year}-${String(lastSeq + 1).padStart(5, '0')}`;
  }

  const load = await tenantPrisma.carrierLoad.create({
    data: {
      orgId,
      clientId: data.clientId,
      dispatchId: data.dispatchId ?? null,
      contractId: data.contractId ?? null,
      loadType: data.loadType ?? 'ftl',
      referenceNumber,
      bolNumber: data.bolNumber ?? null,
      proNumber: data.proNumber ?? null,
      poNumber: data.poNumber ?? null,
      commodityDescription: data.commodityDescription ?? null,
      commodityWeightLbs: data.commodityWeightLbs ?? null,
      commodityPieces: data.commodityPieces ?? null,
      commodityPallets: data.commodityPallets ?? null,
      hazmat: data.hazmat ?? false,
      hazmatClass: data.hazmatClass ?? null,
      rateType: rateType ?? 'flat',
      rateAmount: rateAmount ?? null,
      brokerFlag: data.brokerFlag ?? false,
      carrierCost: data.carrierCost ?? null,
      otherCharges: data.otherCharges ?? null,
      specialInstructions: data.specialInstructions ?? null,
      notes: data.notes ?? null,
      status: 'pending',
    },
  });

  logger.info('createLoad: created', { orgId, loadId: load.id, referenceNumber });

  // Persist stops — if a dispatchId exists, create CarrierStop records immediately.
  // Otherwise store as JSON so they survive until a dispatch is attached.
  if (data.stops && data.stops.length > 0) {
    if (load.dispatchId) {
      await persistStops(tenantPrisma, orgId, load.id, load.dispatchId, data.stops);
    } else {
      // No dispatch yet — store stops as JSON for later persistence when dispatch is assigned
      await tenantPrisma.carrierLoad.update({
        where: { id: load.id },
        data: { pendingStopsJson: JSON.stringify(data.stops) },
      });
      logger.info('createLoad: stored pending stops as JSON (no dispatchId)', {
        orgId,
        loadId: load.id,
        stopCount: data.stops.length,
      });
    }
  }

  // Compute initial revenue
  await recalculateAndStore(orgId, load.id);

  // Return updated load
  const updated = await tenantPrisma.carrierLoad.findFirst({ where: { id: load.id, orgId } });
  return updated ?? load;
}

// ---------------------------------------------------------------------------
// Stop persistence helper
// ---------------------------------------------------------------------------

async function persistStops(
  tenantPrisma: PrismaClient,
  orgId: string,
  loadId: string,
  dispatchId: string,
  stops: StopInput[]
) {
  // Safety guard: if no stops submitted but load already has stops, skip entirely.
  // An empty submission means "no changes to stops", not "delete all stops".
  const existingStopCount = await tenantPrisma.carrierStop.count({
    where: { loadId },
  });
  if (stops.length === 0 && existingStopCount > 0) {
    logger.info('persistStops: skipping — empty submission with existing stops', { orgId, loadId, existingStopCount });
    return;
  }

  // Verify all facilities belong to this org (tenant isolation)
  const facilityIds = [...new Set(stops.map((s) => s.facility_id))];
  const validFacilities = await tenantPrisma.carrierFacility.findMany({
    where: { id: { in: facilityIds }, orgId },
    select: { id: true },
  });
  const validIds = new Set(validFacilities.map((f) => f.id));
  for (const facilityId of facilityIds) {
    if (!validIds.has(facilityId)) {
      throw new Error(`Invalid facility: ${facilityId}`);
    }
  }

  // Fetch existing stops for this load
  const existingStops = await tenantPrisma.carrierStop.findMany({
    where: { loadId },
    select: { id: true, status: true },
  });
  const existingIds = new Set(existingStops.map((s) => s.id));

  // Determine incoming stop IDs (those with an existing id in the payload)
  const incomingWithId = stops.filter((s) => s.id && existingIds.has(s.id));
  const incomingNewStops = stops.filter((s) => !s.id || !existingIds.has(s.id));

  // Find stops to delete: existing stops not in the incoming payload AND status is 'pending'
  const incomingIdSet = new Set(incomingWithId.map((s) => s.id));
  const toDelete = existingStops
    .filter((s) => !incomingIdSet.has(s.id) && s.status === 'pending')
    .map((s) => s.id);

  await tenantPrisma.$transaction(async (tx) => {
    // Delete removed pending stops
    if (toDelete.length > 0) {
      await tx.carrierStop.deleteMany({ where: { id: { in: toDelete } } });
    }

    // Update existing stops
    for (const stop of incomingWithId) {
      await tx.carrierStop.update({
        where: { id: stop.id },
        data: {
          facilityId: stop.facility_id,
          stopType: stop.stop_type,
          sequenceOrder: stop.sequence_order,
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

    // Create new stops — offset sequenceOrder by the number of stops already on
    // this dispatch so new stops from a second load do not collide with the unique
    // constraint on (dispatchId, sequenceOrder).
    if (incomingNewStops.length > 0) {
      const existingDispatchStopCount = await tx.carrierStop.count({
        where: { dispatchId },
      });
      await tx.carrierStop.createMany({
        data: incomingNewStops.map((s) => ({
          dispatchId,
          loadId,
          facilityId: s.facility_id,
          stopType: s.stop_type,
          sequenceOrder: s.sequence_order + existingDispatchStopCount,
          contactName: s.contact_name ?? null,
          contactPhone: s.contact_phone ?? null,
          commodityDescription: s.commodity_description ?? null,
          pieces: s.pieces ?? null,
          weightLbs: s.weight_lbs ?? null,
          bolRequired: s.bol_required ?? true,
          podRequired: s.pod_required ?? true,
          specialInstructions: s.special_instructions ?? null,
          appointmentStart: s.appointment_start ? new Date(s.appointment_start) : null,
          appointmentEnd: s.appointment_end ? new Date(s.appointment_end) : null,
        })),
      });
    }
  });

  logger.info('persistStops: synced stops', { orgId, loadId, count: stops.length });
}

export async function updateLoad(orgId: string, id: string, data: LoadUpdateInput) {
  const tenantPrisma = await getTenantPrisma();
  const existing = await tenantPrisma.carrierLoad.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  const updated = await tenantPrisma.carrierLoad.update({
    where: { id },
    data: {
      ...(data.clientId !== undefined ? { clientId: data.clientId } : {}),
      ...(data.dispatchId !== undefined ? { dispatchId: data.dispatchId } : {}),
      ...(data.contractId !== undefined ? { contractId: data.contractId } : {}),
      ...(data.loadType !== undefined ? { loadType: data.loadType } : {}),
      ...(data.referenceNumber !== undefined ? { referenceNumber: data.referenceNumber } : {}),
      ...(data.bolNumber !== undefined ? { bolNumber: data.bolNumber } : {}),
      ...(data.proNumber !== undefined ? { proNumber: data.proNumber } : {}),
      ...(data.poNumber !== undefined ? { poNumber: data.poNumber } : {}),
      ...(data.commodityDescription !== undefined
        ? { commodityDescription: data.commodityDescription }
        : {}),
      ...(data.commodityWeightLbs !== undefined
        ? { commodityWeightLbs: data.commodityWeightLbs }
        : {}),
      ...(data.commodityPieces !== undefined ? { commodityPieces: data.commodityPieces } : {}),
      ...(data.commodityPallets !== undefined ? { commodityPallets: data.commodityPallets } : {}),
      ...(data.hazmat !== undefined ? { hazmat: data.hazmat } : {}),
      ...(data.hazmatClass !== undefined ? { hazmatClass: data.hazmatClass } : {}),
      ...(data.rateType !== undefined ? { rateType: data.rateType } : {}),
      ...(data.rateAmount !== undefined ? { rateAmount: data.rateAmount } : {}),
      ...(data.brokerFlag !== undefined ? { brokerFlag: data.brokerFlag } : {}),
      ...(data.carrierCost !== undefined ? { carrierCost: data.carrierCost } : {}),
      ...(data.otherCharges !== undefined ? { otherCharges: data.otherCharges } : {}),
      // plannedMiles intentionally omitted — CarrierLoad has no planned_miles column.
      // The value is used below as a calculation override for per_mile revenue.
      ...(data.specialInstructions !== undefined
        ? { specialInstructions: data.specialInstructions }
        : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
  });

  // Notify client when load is marked as delivered
  if (data.status === 'delivered' && existing.status !== 'delivered') {
    after(() => sendClientDeliveredNotification(orgId, id));
  }

  // Notify owner + client when load is marked as invoiced
  if (data.status === 'invoiced' && existing.status !== 'invoiced') {
    after(() => sendInvoiceGeneratedNotification(orgId, id));
    after(() => sendClientInvoiceReadyNotification(orgId, id));
  }

  // When dispatchId changes, migrate existing stops for this load to the new dispatch
  if (data.dispatchId !== undefined && data.dispatchId !== existing.dispatchId) {
    if (data.dispatchId !== null) {
      // Attaching to a dispatch: move all pending stops for this load to the new dispatch
      await tenantPrisma.carrierStop.updateMany({
        where: {
          loadId: id,
          status: 'pending',
        },
        data: {
          dispatchId: data.dispatchId,
        },
      });
      logger.info('updateLoad: migrated pending stops to new dispatch', {
        orgId,
        loadId: id,
        newDispatchId: data.dispatchId,
      });

      // Notify driver that a load was added to their trip
      const loadRefNumber = updated.referenceNumber ?? id.slice(0, 8);
      after(() =>
        sendTripChangeNotification(
          orgId,
          data.dispatchId!,
          'load_added',
          `Load ${loadRefNumber} added to trip`
        )
      );

      // Also persist any stops that were stored as JSON during load creation (no dispatch at the time)
      const loadWithPending = await tenantPrisma.carrierLoad.findFirst({
        where: { id, orgId },
        select: { pendingStopsJson: true },
      });
      if (loadWithPending?.pendingStopsJson) {
        const pendingStops: StopInput[] = JSON.parse(loadWithPending.pendingStopsJson);
        if (pendingStops.length > 0) {
          await persistStops(tenantPrisma, orgId, id, data.dispatchId, pendingStops);
          // Clear the pending JSON now that stops are persisted as CarrierStop records
          await tenantPrisma.carrierLoad.update({
            where: { id },
            data: { pendingStopsJson: null },
          });
          logger.info('updateLoad: persisted pending stops from JSON on dispatch attach', {
            orgId,
            loadId: id,
            dispatchId: data.dispatchId,
            stopCount: pendingStops.length,
          });
        }
      } else {
        // Log when a load is attached but has no stops to copy
        logger.info('updateLoad: load attached to dispatch has no pending stops', {
          orgId,
          loadId: id,
          dispatchId: data.dispatchId,
        });
      }
    } else {
      // Detaching from a dispatch: delete pending stops for this load
      // (completed/skipped stops are preserved as historical records)
      await tenantPrisma.carrierStop.deleteMany({
        where: {
          loadId: id,
          dispatchId: existing.dispatchId!,
          status: 'pending',
        },
      });
      logger.info('updateLoad: deleted pending stops on detach', {
        orgId,
        loadId: id,
        oldDispatchId: existing.dispatchId,
      });

      // Notify driver that a load was removed from their trip
      const loadRefNumber = updated.referenceNumber ?? id.slice(0, 8);
      after(() =>
        sendTripChangeNotification(
          orgId,
          existing.dispatchId!,
          'load_removed',
          `Load ${loadRefNumber} removed from trip`
        )
      );
    }
  }

  // Persist stops when load has a dispatchId (newly assigned or pre-existing).
  // When no dispatchId exists, store/update stops as JSON for later persistence.
  if (data.stops !== undefined) {
    const effectiveDispatchId =
      data.dispatchId !== undefined ? data.dispatchId : existing.dispatchId;
    if (effectiveDispatchId) {
      await persistStops(tenantPrisma, orgId, id, effectiveDispatchId, data.stops);
      // Clear pending JSON since stops are now persisted as CarrierStop records
      if (existing.pendingStopsJson) {
        await tenantPrisma.carrierLoad.update({
          where: { id },
          data: { pendingStopsJson: null },
        });
      }
    } else {
      // No dispatch — store/update pending stops JSON
      await tenantPrisma.carrierLoad.update({
        where: { id },
        data: { pendingStopsJson: data.stops.length > 0 ? JSON.stringify(data.stops) : null },
      });
      logger.info('updateLoad: updated pending stops JSON (no dispatchId)', {
        orgId,
        loadId: id,
        stopCount: data.stops.length,
      });
    }
  }

  // Trigger revenue recalculation if any rate-affecting fields changed
  const rateFields: (keyof LoadUpdateInput)[] = [
    'rateType',
    'rateAmount',
    'plannedMiles',
    'commodityWeightLbs',
    'commodityPallets',
    'otherCharges',
    'brokerFlag',
    'carrierCost',
  ];
  const needsRecalc = rateFields.some((f) => f in data);
  if (needsRecalc) {
    // When plannedMiles is supplied by the caller, CarrierLoad has no planned_miles
    // column so we can't store it. Instead, use it as a miles override for the
    // per_mile calculation: prefer dispatch actual/planned miles if available,
    // otherwise fall back to the submitted value.
    if (data.plannedMiles !== undefined) {
      const loadForCalc = await tenantPrisma.carrierLoad.findFirst({
        where: { id, orgId },
        include: { dispatch: true, contract: true },
      });
      if (loadForCalc) {
        const dispatchMiles = {
          actualMiles:
            loadForCalc.dispatch?.actualMiles != null
              ? Number(loadForCalc.dispatch.actualMiles)
              : null,
          plannedMiles:
            loadForCalc.dispatch?.plannedMiles != null
              ? Number(loadForCalc.dispatch.plannedMiles)
              : data.plannedMiles,
        };
        const contractForRevenue = loadForCalc.contract
          ? {
              fuelSurchargeMethod: loadForCalc.contract.fuelSurchargeMethod,
              fuelSurchargeRate:
                loadForCalc.contract.fuelSurchargeRate != null
                  ? Number(loadForCalc.contract.fuelSurchargeRate)
                  : null,
            }
          : null;
        const result = calculateRevenue(
          {
            rateType: loadForCalc.rateType,
            rateAmount:
              loadForCalc.rateAmount != null ? Number(loadForCalc.rateAmount) : null,
            commodityWeightLbs:
              loadForCalc.commodityWeightLbs != null
                ? Number(loadForCalc.commodityWeightLbs)
                : null,
            commodityPallets: loadForCalc.commodityPallets,
            otherCharges:
              loadForCalc.otherCharges != null ? Number(loadForCalc.otherCharges) : null,
            brokerFlag: loadForCalc.brokerFlag,
            carrierCost:
              loadForCalc.carrierCost != null ? Number(loadForCalc.carrierCost) : null,
          },
          dispatchMiles,
          contractForRevenue
        );
        const fresh = await tenantPrisma.carrierLoad.update({
          where: { id },
          data: { totalRevenue: result.totalRevenue, fuelSurcharge: result.fuelSurcharge },
        });
        // Write plannedMiles back to the dispatch so pay record recalculation
        // can resolve miles without needing the load form context.
        if (loadForCalc.dispatchId && !loadForCalc.dispatch?.plannedMiles) {
          await tenantPrisma.trip.update({
            where: { id: loadForCalc.dispatchId },
            data: { plannedMiles: data.plannedMiles },
          });
        }
        logger.info('updateLoad: revenue recalculated with plannedMiles override', {
          orgId,
          id,
          plannedMiles: data.plannedMiles,
          totalRevenue: result.totalRevenue,
        });
        return fresh;
      }
    }

    await recalculateAndStore(orgId, id);
    const fresh = await tenantPrisma.carrierLoad.findFirst({ where: { id, orgId } });
    return fresh ?? updated;
  }

  return updated;
}

/**
 * Remove load from trip and optionally delete its pending stops
 * Used when cancelling a load that's already assigned to a trip
 */
export async function removeLoadFromTrip(
  orgId: string,
  loadId: string,
  removeStops: boolean
): Promise<{ error: string } | { removedStopCount: number }> {
  const tenantPrisma = await getTenantPrisma();

  const load = await tenantPrisma.carrierLoad.findFirst({
    where: { id: loadId, orgId },
    select: { dispatchId: true },
  });

  if (!load) return { error: 'Load not found' };
  if (!load.dispatchId) return { removedStopCount: 0 }; // No trip assigned

  let removedStopCount = 0;

  // Delete pending stops for this load if requested
  if (removeStops) {
    const deletedStops = await tenantPrisma.carrierStop.deleteMany({
      where: {
        loadId: loadId,
        status: 'pending',
      },
    });
    removedStopCount = deletedStops.count;
  }

  // Unlink load from trip
  await tenantPrisma.carrierLoad.update({
    where: { id: loadId },
    data: { dispatchId: null },
  });

  logger.info('removeLoadFromTrip: unlinked load from trip', {
    orgId,
    loadId,
    removedStopCount,
  });

  return { removedStopCount };
}
