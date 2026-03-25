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
  DollarSign,
  Package,
  Plus,
  Truck,
  UserCheck,
  Users,
} from 'lucide-react-native'
import { useAuthContext } from '../../context/AuthContext'
import { ownerApi } from '@drivecommand/api-client'
import { KPICard } from '../../components/owner/KPICard'
import { DriverStatusChip } from '../../components/owner/DriverStatusChip'
import { DashboardLoadCard } from '../../components/owner/DashboardLoadCard'
import { DashboardSkeleton } from '../../components/skeletons/DashboardSkeleton'
import { AnimatedScreen } from '../../components/ui/AnimatedScreen'
import { haptic } from '../../lib/haptics'

const SCREEN_WIDTH = Dimensions.get('window').width
const CHIP_WIDTH = (SCREEN_WIDTH - 16 - 16 - 8) / 2

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
            valueColor="#38bdf8"
            icon={<Package color="#38bdf8" size={16} />}
            onPress={() => { haptic.light(); router.push('/(owner)/loads' as any) }}
          />
          <KPICard
            label="Available"
            value={availableDriversCount}
            valueColor="#38bdf8"
            icon={<UserCheck color="#38bdf8" size={16} />}
            onPress={() => { haptic.light(); router.push('/(owner)/drivers' as any) }}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          <KPICard
            label="Revenue (MTD)"
            value={formatRevenue(kpis.revenueThisMonth)}
            valueColor="#10b981"
            icon={<DollarSign color="#10b981" size={16} />}
            onPress={() => { haptic.light(); router.push('/(owner)/invoices' as any) }}
          />
          <KPICard
            label="Open Alerts"
            value={kpis.openAlertsCount}
            valueColor={kpis.openAlertsCount > 0 ? '#fbbf24' : '#94a3b8'}
            icon={<AlertTriangle color={kpis.openAlertsCount > 0 ? '#fbbf24' : '#475569'} size={16} />}
            onPress={() => { haptic.light(); router.push('/(owner)/compliance' as any) }}
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
        </View>

        {activeLoads.length === 0 ? (
          <View className="bg-slate-800 border border-slate-700 rounded-xl p-5 items-center mb-5">
            <Package color="#475569" size={32} />
            <Text className="text-slate-400 text-sm mt-3 text-center">No active loads right now</Text>
          </View>
        ) : (
          <View style={{ marginBottom: 20 }}>
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

      {/* FAB — Quick Create Load */}
      <Pressable
        onPress={() => { haptic.medium(); router.push('/(owner)/loads' as any) }}
        style={{
          position: 'absolute',
          bottom: 24,
          right: 20,
          width: 52,
          height: 52,
          borderRadius: 26,
          backgroundColor: '#0ea5e9',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#0ea5e9',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <Plus color="#ffffff" size={24} />
      </Pressable>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
