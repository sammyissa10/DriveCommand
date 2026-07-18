import { getTenantPrisma } from '@/lib/context/tenant-context';
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
  status?: string;
  notes?: string;
}

export type ContractUpdateInput = Partial<ContractCreateInput> & { status?: string };

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

export async function listContracts(orgId: string, filters: ListContractsFilters = {}) {
  const tenantPrisma = await getTenantPrisma();
  const { clientId, status, page = 1, pageSize = 50 } = filters;
  const skip = (page - 1) * pageSize;

  const where = {
    orgId,
    deletedAt: null,
    ...(clientId ? { clientId } : {}),
    ...(status ? { status } : {}),
  };

  const [items, total] = await Promise.all([
    tenantPrisma.carrierContract.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { name: true } },
      },
    }),
    tenantPrisma.carrierContract.count({ where }),
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
  const tenantPrisma = await getTenantPrisma();
  const contract = await tenantPrisma.carrierContract.findFirst({
    where: { id, orgId },
    include: {
      client: { select: { name: true } },
      routeTemplates: { select: { id: true } },
    },
  });

  if (!contract) return null;

  const revenueAgg = await tenantPrisma.carrierLoad.aggregate({
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
  const tenantPrisma = await getTenantPrisma();
  const year = new Date().getFullYear();

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

  // Retry up to 5 times on unique contract number collision (race condition guard)
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await tenantPrisma.carrierContract.findFirst({
      where: { contractNumber: { startsWith: `CN-${year}-` } },
      orderBy: { contractNumber: 'desc' },
      select: { contractNumber: true },
    });
    const lastSeq = last ? parseInt(last.contractNumber.slice(-5), 10) : 0;
    const seq = String(lastSeq + 1 + attempt).padStart(5, '0');
    const contractNumber = `CN-${year}-${seq}`;

    try {
      return await tenantPrisma.carrierContract.create({
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
    } catch (err) {
      logger.error(
        'createContract failed',
        err instanceof Error ? err : new Error(String(err)),
        {
          code: (err as any)?.code,
          meta: (err as any)?.meta,
          raw: JSON.stringify(err, Object.getOwnPropertyNames(err)),
        }
      );
      const isUniqueViolation =
        err != null &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002';
      if (isUniqueViolation && attempt < 4) continue;
      throw err;
    }
  }

  throw new Error('Failed to generate a unique contract number after 5 attempts');
}

export async function updateContract(orgId: string, id: string, data: ContractUpdateInput) {
  const tenantPrisma = await getTenantPrisma();
  const existing = await tenantPrisma.carrierContract.findFirst({ where: { id, orgId } });
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

  const updated = await tenantPrisma.carrierContract.update({
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
  const tenantPrisma = await getTenantPrisma();
  const existing = await tenantPrisma.carrierContract.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  const updated = await tenantPrisma.carrierContract.update({
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
  const tenantPrisma = await getTenantPrisma();
  const contract = await tenantPrisma.carrierContract.findFirst({
    where: { id: contractId, orgId },
  });
  if (!contract) return null;

  const [totalAgg, invoicedAgg, deliveredAgg, avgAgg] = await Promise.all([
    tenantPrisma.carrierLoad.aggregate({
      where: { contractId, orgId },
      _sum: { totalRevenue: true },
      _count: { id: true },
    }),
    tenantPrisma.carrierLoad.aggregate({
      where: { contractId, orgId, status: 'invoiced' },
      _sum: { totalRevenue: true },
    }),
    tenantPrisma.carrierLoad.aggregate({
      where: { contractId, orgId, status: 'delivered' },
      _sum: { totalRevenue: true },
    }),
    tenantPrisma.carrierLoad.aggregate({
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
