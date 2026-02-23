'use server';

import { getTenantPrisma } from '@/lib/context/tenant-context';
import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import {
  getStateFromCoordinates,
  haversineDistance,
  US_STATES,
} from '@/lib/geo/state-lookup';

export interface IFTAReportRow {
  stateCode: string;
  stateName: string;
  milesDriven: number;
  fuelGallons: number;
}

export interface IFTAReportData {
  rows: IFTAReportRow[];
  totals: {
    totalMiles: number;
    totalGallons: number;
    stateCount: number;
  };
  quarter: 1 | 2 | 3 | 4;
  year: number;
}

/**
 * Returns the start and end dates for an IFTA quarter.
 * Q1 = Jan 1 – Mar 31, Q2 = Apr 1 – Jun 30, Q3 = Jul 1 – Sep 30, Q4 = Oct 1 – Dec 31
 */
function getQuarterDateRange(
  quarter: 1 | 2 | 3 | 4,
  year: number
): { startDate: Date; endDate: Date } {
  const quarterStartMonths: Record<number, number> = { 1: 0, 2: 3, 3: 6, 4: 9 };
  const startMonth = quarterStartMonths[quarter];
  const startDate = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0));
  // End date = first day of next quarter (exclusive upper bound)
  const endDate = new Date(Date.UTC(year, startMonth + 3, 1, 0, 0, 0, 0));
  return { startDate, endDate };
}

/**
 * Attempt to extract a 2-letter US state code from a free-text location string.
 * Looks for patterns like ", TX" or " TX " or "(TX)" at word boundaries.
 */
function parseStateFromLocationString(location: string): string | null {
  const statePattern = /\b([A-Z]{2})\b/g;
  let match;
  while ((match = statePattern.exec(location.toUpperCase())) !== null) {
    const candidate = match[1];
    if (US_STATES[candidate]) {
      return candidate;
    }
  }
  return null;
}

/**
 * Compute IFTA quarterly report from GPS and fuel records.
 *
 * Miles per state: derived from consecutive GPS pings per truck using Haversine distance.
 * Each segment is attributed to the state of the starting ping.
 *
 * Fuel per state: derived from FuelRecord lat/lng; falls back to location string parsing.
 *
 * @param quarter - 1, 2, 3, or 4
 * @param year - Full year (e.g. 2025)
 */
export async function getIFTAReport(
  quarter: 1 | 2 | 3 | 4,
  year: number
): Promise<IFTAReportData> {
  // OWNER/MANAGER only — drivers do not have access to IFTA tax data
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  const { startDate, endDate } = getQuarterDateRange(quarter, year);

  // -------------------------------------------------------------------------
  // 1. GPS-based mileage per state
  // -------------------------------------------------------------------------

  // Fetch all GPS records in the quarter, grouped by truck for segment calculation.
  // Order by truckId then timestamp so we can iterate consecutive pings.
  const gpsRecords = await prisma.gPSLocation.findMany({
    where: {
      timestamp: { gte: startDate, lt: endDate },
    },
    select: {
      truckId: true,
      latitude: true,
      longitude: true,
      timestamp: true,
    },
    orderBy: [{ truckId: 'asc' }, { timestamp: 'asc' }],
  });

  // Map: stateCode -> miles driven
  const statesMiles = new Map<string, number>();

  // Group by truckId for segment calculation
  const truckPings = new Map<string, Array<{ lat: number; lng: number }>>();
  for (const record of gpsRecords) {
    const lat = parseFloat(record.latitude.toString());
    const lng = parseFloat(record.longitude.toString());
    if (!truckPings.has(record.truckId)) {
      truckPings.set(record.truckId, []);
    }
    truckPings.get(record.truckId)!.push({ lat, lng });
  }

  // Calculate mileage per segment, attributed to the starting ping's state
  for (const [, pings] of truckPings) {
    for (let i = 0; i < pings.length - 1; i++) {
      const from = pings[i];
      const to = pings[i + 1];
      const stateCode = getStateFromCoordinates(from.lat, from.lng);
      if (!stateCode) continue; // Outside US — skip (Canada, Mexico border runs)
      const segmentMiles = haversineDistance(from.lat, from.lng, to.lat, to.lng);
      statesMiles.set(stateCode, (statesMiles.get(stateCode) ?? 0) + segmentMiles);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Fuel records per state
  // -------------------------------------------------------------------------

  const fuelRecords = await prisma.fuelRecord.findMany({
    where: {
      timestamp: { gte: startDate, lt: endDate },
    },
    select: {
      quantity: true,
      latitude: true,
      longitude: true,
      location: true,
    },
  });

  // Map: stateCode -> gallons purchased
  const statesGallons = new Map<string, number>();

  for (const record of fuelRecords) {
    const gallons = parseFloat(record.quantity.toString());
    let stateCode: string | null = null;

    // Try lat/lng first
    if (record.latitude !== null && record.longitude !== null) {
      const lat = parseFloat(record.latitude.toString());
      const lng = parseFloat(record.longitude.toString());
      stateCode = getStateFromCoordinates(lat, lng);
    }

    // Fall back to parsing the location string
    if (!stateCode && record.location) {
      stateCode = parseStateFromLocationString(record.location);
    }

    // If still unknown, bucket as "UNKNOWN"
    const key = stateCode ?? 'UNKNOWN';
    statesGallons.set(key, (statesGallons.get(key) ?? 0) + gallons);
  }

  // -------------------------------------------------------------------------
  // 3. Aggregate: union of all states from both data sources
  // -------------------------------------------------------------------------

  const allStateCodes = new Set([
    ...statesMiles.keys(),
    ...statesGallons.keys(),
  ]);

  const rows: IFTAReportRow[] = [];

  for (const stateCode of allStateCodes) {
    const milesDriven = statesMiles.get(stateCode) ?? 0;
    const fuelGallons = statesGallons.get(stateCode) ?? 0;

    // Omit states with zero miles AND zero gallons (shouldn't happen, but defensive)
    if (milesDriven === 0 && fuelGallons === 0) continue;

    const stateName =
      stateCode === 'UNKNOWN'
        ? 'Unknown / Out of Country'
        : (US_STATES[stateCode] ?? stateCode);

    rows.push({
      stateCode,
      stateName,
      milesDriven: parseFloat(milesDriven.toFixed(1)),
      fuelGallons: parseFloat(fuelGallons.toFixed(3)),
    });
  }

  // Sort alphabetically by state code; put UNKNOWN last
  rows.sort((a, b) => {
    if (a.stateCode === 'UNKNOWN') return 1;
    if (b.stateCode === 'UNKNOWN') return -1;
    return a.stateCode.localeCompare(b.stateCode);
  });

  const totalMiles = rows.reduce((sum, r) => sum + r.milesDriven, 0);
  const totalGallons = rows.reduce((sum, r) => sum + r.fuelGallons, 0);

  return {
    rows,
    totals: {
      totalMiles: parseFloat(totalMiles.toFixed(1)),
      totalGallons: parseFloat(totalGallons.toFixed(3)),
      stateCount: rows.filter((r) => r.stateCode !== 'UNKNOWN').length,
    },
    quarter,
    year,
  };
}

/**
 * Generate a CSV string from IFTA report data.
 * Suitable for download as `ifta-{year}-q{quarter}.csv`.
 */
export async function generateIFTACSV(
  rows: IFTAReportRow[],
  totals: IFTAReportData['totals'],
  quarter: 1 | 2 | 3 | 4,
  year: number
): Promise<string> {
  const lines: string[] = [];

  // Header
  lines.push(`IFTA Quarterly Report — Q${quarter} ${year}`);
  lines.push('State,State Name,Miles Driven,Fuel Gallons Purchased');

  // Data rows
  for (const row of rows) {
    lines.push(
      [
        row.stateCode,
        `"${row.stateName}"`,
        row.milesDriven.toFixed(1),
        row.fuelGallons.toFixed(3),
      ].join(',')
    );
  }

  // Totals row
  lines.push(
    [
      'TOTAL',
      '"All States"',
      totals.totalMiles.toFixed(1),
      totals.totalGallons.toFixed(3),
    ].join(',')
  );

  return lines.join('\n');
}
