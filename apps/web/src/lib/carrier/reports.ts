import { Prisma } from '@/generated/prisma';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RevenueFilters {
  dateFrom?: string;
  dateTo?: string;
  clientId?: string;
}

export interface RevenueRow {
  month: string;
  client_id: string;
  client_name: string;
  loads_count: number;
  total_invoiced: string;
  total_paid: string;
  outstanding: string;
}

export interface RevenueSummary {
  total_invoiced: string;
  total_paid: string;
  outstanding: string;
  period_start: string;
  period_end: string;
}

export interface RevenueReport {
  monthly_by_client: RevenueRow[];
  summary: RevenueSummary;
  csv_url: null;
}

export interface DriverPayFilters {
  driverId?: string;
  payPeriodStart?: string;
  payPeriodEnd?: string;
  status?: string;
}

export interface DriverPayRow {
  id: string;
  driver_name: string;
  // NOTE: dispatch_number is extracted from dispatch.notes field via [DISPATCH_NUMBER=...] tag.
  // Schema lacks a dedicated dispatchNumber column; it is embedded in notes by createDispatch().
  dispatch_number: string | null;
  total_miles: number;
  base_pay: string;
  bonuses: string;
  tips: string;
  deductions: string;
  reimbursements: string;
  net_pay: string;
  status: string;
  pay_period_start: string | null;
  pay_period_end: string | null;
}

export interface AgingRow {
  client_id: string;
  client_name: string;
  bucket_0_30: string;
  bucket_31_60: string;
  bucket_61_90: string;
  bucket_over_90: string;
  total_outstanding: string;
  // NOTE: over_credit_limit always false — credit_limit column not yet added to schema.
  // Add via migration when credit management feature is built.
  over_credit_limit: false;
}

export interface PerformanceFilters {
  dateFrom?: string;
  dateTo?: string;
  driverId?: string;
}

export interface PerformanceRow {
  dispatch_id: string;
  // NOTE: dispatch_number extracted from notes field via [DISPATCH_NUMBER=...] tag in SQL.
  dispatch_number: string | null;
  driver_name: string;
  total_stops: number;
  on_time_pct: number | null;
  avg_dwell_minutes: number | null;
  actual_miles: string | null;
  total_expenses: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toStr = (v: unknown): string => (v != null ? String(v) : '0');
const toNum = (v: unknown): number => (v != null ? Number(v) : 0);

function defaultDateFrom(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function defaultDateTo(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Function 1: Revenue Report
// ---------------------------------------------------------------------------

interface RawRevenueRow {
  month: string;
  client_id: string;
  client_name: string;
  loads_count: bigint | number;
  total_invoiced: string | null;
}

export async function getRevenueReport(
  orgId: string,
  filters: RevenueFilters = {}
): Promise<RevenueReport> {
  const dateFrom = filters.dateFrom ?? defaultDateFrom();
  const dateTo = filters.dateTo ?? defaultDateTo();

  try {
    let rows: RawRevenueRow[];

    if (filters.clientId) {
      rows = await prisma.$queryRaw<RawRevenueRow[]>(Prisma.sql`
        SELECT
          to_char(l.created_at, 'YYYY-MM')   AS month,
          l.client_id::text                  AS client_id,
          c.name                             AS client_name,
          COUNT(*)::int                      AS loads_count,
          SUM(l.total_revenue)::text         AS total_invoiced
        FROM loads l
        JOIN clients c ON l.client_id = c.id
        WHERE l.org_id = ${orgId}::uuid
          AND l.status != 'cancelled'
          AND l.created_at BETWEEN ${dateFrom}::timestamptz AND ${dateTo}::timestamptz
          AND l.client_id = ${filters.clientId}::uuid
        GROUP BY to_char(l.created_at, 'YYYY-MM'), l.client_id, c.name
        ORDER BY month DESC, c.name
      `);
    } else {
      rows = await prisma.$queryRaw<RawRevenueRow[]>(Prisma.sql`
        SELECT
          to_char(l.created_at, 'YYYY-MM')   AS month,
          l.client_id::text                  AS client_id,
          c.name                             AS client_name,
          COUNT(*)::int                      AS loads_count,
          SUM(l.total_revenue)::text         AS total_invoiced
        FROM loads l
        JOIN clients c ON l.client_id = c.id
        WHERE l.org_id = ${orgId}::uuid
          AND l.status != 'cancelled'
          AND l.created_at BETWEEN ${dateFrom}::timestamptz AND ${dateTo}::timestamptz
        GROUP BY to_char(l.created_at, 'YYYY-MM'), l.client_id, c.name
        ORDER BY month DESC, c.name
      `);
    }

    const monthly_by_client: RevenueRow[] = rows.map((r) => {
      const total_invoiced = toStr(r.total_invoiced);
      return {
        month: r.month,
        client_id: r.client_id,
        client_name: r.client_name,
        loads_count: toNum(r.loads_count),
        total_invoiced,
        // TODO: integrate payment tracking when payment status field is added to loads
        total_paid: '0',
        outstanding: total_invoiced,
      };
    });

    const total_invoiced_num = monthly_by_client.reduce(
      (acc, r) => acc + parseFloat(r.total_invoiced || '0'),
      0
    );

    const summary: RevenueSummary = {
      total_invoiced: total_invoiced_num.toFixed(2),
      // TODO: integrate payment tracking when payment status field is added to loads
      total_paid: '0',
      outstanding: total_invoiced_num.toFixed(2),
      period_start: dateFrom,
      period_end: dateTo,
    };

    return { monthly_by_client, summary, csv_url: null };
  } catch (err) {
    logger.error('getRevenueReport failed', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Function 2: Driver Pay Report
// ---------------------------------------------------------------------------

export async function getDriverPayReport(
  orgId: string,
  filters: DriverPayFilters = {}
): Promise<DriverPayRow[]> {
  try {
    const where: Prisma.DriverPayRecordWhereInput = { orgId };

    if (filters.driverId) where.driverId = filters.driverId;
    if (filters.status) where.status = filters.status;
    if (filters.payPeriodStart || filters.payPeriodEnd) {
      where.payPeriodStart = {};
      if (filters.payPeriodStart) where.payPeriodStart.gte = new Date(filters.payPeriodStart);
      if (filters.payPeriodEnd) where.payPeriodStart.lte = new Date(filters.payPeriodEnd);
    }

    const records = await prisma.driverPayRecord.findMany({
      where,
      include: {
        driver: { select: { firstName: true, lastName: true } },
        // NOTE: CarrierDispatch has no dispatchNumber column — it is stored as
        // [DISPATCH_NUMBER=DC-YYYY-NNNNN] embedded in the notes field.
        dispatch: { select: { notes: true } },
      },
      orderBy: { payPeriodStart: 'desc' },
    });

    // Extract dispatch number from notes tag: [DISPATCH_NUMBER=DC-YYYY-NNNNN]
    const extractDispatchNumber = (notes: string | null): string | null => {
      if (!notes) return null;
      const m = notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/);
      return m ? m[1] : null;
    };

    return records.map((r) => ({
      id: r.id,
      driver_name: `${r.driver.firstName} ${r.driver.lastName}`,
      dispatch_number: extractDispatchNumber(r.dispatch?.notes ?? null),
      total_miles: (r.loadedMiles ?? 0) + (r.emptyMiles ?? 0),
      base_pay: toStr(r.basePay),
      bonuses: toStr(r.bonuses),
      tips: toStr(r.tips),
      deductions: toStr(r.deductions),
      reimbursements: toStr(r.reimbursements),
      net_pay: toStr(r.netPay),
      status: r.status,
      pay_period_start: r.payPeriodStart ? r.payPeriodStart.toISOString().slice(0, 10) : null,
      pay_period_end: r.payPeriodEnd ? r.payPeriodEnd.toISOString().slice(0, 10) : null,
    }));
  } catch (err) {
    logger.error('getDriverPayReport failed', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Function 3: AR Aging Report
// ---------------------------------------------------------------------------

interface RawAgingRow {
  client_id: string;
  client_name: string;
  bucket_0_30: string | null;
  bucket_31_60: string | null;
  bucket_61_90: string | null;
  bucket_over_90: string | null;
}

export async function getAgingReport(orgId: string): Promise<AgingRow[]> {
  try {
    const rows = await prisma.$queryRaw<RawAgingRow[]>(Prisma.sql`
      SELECT
        l.client_id::text                                         AS client_id,
        c.name                                                    AS client_name,
        COALESCE(SUM(CASE
          WHEN EXTRACT(DAY FROM now() - l.created_at) <= 30
          THEN l.total_revenue ELSE 0 END), 0)::text             AS bucket_0_30,
        COALESCE(SUM(CASE
          WHEN EXTRACT(DAY FROM now() - l.created_at) BETWEEN 31 AND 60
          THEN l.total_revenue ELSE 0 END), 0)::text             AS bucket_31_60,
        COALESCE(SUM(CASE
          WHEN EXTRACT(DAY FROM now() - l.created_at) BETWEEN 61 AND 90
          THEN l.total_revenue ELSE 0 END), 0)::text             AS bucket_61_90,
        COALESCE(SUM(CASE
          WHEN EXTRACT(DAY FROM now() - l.created_at) > 90
          THEN l.total_revenue ELSE 0 END), 0)::text             AS bucket_over_90
      FROM loads l
      JOIN clients c ON l.client_id = c.id
      WHERE l.org_id = ${orgId}::uuid
        AND l.status != 'cancelled'
      GROUP BY l.client_id, c.name
      ORDER BY c.name
    `);

    return rows.map((r) => {
      const b0 = parseFloat(r.bucket_0_30 ?? '0');
      const b1 = parseFloat(r.bucket_31_60 ?? '0');
      const b2 = parseFloat(r.bucket_61_90 ?? '0');
      const b3 = parseFloat(r.bucket_over_90 ?? '0');
      return {
        client_id: r.client_id,
        client_name: r.client_name,
        bucket_0_30: b0.toFixed(2),
        bucket_31_60: b1.toFixed(2),
        bucket_61_90: b2.toFixed(2),
        bucket_over_90: b3.toFixed(2),
        total_outstanding: (b0 + b1 + b2 + b3).toFixed(2),
        // NOTE: over_credit_limit always false — credit_limit column not yet added to schema.
        // Add via migration when credit management feature is built.
        over_credit_limit: false as const,
      };
    });
  } catch (err) {
    logger.error('getAgingReport failed', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Function 4: Dispatch Performance Report
// ---------------------------------------------------------------------------

interface RawPerformanceRow {
  dispatch_id: string;
  dispatch_number: string | null;
  driver_name: string;
  total_stops: bigint | number;
  on_time_pct: string | null;
  avg_dwell_minutes: string | null;
  actual_miles: string | null;
  total_expenses: string | null;
}

// NOTE: CarrierDispatch has no dispatchNumber column — it is stored as
// [DISPATCH_NUMBER=DC-YYYY-NNNNN] embedded in the notes field by createDispatch().
// We use PostgreSQL's regexp_match to extract it in SQL.
const DISPATCH_NUMBER_SQL = Prisma.sql`
  (regexp_match(d.notes, '\\[DISPATCH_NUMBER=([^\\]]+)\\]'))[1]
`;

export async function getPerformanceReport(
  orgId: string,
  filters: PerformanceFilters = {}
): Promise<PerformanceRow[]> {
  // Build a single parameterized query using conditional WHERE clauses.
  // Because Prisma.sql only allows static interpolation of Prisma.sql fragments,
  // we branch into 4 variants rather than building dynamic WHERE strings.
  try {
    let rows: RawPerformanceRow[];

    const selectBlock = Prisma.sql`
      SELECT
        d.id::text                                                                     AS dispatch_id,
        ${DISPATCH_NUMBER_SQL}                                                         AS dispatch_number,
        cd.first_name || ' ' || cd.last_name                                          AS driver_name,
        COUNT(s.id)::int                                                               AS total_stops,
        (COUNT(CASE WHEN s.arrived_at <= s.appointment_end
                      AND s.appointment_end IS NOT NULL THEN 1 END)::float
          / NULLIF(COUNT(CASE WHEN s.appointment_end IS NOT NULL THEN 1 END), 0)
          * 100)::text                                                                 AS on_time_pct,
        (AVG(EXTRACT(EPOCH FROM (s.departed_at - s.arrived_at)) / 60)
          FILTER (WHERE s.arrived_at IS NOT NULL AND s.departed_at IS NOT NULL))::text AS avg_dwell_minutes,
        d.actual_miles::text                                                           AS actual_miles,
        COALESCE(
          (SELECT SUM(ce.amount) FROM carrier_expenses ce WHERE ce.dispatch_id = d.id),
          0
        )::text                                                                        AS total_expenses
      FROM dispatches d
      JOIN carrier_drivers cd ON d.primary_driver_id = cd.id
      LEFT JOIN stops s ON s.dispatch_id = d.id
    `;

    if (filters.driverId && filters.dateFrom && filters.dateTo) {
      rows = await prisma.$queryRaw<RawPerformanceRow[]>(Prisma.sql`
        ${selectBlock}
        WHERE d.org_id = ${orgId}::uuid
          AND d.primary_driver_id = ${filters.driverId}::uuid
          AND d.scheduled_departure BETWEEN ${filters.dateFrom}::timestamptz AND ${filters.dateTo}::timestamptz
        GROUP BY d.id, d.notes, cd.first_name, cd.last_name, d.actual_miles
        ORDER BY d.scheduled_departure DESC
      `);
    } else if (filters.driverId) {
      rows = await prisma.$queryRaw<RawPerformanceRow[]>(Prisma.sql`
        ${selectBlock}
        WHERE d.org_id = ${orgId}::uuid
          AND d.primary_driver_id = ${filters.driverId}::uuid
        GROUP BY d.id, d.notes, cd.first_name, cd.last_name, d.actual_miles
        ORDER BY d.scheduled_departure DESC
      `);
    } else if (filters.dateFrom && filters.dateTo) {
      rows = await prisma.$queryRaw<RawPerformanceRow[]>(Prisma.sql`
        ${selectBlock}
        WHERE d.org_id = ${orgId}::uuid
          AND d.scheduled_departure BETWEEN ${filters.dateFrom}::timestamptz AND ${filters.dateTo}::timestamptz
        GROUP BY d.id, d.notes, cd.first_name, cd.last_name, d.actual_miles
        ORDER BY d.scheduled_departure DESC
      `);
    } else {
      rows = await prisma.$queryRaw<RawPerformanceRow[]>(Prisma.sql`
        ${selectBlock}
        WHERE d.org_id = ${orgId}::uuid
        GROUP BY d.id, d.notes, cd.first_name, cd.last_name, d.actual_miles
        ORDER BY d.scheduled_departure DESC
      `);
    }

    return rows.map((r) => ({
      dispatch_id: r.dispatch_id,
      dispatch_number: r.dispatch_number ?? null,
      driver_name: r.driver_name,
      total_stops: toNum(r.total_stops),
      on_time_pct: r.on_time_pct != null ? parseFloat(r.on_time_pct) : null,
      avg_dwell_minutes: r.avg_dwell_minutes != null ? parseFloat(r.avg_dwell_minutes) : null,
      actual_miles: r.actual_miles ?? null,
      total_expenses: toStr(r.total_expenses),
    }));
  } catch (err) {
    logger.error('getPerformanceReport failed', err);
    throw err;
  }
}
