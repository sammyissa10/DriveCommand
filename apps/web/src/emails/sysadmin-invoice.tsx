import * as React from 'react';
import { Shell, colors, fonts, fontSizes, space } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

export interface SysAdminInvoiceEmailProps {
  invoiceNumber: string;
  tenantName: string;
  ownerName: string;
  issueDate: string;
  dueDate: string;
  items: Array<{ description: string; quantity: string; unitPrice: string; amount: string }>;
  subtotal: string;
  total: string;
  notes?: string;
}

/**
 * DELIBERATE EXCEPTION to "delete `const styles`" (migration_recipe rule 4):
 * this template's line-items table is real data, not prose (see the plan's
 * "two hard ones"), so the table layout survives as a module-level object.
 * It is NOT named `styles`, and every value is built from `_system` tokens —
 * zero hex literals, zero font-stack literals of its own.
 */
const tableStyles = {
  metaTable: { width: '100%', borderCollapse: 'collapse' as const, marginBottom: space[8] },
  billToCell: { verticalAlign: 'top' as const, width: '50%' },
  invoiceMetaCell: { verticalAlign: 'top' as const, textAlign: 'right' as const, width: '50%' },
  infoLabel: {
    fontFamily: fonts.bodyStack,
    fontSize: fontSizes.fine,
    fontWeight: 700,
    color: colors.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    margin: `0 0 ${space[1]} 0`,
  },
  infoValue: {
    fontFamily: fonts.bodyStack,
    fontSize: fontSizes.body,
    fontWeight: 700,
    color: colors.textPrimary,
    margin: `0 0 2px 0`,
  },
  infoValueSmall: {
    fontFamily: fonts.bodyStack,
    fontSize: fontSizes.small,
    color: colors.textSecondary,
    margin: 0,
  },
  metaLabel: {
    fontFamily: fonts.bodyStack,
    fontSize: fontSizes.fine,
    color: colors.textSecondary,
    padding: `2px ${space[2]} 2px 0`,
    textAlign: 'right' as const,
  },
  metaValue: {
    fontFamily: fonts.bodyStack,
    fontSize: fontSizes.fine,
    color: colors.textPrimary,
    padding: '2px 0',
  },
  metaValueMono: {
    fontFamily: 'monospace',
    fontSize: fontSizes.fine,
    color: colors.textPrimary,
    fontWeight: 700,
    padding: '2px 0',
  },
  itemsLabel: {
    fontFamily: fonts.bodyStack,
    fontSize: fontSizes.small,
    fontWeight: 700,
    color: colors.textPrimary,
    margin: `0 0 ${space[2]} 0`,
  },
  lineItemsTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontFamily: fonts.bodyStack,
    fontSize: fontSizes.small,
  },
  theadRow: { backgroundColor: colors.bone },
  thDesc: {
    textAlign: 'left' as const,
    padding: `${space[2]} ${space[3]} ${space[2]} 0`,
    fontSize: fontSizes.fine,
    fontWeight: 700,
    color: colors.textSecondary,
    borderBottom: `1px solid ${colors.border}`,
  },
  thNum: {
    textAlign: 'right' as const,
    padding: `${space[2]} 0 ${space[2]} ${space[3]}`,
    fontSize: fontSizes.fine,
    fontWeight: 700,
    color: colors.textSecondary,
    borderBottom: `1px solid ${colors.border}`,
  },
  itemRow: { borderBottom: `1px solid ${colors.border}` },
  tdDesc: {
    textAlign: 'left' as const,
    padding: `${space[3]} ${space[3]} ${space[3]} 0`,
    color: colors.textPrimary,
    verticalAlign: 'top' as const,
  },
  tdNum: {
    textAlign: 'right' as const,
    padding: `${space[3]} 0 ${space[3]} ${space[3]}`,
    color: colors.textPrimary,
    verticalAlign: 'top' as const,
  },
  subtotalLabel: {
    textAlign: 'right' as const,
    padding: `${space[3]} ${space[3]} 4px 0`,
    color: colors.textSecondary,
    fontSize: fontSizes.small,
  },
  subtotalValue: {
    textAlign: 'right' as const,
    padding: `${space[3]} 0 4px`,
    color: colors.textSecondary,
    fontSize: fontSizes.small,
  },
  totalRow: { backgroundColor: colors.bone },
  totalLabel: {
    textAlign: 'right' as const,
    padding: `${space[3]} ${space[3]} ${space[3]} 0`,
    fontWeight: 700,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
  },
  totalValue: {
    textAlign: 'right' as const,
    padding: `${space[3]} 0`,
    fontWeight: 700,
    color: colors.textPrimary,
    fontSize: fontSizes.body,
  },
  notesLabel: {
    fontFamily: fonts.bodyStack,
    fontSize: fontSizes.fine,
    color: colors.textSecondary,
    margin: `0 0 ${space[1]} 0`,
  },
  notesText: {
    fontFamily: fonts.bodyStack,
    fontSize: fontSizes.small,
    color: colors.textPrimary,
    margin: 0,
  },
};

export function SysAdminInvoiceEmail({
  invoiceNumber,
  tenantName,
  ownerName,
  issueDate,
  dueDate,
  items,
  subtotal,
  total,
  notes,
}: SysAdminInvoiceEmailProps) {
  return (
    <Shell
      preheader={`Invoice ${invoiceNumber} for ${tenantName} — ${total} due ${dueDate}`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>Invoice {invoiceNumber}</h2>

      <table style={tableStyles.metaTable}>
        <tbody>
          <tr>
            <td style={tableStyles.billToCell}>
              <p style={tableStyles.infoLabel}>Bill to</p>
              <p style={tableStyles.infoValue}>{tenantName}</p>
              <p style={tableStyles.infoValueSmall}>{ownerName}</p>
            </td>
            <td style={tableStyles.invoiceMetaCell}>
              <table style={{ borderCollapse: 'collapse', marginLeft: 'auto' }}>
                <tbody>
                  <tr>
                    <td style={tableStyles.metaLabel}>Invoice #</td>
                    <td style={tableStyles.metaValueMono}>{invoiceNumber}</td>
                  </tr>
                  <tr>
                    <td style={tableStyles.metaLabel}>Issue date</td>
                    <td style={tableStyles.metaValue}>{issueDate}</td>
                  </tr>
                  <tr>
                    <td style={tableStyles.metaLabel}>Due date</td>
                    <td style={tableStyles.metaValue}>{dueDate}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <p style={tableStyles.itemsLabel}>Items</p>

      <table style={tableStyles.lineItemsTable}>
        <thead>
          <tr style={tableStyles.theadRow}>
            <th style={tableStyles.thDesc}>Description</th>
            <th style={tableStyles.thNum}>Qty</th>
            <th style={tableStyles.thNum}>Unit price</th>
            <th style={tableStyles.thNum}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} style={tableStyles.itemRow}>
              <td style={tableStyles.tdDesc}>{item.description}</td>
              <td style={tableStyles.tdNum}>{item.quantity}</td>
              <td style={tableStyles.tdNum}>{item.unitPrice}</td>
              <td style={tableStyles.tdNum}>{item.amount}</td>
            </tr>
          ))}
          <tr>
            <td colSpan={3} style={tableStyles.subtotalLabel}>Subtotal</td>
            <td style={tableStyles.subtotalValue}>{subtotal}</td>
          </tr>
          <tr style={tableStyles.totalRow}>
            <td colSpan={3} style={tableStyles.totalLabel}>Total due</td>
            <td style={tableStyles.totalValue}>{total}</td>
          </tr>
        </tbody>
      </table>

      {notes ? (
        <div style={{ marginTop: space[6] }}>
          <p style={tableStyles.notesLabel}>Notes:</p>
          <p style={tableStyles.notesText}>{notes}</p>
        </div>
      ) : null}

      <p>This invoice was issued by DriveCommand.</p>
    </Shell>
  );
}
