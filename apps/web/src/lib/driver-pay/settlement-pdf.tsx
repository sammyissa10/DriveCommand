/**
 * Settlement PDF Generator — @react-pdf/renderer v4.3.2
 *
 * Generates a printable settlement statement for a driver pay period.
 * Server-side only — never import from client components.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import React from 'react';
import type {
  DriverSettlement,
  CarrierDriver,
  Tenant,
  LoadDriverAssignment,
  LoadPayComponent,
  DriverBonus,
  DriverDeduction,
  CarrierLoad,
} from '@/generated/prisma';
import { formatDateOnlyShort } from '@/lib/utils/date';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeductionAppliedItem {
  deduction: DriverDeduction;
  appliedAmount: string;
}

export interface SettlementPdfInput {
  settlement: DriverSettlement;
  tenant: Pick<Tenant, 'name'>;
  driver: Pick<CarrierDriver, 'firstName' | 'lastName'> & { employmentType?: string | null };
  assignments: Array<
    LoadDriverAssignment & {
      payComponents: LoadPayComponent[];
      load: Pick<CarrierLoad, 'referenceNumber' | 'status'>;
    }
  >;
  bonuses: DriverBonus[];
  deductionsApplied: DeductionAppliedItem[];
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1f2937',
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 50,
    lineHeight: 1.4,
  },
  // Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  carrierName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#1f2937',
  },
  settlementRef: {
    fontSize: 9,
    color: '#6b7280',
    textAlign: 'right',
  },
  titleCentered: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginBottom: 16,
    color: '#1f2937',
    letterSpacing: 1,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#d1d5db',
    marginBottom: 14,
  },
  // Driver block
  driverBlock: {
    marginBottom: 16,
  },
  driverRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
  },
  value: {
    color: '#1f2937',
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: '#1f2937',
    marginBottom: 6,
    marginTop: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingBottom: 2,
  },
  // Summary table
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingHorizontal: 6,
  },
  tableRowAlt: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    paddingHorizontal: 6,
    backgroundColor: '#f9fafb',
  },
  tableRowNet: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 6,
    backgroundColor: '#ecfdf5',
    marginTop: 2,
  },
  netLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    color: '#047857',
  },
  netValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    color: '#047857',
  },
  deductionValue: {
    color: '#dc2626',
  },
  // Load breakdown
  loadCard: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 3,
    padding: 8,
    marginBottom: 8,
  },
  loadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  loadRef: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: '#1f2937',
  },
  componentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
    paddingLeft: 8,
  },
  componentCategory: {
    fontSize: 8,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 40,
    left: 50,
    right: 50,
  },
  footerDivider: {
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
    marginBottom: 8,
  },
  footerText: {
    fontSize: 8,
    color: '#6b7280',
    marginBottom: 2,
  },
  signatureLine: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 40,
  },
  signatureField: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
    paddingTop: 4,
    fontSize: 8,
    color: '#374151',
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// `period_start` / `period_end` are `@db.Date`. A settlement PDF is a
// document a driver keeps, so the period printed on it must be the period
// stored — see lib/utils/date.ts (quick-541).
const formatDate = formatDateOnlyShort;

function formatMoney(val: { toString(): string } | string | number): string {
  const n = parseFloat(typeof val === 'object' ? val.toString() : String(val));
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

// ---------------------------------------------------------------------------
// PDF Document component
// ---------------------------------------------------------------------------

function SettlementDoc(props: SettlementPdfInput) {
  const { settlement, tenant, driver, assignments, bonuses, deductionsApplied } = props;

  const employmentLabel = driver.employmentType
    ? driver.employmentType === 'W2'
      ? 'W-2 Employee'
      : '1099 Contractor'
    : 'Contractor';

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <Text style={styles.carrierName}>{tenant.name}</Text>
          <Text style={styles.settlementRef}>{settlement.settlementReference ?? ''}</Text>
        </View>
        <Text style={styles.titleCentered}>DRIVER SETTLEMENT STATEMENT</Text>
        <View style={styles.divider} />

        {/* ── Driver block ── */}
        <View style={styles.driverBlock}>
          <View style={styles.driverRow}>
            <View>
              <Text>
                <Text style={styles.label}>Driver: </Text>
                <Text style={styles.value}>
                  {driver.firstName} {driver.lastName}
                </Text>
              </Text>
              <Text>
                <Text style={styles.label}>Employment Type: </Text>
                <Text style={styles.value}>{employmentLabel}</Text>
              </Text>
            </View>
            <View>
              <Text>
                <Text style={styles.label}>Pay Period: </Text>
                <Text style={styles.value}>
                  {formatDate(settlement.periodStart)} – {formatDate(settlement.periodEnd)}
                </Text>
              </Text>
              <Text>
                <Text style={styles.label}>Generated: </Text>
                <Text style={styles.value}>{formatDate(settlement.createdAt)}</Text>
              </Text>
            </View>
          </View>
        </View>

        {/* ── Summary table ── */}
        <Text style={styles.sectionTitle}>Pay Summary</Text>
        <View style={styles.tableRow}>
          <Text style={styles.label}>Gross Taxable Earnings</Text>
          <Text>{formatMoney(settlement.grossTaxable)}</Text>
        </View>
        <View style={styles.tableRowAlt}>
          <Text style={styles.label}>Gross Non-Taxable</Text>
          <Text>{formatMoney(settlement.grossNonTaxable)}</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.label}>Total Deductions</Text>
          <Text style={styles.deductionValue}>
            -{formatMoney(settlement.totalDeductions)}
          </Text>
        </View>
        <View style={styles.tableRowNet}>
          <Text style={styles.netLabel}>Net Pay</Text>
          <Text style={styles.netValue}>{formatMoney(settlement.netPay)}</Text>
        </View>

        {/* ── Per-load breakdown ── */}
        {assignments.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>
              Load Breakdown ({assignments.length} load{assignments.length !== 1 ? 's' : ''})
            </Text>
            {assignments.map((a) => (
              <View key={a.id} style={styles.loadCard}>
                <View style={styles.loadHeader}>
                  <Text style={styles.loadRef}>Load #{a.load.referenceNumber ?? a.loadId.slice(0, 8)}</Text>
                  <Text style={{ fontSize: 8, color: '#6b7280' }}>
                    Approved {formatDate(a.approvedAt ?? a.createdAt)}
                  </Text>
                </View>
                {a.payComponents
                  .filter((c) => (c.deletedAt as Date | null) === null)
                  .map((c) => (
                    <View key={c.id} style={styles.componentRow}>
                      <View style={{ flex: 1 }}>
                        <Text>{c.description}</Text>
                        <Text style={styles.componentCategory}>{c.category as string}</Text>
                      </View>
                      <Text
                        style={
                          (c.category as string) === 'DEDUCTION'
                            ? styles.deductionValue
                            : {}
                        }
                      >
                        {(c.category as string) === 'DEDUCTION' ? '-' : ''}
                        {formatMoney(c.grossAmount)}
                      </Text>
                    </View>
                  ))}
              </View>
            ))}
          </>
        )}

        {/* ── Standalone bonuses ── */}
        {bonuses.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Bonuses</Text>
            <View style={styles.tableRow}>
              <Text style={{ ...styles.label, flex: 2 }}>Type</Text>
              <Text style={{ ...styles.label, flex: 3 }}>Description</Text>
              <Text style={{ ...styles.label, flex: 1, textAlign: 'right' }}>Taxable</Text>
              <Text style={{ ...styles.label, flex: 1, textAlign: 'right' }}>Amount</Text>
            </View>
            {bonuses.map((b, i) => (
              <View key={b.id} style={i % 2 === 0 ? styles.tableRowAlt : styles.tableRow}>
                <Text style={{ flex: 2 }}>{b.bonusType as string}</Text>
                <Text style={{ flex: 3 }}>{b.description}</Text>
                <Text style={{ flex: 1, textAlign: 'right' }}>{b.isTaxable ? 'Yes' : 'No'}</Text>
                <Text style={{ flex: 1, textAlign: 'right' }}>{formatMoney(b.amount)}</Text>
              </View>
            ))}
          </>
        )}

        {/* ── Deductions ── */}
        {deductionsApplied.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Deductions This Period</Text>
            <View style={styles.tableRow}>
              <Text style={{ ...styles.label, flex: 3 }}>Name</Text>
              <Text style={{ ...styles.label, flex: 2 }}>Schedule</Text>
              <Text style={{ ...styles.label, flex: 1, textAlign: 'right' }}>Amount</Text>
            </View>
            {deductionsApplied.map((d, i) => (
              <View key={d.deduction.id} style={i % 2 === 0 ? styles.tableRowAlt : styles.tableRow}>
                <Text style={{ flex: 3 }}>{d.deduction.deductionType as string}</Text>
                <Text style={{ flex: 2 }}>{d.deduction.schedule as string}</Text>
                <Text style={{ flex: 1, textAlign: 'right', color: '#dc2626' }}>
                  -{formatMoney(d.appliedAmount)}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* ── Footer ── */}
        <View style={styles.footer} fixed>
          <View style={styles.footerDivider} />
          <Text style={styles.footerText}>
            Settlement ID: {settlement.id} · Generated: {new Date().toISOString()}
          </Text>
          <Text style={styles.footerText}>
            {tenant.name} · This document is for payroll purposes only.
          </Text>
          <View style={styles.signatureLine}>
            <Text style={styles.signatureField}>Driver Signature</Text>
            <Text style={styles.signatureField}>Date</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateSettlementPdf(
  input: SettlementPdfInput,
): Promise<Buffer> {
  const result = await renderToBuffer(<SettlementDoc {...input} />);
  return Buffer.from(result);
}
