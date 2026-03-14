import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Hr,
} from '@react-email/components';

export interface FleetMessageNotificationEmailProps {
  recipientName: string;
  senderName: string;
  senderRole: 'DRIVER' | 'OWNER';
  messagePreview: string;
  routeName?: string;
}

export function FleetMessageNotificationEmail({
  recipientName,
  senderName,
  senderRole,
  messagePreview,
  routeName,
}: FleetMessageNotificationEmailProps) {
  // Truncate message preview to 300 chars
  const preview =
    messagePreview.length > 300
      ? messagePreview.slice(0, 300) + '...'
      : messagePreview;

  const roleLabel = senderRole === 'DRIVER' ? 'Driver' : 'Dispatch';

  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.headerText}>New Fleet Message</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.message}>
              Hi {recipientName}, you have a new message from {senderName} ({roleLabel}).
            </Text>

            {routeName && (
              <Section style={styles.detailsBox}>
                <table style={styles.table}>
                  <tbody>
                    <tr>
                      <td style={styles.labelCell}>Route</td>
                      <td style={styles.valueCell}>{routeName}</td>
                    </tr>
                  </tbody>
                </table>
              </Section>
            )}

            <Text style={styles.previewLabel}>
              {senderName} ({roleLabel}) sent a message:
            </Text>
            <Section style={styles.quoteBox}>
              <Text style={styles.quoteText}>{preview}</Text>
            </Section>
          </Section>

          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>DriveCommand - Fleet Management</Text>
            <Text style={styles.footerSubtext}>
              This is an automated notification from the DriveCommand fleet messaging system.
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
  message: {
    fontSize: '14px',
    lineHeight: '24px',
    margin: '0 0 24px',
    color: '#374151',
  },
  detailsBox: {
    backgroundColor: '#f9fafb',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '16px',
    marginBottom: '24px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
  },
  labelCell: {
    fontSize: '13px',
    fontWeight: 'bold' as const,
    color: '#6b7280',
    padding: '6px 12px 6px 0',
    verticalAlign: 'top' as const,
    whiteSpace: 'nowrap' as const,
    width: '90px',
  },
  valueCell: {
    fontSize: '13px',
    color: '#111827',
    padding: '6px 0',
    verticalAlign: 'top' as const,
  },
  previewLabel: {
    fontSize: '13px',
    fontWeight: 'bold' as const,
    color: '#6b7280',
    margin: '0 0 8px',
  },
  quoteBox: {
    backgroundColor: '#f3f4f6',
    borderLeft: '3px solid #1e40af',
    padding: '12px 16px',
    borderRadius: '0 6px 6px 0',
    marginBottom: '24px',
  },
  quoteText: {
    fontSize: '13px',
    lineHeight: '22px',
    color: '#374151',
    margin: '0',
    whiteSpace: 'pre-wrap' as const,
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
