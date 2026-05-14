/**
 * exporters/index.ts — Payroll export abstraction layer.
 *
 * Defines the Exporter interface and a registry keyed by ExportFormat.
 * Each format is a pure module; selection happens at runtime via getExporter().
 *
 * IMPORTANT: Exporters read directly from LoadPayComponent rows and
 * settlement deduction snapshot deltas. They do NOT use computeDeductionBreakdown
 * or anything from src/lib/driver-pay/reporting.ts.
 */

import type { Readable } from 'node:stream';
import type {
  DriverSettlement,
  LoadPayComponent,
  CarrierDriver,
  DriverBonus,
  EmploymentType,
} from '@/generated/prisma';

import { genericCsvExporter } from './generic-csv';
import { quickbooksExporter } from './quickbooks';
import { adpExporter } from './adp';
import { gustoExporter } from './gusto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExportFormat = 'generic_csv' | 'quickbooks' | 'adp' | 'gusto';

/** A settlement enriched with all line items needed for export. */
export interface SettlementWithLines {
  settlement: DriverSettlement & {
    driver: Pick<CarrierDriver, 'id' | 'firstName' | 'lastName' | 'email' | 'phone'>;
  };
  /** Direct LoadPayComponent rows — DO NOT use computeDeductionBreakdown or reporting.ts */
  payComponents: LoadPayComponent[];
  bonuses: DriverBonus[];
  /**
   * Deductions parsed from settlement.notes JSON field (_deductionsApplied array).
   * amount is a Decimal string; negative means it reduces net pay.
   */
  deductionsSnapshot: Array<{
    deductionId: string;
    description: string;
    amount: string;
    type: string;
  }>;
}

/** Interface every exporter must implement. */
export interface Exporter {
  format: ExportFormat;
  fileExtension: string; // 'csv'
  mimeType: string; // 'text/csv'
  build(settlements: SettlementWithLines[]): Readable;
}

/**
 * Thrown when net-pay reconciliation fails within an exporter.
 * grossTaxable + grossNonTaxable + deductions + bonuses must equal netPay within 1 cent.
 */
export class PayrollExportReconciliationError extends Error {
  constructor(
    public readonly settlementId: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(
      `PayrollExportReconciliationError: settlement ${settlementId} — ` +
        `expected netPay ${expected} but computed ${actual}`,
    );
    this.name = 'PayrollExportReconciliationError';
  }
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Return the exporter for a given format. Throws if format is unknown. */
export function getExporter(format: ExportFormat): Exporter {
  switch (format) {
    case 'generic_csv':
      return genericCsvExporter;
    case 'quickbooks':
      return quickbooksExporter;
    case 'adp':
      return adpExporter;
    case 'gusto':
      return gustoExporter;
    default: {
      const _exhaustive: never = format;
      throw new Error(`Unknown export format: ${String(_exhaustive)}`);
    }
  }
}

// Re-export EmploymentType for convenience in route handler
export type { EmploymentType };
