import React, { useCallback } from 'react'
import {
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  DollarSign,
  Package,
  Truck,
  UserCheck,
} from 'lucide-react-native'

const SCREEN_WIDTH = Dimensions.get('window').width
// 2-column grid: 16px padding each side + 8px gap between columns
const CHIP_WIDTH = (SCREEN_WIDTH - 16 - 16 - 8) / 2
import { useAuthContext } from '../../context/AuthContext'
import { ownerApi } from '@drivecommand/api-client'
import { KPICard } from '../../components/owner/KPICard'
import { DriverStatusChip } from '../../components/owner/DriverStatusChip'
import { Badge } from '../../components/ui/Badge'
import { DashboardSkeleton } from '../../components/skeletons/DashboardSkeleton'
import { AnimatedScreen } from '../../components/ui/AnimatedScreen'
import { haptic } from '../../lib/haptics'

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

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

function getStatusBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', variant: 'muted' }
    case 'DISPATCHED':
      return { label: 'Accepted', variant: 'info' }
    case 'PICKED_UP':
    case 'IN_TRANSIT':
      return { label: 'En Route', variant: 'warning' }
    case 'DELIVERED':
      return { label: 'Delivered', variant: 'success' }
    case 'INVOICED':
      return { label: 'Invoiced', variant: 'success' }
    case 'CANCELLED':
      return { label: 'Cancelled', variant: 'danger' }
    default:
      return { label: status, variant: 'muted' }
  }
}

function formatRevenue(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`
  return `$${amount.toFixed(0)}`
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function OwnerDashboard() {
  const { token } = useAuthContext()
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
      <SafeAreaView
        className="flex-1 bg-slate-900 items-center justify-center px-6"
        edges={['bottom', 'left', 'right']}
      >
        <AlertTriangle color="#f87171" size={40} />
        <Text className="text-white text-lg font-semibold mt-4 text-center">
          Failed to load dashboard
        </Text>
        <Text className="text-slate-400 text-sm mt-2 text-center">
          {error instanceof Error ? error.message : 'An unexpected error occurred'}
        </Text>
        <Pressable
          onPress={() => refetch()}
          className="mt-6 bg-sky-600 px-6 py-3 rounded-lg active:opacity-80"
        >
          <Text className="text-white font-semibold">Retry</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const { kpis, activeLoads, driverStatuses } = data!

  const availableDriversCount = driverStatuses.filter(
    d => d.activeLoadNumber === null && (d.hosStatus === 'OFF_DUTY' || d.hosStatus === 'SLEEPER_BERTH' || d.hosStatus === null)
  ).length

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor="#0ea5e9"
            colors={['#0ea5e9']}
          />
        }
      >
        {/* Header */}
        <View className="mb-5">
          <Text className="text-2xl font-bold text-white">Dashboard</Text>
          <Text className="text-slate-400 text-sm mt-0.5">Fleet overview</Text>
        </View>

        {/* 2x2 KPI Grid */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <KPICard
            label="Active Loads"
            value={kpis.activeLoadsCount}
            icon={<Package color="#475569" size={18} />}
            onPress={() => { haptic.light(); router.push('/(owner)/loads' as any) }}
          />
          <KPICard
            label="Available"
            value={availableDriversCount}
            icon={<UserCheck color="#475569" size={18} />}
            onPress={() => { haptic.light(); router.push('/(owner)/drivers' as any) }}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          <KPICard
            label="Revenue (MTD)"
            value={formatRevenue(kpis.revenueThisMonth)}
            icon={<DollarSign color="#475569" size={18} />}
            onPress={() => { haptic.light(); router.push('/(owner)/loads' as any) }}
          />
          <KPICard
            label="Open Alerts"
            value={kpis.openAlertsCount}
            icon={<AlertTriangle color={kpis.openAlertsCount > 0 ? '#fbbf24' : '#475569'} size={18} />}
            onPress={() => { haptic.light(); router.push('/(owner)/drivers' as any) }}
          />
        </View>

        {/* Active Loads Section */}
        <View
          style={{
            height: 1,
            backgroundColor: '#334155',
            marginBottom: 14,
          }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Truck color="#64748b" size={15} style={{ marginRight: 6 }} />
          <Text className="text-white font-semibold text-base">Active Loads</Text>
          <Text className="text-slate-500 text-xs ml-2">(top 5)</Text>
        </View>

        {activeLoads.length === 0 ? (
          <View className="bg-slate-800 border border-slate-700 rounded-xl p-5 items-center mb-5">
            <Package color="#475569" size={32} />
            <Text className="text-slate-400 text-sm mt-3 text-center">No active loads right now</Text>
          </View>
        ) : (
          <View style={{ marginBottom: 20, gap: 8 }}>
            {activeLoads.map((load) => {
              const badge = getStatusBadge(load.status)
              return (
                <Pressable
                  key={load.id}
                  onPress={() => { haptic.light(); router.push(`/(owner)/loads/${load.id}` as any) }}
                  android_ripple={{ color: 'rgba(14,165,233,0.1)', borderless: false }}
                  style={({ pressed }) => ({
                    backgroundColor: pressed ? '#263348' : '#1e293b',
                    borderRadius: 12,
                    overflow: 'hidden',
                  })}
                >
                  <View style={{
                    borderWidth: 1,
                    borderColor: '#475569',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                  }}>
                  {/* Row 1: Load number + badge */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 14 }}>
                      #{load.loadNumber}
                    </Text>
                    <Badge label={badge.label} variant={badge.variant} />
                  </View>

                  {/* Row 2: Origin → Destination */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
                    <Text style={{ color: '#cbd5e1', fontSize: 12, flex: 1 }} numberOfLines={1}>
                      {load.origin}
                    </Text>
                    <ArrowRight color="#64748b" size={11} style={{ marginHorizontal: 5, flexShrink: 0 }} />
                    <Text style={{ color: '#cbd5e1', fontSize: 12, flex: 1, textAlign: 'right' }} numberOfLines={1}>
                      {load.destination}
                    </Text>
                  </View>

                  {/* Row 3: Driver name */}
                  <Text style={{ color: '#64748b', fontSize: 11 }} numberOfLines={1}>
                    {load.driverName ?? 'Unassigned'}
                  </Text>
                  </View>
                </Pressable>
              )
            })}
          </View>
        )}

        {/* Driver Status Section */}
        <View
          style={{
            height: 1,
            backgroundColor: '#334155',
            marginBottom: 14,
          }}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <Users color="#64748b" size={15} style={{ marginRight: 6 }} />
          <Text className="text-white font-semibold text-base">Driver Status</Text>
        </View>

        {(() => {
          const activeDrivers = driverStatuses.filter(
            d => d.hosStatus === 'DRIVING' || d.hosStatus === 'ON_DUTY' || d.activeLoadNumber !== null
          )
          if (activeDrivers.length === 0) {
            return (
              <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 items-center">
                <Text className="text-slate-400 text-sm">All drivers are currently off duty</Text>
              </View>
            )
          }
          return (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {activeDrivers.map((driver) => (
                <Pressable
                  key={driver.id}
                  style={({ pressed }) => ({ width: CHIP_WIDTH, opacity: pressed ? 0.75 : 1 })}
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
      </AnimatedScreen>
    </SafeAreaView>
  )
}
