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

export interface DispatchAssignedEmailProps {
  dispatchNumber: string;
  scheduledDeparture: string;
  stopCount: number;
  truckUnitNumber: string;
  driverPortalUrl: string;
  companyName: string;
}

export function DispatchAssignedEmail({
  dispatchNumber,
  scheduledDeparture,
  stopCount,
  truckUnitNumber,
  driverPortalUrl,
  companyName,
}: DispatchAssignedEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.headerText}>DriveCommand - {companyName}</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.greeting}>New Dispatch Assigned</Text>
            <Text style={styles.message}>
              You have been assigned a new dispatch. Please review the details below and
              log in to the driver portal to view your full itinerary.
            </Text>

            <Section style={styles.detailsBox}>
              <Text style={styles.detailRow}>
                <strong>Dispatch Number:</strong> {dispatchNumber}
              </Text>
              <Text style={styles.detailRow}>
                <strong>Scheduled Departure:</strong> {scheduledDeparture}
              </Text>
              <Text style={styles.detailRow}>
                <strong>Total Stops:</strong> {stopCount}
              </Text>
              <Text style={styles.detailRow}>
                <strong>Truck Unit:</strong> {truckUnitNumber}
              </Text>
            </Section>

            <Section style={styles.ctaSection}>
              <Button href={driverPortalUrl} style={styles.button}>
                View Dispatch
              </Button>
            </Section>
          </Section>

          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>DriveCommand - Fleet Management</Text>
            <Text style={styles.footerSubtext}>
              This is an automated notification from {companyName}.
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
