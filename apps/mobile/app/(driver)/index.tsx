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
import { AlertTriangle, Truck } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../../context/AuthContext'
import { driverApi, type DashboardData } from '@drivecommand/api-client'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { AnimatedScreen } from '../../components/ui/AnimatedScreen'
import { TripCard } from '../../components/driver/TripCard'
import { StatsRow } from '../../components/driver/StatsRow'
import { haptic } from '../../lib/haptics'
import { DashboardSkeleton } from '../../components/skeletons/DashboardSkeleton'
import { colors, radii, spacing, typography } from '../../constants/tokens'

// Map route status values to badge variants
type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

function getRouteBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', variant: 'muted' }
    case 'ACTIVE':
    case 'IN_PROGRESS':
      return { label: 'Active', variant: 'info' }
    case 'COMPLETED':
      return { label: 'Completed', variant: 'success' }
    case 'CANCELLED':
      return { label: 'Cancelled', variant: 'danger' }
    default:
      return { label: status, variant: 'muted' }
  }
}

// Map DB status values to driver-friendly display labels and badge variants
function getStatusBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'DISPATCHED':
      return { label: 'Accepted', variant: 'info' }
    case 'IN_TRANSIT':
    case 'PICKED_UP':
      return { label: 'En Route', variant: 'warning' }
    case 'DELIVERED':
      return { label: 'Delivered', variant: 'success' }
    case 'PENDING':
      return { label: 'Pending', variant: 'muted' }
    case 'CANCELLED':
      return { label: 'Cancelled', variant: 'danger' }
    default:
      return { label: status, variant: 'muted' }
  }
}

function formatAlertTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return `${Math.floor(diffHours / 24)}d ago`
}

export default function DriverDashboard() {
  const { token } = useAuthContext()
  const router = useRouter()

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['driver-dashboard'],
    queryFn: () => driverApi.getDashboard(token!),
    enabled: !!token,
  })

  const { data: routeData, refetch: refetchRoute } = useQuery({
    queryKey: ['driver-route'],
    queryFn: () => driverApi.getMyRoute(token!),
    enabled: !!token,
  })

  const onRefresh = useCallback(() => {
    haptic.light()
    refetch()
    refetchRoute()
  }, [refetch, refetchRoute])

  // Loading state — show skeleton instead of spinner
  if (isLoading) {
    return <DashboardSkeleton />
  }

  // Error state
  if (isError) {
    return (
      <SafeAreaView style={styles.errorContainer} edges={['bottom', 'left', 'right']}>
        <AlertTriangle color={colors.danger} size={40} />
        <Text style={styles.errorTitle}>Failed to load dashboard</Text>
        <Text style={styles.errorMessage}>
          {error instanceof Error ? error.message : 'An unexpected error occurred'}
        </Text>
        <Pressable onPress={() => refetch()} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const { activeLoad, stopsCompleted, hosHoursRemaining, todayMiles, recentAlerts } = data!

  return (
    <SafeAreaView style={styles.screen} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Dashboard</Text>
            <Text style={styles.headerSubtitle}>Your shift at a glance</Text>
          </View>

          {/* My Route Card — visible only when a route is assigned */}
          {routeData?.route ? (
            <TripCard
              accentColor={colors.success}
              label="My Route"
              title={routeData.route.name ?? 'Unnamed Route'}
              statusBadge={getRouteBadge(routeData.route.status)}
              origin={routeData.route.origin}
              destination={routeData.route.destination}
              linkText="View Route"
              linkColor={colors.success}
              onPress={() => { haptic.light(); router.push('/(driver)/loads/my-route' as any) }}
            />
          ) : null}

          {/* Active Load Card */}
          {activeLoad ? (
            <TripCard
              accentColor={colors.brandLight}
              label="Active Load"
              title={`#${activeLoad.loadNumber}`}
              statusBadge={getStatusBadge(activeLoad.status)}
              subtitle={activeLoad.customer.companyName}
              origin={activeLoad.origin}
              destination={activeLoad.destination}
              linkText="View Details"
              linkColor={colors.brandLight}
              onPress={() => router.push('/(driver)/loads' as any)}
            />
          ) : (
            /* Empty state — no active load */
            <View style={styles.emptyCard}>
              <Truck color={colors.textMuted} size={36} />
              <Text style={styles.emptyTitle}>No active load</Text>
              <Text style={styles.emptySubtitle}>
                You have no load in progress right now.
              </Text>
              <Pressable
                onPress={() => router.push('/(driver)/loads' as any)}
                style={styles.viewLoadsButton}
              >
                <Text style={styles.viewLoadsText}>View All Loads</Text>
              </Pressable>
            </View>
          )}

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <StatsRow
              miles={todayMiles}
              stops={stopsCompleted}
              hosHours={`${hosHoursRemaining}h`}
            />
          </View>

          {/* Report Incident Quick Action */}
          <Pressable
            onPress={() => router.push('/(driver)/incidents' as any)}
            style={styles.incidentButton}
          >
            <View style={styles.incidentInner}>
              <AlertTriangle color={colors.danger} size={22} />
              <View style={styles.incidentText}>
                <Text style={styles.incidentTitle}>Report Incident</Text>
                <Text style={styles.incidentSubtitle}>
                  Submit accident, violation, or hazard report
                </Text>
              </View>
            </View>
          </Pressable>

          {/* Recent Alerts */}
          <View>
            <View style={styles.sectionHeaderWrap}>
              <SectionHeader title="Recent Alerts" />
            </View>

            {recentAlerts.length === 0 ? (
              <Text style={styles.noAlerts}>No recent alerts</Text>
            ) : (
              <View style={styles.alertList}>
                {recentAlerts.map((alert: DashboardData['recentAlerts'][number]) => (
                  <View key={alert.id} style={styles.alertCard}>
                    <View style={styles.alertRow}>
                      <AlertTriangle
                        color={alert.type === 'danger' ? colors.danger : colors.warning}
                        size={16}
                        style={styles.alertIcon}
                      />
                      <View style={styles.alertContent}>
                        <Text style={styles.alertMessage}>{alert.message}</Text>
                        <Text style={styles.alertTime}>
                          {formatAlertTime(alert.createdAt)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    paddingBottom: 32,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  errorTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    marginTop: spacing.lg,
    textAlign: 'center',
  },
  errorMessage: {
    ...typography.footnote,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: spacing.xxl,
    backgroundColor: colors.brandDark,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
  },
  retryText: {
    ...typography.subhead,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  header: {
    marginBottom: spacing.xl,
  },
  headerTitle: {
    ...typography.title2,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typography.footnote,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyCard: {
    marginBottom: spacing.xl,
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    ...typography.callout,
    color: colors.textPrimary,
    fontWeight: '600',
    marginTop: spacing.md,
  },
  emptySubtitle: {
    ...typography.footnote,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  viewLoadsButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.brandDark,
    paddingHorizontal: spacing.xl,
    paddingVertical: 10,
    borderRadius: radii.md,
  },
  viewLoadsText: {
    ...typography.footnote,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  statsRow: {
    marginBottom: spacing.xl,
  },
  incidentButton: {
    marginBottom: spacing.xl,
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.danger + '80',
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  incidentInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  incidentText: {
    flex: 1,
  },
  incidentTitle: {
    ...typography.callout,
    color: colors.danger,
    fontWeight: '600',
  },
  incidentSubtitle: {
    ...typography.footnote,
    color: colors.textMuted,
    marginTop: 2,
  },
  noAlerts: {
    ...typography.footnote,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
  },
  sectionHeaderWrap: {
    marginHorizontal: -spacing.lg,
  },
  alertList: {
    gap: spacing.sm,
  },
  alertCard: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  alertIcon: {
    marginTop: 2,
    marginRight: spacing.sm,
    flexShrink: 0,
  },
  alertContent: {
    flex: 1,
  },
  alertMessage: {
    ...typography.footnote,
    color: colors.textSecondary,
  },
  alertTime: {
    ...typography.caption2,
    color: colors.textMuted,
    marginTop: 2,
  },
})
