import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
} from '@react-email/components';

export interface InvoiceGeneratedEmailProps {
  loadNumber: string;
  contractName: string;
  invoiceTotal: number;
  dueDate: string;
  clientPortalUrl?: string;
  companyName: string;
}

export function InvoiceGeneratedEmail({
  loadNumber,
  contractName,
  invoiceTotal,
  dueDate,
  clientPortalUrl,
  companyName,
}: InvoiceGeneratedEmailProps) {
  const formattedTotal = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(invoiceTotal);

  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.headerText}>DriveCommand - {companyName}</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.greeting}>Invoice Ready</Text>
            <Text style={styles.message}>
              An invoice has been generated for the completed load. Please review the
              details below.
            </Text>

            <Section style={styles.detailsBox}>
              <Text style={styles.detailRow}>
                <strong>Load Number:</strong> {loadNumber}
              </Text>
              <Text style={styles.detailRow}>
                <strong>Contract:</strong> {contractName}
              </Text>
              <Text style={styles.invoiceTotalRow}>
                <strong>Invoice Total:</strong> {formattedTotal}
              </Text>
              <Text style={styles.detailRow}>
                <strong>Due Date:</strong> {dueDate}
              </Text>
            </Section>

            {clientPortalUrl && (
              <Section style={styles.ctaSection}>
                <Button href={clientPortalUrl} style={styles.button}>
                  View in Portal
                </Button>
              </Section>
            )}
          </Section>

          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>DriveCommand - Fleet Management</Text>
            <Text style={styles.footerSubtext}>
              This is an automated invoice notification from {companyName}.
            </Text>
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
    backgroundColor: '#1e40af',
    padding: '20px',
    borderRadius: '8px 8px 0 0',
  },
  headerText: {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: 'bold',
    margin: '0',
    textAlign: 'center' as const,
  },
  content: {
    backgroundColor: '#ffffff',
    padding: '32px',
    borderRadius: '0 0 8px 8px',
  },
  greeting: {
    fontSize: '18px',
    fontWeight: 'bold',
    margin: '0 0 12px',
    color: '#111827',
  },
  message: {
    fontSize: '14px',
    lineHeight: '24px',
    margin: '0 0 24px',
    color: '#374151',
  },
  detailsBox: {
    backgroundColor: '#f9fafb',
    borderRadius: '6px',
    padding: '16px',
    marginBottom: '24px',
  },
  detailRow: {
    fontSize: '14px',
    lineHeight: '22px',
    margin: '4px 0',
    color: '#374151',
  },
  invoiceTotalRow: {
    fontSize: '16px',
    lineHeight: '24px',
    margin: '12px 0 4px',
    color: '#111827',
  },
  ctaSection: {
    textAlign: 'center' as const,
    marginTop: '32px',
    marginBottom: '32px',
  },
  button: {
    backgroundColor: '#1e40af',
    color: '#ffffff',
    padding: '12px 32px',
    borderRadius: '6px',
    textDecoration: 'none',
    fontSize: '16px',
    fontWeight: 'bold',
    display: 'inline-block',
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
