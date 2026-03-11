import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
} from '@react-email/components';

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
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.headerTitle}>DriveCommand</Text>
            <Text style={styles.headerSubtitle}>Invoice</Text>
          </Section>

          <Section style={styles.content}>
            {/* Info block */}
            <table style={{ width: '100%', borderCollapse: 'collapse' as const, marginBottom: '32px' }}>
              <tbody>
                <tr>
                  <td style={styles.billToCell}>
                    <Text style={styles.infoLabel}>Bill To</Text>
                    <Text style={styles.infoValue}>{tenantName}</Text>
                    <Text style={styles.infoValueSmall}>{ownerName}</Text>
                  </td>
                  <td style={styles.invoiceMetaCell}>
                    <table style={{ borderCollapse: 'collapse' as const }}>
                      <tbody>
                        <tr>
                          <td style={styles.metaLabel}>Invoice #</td>
                          <td style={styles.metaValueMono}>{invoiceNumber}</td>
                        </tr>
                        <tr>
                          <td style={styles.metaLabel}>Issue Date</td>
                          <td style={styles.metaValue}>{issueDate}</td>
                        </tr>
                        <tr>
                          <td style={styles.metaLabel}>Due Date</td>
                          <td style={styles.metaValue}>{dueDate}</td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Items label */}
            <Text style={styles.itemsLabel}>Items</Text>

            {/* Line items table */}
            <table style={styles.lineItemsTable}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <th style={styles.thDesc}>Description</th>
                  <th style={styles.thNum}>Qty</th>
                  <th style={styles.thNum}>Unit Price</th>
                  <th style={styles.thNum}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={styles.tdDesc}>{item.description}</td>
                    <td style={styles.tdNum}>{item.quantity}</td>
                    <td style={styles.tdNum}>{item.unitPrice}</td>
                    <td style={styles.tdNum}>{item.amount}</td>
                  </tr>
                ))}
                {/* Subtotal row */}
                <tr>
                  <td colSpan={3} style={styles.subtotalLabel}>Subtotal</td>
                  <td style={styles.subtotalValue}>{subtotal}</td>
                </tr>
                {/* Total row */}
                <tr style={{ backgroundColor: '#f9fafb' }}>
                  <td colSpan={3} style={styles.totalLabel}>Total Due</td>
                  <td style={styles.totalValue}>{total}</td>
                </tr>
              </tbody>
            </table>

            {/* Notes */}
            {notes && (
              <Section style={{ marginTop: '24px' }}>
                <Text style={styles.notesLabel}>Notes:</Text>
                <Text style={styles.notesText}>{notes}</Text>
              </Section>
            )}
          </Section>

          {/* Footer */}
          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>DriveCommand — Fleet Management Platform</Text>
            <Text style={styles.footerSubtext}>This invoice was issued by DriveCommand.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: '#f6f9fc',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  container: {
    margin: '0 auto',
    padding: '20px 0',
    maxWidth: '600px',
  },
  header: {
    backgroundColor: '#111827',
    padding: '24px',
    borderRadius: '8px 8px 0 0',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: '18px',
    fontWeight: 'bold' as const,
    margin: '0 0 4px',
  },
  headerSubtitle: {
    color: '#9ca3af',
    fontSize: '13px',
    margin: '0',
  },
  content: {
    backgroundColor: '#ffffff',
    padding: '32px',
    borderRadius: '0 0 8px 8px',
  },
  billToCell: {
    verticalAlign: 'top' as const,
    width: '50%',
  },
  infoLabel: {
    fontSize: '11px',
    fontWeight: 'bold' as const,
    color: '#6b7280',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    margin: '0 0 4px',
  },
  infoValue: {
    fontSize: '14px',
    fontWeight: 'bold' as const,
    color: '#111827',
    margin: '0 0 2px',
  },
  infoValueSmall: {
    fontSize: '13px',
    color: '#6b7280',
    margin: '0',
  },
  invoiceMetaCell: {
    verticalAlign: 'top' as const,
    textAlign: 'right' as const,
    width: '50%',
  },
  metaLabel: {
    fontSize: '12px',
    color: '#6b7280',
    padding: '2px 8px 2px 0',
    textAlign: 'right' as const,
  },
  metaValue: {
    fontSize: '12px',
    color: '#111827',
    padding: '2px 0',
  },
  metaValueMono: {
    fontSize: '12px',
    color: '#111827',
    fontFamily: 'monospace',
    padding: '2px 0',
    fontWeight: 'bold' as const,
  },
  itemsLabel: {
    fontSize: '13px',
    fontWeight: 'bold' as const,
    color: '#374151',
    marginBottom: '8px',
    marginTop: '0',
  },
  lineItemsTable: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  },
  thDesc: {
    textAlign: 'left' as const,
    padding: '8px 12px 8px 0',
    fontSize: '12px',
    fontWeight: 'bold' as const,
    color: '#6b7280',
    borderBottom: '1px solid #e5e7eb',
  },
  thNum: {
    textAlign: 'right' as const,
    padding: '8px 0 8px 12px',
    fontSize: '12px',
    fontWeight: 'bold' as const,
    color: '#6b7280',
    borderBottom: '1px solid #e5e7eb',
  },
  tdDesc: {
    textAlign: 'left' as const,
    padding: '10px 12px 10px 0',
    color: '#374151',
    verticalAlign: 'top' as const,
  },
  tdNum: {
    textAlign: 'right' as const,
    padding: '10px 0 10px 12px',
    color: '#374151',
    verticalAlign: 'top' as const,
  },
  subtotalLabel: {
    textAlign: 'right' as const,
    padding: '10px 12px 4px 0',
    color: '#6b7280',
    fontSize: '13px',
  },
  subtotalValue: {
    textAlign: 'right' as const,
    padding: '10px 0 4px',
    color: '#6b7280',
    fontSize: '13px',
  },
  totalLabel: {
    textAlign: 'right' as const,
    padding: '10px 12px 10px 0',
    fontWeight: 'bold' as const,
    color: '#111827',
    fontSize: '14px',
  },
  totalValue: {
    textAlign: 'right' as const,
    padding: '10px 0',
    fontWeight: 'bold' as const,
    color: '#111827',
    fontSize: '14px',
  },
  notesLabel: {
    fontSize: '12px',
    color: '#6b7280',
    margin: '0 0 4px',
  },
  notesText: {
    fontSize: '13px',
    color: '#374151',
    margin: '0',
  },
  divider: {
    borderColor: '#e5e7eb',
    margin: '16px 0',
  },
  footer: {
    marginTop: '32px',
  },
  footerText: {
    fontSize: '14px',
    color: '#6b7280',
    textAlign: 'center' as const,
    margin: '16px 0 8px',
  },
  footerSubtext: {
    fontSize: '12px',
    color: '#9ca3af',
    textAlign: 'center' as const,
    margin: '0',
  },
};
