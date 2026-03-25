import React from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native'
import { useRouter } from 'expo-router'
import { X, MessageSquare, Package } from 'lucide-react-native'
import type { MapVehicle } from '@drivecommand/api-client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(isoString: string | null): string {
  if (!isoString) return 'Unknown'
  const diffMs = Date.now() - new Date(isoString).getTime()
  if (diffMs < 60_000) return 'just now'
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return `${Math.floor(diffHr / 24)}d ago`
}

function formatSpeed(speedKmh: number): string {
  // Convert km/h → mph
  const mph = speedKmh * 0.621371
  return `${mph.toFixed(0)} mph`
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<MapVehicle['status'], string> = {
  MOVING: '#22c55e',
  IDLE: '#f59e0b',
  OFFLINE: '#64748b',
}

const STATUS_BG: Record<MapVehicle['status'], string> = {
  MOVING: '#14532d',
  IDLE: '#451a03',
  OFFLINE: '#1e293b',
}

function StatusBadge({ status }: { status: MapVehicle['status'] }) {
  return (
    <View style={[styles.badge, { backgroundColor: STATUS_BG[status] }]}>
      <View style={[styles.badgeDot, { backgroundColor: STATUS_COLORS[status] }]} />
      <Text style={[styles.badgeText, { color: STATUS_COLORS[status] }]}>
        {status}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface VehicleDetailSheetProps {
  vehicle: MapVehicle | null
  visible: boolean
  onClose: () => void
}

export default function VehicleDetailSheet({
  vehicle,
  visible,
  onClose,
}: VehicleDetailSheetProps) {
  const router = useRouter()

  if (!vehicle) return null

  const handleViewLoad = () => {
    // Navigate to owner loads tab — pass loadNumber as param if available
    onClose()
    router.push('/(owner)/loads' as any)
  }

  const handleMessageDriver = () => {
    onClose()
    router.push({
      pathname: '/(owner)/fleet' as any,
      params: { driverId: vehicle.driverId ?? '' },
    })
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Backdrop — tap to close */}
      <Pressable style={styles.backdrop} onPress={onClose} />

      {/* Sheet */}
      <View style={styles.sheet}>
        {/* Handle bar */}
        <View style={styles.handle} />

        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.truckName} numberOfLines={1}>
              {vehicle.truckName}
            </Text>
            <StatusBadge status={vehicle.status} />
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>

        {/* Driver & Load info */}
        <View style={styles.infoSection}>
          <Text style={styles.infoLabel}>Driver</Text>
          <Text style={styles.infoValue}>
            {vehicle.driverName ?? 'Unassigned'}
          </Text>
        </View>
        <View style={styles.infoSection}>
          <Text style={styles.infoLabel}>Active Load</Text>
          <Text style={styles.infoValue}>
            {vehicle.loadNumber ? `#${vehicle.loadNumber}` : 'No active load'}
          </Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Stats grid (2x2) */}
        <View style={styles.statsGrid}>
          <StatTile label="Speed" value={formatSpeed(vehicle.speed)} />
          <StatTile label="Last Ping" value={timeAgo(vehicle.lastPingAt)} />
          <StatTile label="Odometer" value="N/A" />
          <StatTile label="Fuel" value="N/A" />
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          {vehicle.loadNumber && (
            <TouchableOpacity style={styles.btnPrimary} onPress={handleViewLoad}>
              <Package size={16} color="#0f172a" />
              <Text style={styles.btnPrimaryText}>View Load</Text>
            </TouchableOpacity>
          )}
          {vehicle.driverId && (
            <TouchableOpacity style={styles.btnSecondary} onPress={handleMessageDriver}>
              <MessageSquare size={16} color="#38bdf8" />
              <Text style={styles.btnSecondaryText}>Message Driver</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 8,
    // Ensure sheet stays at the bottom
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    // Shadow on iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 16,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#475569',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    gap: 6,
  },
  truckName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
    marginRight: 12,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#334155',
    borderRadius: 16,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 5,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 13,
    color: '#94a3b8',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  divider: {
    height: 1,
    backgroundColor: '#334155',
    marginVertical: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  statTile: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#38bdf8',
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1e3a5f',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#38bdf8',
  },
})
