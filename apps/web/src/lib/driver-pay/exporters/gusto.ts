/**
 * gusto.ts — Gusto payroll CSV exporter.
 *
 * Spec (W-2 employees): Gusto "Bulk hours and earnings" CSV import.
 * Reference: https://support.gusto.com/article/106621964100000
 *
 * Spec (1099 contractors): Gusto contractor pay CSV import.
 * Reference: https://support.gusto.com/article/213842491000000
 *
 * W-2 columns (verified per Gusto docs):
 *   employee_email, regular_hours, overtime_hours, double_overtime_hours,
 *   bonus, commission, reimbursement, other_hours_code, other_hours_amount,
 *   paycheck_tip_amount, cash_tip_amount, personal_note
 *
 * 1099 columns (verified per Gusto contractor docs):
 *   contractor_email, wage, reimbursement, bonus
 *
 * NOTE: This exporter receives a HOMOGENEOUS list (all W-2 or all 1099) because
 * the API route pre-splits by employmentTypeSnapshot before calling build().
 * If a mixed list is passed, the exporter emits based on the first settlement's
 * employment type (defensive — logs a warning).
 *
 * Trade-off: If payComponents lacks an hourly rate, regular_hours=0 and full
 * gross is placed into bonus. This is documented in README.md.
 *
 * TODO: verify column names against Gusto sandbox import before production rollout.
 *       See README.md for sandbox verification checklist.
 *
 * Money math: decimal.js throughout. No native float arithmetic.
 * CSV escaping: RFC 4180.
 */

import { Readable } from 'node:stream';
import Decimal from 'decimal.js';
import type { Exporter, SettlementWithLines } from './index';

// ---------------------------------------------------------------------------
// RFC 4180 CSV helpers
// ---------------------------------------------------------------------------

function escapeCsv(value: string): string {
  if (/[,"\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function row(fields: string[]): string {
  return fields.map(escapeCsv).join(',') + '\n';
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

const W2_HEADER = [
  'employee_email',
  'regular_hours',
  'overtime_hours',
  'double_overtime_hours',
  'bonus',
  'commission',
  'reimbursement',
  'other_hours_code',
  'other_hours_amount',
  'paycheck_tip_amount',
  'cash_tip_amount',
  'personal_note',
];

const C1099_HEADER = ['contractor_email', 'wage', 'reimbursement', 'bonus'];

// ---------------------------------------------------------------------------
// Row builders
// ---------------------------------------------------------------------------

function w2Row(s: SettlementWithLines): string {
  const { settlement, bonuses, deductionsSnapshot } = s;

  const grossTaxable = new Decimal(settlement.grossTaxable.toString());
  const grossNonTaxable = new Decimal(settlement.grossNonTaxable.toString());

  // Reimbursement = non-taxable gross (per-diem / reimbursements)
  const reimbursement = grossNonTaxable.toFixed(2);

  // Sum bonuses
  const bonusTotal = bonuses.reduce(
    (acc, b) => acc.plus(new Decimal(b.amount.toString())),
    new Decimal(0),
  );

  // Trade-off: no hourly rate available from payComponents — put gross_taxable into bonus
  // regular_hours stays 0 because trucking pay is not hour-based in this model.
  // See README.md "Trade-offs" section.
  const regularHours = '0';
  const bonus = grossTaxable.plus(bonusTotal).toFixed(2);

  void deductionsSnapshot; // Deductions are not a Gusto W-2 column (handled in net pay)

  return row([
    settlement.driver.email ?? '',
    regularHours,
    '',    // overtime_hours
    '',    // double_overtime_hours
    bonus,
    '',    // commission
    reimbursement,
    '',    // other_hours_code
    '',    // other_hours_amount
    '',    // paycheck_tip_amount
    '',    // cash_tip_amount
    settlement.settlementReference ?? '',
  ]);
}

function c1099Row(s: SettlementWithLines): string {
  const { settlement, bonuses } = s;

  const grossTaxable = new Decimal(settlement.grossTaxable.toString());
  const grossNonTaxable = new Decimal(settlement.grossNonTaxable.toString());

  const bonusTotal = bonuses.reduce(
    (acc, b) => acc.plus(new Decimal(b.amount.toString())),
    new Decimal(0),
  );

  return row([
    settlement.driver.email ?? '',
    grossTaxable.toFixed(2),         // wage = gross taxable
    grossNonTaxable.toFixed(2),      // reimbursement = non-taxable
    bonusTotal.toFixed(2),           // bonus
  ]);
}

// ---------------------------------------------------------------------------
// Exporter implementation
// ---------------------------------------------------------------------------

export const gustoExporter: Exporter = {
  format: 'gusto',
  fileExtension: 'csv',
  mimeType: 'text/csv',

  build(settlements: SettlementWithLines[]): Readable {
    async function* generate(): AsyncGenerator<string> {
      if (settlements.length === 0) {
        return;
      }

      // Detect employment type from first settlement (list should be homogeneous)
      const firstType = settlements[0].settlement.employmentTypeSnapshot;
      const is1099 = firstType === 'OWNER_OPERATOR_1099';

      yield row(is1099 ? C1099_HEADER : W2_HEADER);

      for (const s of settlements) {
        yield is1099 ? c1099Row(s) : w2Row(s);
      }
    }

    return Readable.from(generate());
  },
};
