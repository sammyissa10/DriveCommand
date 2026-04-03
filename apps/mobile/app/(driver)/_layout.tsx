import React, { useEffect, useState, Fragment, useCallback } from 'react'
import { View, Text, StyleSheet, AppState } from 'react-native'
import { Tabs } from 'expo-router'
import Mapbox from '@rnmapbox/maps'
import Constants from 'expo-constants'

// Initialize Mapbox token before any MapView renders.
// Token is read from EXPO_PUBLIC_MAPBOX_TOKEN (dev) or app.json extra.mapboxToken (build).
Mapbox.setAccessToken(
  process.env.EXPO_PUBLIC_MAPBOX_TOKEN ??
  (Constants.expoConfig?.extra?.mapboxToken as string | undefined) ??
  ''
)
import { House, Truck, MessageSquare, Navigation, Grid2X2 } from 'lucide-react-native'
import { useAuthContext } from '../../context/AuthContext'
import { driverApi } from '@drivecommand/api-client'
import { useBackgroundGPS } from '../../hooks/useBackgroundGPS'
import { useOfflineSync } from '../../hooks/useOfflineSync'
import { kvStorage } from '../../lib/storage'
import { NotificationPermissionModal, shouldShowNotificationModal } from '../../components/shared/NotificationPermissionModal'
import { SyncStatusBar } from '../../components/shared/SyncStatusBar'
import { AppHeader } from '../../components/shared/AppHeader'
import { SupportTicketFAB } from '../../components/shared/SupportTicketFAB'
import { SupportTicketProvider } from '../../context/SupportTicketContext'
import { haptic } from '../../lib/haptics'
import { useThemeColors, shadows, tabBar } from '../../constants/tokens'
import type { HOSStatus } from '@drivecommand/types'

const LAST_READ_KEY = 'messages_last_read_at'
const UNREAD_POLL_INTERVAL_MS = 30_000

/**
 * Small colored dot indicating background GPS status.
 * Positioned as a custom tab bar icon badge overlay.
 */
function GPSStatusDot({ status }: { status: 'active' | 'paused' | 'no-permission' | 'off' }) {
  const dotColor = {
    active: '#22c55e',        // green — tracking
    paused: '#94a3b8',        // grey — user paused
    'no-permission': '#ef4444', // red — permission denied
    off: '#94a3b8',           // grey — not started
  }[status]

  return <View style={[styles.gpsDot, { backgroundColor: dotColor }]} />
}

/**
 * Unread badge overlay for the Messages tab icon.
 */
function MessageTabIcon({ color, unreadCount }: { color: string; unreadCount: number }) {
  return (
    <>
      <MessageSquare color={color} size={tabBar.iconSize} />
      {unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadBadgeText}>
            {unreadCount > 99 ? '99+' : String(unreadCount)}
          </Text>
        </View>
      )}
    </>
  )
}

/**
 * Wrapper that renders a colored pill indicator above the icon when the tab is active.
 */
function TabIcon({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.tabIconWrap}>
      <View style={[styles.activeBar, focused && styles.activeBarVisible]} />
      <View style={styles.iconWrapper}>{children}</View>
    </View>
  )
}

export default function DriverLayout() {
  const { token } = useAuthContext()
  const c = useThemeColors()
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
      <SupportTicketProvider>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: true,
          tabBarStyle: {
            backgroundColor: c.tabBarBg,
            borderTopColor: c.tabBarBorder,
            borderTopWidth: StyleSheet.hairlineWidth,
            height: tabBar.height,
            paddingTop: 0,
            paddingBottom: 8,
            ...shadows.tabBar,
          },
          tabBarItemStyle: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'flex-start',
            paddingHorizontal: 0,
            minHeight: 48,
          },
          tabBarActiveTintColor: c.tabActive,
          tabBarInactiveTintColor: c.tabInactive,
          tabBarLabelStyle: {
            fontSize: tabBar.labelSize,
            fontWeight: '500',
            marginTop: 2,
            marginBottom: 0,
          },
        }}
      >
        {/* Tab 1: Dashboard — center of gravity, has GPSStatusDot */}
        <Tabs.Screen
          name="index"
          options={{
            tabBarLabel: 'Dashboard',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon focused={focused}>
                <House color={color} size={tabBar.iconSize} />
                <GPSStatusDot status={gpsStatus} />
              </TabIcon>
            ),
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />

        {/* Tab 2: Loads */}
        <Tabs.Screen
          name="loads"
          options={{
            tabBarLabel: 'Loads',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon focused={focused}>
                <Truck color={color} size={tabBar.iconSize} />
              </TabIcon>
            ),
            tabBarButtonTestID: 'tab-loads',
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />

        {/* Tab 3: Map — NEW */}
        <Tabs.Screen
          name="map"
          options={{
            tabBarLabel: 'Map',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon focused={focused}>
                <Navigation color={color} size={tabBar.iconSize} />
              </TabIcon>
            ),
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />

        {/* Tab 4: Messages */}
        <Tabs.Screen
          name="messages"
          options={{
            tabBarLabel: 'Messages',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon focused={focused}>
                <MessageTabIcon color={color} unreadCount={unreadCount} />
              </TabIcon>
            ),
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />

        {/* Tab 5: More — NEW */}
        <Tabs.Screen
          name="more"
          options={{
            tabBarLabel: 'More',
            tabBarIcon: ({ color, focused }) => (
              <TabIcon focused={focused}>
                <Grid2X2 color={color} size={tabBar.iconSize} />
              </TabIcon>
            ),
          }}
          listeners={{ tabPress: () => haptic.light() }}
        />

        {/* Hidden routes — removed from tab bar */}
        <Tabs.Screen name="hos" options={{ href: null }} />
        <Tabs.Screen name="documents" options={{ href: null }} />
        <Tabs.Screen name="incidents" options={{ href: null }} />
      </Tabs>

      {/* Notification permission modal — shown on first login */}
      <NotificationPermissionModal
        visible={showNotifModal}
        onDismiss={() => setShowNotifModal(false)}
      />

      {/* Support ticket FAB — persistent on all driver screens */}
      <SupportTicketFAB />
      </SupportTicketProvider>
    </Fragment>
  )
}

const styles = StyleSheet.create({
  tabIconWrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
    gap: 6,
  },
  activeBar: {
    width: 24,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  activeBarVisible: {
    backgroundColor: '#0ea5e9',
  },
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
    borderColor: 'transparent',
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
