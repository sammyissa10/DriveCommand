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

interface MaintenanceReminderEmailProps {
  truckName: string;
  serviceType: string;
  dueDate: string;
  dueMileage: number | null;
  currentMileage: number;
  milesRemaining: number | null;
  dashboardUrl: string;
}

export function MaintenanceReminderEmail({
  truckName,
  serviceType,
  dueDate,
  dueMileage,
  currentMileage,
  milesRemaining,
  dashboardUrl,
}: MaintenanceReminderEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.headerText}>Maintenance Reminder</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.greeting}>Hello,</Text>
            <Text style={styles.message}>
              This is a reminder that scheduled maintenance is coming up for your truck:
            </Text>

            <Section style={styles.card}>
              <Text style={styles.truckName}>{truckName}</Text>
              <Text style={styles.serviceType}>Service Type: {serviceType}</Text>

              <Hr style={styles.divider} />

              <Text style={styles.dueInfo}>Due Date: <strong>{dueDate}</strong></Text>
              {dueMileage !== null && (
                <Text style={styles.dueInfo}>
                  Due Mileage: <strong>{dueMileage.toLocaleString()} miles</strong>
                </Text>
              )}

              <Text style={styles.currentInfo}>
                Current Mileage: {currentMileage.toLocaleString()} miles
              </Text>
              {milesRemaining !== null && (
                <Text style={styles.milesRemaining}>
                  {milesRemaining > 0
                    ? `${milesRemaining.toLocaleString()} miles remaining`
                    : 'Overdue by mileage'}
                </Text>
              )}
            </Section>

            <Section style={styles.ctaSection}>
              <Button href={dashboardUrl} style={styles.button}>
                View Dashboard
              </Button>
            </Section>
          </Section>

          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>
              DriveCommand - Fleet Management
            </Text>
            <Text style={styles.footerSubtext}>
              This is an automated reminder. Please log in to manage your maintenance schedule.
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
  },
  truckName: {
    fontSize: '18px',
    fontWeight: 'bold',
    margin: '0 0 8px',
    color: '#111827',
  },
  serviceType: {
    fontSize: '14px',
    margin: '0 0 16px',
    color: '#6b7280',
  },
  divider: {
    borderColor: '#e5e7eb',
    margin: '16px 0',
  },
  dueInfo: {
    fontSize: '14px',
    margin: '8px 0',
    color: '#dc2626',
  },
  currentInfo: {
    fontSize: '14px',
    margin: '8px 0',
    color: '#6b7280',
  },
  milesRemaining: {
    fontSize: '14px',
    margin: '8px 0',
    fontWeight: 'bold',
    color: '#059669',
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
