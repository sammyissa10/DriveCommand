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

export interface ClientShipmentUpdateEmailProps {
  status: 'picked_up' | 'delivered';
  loadNumber: string;
  companyName: string;
  facilityName: string;
  timestamp: string;
  driverName: string;
  truckUnitNumber: string;
  referenceNumbers: string;
  commodity?: string;
  estimatedDelivery?: string;
  podNote?: string;
  portalUrl?: string;
}

export function ClientShipmentUpdateEmail({
  status,
  loadNumber,
  companyName,
  facilityName,
  timestamp,
  driverName,
  truckUnitNumber,
  referenceNumbers,
  commodity,
  estimatedDelivery,
  podNote,
  portalUrl,
}: ClientShipmentUpdateEmailProps) {
  const isPickup = status === 'picked_up';
  const greeting = isPickup ? 'Shipment Picked Up' : 'Shipment Delivered';
  const message = isPickup
    ? 'Your shipment has been picked up and is now in transit. We will notify you upon delivery.'
    : 'Your shipment has been successfully delivered. Thank you for your business.';

  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.headerText}>DriveCommand - {companyName}</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.greeting}>{greeting}</Text>
            <Text style={styles.message}>{message}</Text>

            <Section style={styles.detailsBox}>
              <Text style={styles.detailRow}>
                <strong>Load Number:</strong> {loadNumber}
              </Text>
              {referenceNumbers && (
                <Text style={styles.detailRow}>
                  <strong>Reference Numbers:</strong> {referenceNumbers}
                </Text>
              )}
              {commodity && (
                <Text style={styles.detailRow}>
                  <strong>Commodity:</strong> {commodity}
                </Text>
              )}
              <Text style={styles.detailRow}>
                <strong>{isPickup ? 'Picked Up From' : 'Delivered To'}:</strong> {facilityName}
              </Text>
              <Text style={styles.detailRow}>
                <strong>{isPickup ? 'Pickup Time' : 'Delivery Time'}:</strong> {timestamp}
              </Text>
              <Text style={styles.detailRow}>
                <strong>Driver:</strong> {driverName}
              </Text>
              <Text style={styles.detailRow}>
                <strong>Truck Unit:</strong> {truckUnitNumber}
              </Text>
              {isPickup && estimatedDelivery && (
                <Text style={styles.detailRow}>
                  <strong>Estimated Delivery:</strong> {estimatedDelivery}
                </Text>
              )}
              {!isPickup && podNote && (
                <Text style={styles.detailRow}>
                  <strong>Proof of Delivery:</strong> {podNote}
                </Text>
              )}
            </Section>

            {portalUrl && (
              <Section style={styles.ctaSection}>
                <Button href={portalUrl} style={styles.button}>
                  Track Shipment
                </Button>
              </Section>
            )}
          </Section>

          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>DriveCommand - Fleet Management</Text>
            <Text style={styles.footerSubtext}>
              This is an automated shipment notification from {companyName}.
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
