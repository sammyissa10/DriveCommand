'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import {
  calculateCO2Emissions,
  calculateMPG,
  calculateCostPerMile,
  IDLE_COST_PER_HOUR,
} from '@/lib/fuel/fuel-calculator';

/**
 * Get overall fleet fuel summary for the specified time period
 *
 * @param daysBack - Number of days to look back (default: 30)
 * @param tagId - Optional tag ID to filter by tagged vehicles only
 * @returns Fleet fuel summary with totals, averages, and period
 */
export async function getFleetFuelSummary(daysBack: number = 30, tagId?: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();
  const tenantId = await requireTenantId();
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Raw SQL to aggregate fuel records
  // @ts-ignore - Raw query typing
  const results = tagId
    ? await db.$queryRaw`
        SELECT
          SUM(quantity)::float as "totalGallons",
          SUM("totalCost")::float as "totalCost",
          MAX(odometer) - MIN(odometer) as "totalMiles",
          COUNT(*)::int as "fillUpCount"
        FROM "FuelRecord" fr
        WHERE fr."tenantId" = ${tenantId}::uuid AND fr.timestamp >= ${cutoff}
          AND fr."truckId" IN (SELECT "truckId" FROM "TagAssignment" WHERE "tagId" = ${tagId}::uuid AND "truckId" IS NOT NULL)
      `
    : await db.$queryRaw`
        SELECT
          SUM(quantity)::float as "totalGallons",
          SUM("totalCost")::float as "totalCost",
          MAX(odometer) - MIN(odometer) as "totalMiles",
          COUNT(*)::int as "fillUpCount"
        FROM "FuelRecord" fr
        WHERE fr."tenantId" = ${tenantId}::uuid AND fr.timestamp >= ${cutoff}
      `;

  const row = (results as any[])[0];

  // Extract values with defaults for empty result
  const totalGallons = row.totalGallons || 0;
  const totalCost = row.totalCost || 0;
  const totalMiles = row.totalMiles || 0;
  const fillUpCount = row.fillUpCount || 0;

  // Calculate derived metrics
  const avgMPG = calculateMPG(totalMiles, totalGallons);
  const costPerMile = calculateCostPerMile(totalCost, totalMiles);

  return {
    totalGallons,
    totalCost,
    totalMiles,
    fillUpCount,
    avgMPG,
    costPerMile,
    period: daysBack,
  };
}

/**
 * Get fuel efficiency trend over time (daily MPG)
 *
 * @param daysBack - Number of days to look back (default: 30)
 * @param tagId - Optional tag ID to filter by tagged vehicles only
 * @returns Array of daily fuel efficiency data
 */
export async function getFuelEfficiencyTrend(daysBack: number = 30, tagId?: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();
  const tenantId = await requireTenantId();
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Raw SQL: Daily fuel efficiency by aggregating fill-ups per day
  // @ts-ignore - Raw query typing
  const results = tagId
    ? await db.$queryRaw`
        SELECT
          DATE(timestamp) as date,
          SUM(quantity)::float as gallons,
          SUM("totalCost")::float as cost,
          MAX(odometer) - MIN(odometer) as miles
        FROM "FuelRecord" fr
        WHERE fr."tenantId" = ${tenantId}::uuid AND fr.timestamp >= ${cutoff}
          AND fr."truckId" IN (SELECT "truckId" FROM "TagAssignment" WHERE "tagId" = ${tagId}::uuid AND "truckId" IS NOT NULL)
        GROUP BY DATE(timestamp)
        ORDER BY date ASC
      `
    : await db.$queryRaw`
        SELECT
          DATE(timestamp) as date,
          SUM(quantity)::float as gallons,
          SUM("totalCost")::float as cost,
          MAX(odometer) - MIN(odometer) as miles
        FROM "FuelRecord" fr
        WHERE fr."tenantId" = ${tenantId}::uuid AND fr.timestamp >= ${cutoff}
        GROUP BY DATE(timestamp)
        ORDER BY date ASC
      `;

  // Initialize all dates in range with zeros
  const dateMap = new Map<
    string,
    { date: string; mpg: number; gallons: number; cost: number }
  >();

  for (let i = 0; i < daysBack; i++) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    dateMap.set(dateStr, {
      date: dateStr,
      mpg: 0,
      gallons: 0,
      cost: 0,
    });
  }

  // Fill in actual data from query results
  for (const row of results as any[]) {
    const dateStr = row.date.toISOString().split('T')[0];
    const dayData = dateMap.get(dateStr);
    if (dayData) {
      dayData.gallons = row.gallons || 0;
      dayData.cost = row.cost || 0;
      const miles = row.miles || 0;
      dayData.mpg = calculateMPG(miles, row.gallons || 0);
    }
  }

  // Convert to array and sort chronologically
  const trend = Array.from(dateMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return trend;
}

/**
 * Get CO2 emissions by truck
 *
 * @param daysBack - Number of days to look back (default: 30)
 * @param tagId - Optional tag ID to filter by tagged vehicles only
 * @returns CO2 emissions data per truck and fleet totals
 */
export async function getCO2Emissions(daysBack: number = 30, tagId?: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();
  const tenantId = await requireTenantId();
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Raw SQL: Per-truck fuel consumption for CO2 calculation
  // @ts-ignore - Raw query typing
  const results = tagId
    ? await db.$queryRaw`
        SELECT
          t.id as "truckId",
          t.make,
          t.model,
          t."licensePlate",
          COALESCE(SUM(fr.quantity), 0)::float as "totalGallons",
          COALESCE(SUM(fr."totalCost"), 0)::float as "totalCost"
        FROM "Truck" t
        INNER JOIN "TagAssignment" ta ON ta."truckId" = t.id AND ta."tagId" = ${tagId}::uuid
        LEFT JOIN "FuelRecord" fr ON t.id = fr."truckId" AND fr.timestamp >= ${cutoff} AND fr."tenantId" = ${tenantId}::uuid
        WHERE t."tenantId" = ${tenantId}::uuid
        GROUP BY t.id, t.make, t.model, t."licensePlate"
        ORDER BY "totalGallons" DESC NULLS LAST
      `
    : await db.$queryRaw`
        SELECT
          t.id as "truckId",
          t.make,
          t.model,
          t."licensePlate",
          COALESCE(SUM(fr.quantity), 0)::float as "totalGallons",
          COALESCE(SUM(fr."totalCost"), 0)::float as "totalCost"
        FROM "Truck" t
        LEFT JOIN "FuelRecord" fr ON t.id = fr."truckId" AND fr.timestamp >= ${cutoff} AND fr."tenantId" = ${tenantId}::uuid
        WHERE t."tenantId" = ${tenantId}::uuid
        GROUP BY t.id, t.make, t.model, t."licensePlate"
        ORDER BY "totalGallons" DESC NULLS LAST
      `;

  let fleetTotalCO2 = 0;
  let fleetTotalGallons = 0;

  // Calculate CO2 per truck
  const trucks = (results as any[]).map((row) => {
    const totalGallons = row.totalGallons || 0;
    const co2Kg = calculateCO2Emissions(totalGallons);

    fleetTotalCO2 += co2Kg;
    fleetTotalGallons += totalGallons;

    return {
      truckId: row.truckId,
      name: `${row.make} ${row.model}`,
      licensePlate: row.licensePlate,
      totalGallons,
      co2Kg,
    };
  });

  return {
    trucks,
    fleetTotalCO2,
    fleetTotalGallons,
    methodology: 'EPA standard: 8.887 kg CO2 per gallon of diesel',
  };
}

/**
 * Get idle time analysis by truck
 *
 * @param daysBack - Number of days to look back (default: 30)
 * @param tagId - Optional tag ID to filter by tagged vehicles only
 * @returns Idle time data per truck with cost estimates
 */
export async function getIdleTimeAnalysis(daysBack: number = 30, tagId?: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();
  const tenantId = await requireTenantId();
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Raw SQL on GPSLocation: Count total points, idle points, and moving points
  // @ts-ignore - Raw query typing
  const results = tagId
    ? await db.$queryRaw`
        SELECT
          t.id as "truckId",
          t.make,
          t.model,
          t."licensePlate",
          COUNT(g.id)::int as "totalPoints",
          SUM(CASE WHEN g.speed IS NOT NULL AND g.speed = 0 THEN 1 ELSE 0 END)::int as "idlePoints",
          SUM(CASE WHEN g.speed IS NOT NULL AND g.speed > 0 THEN 1 ELSE 0 END)::int as "movingPoints"
        FROM "Truck" t
        INNER JOIN "TagAssignment" ta ON ta."truckId" = t.id AND ta."tagId" = ${tagId}::uuid
        LEFT JOIN "GPSLocation" g ON t.id = g."truckId" AND g.timestamp >= ${cutoff} AND g."tenantId" = ${tenantId}::uuid
        WHERE t."tenantId" = ${tenantId}::uuid
        GROUP BY t.id, t.make, t.model, t."licensePlate"
      `
    : await db.$queryRaw`
        SELECT
          t.id as "truckId",
          t.make,
          t.model,
          t."licensePlate",
          COUNT(g.id)::int as "totalPoints",
          SUM(CASE WHEN g.speed IS NOT NULL AND g.speed = 0 THEN 1 ELSE 0 END)::int as "idlePoints",
          SUM(CASE WHEN g.speed IS NOT NULL AND g.speed > 0 THEN 1 ELSE 0 END)::int as "movingPoints"
        FROM "Truck" t
        LEFT JOIN "GPSLocation" g ON t.id = g."truckId" AND g.timestamp >= ${cutoff} AND g."tenantId" = ${tenantId}::uuid
        WHERE t."tenantId" = ${tenantId}::uuid
        GROUP BY t.id, t.make, t.model, t."licensePlate"
      `;

  // Calculate idle percent and cost for each truck
  const trucks = (results as any[]).map((row) => {
    const totalPoints = row.totalPoints || 0;
    const idlePoints = row.idlePoints || 0;
    const movingPoints = row.movingPoints || 0;

    // Calculate idle percentage
    const idlePercent =
      totalPoints > 0 ? Number(((idlePoints / totalPoints) * 100).toFixed(1)) : 0;

    // Estimate idle cost: (idle points * 5 min/point / 60) * IDLE_COST_PER_HOUR
    // Seed data generates GPS points every ~5 minutes
    const estimatedIdleHours = (idlePoints * 5) / 60;
    const estimatedIdleCost = Number(
      (estimatedIdleHours * IDLE_COST_PER_HOUR).toFixed(2)
    );

    return {
      truckId: row.truckId,
      name: `${row.make} ${row.model}`,
      licensePlate: row.licensePlate,
      totalPoints,
      idlePoints,
      movingPoints,
      idlePercent,
      estimatedIdleCost,
    };
  });

  return trucks;
}

/**
 * Get fuel efficiency rankings by truck
 *
 * @param daysBack - Number of days to look back (default: 30)
 * @param tagId - Optional tag ID to filter by tagged vehicles only
 * @returns Array of trucks ranked by MPG (best first)
 */
export async function getFuelEfficiencyRankings(daysBack: number = 30, tagId?: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();
  const tenantId = await requireTenantId();
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Raw SQL: Per-truck MPG ranking using LEFT JOIN
  // @ts-ignore - Raw query typing
  const results = tagId
    ? await db.$queryRaw`
        SELECT
          t.id as "truckId",
          t.make,
          t.model,
          t."licensePlate",
          COALESCE(SUM(fr.quantity), 0)::float as "totalGallons",
          COALESCE(SUM(fr."totalCost"), 0)::float as "totalCost",
          COALESCE(MAX(fr.odometer) - MIN(fr.odometer), 0)::int as "totalMiles",
          COUNT(fr.id)::int as "fillUpCount"
        FROM "Truck" t
        INNER JOIN "TagAssignment" ta ON ta."truckId" = t.id AND ta."tagId" = ${tagId}::uuid
        LEFT JOIN "FuelRecord" fr ON t.id = fr."truckId" AND fr.timestamp >= ${cutoff} AND fr."tenantId" = ${tenantId}::uuid
        WHERE t."tenantId" = ${tenantId}::uuid
        GROUP BY t.id, t.make, t.model, t."licensePlate"
        ORDER BY "totalMiles" DESC NULLS LAST
      `
    : await db.$queryRaw`
        SELECT
          t.id as "truckId",
          t.make,
          t.model,
          t."licensePlate",
          COALESCE(SUM(fr.quantity), 0)::float as "totalGallons",
          COALESCE(SUM(fr."totalCost"), 0)::float as "totalCost",
          COALESCE(MAX(fr.odometer) - MIN(fr.odometer), 0)::int as "totalMiles",
          COUNT(fr.id)::int as "fillUpCount"
        FROM "Truck" t
        LEFT JOIN "FuelRecord" fr ON t.id = fr."truckId" AND fr.timestamp >= ${cutoff} AND fr."tenantId" = ${tenantId}::uuid
        WHERE t."tenantId" = ${tenantId}::uuid
        GROUP BY t.id, t.make, t.model, t."licensePlate"
        ORDER BY "totalMiles" DESC NULLS LAST
      `;

  // Calculate MPG and cost per mile for each truck
  const rankings = (results as any[]).map((row) => {
    const totalGallons = row.totalGallons || 0;
    const totalCost = row.totalCost || 0;
    const totalMiles = row.totalMiles || 0;
    const fillUpCount = row.fillUpCount || 0;

    const mpg = calculateMPG(totalMiles, totalGallons);
    const costPerMile = calculateCostPerMile(totalCost, totalMiles);

    return {
      truckId: row.truckId,
      name: `${row.make} ${row.model}`,
      licensePlate: row.licensePlate,
      mpg,
      totalGallons,
      totalCost,
      totalMiles,
      costPerMile,
      fillUpCount,
    };
  });

  // Sort by MPG descending (best first), trucks with 0 fuel records at bottom
  rankings.sort((a, b) => {
    if (a.fillUpCount === 0 && b.fillUpCount === 0) return 0;
    if (a.fillUpCount === 0) return 1;
    if (b.fillUpCount === 0) return -1;
    return b.mpg - a.mpg;
  });

  return rankings;
}
