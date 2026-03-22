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

interface DriverDocumentExpiryReminderEmailProps {
  driverName: string;
  documentType: string; // Human-readable: "Driver License", "Driver Application", "General Document"
  expiryDate: string;
  daysUntilExpiry: number;
  dashboardUrl: string;
}

export function DriverDocumentExpiryReminderEmail({
  driverName,
  documentType,
  expiryDate,
  daysUntilExpiry,
  dashboardUrl,
}: DriverDocumentExpiryReminderEmailProps) {
  const isUrgent = daysUntilExpiry < 7;
  const isExpired = daysUntilExpiry < 0;

  const urgencyColor = isExpired ? '#dc2626' : isUrgent ? '#f59e0b' : '#059669';
  const urgencyText = isExpired
    ? 'EXPIRED'
    : isUrgent
    ? 'URGENT'
    : 'UPCOMING';

  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.headerText}>Driver Document Expiry Notice</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.greeting}>Hello,</Text>
            <Text style={styles.message}>
              {isExpired
                ? 'A required driver document has expired:'
                : `A required driver document is expiring soon:`}
            </Text>

            <Section style={styles.card}>
              <Section style={{ ...styles.urgencyBadge, backgroundColor: urgencyColor }}>
                <Text style={styles.urgencyText}>{urgencyText}</Text>
              </Section>

              <Text style={styles.driverName}>{driverName}</Text>
              <Text style={styles.documentType}>Document: {documentType}</Text>

              <Hr style={styles.divider} />

              <Text style={styles.expiryInfo}>
                Expiry Date: <strong>{expiryDate}</strong>
              </Text>
              <Text style={{ ...styles.daysInfo, color: urgencyColor }}>
                {isExpired
                  ? `Expired ${Math.abs(daysUntilExpiry)} ${Math.abs(daysUntilExpiry) === 1 ? 'day' : 'days'} ago`
                  : daysUntilExpiry === 0
                  ? 'Expires today'
                  : `Expires in ${daysUntilExpiry} ${daysUntilExpiry === 1 ? 'day' : 'days'}`}
              </Text>

              {isUrgent && (
                <Text style={styles.warning}>
                  {isExpired
                    ? 'This document has expired. Please renew immediately to maintain DOT compliance.'
                    : 'This document is expiring soon. Please renew to avoid compliance issues.'}
                </Text>
              )}
            </Section>

            <Section style={styles.ctaSection}>
              <Button href={dashboardUrl} style={styles.button}>
                View Driver Profile
              </Button>
            </Section>
          </Section>

          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>
              DriveCommand - Fleet Management
            </Text>
            <Text style={styles.footerSubtext}>
              This is an automated reminder. Please log in to update driver documents.
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
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
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
    fontSize: '16px',
    margin: '0 0 16px',
  },
  message: {
    fontSize: '14px',
    lineHeight: '24px',
    margin: '0 0 24px',
    color: '#374151',
  },
  card: {
    backgroundColor: '#f9fafb',
    padding: '20px',
    borderRadius: '6px',
    marginBottom: '24px',
    border: '1px solid #e5e7eb',
    position: 'relative' as const,
  },
  urgencyBadge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '12px',
    marginBottom: '12px',
  },
  urgencyText: {
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 'bold',
    margin: '0',
    textTransform: 'uppercase' as const,
  },
  driverName: {
    fontSize: '18px',
    fontWeight: 'bold',
    margin: '0 0 8px',
    color: '#111827',
  },
  documentType: {
    fontSize: '14px',
    margin: '0 0 16px',
    color: '#6b7280',
  },
  divider: {
    borderColor: '#e5e7eb',
    margin: '16px 0',
  },
  expiryInfo: {
    fontSize: '14px',
    margin: '8px 0',
    color: '#374151',
  },
  daysInfo: {
    fontSize: '16px',
    margin: '8px 0',
    fontWeight: 'bold',
  },
  warning: {
    fontSize: '13px',
    margin: '16px 0 0',
    padding: '12px',
    backgroundColor: '#fef3c7',
    borderLeft: '4px solid #f59e0b',
    borderRadius: '4px',
    color: '#92400e',
  },
  ctaSection: {
    textAlign: 'center' as const,
    marginTop: '32px',
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
