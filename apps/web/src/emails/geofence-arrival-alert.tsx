import {
  Html, Head, Body, Container, Section, Text, Button, Hr,
} from '@react-email/components';

export interface GeofenceArrivalAlertProps {
  loadNumber: string;
  stopType: 'pickup' | 'delivery';
  stopAddress: string;
  driverName: string;
  licensePlate: string;
  loadUrl: string;
}

export function GeofenceArrivalAlert({
  loadNumber,
  stopType,
  stopAddress,
  driverName,
  licensePlate,
  loadUrl,
}: GeofenceArrivalAlertProps) {
  const isPickup = stopType === 'pickup';
  const headerColor = isPickup ? '#1e40af' : '#059669';
  const stopLabel = isPickup ? 'Pickup Location' : 'Delivery Location';
  const headline = isPickup
    ? `Truck arrived at pickup — Load ${loadNumber}`
    : `Truck arrived at delivery — Load ${loadNumber}`;

  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ margin: '0 auto', padding: '20px 0', maxWidth: '600px' }}>
          <Section style={{ backgroundColor: headerColor, padding: '20px', borderRadius: '8px 8px 0 0' }}>
            <Text style={{ color: '#ffffff', fontSize: '22px', fontWeight: 'bold', margin: 0, textAlign: 'center' as const }}>
              {headline}
            </Text>
          </Section>

          <Section style={{ backgroundColor: '#ffffff', padding: '32px', borderRadius: '0 0 8px 8px' }}>
            <Text style={{ fontSize: '14px', color: '#374151', margin: '0 0 24px' }}>
              GPS geofencing detected the truck entering the {stopType} zone.
              The load status has been automatically updated.
            </Text>

            <Section style={{ backgroundColor: '#f9fafb', padding: '20px', borderRadius: '6px', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
              <Text style={{ fontSize: '14px', margin: '6px 0', color: '#374151' }}>
                <strong>Load #:</strong> {loadNumber}
              </Text>
              <Hr style={{ borderColor: '#e5e7eb', margin: '12px 0' }} />
              <Text style={{ fontSize: '14px', margin: '6px 0', color: '#374151' }}>
                <strong>{stopLabel}:</strong> {stopAddress}
              </Text>
              <Text style={{ fontSize: '14px', margin: '6px 0', color: '#374151' }}>
                <strong>Driver:</strong> {driverName}
              </Text>
              <Text style={{ fontSize: '14px', margin: '6px 0', color: '#374151' }}>
                <strong>Truck:</strong> {licensePlate}
              </Text>
            </Section>

            <Section style={{ textAlign: 'center' as const }}>
              <Button
                href={loadUrl}
                style={{ backgroundColor: headerColor, color: '#ffffff', padding: '12px 32px', borderRadius: '6px', fontSize: '15px', fontWeight: 'bold', textDecoration: 'none', display: 'inline-block' }}
              >
                View Load
              </Button>
            </Section>
          </Section>

          <Section style={{ marginTop: '24px' }}>
            <Text style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: 0 }}>
              DriveCommand — Automated Geofence Alert
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
