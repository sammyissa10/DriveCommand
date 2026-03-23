import { useEffect, useState, Fragment } from 'react'
import { View, StyleSheet } from 'react-native'
import { Tabs } from 'expo-router'
import { House, Truck, Clock, MessageSquare, FileText } from 'lucide-react-native'
import { useAuthContext } from '../../context/AuthContext'
import { driverApi } from '@drivecommand/api-client'
import { useBackgroundGPS } from '../../hooks/useBackgroundGPS'
import { kvStorage } from '../../lib/storage'
import { NotificationPermissionModal, shouldShowNotificationModal } from '../../components/shared/NotificationPermissionModal'
import type { HOSStatus } from '@drivecommand/types'

/**
 * Small colored dot indicating background GPS status.
 * Positioned as a custom tab bar icon badge overlay.
 */
function GPSStatusDot({ status }: { status: 'active' | 'paused' | 'no-permission' | 'off' }) {
  const color = {
    active: '#22c55e',       // green — tracking
    paused: '#94a3b8',       // grey — user paused
    'no-permission': '#ef4444', // red — permission denied
    off: '#94a3b8',          // grey — not started
  }[status]

  return <View style={[styles.gpsDot, { backgroundColor: color }]} />
}

export default function DriverLayout() {
  const { token } = useAuthContext()
  const [hosStatus, setHOSStatus] = useState<HOSStatus | undefined>(undefined)
  const [showNotifModal, setShowNotifModal] = useState(false)

  // Show notification permission modal on first login
  useEffect(() => {
    if (shouldShowNotificationModal()) {
      // Small delay so the driver dashboard is visible before the modal appears
      const timer = setTimeout(() => setShowNotifModal(true), 1200)
      return () => clearTimeout(timer)
    }
  }, [])

  // Fetch HOS status + active load tracking token on mount
  useEffect(() => {
    if (!token) return

    // HOS status calibrates GPS update interval
    driverApi.getHOS(token)
      .then((data) => setHOSStatus(data.currentStatus))
      .catch(() => { /* HOS fetch is best-effort — GPS still starts with default interval */ })

    // Store active load tracking token for GPS reports (supplementary context)
    driverApi.getTrackingToken(token)
      .then(({ trackingToken }) => {
        if (trackingToken) {
          kvStorage.setString('gps_tracking_token', trackingToken)
        }
      })
      .catch(() => { /* Best-effort — GPS works without tracking token */ })
  }, [token])

  const { gpsStatus } = useBackgroundGPS(hosStatus)

  return (
    <Fragment>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: {
            backgroundColor: '#1e293b',
            borderTopColor: '#334155',
            height: 64,
            paddingBottom: 8,
          },
          tabBarActiveTintColor: '#0ea5e9',
          tabBarInactiveTintColor: '#64748b',
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarIcon: ({ color }) => (
              <View style={styles.iconWrapper}>
                <House color={color} size={24} />
                {/* GPS status dot overlaid on the home tab icon */}
                <GPSStatusDot status={gpsStatus} />
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="loads"
          options={{ tabBarIcon: ({ color }) => <Truck color={color} size={24} /> }}
        />
        <Tabs.Screen
          name="hos"
          options={{ tabBarIcon: ({ color }) => <Clock color={color} size={24} /> }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            tabBarIcon: ({ color }) => (
              // Badge overlay for unread count — implemented in Phase 34
              <MessageSquare color={color} size={24} />
            ),
          }}
        />
        <Tabs.Screen
          name="documents"
          options={{ tabBarIcon: ({ color }) => <FileText color={color} size={24} /> }}
        />
      </Tabs>

      {/* Notification permission modal — shown on first login */}
      <NotificationPermissionModal
        visible={showNotifModal}
        onDismiss={() => setShowNotifModal(false)}
      />
    </Fragment>
  )
}

const styles = StyleSheet.create({
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gpsDot: {
    position: 'absolute',
    top: -4,
    right: -8,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
})
