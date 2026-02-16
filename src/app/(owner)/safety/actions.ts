'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { SafetyEventSeverity, SafetyEventType } from '@/generated/prisma';
import { calculateSafetyScore } from '@/lib/safety/score-calculator';

/**
 * Event type labels for human-readable display
 */
const EVENT_LABELS: Record<SafetyEventType, string> = {
  [SafetyEventType.HARSH_BRAKING]: 'Harsh Braking',
  [SafetyEventType.HARSH_ACCELERATION]: 'Harsh Acceleration',
  [SafetyEventType.HARSH_CORNERING]: 'Harsh Cornering',
  [SafetyEventType.SPEEDING]: 'Speeding',
  [SafetyEventType.DISTRACTED_DRIVING]: 'Distracted Driving',
  [SafetyEventType.ROLLING_STOP]: 'Rolling Stop',
  [SafetyEventType.SEATBELT_VIOLATION]: 'Seatbelt Violation',
  [SafetyEventType.FOLLOWING_TOO_CLOSE]: 'Following Too Close',
};

/**
 * Severity labels for human-readable display
 */
const SEVERITY_LABELS: Record<SafetyEventSeverity, string> = {
  [SafetyEventSeverity.LOW]: 'Low',
  [SafetyEventSeverity.MEDIUM]: 'Medium',
  [SafetyEventSeverity.HIGH]: 'High',
  [SafetyEventSeverity.CRITICAL]: 'Critical',
};

/**
 * Chart color CSS variables for severity
 */
const SEVERITY_COLORS: Record<SafetyEventSeverity, string> = {
  [SafetyEventSeverity.LOW]: 'var(--color-low)',
  [SafetyEventSeverity.MEDIUM]: 'var(--color-medium)',
  [SafetyEventSeverity.HIGH]: 'var(--color-high)',
  [SafetyEventSeverity.CRITICAL]: 'var(--color-critical)',
};

/**
 * Get overall fleet safety score for the specified time period
 *
 * @param daysBack - Number of days to look back (default: 30)
 * @returns Fleet safety score, total events, events by severity, and period
 */
export async function getFleetSafetyScore(daysBack: number = 30) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();
  const tenantId = await requireTenantId();
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Raw SQL to get event counts by severity
  // @ts-ignore - Raw query typing
  const results = await db.$queryRaw`
    SELECT severity, COUNT(*)::int as count
    FROM "SafetyEvent"
    WHERE "tenantId" = ${tenantId}::uuid AND timestamp >= ${cutoff}
    GROUP BY severity
  `;

  // Build counts object with all severities initialized to 0
  const counts: Record<SafetyEventSeverity, number> = {
    [SafetyEventSeverity.LOW]: 0,
    [SafetyEventSeverity.MEDIUM]: 0,
    [SafetyEventSeverity.HIGH]: 0,
    [SafetyEventSeverity.CRITICAL]: 0,
  };

  // Fill in actual counts from query results
  let totalEvents = 0;
  for (const row of results as any[]) {
    counts[row.severity as SafetyEventSeverity] = row.count;
    totalEvents += row.count;
  }

  // Calculate the safety score
  const score = calculateSafetyScore(counts);

  return {
    score,
    totalEvents,
    eventsBySeverity: counts,
    period: daysBack,
  };
}

/**
 * Get safety event distribution by type and severity
 *
 * @param daysBack - Number of days to look back (default: 30)
 * @returns Event distribution by type and by severity
 */
export async function getEventDistribution(daysBack: number = 30) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();
  const tenantId = await requireTenantId();
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Get distribution by event type
  // @ts-ignore - Raw query typing
  const typeResults = await db.$queryRaw`
    SELECT "eventType", COUNT(*)::int as count
    FROM "SafetyEvent"
    WHERE "tenantId" = ${tenantId}::uuid AND timestamp >= ${cutoff}
    GROUP BY "eventType"
    ORDER BY count DESC
  `;

  // Get distribution by severity
  // @ts-ignore - Raw query typing
  const severityResults = await db.$queryRaw`
    SELECT severity, COUNT(*)::int as count
    FROM "SafetyEvent"
    WHERE "tenantId" = ${tenantId}::uuid AND timestamp >= ${cutoff}
    GROUP BY severity
  `;

  // Map type results with human-readable labels
  const byType = (typeResults as any[]).map((row) => ({
    eventType: row.eventType as SafetyEventType,
    label: EVENT_LABELS[row.eventType as SafetyEventType],
    count: row.count,
  }));

  // Map severity results with labels and chart colors
  const bySeverity = (severityResults as any[]).map((row) => ({
    severity: row.severity as SafetyEventSeverity,
    label: SEVERITY_LABELS[row.severity as SafetyEventSeverity],
    count: row.count,
    fill: SEVERITY_COLORS[row.severity as SafetyEventSeverity],
  }));

  return { byType, bySeverity };
}

/**
 * Get safety score trend over time
 *
 * @param daysBack - Number of days to look back (default: 30)
 * @returns Array of daily safety scores
 */
export async function getSafetyScoreTrend(daysBack: number = 30) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();
  const tenantId = await requireTenantId();
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Raw SQL to get daily event counts by severity
  // @ts-ignore - Raw query typing
  const results = await db.$queryRaw`
    SELECT DATE(timestamp) as date, severity, COUNT(*)::int as count
    FROM "SafetyEvent"
    WHERE "tenantId" = ${tenantId}::uuid AND timestamp >= ${cutoff}
    GROUP BY DATE(timestamp), severity
    ORDER BY date ASC
  `;

  // Initialize all dates in the range with zero counts
  const dateMap = new Map<
    string,
    { date: string; counts: Record<SafetyEventSeverity, number>; totalEvents: number }
  >();

  for (let i = 0; i < daysBack; i++) {
    const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    dateMap.set(dateStr, {
      date: dateStr,
      counts: {
        [SafetyEventSeverity.LOW]: 0,
        [SafetyEventSeverity.MEDIUM]: 0,
        [SafetyEventSeverity.HIGH]: 0,
        [SafetyEventSeverity.CRITICAL]: 0,
      },
      totalEvents: 0,
    });
  }

  // Fill in actual counts from query results
  for (const row of results as any[]) {
    const dateStr = row.date.toISOString().split('T')[0];
    const dayData = dateMap.get(dateStr);
    if (dayData) {
      dayData.counts[row.severity as SafetyEventSeverity] = row.count;
      dayData.totalEvents += row.count;
    }
  }

  // Calculate score for each day
  const trend = Array.from(dateMap.values())
    .map((dayData) => ({
      date: dayData.date,
      score: calculateSafetyScore(dayData.counts),
      events: dayData.totalEvents,
    }))
    .sort((a, b) => a.date.localeCompare(b.date)); // Sort chronologically

  return trend;
}

/**
 * Get driver/truck safety rankings
 * Currently aggregates by truck since driverId is null in seed data
 *
 * @param daysBack - Number of days to look back (default: 30)
 * @returns Array of truck safety scores sorted by best score first
 */
export async function getDriverRankings(daysBack: number = 30) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();
  const tenantId = await requireTenantId();
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Aggregate by truck with LEFT JOIN to include trucks with zero events
  // @ts-ignore - Raw query typing
  const results = await db.$queryRaw`
    SELECT
      t.id as "truckId",
      t.make,
      t.model,
      t."licensePlate",
      COALESCE(SUM(CASE WHEN se.severity = 'LOW' THEN 1 ELSE 0 END), 0)::int as low_count,
      COALESCE(SUM(CASE WHEN se.severity = 'MEDIUM' THEN 1 ELSE 0 END), 0)::int as medium_count,
      COALESCE(SUM(CASE WHEN se.severity = 'HIGH' THEN 1 ELSE 0 END), 0)::int as high_count,
      COALESCE(SUM(CASE WHEN se.severity = 'CRITICAL' THEN 1 ELSE 0 END), 0)::int as critical_count,
      COUNT(se.id)::int as total_events
    FROM "Truck" t
    LEFT JOIN "SafetyEvent" se ON t.id = se."truckId" AND se.timestamp >= ${cutoff} AND se."tenantId" = ${tenantId}::uuid
    WHERE t."tenantId" = ${tenantId}::uuid
    GROUP BY t.id, t.make, t.model, t."licensePlate"
    ORDER BY total_events ASC
  `;

  // Calculate score per truck
  const rankings = (results as any[]).map((row) => {
    const counts: Record<SafetyEventSeverity, number> = {
      [SafetyEventSeverity.LOW]: row.low_count,
      [SafetyEventSeverity.MEDIUM]: row.medium_count,
      [SafetyEventSeverity.HIGH]: row.high_count,
      [SafetyEventSeverity.CRITICAL]: row.critical_count,
    };

    return {
      truckId: row.truckId,
      name: `${row.make} ${row.model}`,
      licensePlate: row.licensePlate,
      score: calculateSafetyScore(counts),
      totalEvents: row.total_events,
    };
  });

  // Sort by score descending (best first)
  rankings.sort((a, b) => b.score - a.score);

  return rankings;
}
