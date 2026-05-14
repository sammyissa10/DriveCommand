/**
 * quickbooks.ts — QuickBooks Desktop General Journal Entry CSV exporter.
 *
 * Spec: QuickBooks Desktop "General Journal Entry" CSV import format.
 * Reference: https://quickbooks.intuit.com/learn-support/en-us/help-article/import-export-data/format-csv-files-quickbooks-desktop/L9CqaWqaY_US_en_US
 *
 * Format: CSV (NOT IIF). Intuit has deprecated IIF for new integrations;
 * the General Journal Entry CSV format has stable, current Intuit-published documentation.
 *
 * Columns (verified per Intuit docs):
 *   Date, Journal No., Account, Debits, Credits, Description, Name, Class, Memo
 *
 * Per settlement:
 *   - ONE debit row: gross_taxable + gross_non_taxable to "Payroll Expense"
 *   - ONE credit row per deduction: to "TODO:DEDUCTION_ACCOUNT" (carrier must map)
 *   - ONE credit row for net pay: to "Cash/Checking"
 *
 * TODO: verify column layout against QuickBooks Desktop 2024 sandbox import.
 * TODO: "Account" values for deductions require carrier chart-of-accounts mapping.
 *       See README.md for details.
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

const HEADER = ['Date', 'Journal No.', 'Account', 'Debits', 'Credits', 'Description', 'Name', 'Class', 'Memo'];

/**
 * Format date as MM/DD/YYYY (QuickBooks US date format).
 */
function formatDate(d: Date): string {
  const dt = d instanceof Date ? d : new Date(d);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const yyyy = dt.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function* settlementRows(s: SettlementWithLines): Generator<string> {
  const { settlement, deductionsSnapshot } = s;

  const dateStr = settlement.finalizedAt ? formatDate(settlement.finalizedAt) : '';
  const journalNo = settlement.settlementReference ?? '';
  const driverName = `${settlement.driver.firstName} ${settlement.driver.lastName}`;

  const grossTaxable = new Decimal(settlement.grossTaxable.toString());
  const grossNonTaxable = new Decimal(settlement.grossNonTaxable.toString());
  const grossTotal = grossTaxable.plus(grossNonTaxable);
  const netPay = new Decimal(settlement.netPay.toString());

  // Debit row: full gross to Payroll Expense
  yield row([
    dateStr,
    journalNo,
    'Payroll Expense',
    grossTotal.toFixed(2), // Debits
    '',                    // Credits
    `Driver payroll — ${journalNo}`,
    driverName,
    '',
    settlement.settlementReference ?? '',
  ]);

  // Credit rows for each deduction
  for (const ded of deductionsSnapshot) {
    // deductionsSnapshot.amount is stored as negative — take abs for Credits column
    const dedAmt = new Decimal(ded.amount).abs();
    yield row([
      dateStr,
      journalNo,
      'TODO:DEDUCTION_ACCOUNT', // TODO: verify column against QuickBooks chart-of-accounts
      '',                       // Debits
      dedAmt.toFixed(2),        // Credits
      ded.description,
      driverName,
      '',
      `Deduction: ${ded.type}`,
    ]);
  }

  // Credit row for net pay (Cash/Checking)
  yield row([
    dateStr,
    journalNo,
    'Cash/Checking',
    '',                // Debits
    netPay.toFixed(2), // Credits
    `Net pay — ${journalNo}`,
    driverName,
    '',
    settlement.settlementReference ?? '',
  ]);
}

// ---------------------------------------------------------------------------
// Exporter implementation
// ---------------------------------------------------------------------------

export const quickbooksExporter: Exporter = {
  format: 'quickbooks',
  fileExtension: 'csv',
  mimeType: 'text/csv',

  build(settlements: SettlementWithLines[]): Readable {
    async function* generate(): AsyncGenerator<string> {
      yield row(HEADER);
      for (const s of settlements) {
        for (const line of settlementRows(s)) {
          yield line;
        }
      }
    }

    return Readable.from(generate());
  },
};
