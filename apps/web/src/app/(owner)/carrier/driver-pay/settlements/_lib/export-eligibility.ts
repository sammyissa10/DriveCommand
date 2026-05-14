/**
 * export-eligibility.ts
 *
 * Pure helper for computing the export-eligible settlement IDs and total.
 * Extracted so it can be unit-tested independently of the server component.
 */

import Decimal from 'decimal.js';

export interface EligibleRow {
  id: string;
  netPay: { toString(): string };
}

export interface ExportEligibility {
  /** IDs of settlements eligible for payroll export */
  ids: string[];
  /** Decimal string with 2 fractional digits, e.g. "641.13" */
  total: string;
}

/**
 * Given an array of rows already filtered by the eligibility criteria
 * (FINALIZED|PAID, deletedAt null, employmentTypeSnapshot not null),
 * compute the IDs and total net pay using decimal.js.
 */
export function computeExportEligibility(rows: EligibleRow[]): ExportEligibility {
  const total = rows
    .reduce((acc, s) => acc.plus(new Decimal(s.netPay.toString())), new Decimal(0))
    .toFixed(2);

  return {
    ids: rows.map((s) => s.id),
    total,
  };
}
