import { useEffect, useState, Fragment, useCallback } from 'react'
import { View, Text, StyleSheet, AppState } from 'react-native'
import { Tabs } from 'expo-router'
import { House, Truck, Clock, MessageSquare, FileText } from 'lucide-react-native'
import { useAuthContext } from '../../context/AuthContext'
import { driverApi } from '@drivecommand/api-client'
import { useBackgroundGPS } from '../../hooks/useBackgroundGPS'
import { useOfflineSync } from '../../hooks/useOfflineSync'
import { kvStorage } from '../../lib/storage'
import { NotificationPermissionModal, shouldShowNotificationModal } from '../../components/shared/NotificationPermissionModal'
import { SyncStatusBar } from '../../components/shared/SyncStatusBar'
import { AppHeader } from '../../components/shared/AppHeader'
import { haptic } from '../../lib/haptics'
import type { HOSStatus } from '@drivecommand/types'

const LAST_READ_KEY = 'messages_last_read_at'
const UNREAD_POLL_INTERVAL_MS = 30_000

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

/**
 * Unread badge overlay for the Messages tab icon.
 */
function MessageTabIcon({ color, unreadCount }: { color: string; unreadCount: number }) {
  return (
    <View style={styles.iconWrapper}>
      <MessageSquare color={color} size={24} />
      {unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>
            {unreadCount > 99 ? '99+' : String(unreadCount)}
          </Text>
        </View>
      )}
    </View>
  )
}

export default function DriverLayout() {
  const { token } = useAuthContext()
  const [hosStatus, setHOSStatus] = useState<HOSStatus | undefined>(undefined)
  const [showNotifModal, setShowNotifModal] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [hasActiveLoad, setHasActiveLoad] = useState(false)

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

    // Store active load tracking token + detect whether driver has an active load
    driverApi.getTrackingToken(token)
      .then(({ trackingToken }) => {
        if (trackingToken) {
          kvStorage.setString('gps_tracking_token', trackingToken)
          setHasActiveLoad(true)
        } else {
          setHasActiveLoad(false)
        }
      })
      .catch(() => { /* Best-effort */ })
  }, [token])

  // Fetch unread count — uses lastReadAt from MMKV as the `since` parameter
  const fetchUnreadCount = useCallback(async () => {
    if (!token) return
    const since = kvStorage.getString(LAST_READ_KEY) ?? undefined
    try {
      const { count } = await driverApi.getUnreadCount(token, since)
      setUnreadCount(count)
    } catch {
      // Best-effort — don't disrupt navigation if this fails
    }
  }, [token])

  // Initial unread count fetch
  useEffect(() => {
    fetchUnreadCount()
  }, [fetchUnreadCount])

  // Poll unread count every 30s
  useEffect(() => {
    const timer = setInterval(fetchUnreadCount, UNREAD_POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [fetchUnreadCount])

  // Refresh unread count when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        fetchUnreadCount()
      }
    })
    return () => sub.remove()
  }, [fetchUnreadCount])

  const { gpsStatus } = useBackgroundGPS(hosStatus, hasActiveLoad)
  const { isOnline, isSyncing, pendingCount, failedCount, retryFailed } = useOfflineSync()

  return (
    <Fragment>
      {/* Persistent top bar — company name + account avatar */}
      <AppHeader />
      {/* Sync status bar — visible only when offline or syncing */}
      <SyncStatusBar
        isOnline={isOnline}
        isSyncing={isSyncing}
        pendingCount={pendingCount}
        failedCount={failedCount}
        onRetryFailed={retryFailed}
      />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '500',
            marginTop: 2,
            marginBottom: 0,
          },
          tabBarStyle: {
            backgroundColor: '#1e293b',
            borderTopColor: '#334155',
            height: 72,
            paddingBottom: 10,
            paddingTop: 6,
          },
          tabBarItemStyle: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 0,
          },
          tabBarActiveTintColor: '#0ea5e9',
          tabBarInactiveTintColor: '#64748b',
        }}
      >
        <Tabs.Screen
          name="loads"
          options={{
            tabBarLabel: 'Loads',
            tabBarIcon: ({ color }) => <Truck color={color} size={24} />,
            tabBarButtonTestID: 'tab-loads',
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        <Tabs.Screen
          name="hos"
          options={{
            tabBarLabel: 'HOS',
            tabBarIcon: ({ color }) => <Clock color={color} size={24} />,
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        {/* Home/Dashboard — center tab */}
        <Tabs.Screen
          name="index"
          options={{
            tabBarLabel: 'Home',
            tabBarIcon: ({ color }) => (
              <View style={styles.iconWrapper}>
                <House color={color} size={24} />
                {/* GPS status dot overlaid on the home tab icon */}
                <GPSStatusDot status={gpsStatus} />
              </View>
            ),
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            tabBarLabel: 'Messages',
            tabBarIcon: ({ color }) => (
              <MessageTabIcon color={color} unreadCount={unreadCount} />
            ),
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        <Tabs.Screen
          name="documents"
          options={{
            tabBarLabel: 'Docs',
            tabBarIcon: ({ color }) => <FileText color={color} size={24} />,
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />
        {/* Hidden routes — href: null removes from tab bar entirely with no gap */}
        <Tabs.Screen name="incidents" options={{ href: null }} />
        <Tabs.Screen name="loads/index" options={{ href: null }} />
        <Tabs.Screen name="loads/[id]" options={{ href: null }} />
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
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -8,
    backgroundColor: '#ef4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
  },
})
