/**
 * adp.ts — ADP Run "Paydata Grid" CSV exporter.
 *
 * Spec: ADP Run Paydata Grid CSV import format.
 * Reference: https://support.adp.com/adp_payroll/content/hybrid/paydata_import.htm
 *
 * Columns (verified subset per ADP documentation):
 *   Co Code, Batch ID, File #, Reg Hours, O/T Hours,
 *   Hours 3 Code, Hours 3 Amount, Earnings 3 Code, Earnings 3 Amount, Memo
 *
 * Unverified columns (carrier-specific identifiers — emit TODO placeholders):
 *   Co Code   → "TODO:CO_CODE"   (carrier's ADP company code)
 *   Batch ID  → "TODO:BATCH_ID"  (payroll batch identifier)
 *   File #    → "TODO:FILE_NUM"  (employee file number in ADP)
 *
 * TODO: verify all column names against ADP Run sandbox import before production rollout.
 *       See README.md for sandbox verification checklist.
 *
 * W-2 settlements: gross_taxable emitted as Earnings 3 Code=MISC/Amount.
 * 1099 settlements: Earnings 3 Code=1099 with full gross amount.
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
// Columns
// ---------------------------------------------------------------------------

const HEADER = [
  'Co Code',
  'Batch ID',
  'File #',
  'Reg Hours',
  'O/T Hours',
  'Hours 3 Code',
  'Hours 3 Amount',
  'Earnings 3 Code',
  'Earnings 3 Amount',
  'Memo',
];

function settlementRow(s: SettlementWithLines): string {
  const { settlement } = s;

  const grossTaxable = new Decimal(settlement.grossTaxable.toString());
  const is1099 = settlement.employmentTypeSnapshot === 'OWNER_OPERATOR_1099';

  const earningsCode = is1099 ? '1099' : 'MISC';
  const earningsAmount = grossTaxable.toFixed(2);

  const fields = [
    'TODO:CO_CODE',   // TODO: verify column Co Code against ADP Run sandbox import
    'TODO:BATCH_ID',  // TODO: verify column Batch ID against ADP Run sandbox import
    'TODO:FILE_NUM',  // TODO: verify column File # against ADP Run sandbox import
    '',               // Reg Hours — trucking does not use standard hourly hours
    '',               // O/T Hours
    '',               // Hours 3 Code
    '',               // Hours 3 Amount
    earningsCode,     // Earnings 3 Code
    earningsAmount,   // Earnings 3 Amount
    settlement.settlementReference ?? '',
  ];

  return row(fields);
}

// ---------------------------------------------------------------------------
// Exporter implementation
// ---------------------------------------------------------------------------

export const adpExporter: Exporter = {
  format: 'adp',
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
