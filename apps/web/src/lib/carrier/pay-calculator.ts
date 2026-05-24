import { after } from 'next/server';
import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { sendPayRecordReadyNotification } from '@/lib/carrier/notifications';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PayResult = Promise<{ data: { recordsCreated: number } } | { error: string; status: number }>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert Prisma Decimal | null | undefined to a plain number */
function toNum(d: Prisma.Decimal | null | undefined): number {
  if (d == null) return 0;
  return parseFloat(String(d));
}

/**
 * Resolve the total loaded miles for a dispatch using the priority chain:
 *   1. dispatch.actualMiles (set from odometer or manual entry)
 *   2. dispatch.plannedMiles (set on the dispatch or written back from the load form)
 *
 * Note: CarrierLoad has no stored miles column; the per-load plannedMiles
 * field is a form-only override used only during revenue calculation.
 * Callers that want load-level miles to influence pay records must persist
 * those miles to dispatch.plannedMiles before calling this function.
 */
function resolveDispatchMiles(
  actualMiles: Prisma.Decimal | null | undefined,
  plannedMiles: Prisma.Decimal | null | undefined
): number {
  return toNum(actualMiles) || toNum(plannedMiles);
}

/** Compute net pay from all components — single source of truth */
function computeNetPay(
  basePay: number,
  bonuses: number,
  tips: number,
  deductions: number,
  reimbursements: number
): number {
  return basePay + bonuses + tips - deductions + reimbursements;
}

// ---------------------------------------------------------------------------
// generateDriverPayRecords
// ---------------------------------------------------------------------------

/**
 * Generate DriverPayRecord rows for all drivers on a given dispatch.
 * Supports 5 pay models: per_mile, percentage_gross, hourly, flat_rate, team_split.
 * For relay dispatches, miles are split at the relay_handoff_stop.
 */
export async function generateDriverPayRecords(
  orgId: string,
  dispatchId: string
): PayResult {
  // Step 1: Load dispatch with all required relations
  const dispatch = await prisma.trip.findFirst({
    where: { id: dispatchId, orgId },
    include: {
      primaryDriver: true,
      coDriver: true,
      carrierLoads: {
        include: { client: { select: { id: true } } },
      },
      stops: { orderBy: { sequenceOrder: 'asc' } },
    },
  });

  if (!dispatch) {
    return { error: 'Dispatch not found', status: 404 };
  }

  // Step 2: Determine if relay
  const isRelay = !!dispatch.relayHandoffStopId && !!dispatch.coDriverId;
  const handoffStop = isRelay
    ? dispatch.stops.find((s) => s.id === dispatch.relayHandoffStopId) ?? null
    : null;

  // Step 3: Calculate total miles — prefer actual (odometer), fall back to planned
  const totalMiles = resolveDispatchMiles(dispatch.actualMiles, dispatch.plannedMiles);

  // Step 4: Split miles for relay
  const totalStops = dispatch.stops.length;
  let primaryMiles = totalMiles;
  let relayMiles = 0;

  if (isRelay && handoffStop && totalStops > 0) {
    const handoffIndex = dispatch.stops.findIndex((s) => s.id === dispatch.relayHandoffStopId);
    primaryMiles = Math.round(totalMiles * ((handoffIndex + 1) / totalStops));
    relayMiles = totalMiles - primaryMiles;
  }

  // Empty miles: ~10% of loaded miles (industry placeholder)
  const primaryEmptyMiles = Math.round(primaryMiles * 0.1);
  const relayEmptyMiles = Math.round(relayMiles * 0.1);

  // HOS hours worked from dispatch timestamps
  const hoursWorked =
    dispatch.actualDeparture && dispatch.actualArrival
      ? (dispatch.actualArrival.getTime() - dispatch.actualDeparture.getTime()) / (1000 * 60 * 60)
      : 0;

  // Build list of drivers to process: [{driver, loadedMiles, emptyMiles}]
  type DriverEntry = {
    driver: typeof dispatch.primaryDriver;
    loadedMiles: number;
    emptyMiles: number;
    isCoDriver: boolean;
  };

  const driverEntries: DriverEntry[] = [
    {
      driver: dispatch.primaryDriver,
      loadedMiles: primaryMiles,
      emptyMiles: primaryEmptyMiles,
      isCoDriver: false,
    },
  ];

  if (isRelay && dispatch.coDriver) {
    driverEntries.push({
      driver: dispatch.coDriver,
      loadedMiles: relayMiles,
      emptyMiles: relayEmptyMiles,
      isCoDriver: true,
    });
  }

  let recordsCreated = 0;

  for (const entry of driverEntries) {
    const { driver, loadedMiles, emptyMiles } = entry;
    const payModel = driver.payModel;
    const payRate = toNum(driver.payRate);

    // Step 5: Fetch approved reimbursable expenses for this driver + dispatch
    const reimbursableExpenses = await prisma.carrierExpense.findMany({
      where: {
        dispatchId,
        driverId: driver.id,
        reimbursable: true,
        approvedAt: { not: null },
      },
    });
    const reimbursements = reimbursableExpenses.reduce(
      (sum, e) => sum + toNum(e.amount),
      0
    );

    // Step 6: Calculate pay based on pay model
    if (payModel === 'percentage_gross') {
      // One DriverPayRecord per load
      for (const load of dispatch.carrierLoads) {
        const grossRevenue = toNum(load.totalRevenue);
        const basePay = grossRevenue * payRate;
        const netPay = computeNetPay(basePay, 0, 0, 0, reimbursements);

        await prisma.driverPayRecord.create({
          data: {
            orgId,
            driverId: driver.id,
            dispatchId,
            loadId: load.id,
            clientId: load.clientId ?? null,
            payModel,
            loadedMiles: null,
            emptyMiles: null,
            loadedRate: null,
            emptyRate: null,
            hoursWorked: null,
            hourlyRate: null,
            grossRevenue: new Prisma.Decimal(grossRevenue),
            percentageApplied: new Prisma.Decimal(payRate),
            flatAmount: null,
            basePay: new Prisma.Decimal(basePay),
            reimbursements: new Prisma.Decimal(reimbursements),
            netPay: new Prisma.Decimal(netPay),
            status: 'pending',
          },
        });
        recordsCreated++;
      }
      continue; // Skip to next driver entry
    }

    let basePay = 0;
    const recordData: Record<string, unknown> = {
      orgId,
      driverId: driver.id,
      dispatchId,
      loadId: null,
      clientId: null,
      payModel,
      status: 'pending',
    };

    if (payModel === 'per_mile') {
      const loadedRate = payRate;
      const emptyRate = payRate * 0.8;
      basePay = loadedMiles * loadedRate + emptyMiles * emptyRate;

      Object.assign(recordData, {
        loadedMiles,
        emptyMiles,
        loadedRate: new Prisma.Decimal(loadedRate),
        emptyRate: new Prisma.Decimal(emptyRate),
        hoursWorked: null,
        hourlyRate: null,
        grossRevenue: null,
        percentageApplied: null,
        flatAmount: null,
      });
    } else if (payModel === 'hourly') {
      basePay = hoursWorked * payRate;

      Object.assign(recordData, {
        loadedMiles: null,
        emptyMiles: null,
        loadedRate: null,
        emptyRate: null,
        hoursWorked: new Prisma.Decimal(hoursWorked),
        hourlyRate: new Prisma.Decimal(payRate),
        grossRevenue: null,
        percentageApplied: null,
        flatAmount: null,
      });
    } else if (payModel === 'flat_rate') {
      basePay = payRate;

      Object.assign(recordData, {
        loadedMiles: null,
        emptyMiles: null,
        loadedRate: null,
        emptyRate: null,
        hoursWorked: null,
        hourlyRate: null,
        grossRevenue: null,
        percentageApplied: null,
        flatAmount: new Prisma.Decimal(payRate),
      });
    } else if (payModel === 'team_split') {
      // Same as per_mile but total miles divided by 2 for co-driver scenario
      const splitMiles = totalMiles / 2;
      const splitEmptyMiles = Math.round(splitMiles * 0.1);
      const loadedRate = payRate;
      const emptyRate = payRate * 0.8;
      basePay = splitMiles * loadedRate + splitEmptyMiles * emptyRate;

      Object.assign(recordData, {
        loadedMiles: Math.round(splitMiles),
        emptyMiles: splitEmptyMiles,
        loadedRate: new Prisma.Decimal(loadedRate),
        emptyRate: new Prisma.Decimal(emptyRate),
        hoursWorked: null,
        hourlyRate: null,
        grossRevenue: null,
        percentageApplied: null,
        flatAmount: null,
      });
    } else {
      // Unknown pay model — log and skip
      logger.warn('generateDriverPayRecords: unknown payModel', {
        orgId,
        dispatchId,
        driverId: driver.id,
        payModel,
      });
      continue;
    }

    const netPay = computeNetPay(basePay, 0, 0, 0, reimbursements);

    await prisma.driverPayRecord.create({
      data: {
        ...recordData,
        basePay: new Prisma.Decimal(basePay),
        reimbursements: new Prisma.Decimal(reimbursements),
        netPay: new Prisma.Decimal(netPay),
      } as Parameters<typeof prisma.driverPayRecord.create>[0]['data'],
    });
    recordsCreated++;
  }

  logger.info('generateDriverPayRecords: completed', { orgId, dispatchId, recordsCreated });

  // Notify owner about each newly created pay record
  if (recordsCreated > 0) {
    const newRecords = await prisma.driverPayRecord.findMany({
      where: { dispatchId, orgId },
      select: {
        id: true,
        netPay: true,
        driver: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: recordsCreated,
    });
    for (const rec of newRecords) {
      const driverName = `${rec.driver.firstName} ${rec.driver.lastName}`.trim();
      after(() => sendPayRecordReadyNotification(
        orgId,
        rec.id,
        driverName,
        dispatchId,
        Number(rec.netPay ?? 0)
      ));
    }
  }

  return { data: { recordsCreated } };
}

// ---------------------------------------------------------------------------
// recalculatePayRecordReimbursements
// ---------------------------------------------------------------------------

/**
 * Re-fetch approved reimbursable expenses for the pay record's driver+dispatch
 * and update the pay record's reimbursements + net_pay.
 *
 * For percentage_gross pay models where multiple records exist for the same
 * driver+dispatch (one per load), the total reimbursements are split evenly
 * across all records so the driver isn't double-reimbursed.
 *
 * Returns an error descriptor if the record is not found or is paid.
 */
export async function recalculatePayRecordReimbursements(
  orgId: string,
  payRecordId: string
): Promise<
  | { error: string; status: number }
  | { data: { id: string; basePay: number; reimbursements: number; netPay: number } }
> {
  const record = await prisma.driverPayRecord.findFirst({
    where: { id: payRecordId, orgId },
  });

  if (!record) {
    return { error: 'Pay record not found', status: 404 };
  }

  if (record.status === 'paid') {
    return { error: 'Cannot recalculate a paid record', status: 422 };
  }

  if (!record.dispatchId) {
    return { error: 'Pay record has no associated dispatch', status: 422 };
  }

  // Sum all approved reimbursable expenses for this driver+dispatch.
  // Include expenses where driverId IS NULL (dispatcher-added expenses have no
  // driverId set but still belong to the dispatch and should be reimbursed).
  const reimbursableExpenses = await prisma.carrierExpense.findMany({
    where: {
      dispatchId: record.dispatchId,
      reimbursable: true,
      approvedAt: { not: null },
      OR: [{ driverId: record.driverId }, { driverId: null }],
    },
  });

  logger.info('recalculatePayRecordReimbursements: expenses found', {
    orgId,
    payRecordId,
    dispatchId: record.dispatchId,
    driverId: record.driverId,
    expenseCount: reimbursableExpenses.length,
  });

  const totalReimbursements = reimbursableExpenses.reduce(
    (sum, e) => sum + toNum(e.amount),
    0
  );

  // For percentage_gross, split reimbursements evenly across all records for
  // this driver+dispatch (one per load). Other pay models have exactly one record.
  let reimbursementShare = totalReimbursements;
  if (record.payModel === 'percentage_gross' && record.dispatchId) {
    const siblingCount = await prisma.driverPayRecord.count({
      where: {
        orgId,
        dispatchId: record.dispatchId,
        driverId: record.driverId,
      },
    });
    if (siblingCount > 1) {
      reimbursementShare = totalReimbursements / siblingCount;
    }
  }

  // For mile-based pay models, re-derive miles from the dispatch (including the
  // load plannedMiles fallback) and recompute basePay. This handles the common
  // case where the dispatch has no odometer data yet but loads have plannedMiles.
  let newBasePay = toNum(record.basePay);
  let newLoadedMiles = record.loadedMiles ?? 0;
  let newEmptyMiles = record.emptyMiles ?? 0;

  if (record.payModel === 'per_mile' || record.payModel === 'team_split') {
    const dispatch = await prisma.trip.findFirst({
      where: { id: record.dispatchId, orgId },
    });

    if (dispatch) {
      const resolvedMiles = resolveDispatchMiles(dispatch.actualMiles, dispatch.plannedMiles);

      if (resolvedMiles > 0) {
        const loadedMiles =
          record.payModel === 'team_split' ? resolvedMiles / 2 : resolvedMiles;
        const emptyMiles = Math.round(loadedMiles * 0.1);
        const loadedRate = toNum(record.loadedRate);
        const emptyRate = toNum(record.emptyRate);
        newBasePay = loadedMiles * loadedRate + emptyMiles * emptyRate;
        newLoadedMiles = Math.round(loadedMiles);
        newEmptyMiles = emptyMiles;
      }
    }
  }

  const newNetPay = computeNetPay(
    newBasePay,
    toNum(record.bonuses),
    toNum(record.tips),
    toNum(record.deductions),
    reimbursementShare
  );

  await prisma.driverPayRecord.update({
    where: { id: payRecordId },
    data: {
      loadedMiles: newLoadedMiles,
      emptyMiles: newEmptyMiles,
      basePay: new Prisma.Decimal(newBasePay),
      reimbursements: new Prisma.Decimal(reimbursementShare),
      netPay: new Prisma.Decimal(newNetPay),
    },
  });

  logger.info('recalculatePayRecordReimbursements: updated', {
    orgId,
    payRecordId,
    newBasePay,
    reimbursementShare,
    newNetPay,
  });

  return {
    data: { id: payRecordId, basePay: newBasePay, reimbursements: reimbursementShare, netPay: newNetPay },
  };
}
