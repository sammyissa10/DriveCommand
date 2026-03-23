import React, { useCallback } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Truck } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../../context/AuthContext'
import { driverApi, type DashboardData } from '@drivecommand/api-client'
import { Badge } from '../../components/ui/Badge'
import { StatChip } from '../../components/driver/StatChip'

// Map DB status values to driver-friendly display labels and badge variants
type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

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

  const onRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-900 items-center justify-center">
        <ActivityIndicator size="large" color="#0ea5e9" />
        <Text className="text-slate-400 mt-3 text-sm">Loading dashboard...</Text>
      </SafeAreaView>
    )
  }

  // Error state
  if (isError) {
    return (
      <SafeAreaView className="flex-1 bg-slate-900 items-center justify-center px-6">
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

  const { activeLoad, stopsCompleted, hosHoursRemaining, todayMiles, recentAlerts } = data!

  return (
    <SafeAreaView className="flex-1 bg-slate-900">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
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
          <Text className="text-slate-400 text-sm mt-0.5">Your shift at a glance</Text>
        </View>

        {/* Active Load Card */}
        {activeLoad ? (
          <Pressable
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onPress={() => router.push('/(driver)/loads' as any)}
            className="mb-5 bg-slate-800 border border-sky-700 rounded-xl p-4 active:opacity-80"
          >
            {/* Brand accent bar */}
            <View className="absolute left-0 top-0 bottom-0 w-1 bg-sky-500 rounded-l-xl" />

            <View className="pl-2">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-xs text-slate-400 font-medium uppercase tracking-wide">
                  Active Load
                </Text>
                {(() => {
                  const badge = getStatusBadge(activeLoad.status)
                  return <Badge label={badge.label} variant={badge.variant} />
                })()}
              </View>

              <Text className="text-lg font-bold text-white mb-1">
                #{activeLoad.loadNumber}
              </Text>

              <Text className="text-sm text-slate-300 mb-0.5">
                {activeLoad.customer.companyName}
              </Text>

              <View className="flex-row items-center mt-2">
                <Text className="text-sm text-slate-400 flex-1" numberOfLines={1}>
                  {activeLoad.origin}
                </Text>
                <ArrowRight color="#64748b" size={14} style={{ marginHorizontal: 6 }} />
                <Text className="text-sm text-slate-400 flex-1 text-right" numberOfLines={1}>
                  {activeLoad.destination}
                </Text>
              </View>

              <View className="flex-row items-center justify-end mt-3">
                <Text className="text-xs text-sky-400 font-medium mr-1">View Details</Text>
                <ArrowRight color="#38bdf8" size={12} />
              </View>
            </View>
          </Pressable>
        ) : (
          /* Empty state — no active load */
          <View className="mb-5 bg-slate-800 border border-slate-700 rounded-xl p-6 items-center">
            <Truck color="#475569" size={36} />
            <Text className="text-white text-base font-semibold mt-3">No active load</Text>
            <Text className="text-slate-400 text-sm mt-1 text-center">
              You have no load in progress right now.
            </Text>
            <Pressable
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onPress={() => router.push('/(driver)/loads' as any)}
              className="mt-4 bg-sky-600 px-5 py-2.5 rounded-lg active:opacity-80"
            >
              <Text className="text-white font-semibold text-sm">View All Loads</Text>
            </Pressable>
          </View>
        )}

        {/* Stats Row */}
        <View className="flex-row gap-2 mb-5">
          <StatChip value={todayMiles} label="Miles Today" />
          <StatChip value={stopsCompleted} label="Stops Done" />
          <StatChip value={`${hosHoursRemaining}h`} label="HOS Left" />
        </View>

        {/* Recent Alerts */}
        <View>
          <Text className="text-white font-semibold text-base mb-3">Recent Alerts</Text>

          {recentAlerts.length === 0 ? (
            <Text className="text-slate-500 text-sm">No recent alerts</Text>
          ) : (
            <View className="gap-2">
              {recentAlerts.map((alert: DashboardData['recentAlerts'][number]) => (
                <View
                  key={alert.id}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 flex-row items-start"
                >
                  <AlertTriangle
                    color={alert.type === 'danger' ? '#f87171' : '#fbbf24'}
                    size={16}
                    style={{ marginTop: 2, marginRight: 10, flexShrink: 0 }}
                  />
                  <View className="flex-1">
                    <Text className="text-slate-200 text-sm">{alert.message}</Text>
                    <Text className="text-slate-500 text-xs mt-0.5">
                      {formatAlertTime(alert.createdAt)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
