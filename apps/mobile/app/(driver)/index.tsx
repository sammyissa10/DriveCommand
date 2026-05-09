import React, { useCallback } from 'react'
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Bell,
  Gauge,
  Navigation,
  RotateCcw,
  Timer,
  Truck,
} from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../../context/AuthContext'
import { driverApi, type DashboardData } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../components/ui/AnimatedScreen'
import { TripCard } from '../../components/driver/TripCard'
import { haptic } from '../../lib/haptics'
import { DashboardSkeleton } from '../../components/skeletons/DashboardSkeleton'
import { useThemeColors, radii, typography } from '../../constants/tokens'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

function getRouteBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'PENDING':     return { label: 'Pending',   variant: 'muted' }
    case 'ACTIVE':
    case 'IN_PROGRESS': return { label: 'Active',    variant: 'info' }
    case 'COMPLETED':   return { label: 'Completed', variant: 'success' }
    case 'CANCELLED':   return { label: 'Cancelled', variant: 'danger' }
    default:            return { label: status,      variant: 'muted' }
  }
}

function getStatusBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'DISPATCHED':  return { label: 'Accepted', variant: 'info' }
    case 'IN_TRANSIT':
    case 'PICKED_UP':   return { label: 'En Route', variant: 'warning' }
    case 'DELIVERED':   return { label: 'Delivered', variant: 'success' }
    case 'PENDING':     return { label: 'Pending',   variant: 'muted' }
    case 'CANCELLED':   return { label: 'Cancelled', variant: 'danger' }
    default:            return { label: status,      variant: 'muted' }
  }
}

function formatAlertTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function DriverDashboard() {
  const { token } = useAuthContext()
  const router    = useRouter()
  const c = useThemeColors()

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['driver-dashboard'],
    queryFn:  () => driverApi.getDashboard(token!),
    enabled:  !!token,
  })

  const { data: routeData, refetch: refetchRoute } = useQuery({
    queryKey: ['driver-route'],
    queryFn:  () => driverApi.getMyRoute(token!),
    enabled:  !!token,
  })

  const onRefresh = useCallback(() => {
    haptic.light(); refetch(); refetchRoute()
  }, [refetch, refetchRoute])

  if (isLoading) return <DashboardSkeleton />

  if (isError) {
    return (
      <SafeAreaView style={[styles.errorContainer, { backgroundColor: c.background }]} edges={['bottom', 'left', 'right']}>
        <AlertTriangle color={c.danger} size={44} />
        <Text style={[styles.errorTitle, { color: c.textPrimary }]}>Failed to load dashboard</Text>
        <Text style={[styles.errorMessage, { color: c.textSecondary }]}>
          {error instanceof Error ? error.message : 'An unexpected error occurred'}
        </Text>
        <Pressable onPress={() => refetch()} style={[styles.retryBtn, { backgroundColor: c.brandDark }]}>
          <Text style={[styles.retryText, { color: c.textPrimary }]}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const { activeLoad, stopsCompleted, hosHoursRemaining, todayMiles, recentAlerts } = data!

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.background }]} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={c.brand}
              colors={[c.brand]}
            />
          }
        >
          {/* ── Header */}
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Dashboard</Text>
            <Text style={[styles.headerSub, { color: c.textSecondary }]}>Your shift at a glance</Text>
          </View>

          {/* ── My Route */}
          {routeData?.route ? (
            <TripCard
              accentColor={c.success}
              label="My Route"
              title={routeData.route.name ?? 'Unnamed Route'}
              statusBadge={getRouteBadge(routeData.route.status)}
              origin={routeData.route.origin}
              destination={routeData.route.destination}
              linkText="View Route"
              linkColor={c.success}
              onPress={() => { haptic.light(); router.push('/(driver)/loads/my-route' as any) }}
            />
          ) : null}

          {/* ── Active Load */}
          {activeLoad ? (
            <TripCard
              accentColor={c.brandLight}
              label="Active Load"
              title={`#${activeLoad.loadNumber}`}
              statusBadge={getStatusBadge(activeLoad.status)}
              subtitle={activeLoad.customer.companyName}
              origin={activeLoad.origin}
              destination={activeLoad.destination}
              linkText="View Details"
              linkColor={c.brandLight}
              onPress={() => router.push('/(driver)/loads' as any)}
            />
          ) : (
            <View style={[styles.emptyLoad, { backgroundColor: c.surfaceCard, borderColor: c.border }]}>
              <View style={[styles.emptyIconWrap, { backgroundColor: c.background, borderColor: c.border }]}>
                <Truck color={c.textMuted} size={24} />
              </View>
              <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>No active load</Text>
              <Text style={[styles.emptySub, { color: c.textSecondary }]}>You have no load in progress right now.</Text>
              <Pressable
                onPress={() => router.push('/(driver)/loads' as any)}
                style={[styles.viewLoadsBtn, { backgroundColor: c.brandDark }]}
              >
                <Text style={[styles.viewLoadsTxt, { color: c.textPrimary }]}>View All Loads</Text>
              </Pressable>
            </View>
          )}

          {/* ── Shift Stats */}
          <View style={styles.statsRow}>
            {/* Miles */}
            <View style={[styles.statChip, { borderTopColor: '#38bdf8', backgroundColor: c.surfaceCard, borderColor: c.border }]}>
              <Gauge color="#38bdf8" size={14} />
              <Text style={[styles.statNum, { color: c.textPrimary }]}>{todayMiles}</Text>
              <Text style={[styles.statLbl, { color: c.textMuted }]}>Miles</Text>
            </View>
            {/* Stops */}
            <View style={[styles.statChip, { borderTopColor: '#22c55e', backgroundColor: c.surfaceCard, borderColor: c.border }]}>
              <Navigation color="#22c55e" size={14} />
              <Text style={[styles.statNum, { color: c.textPrimary }]}>{stopsCompleted}</Text>
              <Text style={[styles.statLbl, { color: c.textMuted }]}>Stops</Text>
            </View>
            {/* HOS */}
            <View style={[styles.statChip, { borderTopColor: '#f59e0b', backgroundColor: c.surfaceCard, borderColor: c.border }]}>
              <Timer color="#f59e0b" size={14} />
              <Text style={[styles.statNum, { color: c.textPrimary }]}>{hosHoursRemaining}h</Text>
              <Text style={[styles.statLbl, { color: c.textMuted }]}>HOS Left</Text>
            </View>
          </View>

          {/* ── Report Incident — outlined button */}
          <Pressable
            onPress={() => { haptic.medium(); router.push('/(driver)/incidents' as any) }}
            style={({ pressed }) => [styles.incidentBtn, { borderColor: c.danger + '55', backgroundColor: c.dangerBg }, pressed && { opacity: 0.7 }]}
          >
            <AlertTriangle color={c.danger} size={15} />
            <Text style={[styles.incidentBtnLabel, { color: c.danger }]}>Report Incident</Text>
          </Pressable>

          {/* ── Recent Alerts */}
          <View style={styles.alertsBlock}>
            <Text style={[styles.alertsTitle, { color: c.textMuted }]}>Recent Alerts</Text>

            {recentAlerts.length === 0 ? (
              <View style={[styles.noAlertsCard, { backgroundColor: c.surfaceCard, borderColor: c.border }]}>
                <Bell color={c.textMuted} size={18} />
                <Text style={[styles.noAlertsText, { color: c.textSecondary }]}>No alerts right now</Text>
                <Pressable
                  onPress={() => { haptic.light(); refetch() }}
                  style={[styles.refreshBtn, { borderColor: c.border }]}
                  hitSlop={8}
                >
                  <RotateCcw color={c.textMuted} size={11} />
                  <Text style={[styles.refreshTxt, { color: c.textMuted }]}>Refresh</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.alertList}>
                {recentAlerts.map((alert: DashboardData['recentAlerts'][number]) => {
                  const dotColor = alert.type === 'danger' ? c.danger : c.warning
                  return (
                    <View key={alert.id} style={[styles.alertCard, { backgroundColor: c.surfaceCard, borderColor: c.border }]}>
                      <View style={[styles.alertDot, { backgroundColor: dotColor }]} />
                      <View style={styles.alertBody}>
                        <Text style={[styles.alertMsg, { color: c.textSecondary }]}>{alert.message}</Text>
                        <Text style={[styles.alertTime, { color: c.textMuted }]}>{formatAlertTime(alert.createdAt)}</Text>
                      </View>
                    </View>
                  )
                })}
              </View>
            )}
          </View>

        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen:  { flex: 1 },
  scroll:  { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 52 },

  // Error
  errorContainer: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  errorTitle:   { ...typography.headline, marginTop: 16, textAlign: 'center' },
  errorMessage: { ...typography.footnote, marginTop: 8, textAlign: 'center' },
  retryBtn:     { marginTop: 24, paddingHorizontal: 28, paddingVertical: 12, borderRadius: radii.md },
  retryText:    { ...typography.subhead, fontWeight: '600' },

  // Header
  header:      { marginBottom: 20 },
  headerTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  headerSub:   { fontSize: 13, marginTop: 3 },

  // Empty load
  emptyLoad: {
    marginBottom: 20,
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1,
  },
  emptyIconWrap: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  emptyTitle:   { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  emptySub:     { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  viewLoadsBtn: { marginTop: 14, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  viewLoadsTxt: { fontSize: 13, fontWeight: '600' },

  // ── Stat chips — compact 3-column
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  statChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderTopWidth: 2,
  },
  statNum: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  statLbl: {
    fontSize: 10,
  },

  // ── Report Incident — clean outlined button
  incidentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 28,
  },
  incidentBtnLabel: {
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Alerts
  alertsBlock: { gap: 10 },
  alertsTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  noAlertsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  noAlertsText: { flex: 1, fontSize: 13 },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 7, borderWidth: 1,
  },
  refreshTxt: { fontSize: 11, fontWeight: '500' },

  alertList: { gap: 8 },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  alertDot:  { width: 7, height: 7, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  alertBody: { flex: 1 },
  alertMsg:  { fontSize: 13, lineHeight: 19 },
  alertTime: { fontSize: 11, marginTop: 3 },
})
