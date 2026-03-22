import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

export interface RateConfirmationData {
  loadNumber: string;
  origin: string;
  destination: string;
  pickupDate: string;
  deliveryDate?: string;
  commodity?: string;
  rate: string;
  driverName: string;
  truckInfo: string;
  customerName: string;
  customerEmail?: string;
  documentDate: string;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingTop: 40,
    paddingBottom: 40,
    paddingHorizontal: 50,
    color: '#1a1a2e',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#1e40af',
    borderBottomStyle: 'solid',
  },
  companyName: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: '#1e40af',
  },
  docTitleBlock: {
    alignItems: 'flex-end',
  },
  docTitle: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#1e40af',
    textAlign: 'right',
  },
  docMeta: {
    fontSize: 9,
    color: '#6b7280',
    marginTop: 3,
    textAlign: 'right',
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1e40af',
    backgroundColor: '#f0f4ff',
    padding: 6,
    paddingLeft: 10,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
    paddingHorizontal: 10,
  },
  label: {
    fontSize: 10,
    color: '#6b7280',
    width: 130,
    fontFamily: 'Helvetica-Bold',
  },
  value: {
    fontSize: 10,
    color: '#1a1a2e',
    flex: 1,
  },
  rateSection: {
    marginBottom: 16,
    backgroundColor: '#f0f4ff',
    padding: 14,
    borderRadius: 4,
  },
  rateSectionHeader: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1e40af',
    marginBottom: 10,
  },
  rateAmount: {
    fontSize: 26,
    fontFamily: 'Helvetica-Bold',
    color: '#1e40af',
  },
  rateLabel: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 3,
  },
  termsSection: {
    marginBottom: 20,
  },
  termsHeader: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#1e40af',
    backgroundColor: '#f0f4ff',
    padding: 6,
    paddingLeft: 10,
    marginBottom: 8,
  },
  termsText: {
    fontSize: 9,
    color: '#4b5563',
    lineHeight: 1.6,
    paddingHorizontal: 10,
  },
  signaturesSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    borderTopStyle: 'solid',
  },
  signatureBlock: {
    width: '44%',
  },
  signatureLine: {
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
    borderBottomStyle: 'solid',
    marginBottom: 4,
    paddingBottom: 24,
  },
  signatureLabel: {
    fontSize: 9,
    color: '#6b7280',
    fontFamily: 'Helvetica-Bold',
  },
  signatureDateRow: {
    flexDirection: 'row',
    marginTop: 10,
    alignItems: 'center',
  },
  signatureDateLabel: {
    fontSize: 9,
    color: '#6b7280',
    fontFamily: 'Helvetica-Bold',
    width: 35,
  },
  signatureDateLine: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
    borderBottomStyle: 'solid',
    paddingBottom: 10,
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 50,
    right: 50,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    borderTopStyle: 'solid',
    paddingTop: 8,
  },
});

export function RateConfirmationDocument({ data }: { data: RateConfirmationData }) {
  return (
    <Document
      title={`Rate Confirmation - ${data.loadNumber}`}
      author="DriveCommand"
      subject="Rate Confirmation"
    >
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>DriveCommand</Text>
          <View style={styles.docTitleBlock}>
            <Text style={styles.docTitle}>Rate Confirmation</Text>
            <Text style={styles.docMeta}>Document Date: {data.documentDate}</Text>
            <Text style={styles.docMeta}>Reference: {data.loadNumber}</Text>
          </View>
        </View>

        {/* Load Details */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Load Details</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Load Number:</Text>
            <Text style={styles.value}>{data.loadNumber}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Origin:</Text>
            <Text style={styles.value}>{data.origin}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Destination:</Text>
            <Text style={styles.value}>{data.destination}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Pickup Date:</Text>
            <Text style={styles.value}>{data.pickupDate}</Text>
          </View>
          {data.deliveryDate && (
            <View style={styles.row}>
              <Text style={styles.label}>Delivery Date:</Text>
              <Text style={styles.value}>{data.deliveryDate}</Text>
            </View>
          )}
          {data.commodity && (
            <View style={styles.row}>
              <Text style={styles.label}>Commodity:</Text>
              <Text style={styles.value}>{data.commodity}</Text>
            </View>
          )}
        </View>

        {/* Rate */}
        <View style={styles.rateSection}>
          <Text style={styles.rateSectionHeader}>Agreed Rate</Text>
          <Text style={styles.rateAmount}>${data.rate}</Text>
          <Text style={styles.rateLabel}>All-inclusive rate (USD)</Text>
        </View>

        {/* Carrier Info */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Carrier Information</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Driver:</Text>
            <Text style={styles.value}>{data.driverName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Truck:</Text>
            <Text style={styles.value}>{data.truckInfo}</Text>
          </View>
        </View>

        {/* Customer / Shipper Info */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Shipper / Broker Information</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Company:</Text>
            <Text style={styles.value}>{data.customerName}</Text>
          </View>
          {data.customerEmail && (
            <View style={styles.row}>
              <Text style={styles.label}>Email:</Text>
              <Text style={styles.value}>{data.customerEmail}</Text>
            </View>
          )}
        </View>

        {/* Terms */}
        <View style={styles.termsSection}>
          <Text style={styles.termsHeader}>Terms &amp; Conditions</Text>
          <Text style={styles.termsText}>
            Carrier agrees to transport the above-described freight under the terms and conditions
            set forth herein. By accepting this rate confirmation, Carrier confirms its agreement
            to transport the load at the rate stated above.{'\n\n'}
            Payment Terms: Net 30 days from delivery date and receipt of required documentation
            (signed BOL, POD, and any applicable accessorial receipts).{'\n\n'}
            Carrier is responsible for loading, securing, and delivering freight in good condition.
            Carrier assumes full liability for cargo loss or damage in accordance with applicable
            law and carrier-broker agreement.{'\n\n'}
            This rate confirmation constitutes a binding agreement between the parties named above.
            Any changes to the agreed rate must be confirmed in writing prior to load pickup.
          </Text>
        </View>

        {/* Signature Lines */}
        <View style={styles.signaturesSection}>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Carrier Signature</Text>
            <View style={styles.signatureDateRow}>
              <Text style={styles.signatureDateLabel}>Date:</Text>
              <View style={styles.signatureDateLine} />
            </View>
          </View>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Shipper / Broker Signature</Text>
            <View style={styles.signatureDateRow}>
              <Text style={styles.signatureDateLabel}>Date:</Text>
              <View style={styles.signatureDateLine} />
            </View>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Generated by DriveCommand — {data.documentDate} — {data.loadNumber}
        </Text>
      </Page>
    </Document>
  );
}
