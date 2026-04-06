import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

// Helper: convert Prisma Decimal | null to string | null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const decStr = (d: any): string | null => (d != null ? String(d) : null);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ListContractsFilters {
  clientId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface ContractCreateInput {
  contractName?: string;
  contractType?: string;
  effectiveDate?: string;
  expirationDate?: string;
  rateType?: string;
  baseRate?: string;
  fuelSurchargeRate?: string;
  fuelSurchargeMethod?: string;
  detentionFreeMinutes?: number;
  detentionRatePerHour?: string;
  tonuRate?: string;
  layoverRatePerDay?: string;
  paymentTermsOverride?: string;
  autoRenew?: boolean;
  notes?: string;
}

export type ContractUpdateInput = Partial<ContractCreateInput> & { status?: string };

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export async function listContracts(orgId: string, filters: ListContractsFilters = {}) {
  const { clientId, status, page = 1, pageSize = 50 } = filters;
  const skip = (page - 1) * pageSize;

  const where = {
    orgId,
    ...(clientId ? { clientId } : {}),
    ...(status ? { status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.carrierContract.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { name: true } },
      },
    }),
    prisma.carrierContract.count({ where }),
  ]);

  const serialized = items.map((c) => ({
    ...c,
    baseRate: decStr(c.baseRate),
    fuelSurchargeRate: decStr(c.fuelSurchargeRate),
    detentionRatePerHour: decStr(c.detentionRatePerHour),
    tonuRate: decStr(c.tonuRate),
    layoverRatePerDay: decStr(c.layoverRatePerDay),
  }));

  return { items: serialized, total };
}

export async function getContract(orgId: string, id: string) {
  const contract = await prisma.carrierContract.findFirst({
    where: { id, orgId },
    include: {
      client: { select: { name: true } },
      routeTemplates: { select: { id: true } },
    },
  });

  if (!contract) return null;

  const revenueAgg = await prisma.carrierLoad.aggregate({
    where: { contractId: id, orgId },
    _sum: { totalRevenue: true },
    _count: { id: true },
  });

  return {
    ...contract,
    baseRate: decStr(contract.baseRate),
    fuelSurchargeRate: decStr(contract.fuelSurchargeRate),
    detentionRatePerHour: decStr(contract.detentionRatePerHour),
    tonuRate: decStr(contract.tonuRate),
    layoverRatePerDay: decStr(contract.layoverRatePerDay),
    routeTemplateCount: contract.routeTemplates.length,
    totalLoads: revenueAgg._count.id,
    totalRevenue: decStr(revenueAgg._sum.totalRevenue),
  };
}

export async function createContract(
  orgId: string,
  clientId: string,
  data: ContractCreateInput
) {
  return prisma.$transaction(async (tx) => {
    const year = new Date().getFullYear();
    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${year + 1}-01-01T00:00:00.000Z`);

    const count = await tx.carrierContract.count({
      where: {
        orgId,
        createdAt: { gte: yearStart, lt: yearEnd },
      },
    });

    const seq = String(count + 1).padStart(5, '0');
    const contractNumber = `CN-${year}-${seq}`;

    const {
      effectiveDate,
      expirationDate,
      baseRate,
      fuelSurchargeRate,
      detentionRatePerHour,
      tonuRate,
      layoverRatePerDay,
      detentionFreeMinutes,
      ...rest
    } = data;

    return tx.carrierContract.create({
      data: {
        ...rest,
        orgId,
        clientId,
        contractNumber,
        ...(effectiveDate ? { effectiveDate: new Date(effectiveDate) } : {}),
        ...(expirationDate ? { expirationDate: new Date(expirationDate) } : {}),
        ...(baseRate != null ? { baseRate } : {}),
        ...(fuelSurchargeRate != null ? { fuelSurchargeRate } : {}),
        ...(detentionRatePerHour != null ? { detentionRatePerHour } : {}),
        ...(tonuRate != null ? { tonuRate } : {}),
        ...(layoverRatePerDay != null ? { layoverRatePerDay } : {}),
        ...(detentionFreeMinutes != null ? { detentionFreeMinutes } : {}),
      },
    });
  }, TX_OPTIONS);
}

export async function updateContract(orgId: string, id: string, data: ContractUpdateInput) {
  const existing = await prisma.carrierContract.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  const {
    effectiveDate,
    expirationDate,
    baseRate,
    fuelSurchargeRate,
    detentionRatePerHour,
    tonuRate,
    layoverRatePerDay,
    detentionFreeMinutes,
    ...rest
  } = data;

  const updated = await prisma.carrierContract.update({
    where: { id },
    data: {
      ...rest,
      ...(effectiveDate ? { effectiveDate: new Date(effectiveDate) } : {}),
      ...(expirationDate ? { expirationDate: new Date(expirationDate) } : {}),
      ...(baseRate != null ? { baseRate } : {}),
      ...(fuelSurchargeRate != null ? { fuelSurchargeRate } : {}),
      ...(detentionRatePerHour != null ? { detentionRatePerHour } : {}),
      ...(tonuRate != null ? { tonuRate } : {}),
      ...(layoverRatePerDay != null ? { layoverRatePerDay } : {}),
      ...(detentionFreeMinutes != null ? { detentionFreeMinutes } : {}),
    },
  });

  return {
    ...updated,
    baseRate: decStr(updated.baseRate),
    fuelSurchargeRate: decStr(updated.fuelSurchargeRate),
    detentionRatePerHour: decStr(updated.detentionRatePerHour),
    tonuRate: decStr(updated.tonuRate),
    layoverRatePerDay: decStr(updated.layoverRatePerDay),
  };
}

export async function softDeleteContract(orgId: string, id: string) {
  const existing = await prisma.carrierContract.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  const updated = await prisma.carrierContract.update({
    where: { id },
    data: { status: 'cancelled' },
  });

  return {
    ...updated,
    baseRate: decStr(updated.baseRate),
    fuelSurchargeRate: decStr(updated.fuelSurchargeRate),
    detentionRatePerHour: decStr(updated.detentionRatePerHour),
    tonuRate: decStr(updated.tonuRate),
    layoverRatePerDay: decStr(updated.layoverRatePerDay),
  };
}

export async function getContractLoadsSummary(orgId: string, contractId: string) {
  const contract = await prisma.carrierContract.findFirst({
    where: { id: contractId, orgId },
  });
  if (!contract) return null;

  const [totalAgg, invoicedAgg, deliveredAgg, avgAgg] = await Promise.all([
    prisma.carrierLoad.aggregate({
      where: { contractId, orgId },
      _sum: { totalRevenue: true },
      _count: { id: true },
    }),
    prisma.carrierLoad.aggregate({
      where: { contractId, orgId, status: 'invoiced' },
      _sum: { totalRevenue: true },
    }),
    prisma.carrierLoad.aggregate({
      where: { contractId, orgId, status: 'delivered' },
      _sum: { totalRevenue: true },
    }),
    prisma.carrierLoad.aggregate({
      where: { contractId, orgId },
      _avg: { rateAmount: true },
    }),
  ]);

  return {
    totalLoads: totalAgg._count.id,
    totalRevenue: decStr(totalAgg._sum.totalRevenue),
    totalInvoiced: decStr(invoicedAgg._sum.totalRevenue),
    totalPaid: decStr(deliveredAgg._sum.totalRevenue),
    avgRate: decStr(avgAgg._avg.rateAmount),
  };
}
