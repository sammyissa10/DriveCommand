import { after } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { calculateRevenue, recalculateAndStore } from './revenue-calculator';
import { sendInvoiceGeneratedNotification } from '@/lib/carrier/notifications';

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
}

export type LoadUpdateInput = Partial<LoadCreateInput> & {
  status?: string;
};

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export async function listLoads(orgId: string, filters: ListLoadsFilters = {}) {
  const { clientId, dispatchId, status, dateFrom, dateTo, page = 1, pageSize = 50 } = filters;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {
    orgId,
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
    prisma.carrierLoad.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { name: true } },
        dispatch: { select: { id: true, notes: true } },
      },
    }),
    prisma.carrierLoad.count({ where }),
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
  const load = await prisma.carrierLoad.findFirst({
    where: { id, orgId },
    include: {
      client: true,
      dispatch: true,
      contract: true,
      stops: { orderBy: { sequenceOrder: 'asc' } },
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
  if (!data.clientId) {
    throw new Error('client_id is required — every load must be attributed to a client.');
  }

  // Verify client belongs to this org (cross-tenant isolation)
  const client = await prisma.carrierClient.findFirst({
    where: { id: data.clientId, orgId },
  });
  if (!client) {
    throw new Error('Invalid client');
  }

  let rateType = data.rateType;
  let rateAmount = data.rateAmount;

  // Auto-populate rate fields from contract if contractId provided
  if (data.contractId) {
    const contract = await prisma.carrierContract.findFirst({
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
    const lastLoad = await prisma.carrierLoad.findFirst({
      where: { orgId, referenceNumber: { startsWith: `LD-${year}-` } },
      orderBy: { referenceNumber: 'desc' },
      select: { referenceNumber: true },
    });
    const lastSeq = lastLoad?.referenceNumber ? parseInt(lastLoad.referenceNumber.slice(-5), 10) : 0;
    referenceNumber = `LD-${year}-${String(lastSeq + 1).padStart(5, '0')}`;
  }

  const load = await prisma.carrierLoad.create({
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

  // Compute initial revenue
  await recalculateAndStore(orgId, load.id);

  // Return updated load
  const updated = await prisma.carrierLoad.findFirst({ where: { id: load.id, orgId } });
  return updated ?? load;
}

export async function updateLoad(orgId: string, id: string, data: LoadUpdateInput) {
  const existing = await prisma.carrierLoad.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  const updated = await prisma.carrierLoad.update({
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

  // Notify client when load is marked as invoiced
  if (data.status === 'invoiced' && existing.status !== 'invoiced') {
    after(() => sendInvoiceGeneratedNotification(orgId, id));
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
      const loadForCalc = await prisma.carrierLoad.findFirst({
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
        const fresh = await prisma.carrierLoad.update({
          where: { id },
          data: { totalRevenue: result.totalRevenue, fuelSurcharge: result.fuelSurcharge },
        });
        // Write plannedMiles back to the dispatch so pay record recalculation
        // can resolve miles without needing the load form context.
        if (loadForCalc.dispatchId && !loadForCalc.dispatch?.plannedMiles) {
          await prisma.carrierDispatch.update({
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
    const fresh = await prisma.carrierLoad.findFirst({ where: { id, orgId } });
    return fresh ?? updated;
  }

  return updated;
}
