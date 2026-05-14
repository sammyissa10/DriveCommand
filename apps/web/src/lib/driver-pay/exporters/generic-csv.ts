/**
 * generic-csv.ts — Generic per-driver/per-settlement CSV exporter.
 *
 * Spec: Generic DriveCommand canonical layout — no external provider spec.
 * One row per settlement. Columns (all verified):
 *   settlement_reference, driver_id, driver_first_name, driver_last_name,
 *   driver_email, period_start, period_end, employment_type,
 *   gross_taxable, gross_non_taxable, total_deductions, net_pay,
 *   line_count, bonus_count, deduction_count
 *
 * Money math: decimal.js throughout. No native float arithmetic.
 * CSV escaping: RFC 4180 (wrap values containing comma, quote, or newline in
 * double-quotes; internal quotes doubled).
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
// Columns
// ---------------------------------------------------------------------------

const HEADER = [
  'settlement_reference',
  'driver_id',
  'driver_first_name',
  'driver_last_name',
  'driver_email',
  'period_start',
  'period_end',
  'employment_type',
  'gross_taxable',
  'gross_non_taxable',
  'total_deductions',
  'net_pay',
  'line_count',
  'bonus_count',
  'deduction_count',
];

function formatDate(d: Date): string {
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d);
}

function settlementRow(s: SettlementWithLines): string {
  const { settlement, payComponents, bonuses, deductionsSnapshot } = s;

  const grossTaxable = new Decimal(settlement.grossTaxable.toString());
  const grossNonTaxable = new Decimal(settlement.grossNonTaxable.toString());
  const totalDeductions = new Decimal(settlement.totalDeductions.toString());
  const netPay = new Decimal(settlement.netPay.toString());

  const fields = [
    settlement.settlementReference ?? '',
    settlement.driver.id,
    settlement.driver.firstName,
    settlement.driver.lastName,
    settlement.driver.email ?? '',
    formatDate(settlement.periodStart),
    formatDate(settlement.periodEnd),
    settlement.employmentTypeSnapshot ?? '',
    grossTaxable.toFixed(2),
    grossNonTaxable.toFixed(2),
    totalDeductions.toFixed(2),
    netPay.toFixed(2),
    String(payComponents.length),
    String(bonuses.length),
    String(deductionsSnapshot.length),
  ];

  return row(fields);
}

// ---------------------------------------------------------------------------
// Exporter implementation
// ---------------------------------------------------------------------------

export const genericCsvExporter: Exporter = {
  format: 'generic_csv',
  fileExtension: 'csv',
  mimeType: 'text/csv',

  build(settlements: SettlementWithLines[]): Readable {
    async function* generate(): AsyncGenerator<string> {
      yield row(HEADER);
      for (const s of settlements) {
        yield settlementRow(s);
      }
    }

    return Readable.from(generate());
  },
};
