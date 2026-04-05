import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

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
  const dispatch = await prisma.carrierDispatch.findFirst({
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

  // Step 3: Calculate total miles
  const totalMiles = toNum(dispatch.actualMiles ?? dispatch.plannedMiles);

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
        const netPay = basePay + reimbursements;

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

    const netPay = basePay + reimbursements;

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
  return { data: { recordsCreated } };
}
