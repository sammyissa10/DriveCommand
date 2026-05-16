/**
 * accessorial-spend.ts — Accessorial spend grouped by client/contract.
 * Filters to ACCESSORIAL category, groups in JS, computes prior-period delta.
 */

import Decimal from 'decimal.js';
import type { PrismaClient } from '@/generated/prisma';
import {
  getPriorPeriodRange,
  computeDeltaPct,
  type PeriodRange,
  type ReportFilters,
} from '@/lib/driver-pay/reporting';

export interface AccessorialSpendRow {
  clientId: string | null;
  clientName: string;
  contractId: string | null;
  contractName: string | null;
  totalAmount: string;       // Decimal serialized to toFixed(2)
  componentCount: number;
  avgAmount: string;
}

export interface AccessorialSpendResult {
  bigNumber: string;         // total accessorial spend in period (toFixed(2))
  deltaPct: number | null;   // vs prior period
  priorTotal: string;
  rows: AccessorialSpendRow[];
}

export async function computeAccessorialSpend(
  prisma: PrismaClient,
  tenantId: string,
  range: PeriodRange,
  filters?: ReportFilters,
): Promise<AccessorialSpendResult> {
  const driverFilter = filters?.driverIds?.length
    ? { driverId: { in: filters.driverIds } }
    : {};

  // Fetch current period ACCESSORIAL components
  const components = await prisma.loadPayComponent.findMany({
    where: {
      tenantId,
      category: 'ACCESSORIAL',
      deletedAt: null,
      createdAt: { gte: range.start, lte: range.end },
      ...driverFilter,
    },
    include: {
      load: {
        select: {
          clientId: true,
          contractId: true,
          client: { select: { name: true } },
          contract: { select: { contractName: true } },
        },
      },
    },
  });

  // Group by clientId in JS
  const buckets = new Map<
    string | null,
    {
      clientId: string | null;
      clientName: string;
      contractId: string | null;
      contractName: string | null;
      total: Decimal;
      count: number;
    }
  >();

  let bigNumberDecimal = new Decimal(0);

  for (const comp of components) {
    const amount = new Decimal(comp.grossAmount.toString());
    bigNumberDecimal = bigNumberDecimal.plus(amount);

    const clientId = comp.load?.clientId ?? null;
    const key = clientId ?? '__no_client__';
    const existing = buckets.get(key);

    if (existing) {
      existing.total = existing.total.plus(amount);
      existing.count += 1;
    } else {
      buckets.set(key, {
        clientId,
        clientName: comp.load?.client?.name ?? 'Unknown / No Client',
        contractId: comp.load?.contractId ?? null,
        contractName: comp.load?.contract?.contractName ?? null,
        total: amount,
        count: 1,
      });
    }
  }

  // Build rows sorted by totalAmount desc
  const rows: AccessorialSpendRow[] = Array.from(buckets.values())
    .map((b) => ({
      clientId: b.clientId,
      clientName: b.clientName,
      contractId: b.contractId,
      contractName: b.contractName,
      totalAmount: b.total.toFixed(2),
      componentCount: b.count,
      avgAmount: b.count > 0 ? b.total.div(new Decimal(b.count)).toFixed(2) : '0.00',
    }))
    .sort((a, b) => new Decimal(b.totalAmount).minus(new Decimal(a.totalAmount)).toNumber());

  // Prior period sum
  const priorRange = getPriorPeriodRange(range);
  const priorComponents = await prisma.loadPayComponent.findMany({
    where: {
      tenantId,
      category: 'ACCESSORIAL',
      deletedAt: null,
      createdAt: { gte: priorRange.start, lte: priorRange.end },
      ...driverFilter,
    },
    select: { grossAmount: true },
  });

  const priorDecimal = priorComponents.reduce(
    (acc, c) => acc.plus(new Decimal(c.grossAmount.toString())),
    new Decimal(0),
  );

  return {
    bigNumber: bigNumberDecimal.toFixed(2),
    deltaPct: computeDeltaPct(bigNumberDecimal, priorDecimal),
    priorTotal: priorDecimal.toFixed(2),
    rows,
  };
}
