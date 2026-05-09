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

interface WorkflowInstanceBlockedEmailProps {
  driverName: string;
  stepName: string;
  playbookName: string;
  tenantName: string;
  hoursBlocked: number;
  dashboardUrl: string;
}

export function WorkflowInstanceBlockedEmail({
  driverName,
  stepName,
  playbookName,
  tenantName,
  hoursBlocked,
  dashboardUrl,
}: WorkflowInstanceBlockedEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.headerText}>Driver Blocked — Admin Escalation</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.greeting}>Hello,</Text>
            <Text style={styles.message}>
              A driver has been blocked from dispatch for over {hoursBlocked} hours and requires admin attention.
            </Text>

            <Section style={styles.card}>
              <Section style={styles.urgencyBadge}>
                <Text style={styles.urgencyText}>ACTION REQUIRED</Text>
              </Section>

              <Text style={styles.driverName}>{driverName}</Text>
              <Text style={styles.detail}>Checklist: {playbookName}</Text>
              <Text style={styles.detail}>Blocked on: &quot;{stepName}&quot;</Text>

              <Hr style={styles.divider} />

              <Text style={styles.blockedInfo}>
                Blocked for over <strong>{hoursBlocked} hours</strong>
              </Text>
              <Text style={styles.warning}>
                This driver cannot be dispatched until the required step is resolved. Please review and take action.
              </Text>
            </Section>

            <Section style={styles.ctaSection}>
              <Button href={dashboardUrl} style={styles.button}>
                Review Checklist
              </Button>
            </Section>
          </Section>

          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>
              {tenantName} — DriveCommand Fleet Management
            </Text>
            <Text style={styles.footerSubtext}>
              This is an automated admin escalation. Please log in to resolve the blocked checklist.
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
    backgroundColor: '#dc2626',
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
    backgroundColor: '#dc2626',
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
  detail: {
    fontSize: '14px',
    margin: '0 0 4px',
    color: '#6b7280',
  },
  divider: {
    borderColor: '#e5e7eb',
    margin: '16px 0',
  },
  blockedInfo: {
    fontSize: '14px',
    margin: '8px 0',
    color: '#374151',
  },
  warning: {
    fontSize: '13px',
    margin: '16px 0 0',
    padding: '12px',
    backgroundColor: '#fef2f2',
    borderLeft: '4px solid #dc2626',
    borderRadius: '4px',
    color: '#991b1b',
  },
  ctaSection: {
    textAlign: 'center' as const,
    marginTop: '32px',
  },
  button: {
    backgroundColor: '#dc2626',
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
