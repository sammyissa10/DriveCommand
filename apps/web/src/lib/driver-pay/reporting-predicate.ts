/**
 * Driver Pay Reporting — Canonical Settlement Predicate
 *
 * This module defines the SINGLE source of truth for "which settlements count
 * for a given window and scope" on the Driver Pay Reports page.
 *
 * Every function that performs period aggregation for reporting MUST use
 * `countedSettlementsWhere()`. No function may inline its own periodStart/periodEnd
 * filter or status filter.
 *
 * Semantics enforced here:
 * - Period OVERLAP (not containment): a settlement counts when
 *   [periodStart, periodEnd] ∩ [range.start, range.end] ≠ ∅
 *   i.e. periodStart <= range.end AND periodEnd >= range.start
 * - Explicit status scope: payroll_out = PAID only; approved = FINALIZED + PAID
 * - Soft-delete excluded: deletedAt: null
 * - Tenant scoping applied uniformly
 * - Optional driverId and user-supplied status filters applied safely
 */

import type { Prisma, DriverSettlementStatus } from '@/generated/prisma';
import type { PeriodRange, ReportFilters } from './reporting';

// ---------------------------------------------------------------------------
// Status scope constants — explicit, not per-function improvisation
// ---------------------------------------------------------------------------

/**
 * Settlements that are considered "paid out" — the scope for Total Payroll,
 * Drivers Paid, Avg Net Pay, Total Bonuses, Total Deductions, and the Net Pay
 * Trend chart on the Reports page. VOIDED is intentionally excluded.
 */
export const COUNTED_FOR_PAYROLL_OUT = ['PAID'] as const satisfies readonly DriverSettlementStatus[];

/**
 * Settlements that are considered "approved" — used for rolling avg anomaly
 * detection and per-driver YTD detail. Includes FINALIZED (locked, not yet paid)
 * in addition to PAID.
 */
export const COUNTED_FOR_APPROVED = ['FINALIZED', 'PAID'] as const satisfies readonly DriverSettlementStatus[];

export type CountedScope = 'payroll_out' | 'approved';

const SCOPE_TO_STATUSES: Record<CountedScope, readonly DriverSettlementStatus[]> = {
  payroll_out: COUNTED_FOR_PAYROLL_OUT,
  approved:    COUNTED_FOR_APPROVED,
};

// ---------------------------------------------------------------------------
// Canonical predicate builder
// ---------------------------------------------------------------------------

/**
 * Build the canonical Prisma `where` clause for counting settlements in a
 * reporting aggregation.
 *
 * Usage:
 * ```ts
 * const where = countedSettlementsWhere(tenantId, range, filters, 'payroll_out');
 * const settlements = await prisma.driverSettlement.findMany({ where, select: { ... } });
 * ```
 *
 * @param tenantId  - Tenant to scope the query (multi-tenant isolation)
 * @param range     - Period range { start, end } from getPeriodRange()
 * @param filters   - Report filters (driverIds, status from UI)
 * @param scope     - 'payroll_out' (PAID only) or 'approved' (FINALIZED + PAID)
 * @returns Prisma.DriverSettlementWhereInput ready to pass to findMany / count
 */
export function countedSettlementsWhere(
  tenantId: string,
  range: PeriodRange,
  filters: ReportFilters,
  scope: CountedScope,
): Prisma.DriverSettlementWhereInput {
  const statuses = SCOPE_TO_STATUSES[scope];

  const where: Prisma.DriverSettlementWhereInput = {
    tenantId,
    deletedAt: null,
    // Period OVERLAP — NOT containment.
    // A settlement with periodStart before range.start still counts if its
    // periodEnd falls inside (or after) range.start.
    // Equivalent to: periodStart <= range.end AND periodEnd >= range.start
    periodStart: { lte: range.end },
    periodEnd:   { gte: range.start },
    status: { in: [...statuses] },
  };

  // Optional driver filter from UI
  if (filters.driverIds && filters.driverIds.length > 0) {
    where.driverId = { in: filters.driverIds };
  }

  // Honour the user-supplied status filter ONLY when it narrows within the scope.
  // E.g. user selects 'PAID' while scope is 'approved' (FINALIZED+PAID) → narrow to PAID.
  // If user selects 'VOIDED' while scope is 'payroll_out' → intersect is empty (correct).
  // If filters.status is 'ALL' or undefined → use the full scope statuses.
  if (filters.status && filters.status !== 'ALL') {
    const userStatus = filters.status as DriverSettlementStatus;
    if ((statuses as readonly string[]).includes(userStatus)) {
      // Narrowing: keep only the user-requested status within scope
      where.status = userStatus;
    } else {
      // User selected a status outside this scope (e.g. VOIDED for payroll_out)
      // Return a predicate that matches nothing so aggregations return zero/empty.
      where.status = { in: [] };
    }
  }

  return where;
}
