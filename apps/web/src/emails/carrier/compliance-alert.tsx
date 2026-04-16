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

export interface ComplianceAlertItem {
  type: string;
  message: string;
  severity: 'critical' | 'warning';
  link: string;
}

export interface ComplianceAlertEmailProps {
  companyName: string;
  alerts: ComplianceAlertItem[];
  dashboardUrl: string;
}

export function ComplianceAlertEmail({
  companyName,
  alerts,
  dashboardUrl,
}: ComplianceAlertEmailProps) {
  const criticalAlerts = alerts.filter((a) => a.severity === 'critical');
  const warningAlerts = alerts.filter((a) => a.severity === 'warning');

  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.headerText}>DriveCommand - {companyName}</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.greeting}>
              {alerts.length} Compliance Alert{alerts.length !== 1 ? 's' : ''} Require
              Attention
            </Text>
            <Text style={styles.message}>
              The following compliance items require your immediate review. Please take
              action before any items expire.
            </Text>

            {criticalAlerts.length > 0 && (
              <Section style={styles.alertGroup}>
                <Text style={styles.alertGroupHeader}>
                  Critical ({criticalAlerts.length})
                </Text>
                {criticalAlerts.map((alert, i) => (
                  <Section key={i} style={styles.criticalAlert}>
                    <Text style={styles.alertMessage}>{alert.message}</Text>
                  </Section>
                ))}
              </Section>
            )}

            {warningAlerts.length > 0 && (
              <Section style={styles.alertGroup}>
                <Text style={styles.alertGroupHeader}>
                  Warnings ({warningAlerts.length})
                </Text>
                {warningAlerts.map((alert, i) => (
                  <Section key={i} style={styles.warningAlert}>
                    <Text style={styles.alertMessage}>{alert.message}</Text>
                  </Section>
                ))}
              </Section>
            )}

            <Section style={styles.ctaSection}>
              <Button href={dashboardUrl} style={styles.button}>
                View Compliance Dashboard
              </Button>
            </Section>
          </Section>

          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>DriveCommand - Fleet Management</Text>
            <Text style={styles.footerSubtext}>
              This is an automated daily compliance report from {companyName}.
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
  alertGroup: {
    marginBottom: '20px',
  },
  alertGroupHeader: {
    fontSize: '14px',
    fontWeight: 'bold',
    margin: '0 0 8px',
    color: '#374151',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  criticalAlert: {
    backgroundColor: '#fef2f2',
    borderLeft: '4px solid #dc2626',
    padding: '10px 12px',
    marginBottom: '8px',
    borderRadius: '0 4px 4px 0',
  },
  warningAlert: {
    backgroundColor: '#fffbeb',
    borderLeft: '4px solid #d97706',
    padding: '10px 12px',
    marginBottom: '8px',
    borderRadius: '0 4px 4px 0',
  },
  alertMessage: {
    fontSize: '13px',
    lineHeight: '20px',
    margin: '0',
    color: '#374151',
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
