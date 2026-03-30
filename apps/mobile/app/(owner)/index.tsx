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
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Building2,
  FileText,
  Package,
  Truck,
  UserPlus,
  Users,
} from 'lucide-react-native'
import { useAuthContext } from '../../context/AuthContext'
import { useSupportTicket } from '../../context/SupportTicketContext'
import { ownerApi } from '@drivecommand/api-client'
import { DriverStatusChip } from '../../components/owner/DriverStatusChip'
import { DashboardLoadCard } from '../../components/owner/DashboardLoadCard'
import { KPIGrid } from '../../components/owner/KPIGrid'
import { SpeedDial } from '../../components/owner/SpeedDial'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { DashboardSkeleton } from '../../components/skeletons/DashboardSkeleton'
import { AnimatedScreen } from '../../components/ui/AnimatedScreen'
import { haptic } from '../../lib/haptics'
import { colors, radii, spacing, typography } from '../../constants/tokens'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OwnerDashboardData {
  kpis: {
    activeLoadsCount: number
    driversOnDutyCount: number
    revenueThisMonth: number
    openAlertsCount: number
  }
  activeLoads: Array<{
    id: string
    loadNumber: string
    status: string
    origin: string
    destination: string
    customer: { id: string; companyName: string }
    truck: { id: string; make: string; model: string; licensePlate: string } | null
    driverName: string | null
    createdAt: string
    updatedAt: string
  }>
  driverStatuses: Array<{
    id: string
    name: string
    hosStatus: string | null
    activeLoadNumber: string | null
  }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRevenue(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`
  return `$${amount.toFixed(0)}`
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

const CREATE_ACTIONS = [
  { key: 'load',     label: 'New Load',      icon: Package,   route: '/(owner)/loads?create=1',       color: '#38bdf8' },
  { key: 'truck',    label: 'Add Truck',     icon: Truck,     route: '/(owner)/more/trucks/new',      color: '#f87171' },
  { key: 'driver',   label: 'Invite Driver', icon: UserPlus,  route: '/(owner)/drivers/invite',       color: '#a78bfa' },
  { key: 'customer', label: 'New Customer',  icon: Building2, route: '/(owner)/more/crm/new',         color: '#34d399' },
  { key: 'invoice',  label: 'New Invoice',   icon: FileText,  route: '/(owner)/more/invoices/new',    color: '#fbbf24' },
] as const

export default function OwnerDashboard() {
  const { token } = useAuthContext()
  const { open: openSupport } = useSupportTicket()
  const router = useRouter()

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<OwnerDashboardData>({
    queryKey: ['owner-dashboard'],
    queryFn: () => ownerApi.getDashboard(token!),
    enabled: !!token,
    refetchInterval: 60_000,
  })

  const onRefresh = useCallback(() => {
    haptic.light()
    refetch()
  }, [refetch])

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

  const { kpis, activeLoads, driverStatuses } = data!

  const availableDriversCount = driverStatuses.filter(
    d => d.activeLoadNumber === null && (d.hosStatus === 'OFF_DUTY' || d.hosStatus === 'SLEEPER_BERTH' || d.hosStatus === null)
  ).length

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
            <Text style={styles.headerSubtitle}>Fleet overview</Text>
          </View>

          {/* 2x2 KPI Grid */}
          <KPIGrid
            kpis={{
              activeLoads: kpis.activeLoadsCount,
              availableDrivers: availableDriversCount,
              revenue: formatRevenue(kpis.revenueThisMonth),
              openAlerts: kpis.openAlertsCount,
            }}
            onPressLoads={() => { haptic.light(); router.push('/(owner)/loads' as any) }}
            onPressDrivers={() => { haptic.light(); router.push('/(owner)/drivers' as any) }}
            onPressRevenue={() => { haptic.light(); router.push('/(owner)/invoices' as any) }}
            onPressAlerts={() => { haptic.light(); router.push('/(owner)/compliance' as any) }}
          />

          {/* Active Loads Section */}
          <View style={styles.divider} />
          <View style={styles.sectionHeaderWrap}>
            <SectionHeader title="Active Loads" />
          </View>

          {activeLoads.length === 0 ? (
            <View style={styles.emptySection}>
              <Package color={colors.textMuted} size={32} />
              <Text style={styles.emptySectionText}>No active loads right now</Text>
            </View>
          ) : (
            <View style={styles.loadList}>
              {activeLoads.map((load) => (
                <DashboardLoadCard
                  key={load.id}
                  id={load.id}
                  loadNumber={load.loadNumber}
                  status={load.status}
                  origin={load.origin}
                  destination={load.destination}
                  driverName={load.driverName}
                  onPress={() => router.push(`/(owner)/loads/${load.id}` as any)}
                />
              ))}
            </View>
          )}

          {/* Driver Status Section */}
          <View style={styles.divider} />
          <View style={styles.sectionHeaderWrap}>
            <SectionHeader title="Driver Status" />
          </View>

          {(() => {
            const activeDrivers = driverStatuses.filter(
              d => d.hosStatus === 'DRIVING' || d.hosStatus === 'ON_DUTY' || d.activeLoadNumber !== null
            )
            if (activeDrivers.length === 0) {
              return (
                <View style={styles.emptySection}>
                  <Text style={styles.emptySectionText}>All drivers are currently off duty</Text>
                </View>
              )
            }
            return (
              <View style={styles.chipGrid}>
                {activeDrivers.map((driver) => (
                  <Pressable
                    key={driver.id}
                    style={({ pressed }) => [styles.chipItem, pressed && styles.chipPressed]}
                    onPress={() => router.push(`/(owner)/drivers/${driver.id}` as any)}
                  >
                    <DriverStatusChip
                      name={driver.name}
                      hosStatus={driver.hosStatus}
                      activeLoadNumber={driver.activeLoadNumber}
                    />
                  </Pressable>
                ))}
              </View>
            )
          })()}
        </ScrollView>

        <SpeedDial
          actions={CREATE_ACTIONS}
          onAction={(route) => { haptic.light(); router.push(route as any) }}
          onSupportPress={openSupport}
        />
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
    paddingBottom: 100,
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
    ...typography.title1,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typography.footnote,
    color: colors.textMuted,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginBottom: spacing.sm,
  },
  sectionHeaderWrap: {
    marginHorizontal: -spacing.lg,
  },
  loadList: {
    marginBottom: spacing.xl,
  },
  emptySection: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.md,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  emptySectionText: {
    ...typography.footnote,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  chipItem: {
    flexBasis: '48%',
    flex: 0,
  },
  chipPressed: {
    opacity: 0.75,
  },
})
