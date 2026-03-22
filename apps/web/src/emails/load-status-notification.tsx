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

export interface LoadStatusNotificationEmailProps {
  customerName: string;
  loadNumber: string;
  status: string;
  origin: string;
  destination: string;
  driverName: string;
  truckInfo: string;
  estimatedDelivery?: string;
  trackingUrl: string;
}

export function LoadStatusNotificationEmail({
  customerName,
  loadNumber,
  status,
  origin,
  destination,
  driverName,
  truckInfo,
  estimatedDelivery,
  trackingUrl,
}: LoadStatusNotificationEmailProps) {
  const statusConfig: Record<string, { message: string; headerColor: string }> = {
    DISPATCHED: { message: 'Your load has been dispatched', headerColor: '#1e40af' },
    PICKED_UP: { message: 'Your load has been picked up', headerColor: '#1e40af' },
    IN_TRANSIT: { message: 'Your load is in transit', headerColor: '#1e40af' },
    DELIVERED: { message: 'Your load has been delivered', headerColor: '#059669' },
  };

  const config = statusConfig[status] || { message: `Your load status: ${status}`, headerColor: '#1e40af' };

  const statusLabels: Record<string, string> = {
    DISPATCHED: 'Dispatched',
    PICKED_UP: 'Picked Up',
    IN_TRANSIT: 'In Transit',
    DELIVERED: 'Delivered',
  };
  const statusLabel = statusLabels[status] || status;

  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={{ ...styles.header, backgroundColor: config.headerColor }}>
            <Text style={styles.headerText}>{config.message}</Text>
          </Section>

          <Section style={styles.content}>
            <Text style={styles.greeting}>Hello, {customerName}</Text>
            <Text style={styles.message}>
              We want to keep you informed about your shipment. Here is the latest status update for load{' '}
              <strong>{loadNumber}</strong>:
            </Text>

            <Section style={styles.card}>
              <Text style={styles.statusBadgeText}>{statusLabel}</Text>

              <Hr style={styles.divider} />

              <Text style={styles.detailRow}>
                <strong>Load #:</strong> {loadNumber}
              </Text>
              <Text style={styles.detailRow}>
                <strong>Origin:</strong> {origin}
              </Text>
              <Text style={styles.detailRow}>
                <strong>Destination:</strong> {destination}
              </Text>
              <Text style={styles.detailRow}>
                <strong>Driver:</strong> {driverName}
              </Text>
              <Text style={styles.detailRow}>
                <strong>Truck:</strong> {truckInfo}
              </Text>
              {estimatedDelivery && (
                <Text style={styles.detailRow}>
                  <strong>Estimated Delivery:</strong> {estimatedDelivery}
                </Text>
              )}
            </Section>

            <Section style={styles.ctaSection}>
              <Button href={trackingUrl} style={styles.button}>
                Track Load
              </Button>
            </Section>
          </Section>

          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>DriveCommand - Fleet Management</Text>
            <Text style={styles.footerSubtext}>
              This is an automated notification about your shipment.
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
  statusBadgeText: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#1e40af',
    margin: '0 0 12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  detailRow: {
    fontSize: '14px',
    margin: '6px 0',
    color: '#374151',
  },
  divider: {
    borderColor: '#e5e7eb',
    margin: '16px 0',
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
