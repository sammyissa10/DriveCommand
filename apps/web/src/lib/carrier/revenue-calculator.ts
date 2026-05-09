import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

// Helper: convert Prisma Decimal | null to string | null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const decStr = (d: any): string | null => (d != null ? String(d) : null);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RevenueInput {
  rateType: string;
  rateAmount: number | null | undefined;
  commodityWeightLbs?: number | null;
  commodityPallets?: number | null;
  otherCharges?: number | null;
  brokerFlag?: boolean | null;
  carrierCost?: number | null;
  deliveryStopCount?: number;
}

export interface DispatchForRevenue {
  actualMiles?: number | null;
  plannedMiles?: number | null;
}

export interface ContractForRevenue {
  fuelSurchargeMethod?: string | null;
  fuelSurchargeRate?: number | null;
}

export interface RevenueResult {
  baseRevenue: number;
  fuelSurcharge: number;
  detentionAmount: number;
  otherCharges: number;
  totalRevenue: number;
  grossMargin?: number | null;
}

// ---------------------------------------------------------------------------
// Calculator
// ---------------------------------------------------------------------------

export function calculateRevenue(
  load: RevenueInput,
  dispatch?: DispatchForRevenue | null,
  contract?: ContractForRevenue | null
): RevenueResult {
  const rateAmount = Number(load.rateAmount ?? 0);

  // Base revenue by rate type
  let baseRevenue = 0;
  switch (load.rateType) {
    case 'per_mile': {
      const miles = Number(dispatch?.actualMiles ?? dispatch?.plannedMiles ?? 0);
      baseRevenue = rateAmount * miles;
      break;
    }
    case 'flat':
    case 'per_load':
      baseRevenue = rateAmount;
      break;
    case 'per_stop': {
      const stopCount = load.deliveryStopCount ?? 0;
      baseRevenue = rateAmount * stopCount;
      break;
    }
    case 'per_cwt': {
      const weightLbs = Number(load.commodityWeightLbs ?? 0);
      baseRevenue = rateAmount * (weightLbs / 100);
      break;
    }
    case 'per_pallet': {
      const pallets = Number(load.commodityPallets ?? 0);
      baseRevenue = rateAmount * pallets;
      break;
    }
    case 'hourly':
    case 'per_hour':
      baseRevenue = rateAmount * 8; // hardcoded default hours
      break;
    default:
      baseRevenue = rateAmount;
  }

  // FSC calculation
  let fuelSurcharge = 0;
  if (contract && contract.fuelSurchargeMethod && contract.fuelSurchargeMethod !== 'none') {
    const fscRate = Number(contract.fuelSurchargeRate ?? 0);
    if (contract.fuelSurchargeMethod === 'percent_of_linehaul') {
      fuelSurcharge = baseRevenue * fscRate;
    } else if (contract.fuelSurchargeMethod === 'per_mile') {
      const miles = Number(dispatch?.actualMiles ?? dispatch?.plannedMiles ?? 0);
      fuelSurcharge = miles * fscRate;
    }
  }

  // Detention: pass 0 (no detention_minutes column)
  const detentionAmount = 0;

  const otherCharges = Number(load.otherCharges ?? 0);
  const totalRevenue = baseRevenue + fuelSurcharge + detentionAmount + otherCharges;

  const result: RevenueResult = {
    baseRevenue,
    fuelSurcharge,
    detentionAmount,
    otherCharges,
    totalRevenue,
  };

  // Gross margin: compute but do not store (log only)
  if (load.brokerFlag) {
    const grossMargin = totalRevenue - Number(load.carrierCost ?? 0);
    result.grossMargin = grossMargin;
    logger.info('revenue-calculator: broker gross margin', {
      totalRevenue,
      carrierCost: load.carrierCost,
      grossMargin,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// DB helper: fetch load + dispatch + contract, recalculate, store
// ---------------------------------------------------------------------------

export async function recalculateAndStore(
  orgId: string,
  loadId: string
): Promise<{ id: string; totalRevenue: string | null; fuelSurcharge: string | null } | null> {
  const load = await prisma.carrierLoad.findFirst({
    where: { id: loadId, orgId },
    include: {
      dispatch: true,
      contract: true,
    },
  });

  if (!load) return null;

  // Count delivery stops for per_stop rate type
  const deliveryStopCount = await prisma.carrierStop.count({
    where: {
      dispatchId: load.dispatchId ?? undefined,
      stopType: 'delivery',
    },
  });

  const dispatchForRevenue: DispatchForRevenue | null = load.dispatch
    ? {
        actualMiles: load.dispatch.actualMiles != null ? Number(load.dispatch.actualMiles) : null,
        plannedMiles: load.dispatch.plannedMiles != null ? Number(load.dispatch.plannedMiles) : null,
      }
    : null;

  const contractForRevenue: ContractForRevenue | null = load.contract
    ? {
        fuelSurchargeMethod: load.contract.fuelSurchargeMethod,
        fuelSurchargeRate:
          load.contract.fuelSurchargeRate != null
            ? Number(load.contract.fuelSurchargeRate)
            : null,
      }
    : null;

  const result = calculateRevenue(
    {
      rateType: load.rateType,
      rateAmount: load.rateAmount != null ? Number(load.rateAmount) : null,
      commodityWeightLbs:
        load.commodityWeightLbs != null ? Number(load.commodityWeightLbs) : null,
      commodityPallets: load.commodityPallets,
      otherCharges: load.otherCharges != null ? Number(load.otherCharges) : null,
      brokerFlag: load.brokerFlag,
      carrierCost: load.carrierCost != null ? Number(load.carrierCost) : null,
      deliveryStopCount,
    },
    dispatchForRevenue,
    contractForRevenue
  );

  const updated = await prisma.carrierLoad.update({
    where: { id: loadId },
    data: {
      totalRevenue: result.totalRevenue,
      fuelSurcharge: result.fuelSurcharge,
    },
  });

  return {
    id: updated.id,
    totalRevenue: decStr(updated.totalRevenue),
    fuelSurcharge: decStr(updated.fuelSurcharge),
  };
}
