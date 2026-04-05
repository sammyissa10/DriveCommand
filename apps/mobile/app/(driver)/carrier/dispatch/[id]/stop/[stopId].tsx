import React from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native'
import * as Linking from 'expo-linking'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  Package,
  MapPin,
  Fuel,
  Phone,
  Camera,
  FileText,
  DollarSign,
} from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '@/context/AuthContext'
import { carrierDriverApi, type CarrierStopDocument } from '@drivecommand/api-client'
import { AnimatedScreen } from '@/components/ui/AnimatedScreen'
import { StopStatusButtons } from '@/components/carrier/StopStatusButtons'
import { useThemeColors } from '@/constants/tokens'
import { openNavigation } from '@/lib/navigation'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatStopTypeLabel(stopType: string): string {
  switch (stopType.toLowerCase()) {
    case 'pickup':
      return 'Pickup'
    case 'fuel':
      return 'Fuel Stop'
    case 'delivery':
    default:
      return 'Delivery'
  }
}

function getStopTypeIcon(stopType: string, color: string, size = 20) {
  switch (stopType.toLowerCase()) {
    case 'pickup':
      return <Package size={size} color={color} />
    case 'fuel':
      return <Fuel size={size} color={color} />
    case 'delivery':
    default:
      return <MapPin size={size} color={color} />
  }
}

function formatAppointmentWindow(start: string, end: string | null): string {
  const startDate = new Date(start)
  const dateStr = startDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  const startTime = startDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  if (!end) return `${dateStr} ${startTime}`
  const endTime = new Date(end).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${dateStr} ${startTime} - ${endTime}`
}

function formatDocDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionCard({ children }: { children: React.ReactNode }) {
  const c = useThemeColors()
  return (
    <View style={[styles.sectionCard, { backgroundColor: c.surfaceCard, borderColor: c.border }]}>
      {children}
    </View>
  )
}

function LabelValueRow({ label, value }: { label: string; value: string }) {
  const c = useThemeColors()
  return (
    <View style={styles.labelValueRow}>
      <Text style={[styles.labelText, { color: c.textTertiary }]}>{label}</Text>
      <Text style={[styles.valueText, { color: c.textPrimary }]}>{value}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function StopDetailScreen() {
  const c = useThemeColors()
  const { id, stopId } = useLocalSearchParams<{ id: string; stopId: string }>()
  const { token } = useAuthContext()
  const router = useRouter()

  const { data: dispatch } = useQuery({
    queryKey: ['carrier-dispatch', id],
    queryFn: () => carrierDriverApi.getDispatchDetail(token!, id),
    enabled: !!token && !!id,
  })

  const stop = dispatch?.stops.find((s) => s.id === stopId) ?? null

  if (!stop) {
    return (
      <AnimatedScreen>
        <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft size={22} color={c.textPrimary} />
            </Pressable>
          </View>
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { color: c.textSecondary }]}>Stop not found.</Text>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              style={[styles.backLinkButton, { borderColor: c.border }]}
            >
              <Text style={[styles.backLinkText, { color: c.brand }]}>Go Back</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </AnimatedScreen>
    )
  }

  const { facility } = stop
  const fullAddress = [
    facility.addressLine1,
    facility.city,
    facility.state,
    facility.zip,
  ]
    .filter(Boolean)
    .join(', ')

  const hasContactInfo = !!(stop.contactName || stop.contactPhone)

  const hasDetails = !!(
    stop.specialInstructions ||
    stop.bolNumber ||
    stop.podNumber ||
    stop.sealNumber ||
    stop.appointmentStart
  )

  const handleOpenMaps = () => {
    openNavigation(
      facility.latitude != null && facility.longitude != null
        ? { lat: facility.latitude, lng: facility.longitude, address: fullAddress }
        : { address: fullAddress }
    )
  }

  const handlePhoneCall = (phone: string) => {
    Linking.openURL(`tel:${phone}`)
  }

  const handleUploadDocument = () => {
    Alert.alert('Coming Soon', 'Document upload will be available soon.')
  }

  const handleLogExpense = () => {
    Alert.alert('Coming Soon', 'Expense logging will be available soon.')
  }

  return (
    <AnimatedScreen>
      <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={22} color={c.textPrimary} />
          </Pressable>
          <View style={styles.headerCenter}>
            {getStopTypeIcon(stop.stopType, c.brand, 18)}
            <Text style={[styles.stopTypeLabel, { color: c.textPrimary }]}>
              {formatStopTypeLabel(stop.stopType)}
            </Text>
            <View style={[styles.sequenceBadge, { backgroundColor: c.mutedBg }]}>
              <Text style={[styles.sequenceText, { color: c.textTertiary }]}>
                #{stop.sequenceOrder}
              </Text>
            </View>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Facility section */}
          <SectionCard>
            <Text style={[styles.facilityName, { color: c.textPrimary }]}>
              {facility.name}
            </Text>
            {fullAddress ? (
              <Text style={[styles.facilityAddress, { color: c.textSecondary }]}>
                {fullAddress}
              </Text>
            ) : null}

            {/* Open in Maps button */}
            {fullAddress ? (
              <Pressable
                onPress={handleOpenMaps}
                accessibilityRole="button"
                accessibilityLabel="Open in maps"
                style={[styles.mapsButton, { borderColor: c.brand }]}
              >
                <MapPin size={15} color={c.brand} />
                <Text style={[styles.mapsButtonText, { color: c.brand }]}>Open in Maps</Text>
              </Pressable>
            ) : null}
          </SectionCard>

          {/* Contact section */}
          {hasContactInfo && (
            <SectionCard>
              <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Contact</Text>
              {stop.contactName ? (
                <Text style={[styles.contactName, { color: c.textPrimary }]}>
                  {stop.contactName}
                </Text>
              ) : null}
              {stop.contactPhone ? (
                <Pressable
                  onPress={() => handlePhoneCall(stop.contactPhone!)}
                  accessibilityRole="button"
                  accessibilityLabel={`Call ${stop.contactPhone}`}
                  style={styles.phoneRow}
                >
                  <Phone size={14} color={c.brand} />
                  <Text style={[styles.phoneText, { color: c.brand }]}>{stop.contactPhone}</Text>
                </Pressable>
              ) : null}
            </SectionCard>
          )}

          {/* Details section */}
          {hasDetails && (
            <SectionCard>
              <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>Details</Text>
              {stop.appointmentStart ? (
                <LabelValueRow
                  label="Appointment"
                  value={formatAppointmentWindow(stop.appointmentStart, stop.appointmentEnd)}
                />
              ) : null}
              {stop.bolNumber ? (
                <LabelValueRow label="BOL #" value={stop.bolNumber} />
              ) : null}
              {stop.podNumber ? (
                <LabelValueRow label="POD #" value={stop.podNumber} />
              ) : null}
              {stop.sealNumber ? (
                <LabelValueRow label="Seal #" value={stop.sealNumber} />
              ) : null}
              {stop.specialInstructions ? (
                <View style={styles.instructionsRow}>
                  <Text style={[styles.labelText, { color: c.textTertiary }]}>Instructions</Text>
                  <Text style={[styles.instructionsText, { color: c.textPrimary }]}>
                    {stop.specialInstructions}
                  </Text>
                </View>
              ) : null}
            </SectionCard>
          )}

          {/* Status buttons */}
          {(stop.status === 'pending' || stop.status === 'arrived') && (
            <SectionCard>
              <StopStatusButtons
                stop={stop}
                token={token!}
                dispatchId={id}
                onSuccess={() => router.back()}
              />
            </SectionCard>
          )}

          {/* Documents section */}
          <SectionCard>
            <View style={styles.docSectionHeader}>
              <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>
                Documents
              </Text>
              <Text style={[styles.docCount, { color: c.textTertiary }]}>
                {stop.documents.length}
              </Text>
            </View>

            {stop.documents.length > 0 ? (
              <View style={styles.docList}>
                {stop.documents.map((doc: CarrierStopDocument) => (
                  <View
                    key={doc.id}
                    style={[styles.docRow, { borderTopColor: c.border }]}
                  >
                    <FileText size={14} color={c.textTertiary} />
                    <View style={styles.docInfo}>
                      <Text style={[styles.docFilename, { color: c.textPrimary }]} numberOfLines={1}>
                        {doc.filename}
                      </Text>
                      <Text style={[styles.docMeta, { color: c.textTertiary }]}>
                        {doc.documentType} · {formatDocDate(doc.createdAt)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Upload button */}
            <Pressable
              onPress={handleUploadDocument}
              accessibilityRole="button"
              accessibilityLabel="Upload document"
              style={[styles.outlinedButton, { borderColor: c.border, marginTop: stop.documents.length > 0 ? 10 : 0 }]}
            >
              <Camera size={16} color={c.textSecondary} />
              <Text style={[styles.outlinedButtonText, { color: c.textSecondary }]}>
                Upload Document
              </Text>
            </Pressable>
          </SectionCard>

          {/* Expense Log button */}
          <Pressable
            onPress={handleLogExpense}
            accessibilityRole="button"
            accessibilityLabel="Log expense"
            style={[styles.outlinedButton, styles.expenseButton, { borderColor: c.border }]}
          >
            <DollarSign size={16} color={c.textSecondary} />
            <Text style={[styles.outlinedButtonText, { color: c.textSecondary }]}>
              Log Expense
            </Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </AnimatedScreen>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stopTypeLabel: {
    fontSize: 18,
    fontWeight: '700',
  },
  sequenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  sequenceText: {
    fontSize: 12,
    fontWeight: '600',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 10,
  },
  sectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  facilityName: {
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  facilityAddress: {
    fontSize: 14,
    lineHeight: 20,
  },
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    marginTop: 4,
  },
  mapsButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '600',
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  phoneText: {
    fontSize: 15,
    fontWeight: '500',
  },
  labelValueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  labelText: {
    fontSize: 13,
    fontWeight: '500',
  },
  valueText: {
    fontSize: 13,
    flex: 1,
    textAlign: 'right',
  },
  instructionsRow: {
    gap: 4,
  },
  instructionsText: {
    fontSize: 13,
    lineHeight: 18,
  },
  docSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  docCount: {
    fontSize: 12,
    fontWeight: '600',
  },
  docList: {
    gap: 0,
  },
  docRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  docInfo: {
    flex: 1,
    gap: 2,
  },
  docFilename: {
    fontSize: 13,
    fontWeight: '500',
  },
  docMeta: {
    fontSize: 11,
  },
  outlinedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
  },
  outlinedButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  expenseButton: {
    marginHorizontal: 0,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  errorText: {
    fontSize: 15,
  },
  backLinkButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  backLinkText: {
    fontSize: 14,
    fontWeight: '600',
  },
})
