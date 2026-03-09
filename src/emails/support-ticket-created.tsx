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

interface SupportTicketCreatedEmailProps {
  ticketNumber: string;
  title: string;
  category: string;
  priority: string;
  submitterEmail: string;
  ticketUrl: string;
}

export function SupportTicketCreatedEmail({
  ticketNumber,
  title,
  category,
  priority,
  submitterEmail,
  ticketUrl,
}: SupportTicketCreatedEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.headerText}>New Support Ticket</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.message}>
              A new support ticket has been submitted.
            </Text>

            <Section style={styles.detailsBox}>
              <table style={styles.table}>
                <tbody>
                  <tr>
                    <td style={styles.labelCell}>Ticket</td>
                    <td style={styles.valueCell}>{ticketNumber}</td>
                  </tr>
                  <tr>
                    <td style={styles.labelCell}>Title</td>
                    <td style={styles.valueCell}>{title}</td>
                  </tr>
                  <tr>
                    <td style={styles.labelCell}>Category</td>
                    <td style={styles.valueCell}>{category}</td>
                  </tr>
                  <tr>
                    <td style={styles.labelCell}>Priority</td>
                    <td style={styles.valueCell}>{priority}</td>
                  </tr>
                  <tr>
                    <td style={styles.labelCell}>From</td>
                    <td style={styles.valueCell}>{submitterEmail}</td>
                  </tr>
                </tbody>
              </table>
            </Section>

            <Section style={styles.ctaSection}>
              <Button href={ticketUrl} style={styles.button}>
                View Ticket in Admin Dashboard
              </Button>
            </Section>
          </Section>

          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>
              DriveCommand - Fleet Management
            </Text>
            <Text style={styles.footerSubtext}>
              This is an automated notification from the DriveCommand support system.
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
  ctaSection: {
    textAlign: 'center' as const,
    marginTop: '32px',
    marginBottom: '8px',
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
