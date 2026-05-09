import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Package, MapPin, Fuel, Check } from 'lucide-react-native'
import { useThemeColors } from '@/constants/tokens'
import type { CarrierDispatchDetailStop } from '@drivecommand/api-client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StopListItemProps {
  stop: CarrierDispatchDetailStop
  isActive: boolean
  onPress: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAppointmentTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getStopTypeIcon(stopType: string, color: string) {
  switch (stopType.toLowerCase()) {
    case 'pickup':
      return <Package size={14} color={color} />
    case 'fuel':
      return <Fuel size={14} color={color} />
    case 'delivery':
    default:
      return <MapPin size={14} color={color} />
  }
}

function capitalizeStatus(status: string): string {
  if (!status) return ''
  return status.charAt(0).toUpperCase() + status.slice(1)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StopListItem({ stop, isActive, onPress }: StopListItemProps) {
  const c = useThemeColors()

  // Status badge colors
  const statusColors: Record<string, { bg: string; text: string }> = {
    pending: { bg: c.mutedBg, text: c.textTertiary },
    arrived: { bg: c.infoBg, text: c.info },
    completed: { bg: c.successBg, text: c.success },
    departed: { bg: c.successBg, text: c.success },
    skipped: { bg: c.dangerBg, text: c.danger },
  }
  const statusColor = statusColors[stop.status] ?? statusColors.pending

  // Document indicator
  const bolMissing = stop.bolRequired && !stop.bolUploaded
  const podMissing = stop.podRequired && !stop.podUploaded
  const hasRequiredDocs = stop.bolRequired || stop.podRequired
  const allDocsUploaded = hasRequiredDocs && !bolMissing && !podMissing

  const locationText = [stop.facility.city, stop.facility.state].filter(Boolean).join(', ')
  const typeIconColor = isActive ? c.brand : c.textTertiary

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${stop.stopType} at ${stop.facility.name}`}
      style={[
        styles.container,
        {
          backgroundColor: isActive ? 'rgba(14,165,233,0.06)' : c.surfaceCard,
          borderColor: isActive ? c.brand : c.border,
          borderLeftColor: isActive ? c.brand : c.border,
          borderLeftWidth: isActive ? 3 : 1,
        },
      ]}
    >
      {/* Sequence badge */}
      <View style={[styles.sequenceBadge, { backgroundColor: isActive ? c.brand : c.mutedBg }]}>
        <Text style={[styles.sequenceText, { color: isActive ? '#fff' : c.textTertiary }]}>
          {stop.sequenceOrder}
        </Text>
      </View>

      {/* Middle: facility info */}
      <View style={styles.infoColumn}>
        <View style={styles.nameRow}>
          {getStopTypeIcon(stop.stopType, typeIconColor)}
          <Text style={[styles.facilityName, { color: c.textPrimary }]} numberOfLines={1}>
            {stop.facility.name}
          </Text>
        </View>
        {locationText ? (
          <Text style={[styles.locationText, { color: c.textSecondary }]}>{locationText}</Text>
        ) : null}
        {stop.appointmentStart ? (
          <Text style={[styles.appointmentText, { color: c.textTertiary }]}>
            {formatAppointmentTime(stop.appointmentStart)}
          </Text>
        ) : null}
      </View>

      {/* Right: status badge + doc indicator */}
      <View style={styles.rightColumn}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor.text }]}>
            {capitalizeStatus(stop.status)}
          </Text>
        </View>
        <View style={styles.docIndicator}>
          {(bolMissing || podMissing) ? (
            <View style={[styles.docDot, { backgroundColor: c.danger }]} />
          ) : allDocsUploaded ? (
            <Check size={10} color={c.success} />
          ) : null}
        </View>
      </View>
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 10,
  },
  sequenceBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  sequenceText: {
    fontSize: 11,
    fontWeight: '700',
  },
  infoColumn: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  facilityName: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  locationText: {
    fontSize: 12,
    marginLeft: 19, // indent to align with facility name (icon 14 + gap 5)
  },
  appointmentText: {
    fontSize: 11,
    marginLeft: 19,
  },
  rightColumn: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  docIndicator: {
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})
