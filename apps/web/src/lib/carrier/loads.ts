import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { recalculateAndStore } from './revenue-calculator';

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
  brokerFlag?: boolean;
  carrierCost?: number;
  specialInstructions?: string;
  notes?: string;
  otherCharges?: number;
}

export type LoadUpdateInput = Partial<LoadCreateInput>;

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

  return { items, total };
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

  let rateType = data.rateType;
  let rateAmount = data.rateAmount;

  // Auto-populate rate fields from contract if contractId provided
  if (data.contractId) {
    const contract = await prisma.carrierContract.findFirst({
      where: { id: data.contractId, orgId },
    });
    if (contract) {
      if (!rateType) rateType = contract.rateType;
      if (rateAmount == null && contract.baseRate != null) {
        rateAmount = Number(contract.baseRate);
      }
    }
  }

  // Auto-generate referenceNumber as LD-YYYY-NNNNN if not provided
  let referenceNumber = data.referenceNumber;
  if (referenceNumber == null || referenceNumber === undefined) {
    const existingCount = await prisma.carrierLoad.count({ where: { orgId } });
    const year = new Date().getFullYear();
    referenceNumber = `LD-${year}-${String(existingCount + 1).padStart(5, '0')}`;
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
      ...(data.specialInstructions !== undefined
        ? { specialInstructions: data.specialInstructions }
        : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    },
  });

  // Trigger revenue recalculation if any rate-affecting fields changed
  const rateFields: (keyof LoadUpdateInput)[] = [
    'rateType',
    'rateAmount',
    'commodityWeightLbs',
    'commodityPallets',
    'otherCharges',
    'brokerFlag',
    'carrierCost',
  ];
  const needsRecalc = rateFields.some((f) => f in data);
  if (needsRecalc) {
    await recalculateAndStore(orgId, id);
    const fresh = await prisma.carrierLoad.findFirst({ where: { id, orgId } });
    return fresh ?? updated;
  }

  return updated;
}
