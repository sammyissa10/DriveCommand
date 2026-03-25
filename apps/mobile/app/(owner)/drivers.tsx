import React, { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { FlashList } from '@shopify/flash-list'
import { AlertTriangle, Users } from 'lucide-react-native'
import { useAuthContext } from '../../context/AuthContext'
import { ownerApi, type OwnerDriverSummary } from '@drivecommand/api-client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FilterTab = 'all' | 'on_duty' | 'off_duty'

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'on_duty', label: 'On Duty' },
  { key: 'off_duty', label: 'Off Duty' },
]

/**
 * Deterministic color from driver name — generates a consistent hue from
 * the name string so each avatar has a stable color.
 */
function getAvatarColor(name: string): string {
  const COLORS = [
    '#0ea5e9', // sky
    '#8b5cf6', // violet
    '#f59e0b', // amber
    '#10b981', // emerald
    '#ef4444', // red
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#f97316', // orange
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function getHOSLabel(hosStatus: string | null): string {
  switch (hosStatus) {
    case 'DRIVING':
      return 'Driving'
    case 'ON_DUTY':
      return 'On Duty'
    case 'OFF_DUTY':
      return 'Off Duty'
    case 'SLEEPER_BERTH':
      return 'Sleeper'
    default:
      return 'Off Duty'
  }
}

// ---------------------------------------------------------------------------
// DriverCard Component
// ---------------------------------------------------------------------------

interface DriverCardProps {
  driver: OwnerDriverSummary
  onPress: () => void
}

function DriverCard({ driver, onPress }: DriverCardProps) {
  const avatarColor = getAvatarColor(driver.name)
  const initials = getInitials(driver.name)

  // Compliance dot color
  const complianceDotColor =
    driver.complianceStatus === 'critical'
      ? '#ef4444'
      : driver.complianceStatus === 'warning'
        ? '#f59e0b'
        : '#22c55e'

  // Status badge color based on HOS status
  const hosLabelColor =
    driver.hosStatus === 'DRIVING'
      ? '#22c55e'
      : driver.hosStatus === 'ON_DUTY'
        ? '#38bdf8'
        : '#64748b'

  const loadLabel = driver.currentLoadNumber
    ? `#${driver.currentLoadNumber}`
    : 'No active load'
  const isUnassigned = !driver.currentLoadNumber

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? '#1e3a5f' : '#1e293b',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 12,
        padding: 14,
        marginHorizontal: 16,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      })}
    >
      {/* Avatar circle */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: avatarColor + '33', // 20% opacity
          borderWidth: 2,
          borderColor: avatarColor,
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Text style={{ color: avatarColor, fontWeight: '700', fontSize: 15 }}>
          {initials}
        </Text>
      </View>

      {/* Center: name + status */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 15 }}
          numberOfLines={1}
        >
          {driver.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 }}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 3.5,
              backgroundColor: hosLabelColor,
            }}
          />
          <Text style={{ color: hosLabelColor, fontSize: 12 }}>
            {getHOSLabel(driver.hosStatus)}
          </Text>
        </View>
        <Text
          style={{ color: isUnassigned ? '#475569' : '#94a3b8', fontSize: 12, marginTop: 2 }}
          numberOfLines={1}
        >
          {loadLabel}
        </Text>
      </View>

      {/* Right: compliance dot */}
      <View style={{ alignItems: 'center', flexShrink: 0, gap: 4 }}>
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 6,
            backgroundColor: complianceDotColor,
          }}
        />
        {(driver.expiredDocCount > 0 || driver.expiringDocCount > 0) && (
          <Text style={{ color: complianceDotColor, fontSize: 10, fontWeight: '600' }}>
            {driver.expiredDocCount > 0
              ? `${driver.expiredDocCount} exp`
              : `${driver.expiringDocCount} warn`}
          </Text>
        )}
      </View>
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function OwnerDriversScreen() {
  const { token } = useAuthContext()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<FilterTab>('all')

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<OwnerDriverSummary[]>({
    queryKey: ['owner-drivers'],
    queryFn: () => ownerApi.getDrivers(token!),
    enabled: !!token,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const onRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const filtered =
    !data
      ? []
      : activeTab === 'all'
        ? data
        : data.filter((d) => d.status === activeTab)

  // Loading
  if (isLoading) {
    return (
      <SafeAreaView
        className="flex-1 bg-slate-900 items-center justify-center"
        edges={['bottom', 'left', 'right']}
      >
        <ActivityIndicator size="large" color="#0ea5e9" />
        <Text className="text-slate-400 mt-3 text-sm">Loading drivers...</Text>
      </SafeAreaView>
    )
  }

  // Error
  if (isError) {
    return (
      <SafeAreaView
        className="flex-1 bg-slate-900 items-center justify-center px-6"
        edges={['bottom', 'left', 'right']}
      >
        <AlertTriangle color="#f87171" size={40} />
        <Text className="text-white text-lg font-semibold mt-4 text-center">
          Failed to load drivers
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

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={['bottom', 'left', 'right']}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
        <Text style={{ color: '#f1f5f9', fontSize: 22, fontWeight: '700' }}>Drivers</Text>
        <Text style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>
          {data?.length ?? 0} driver{(data?.length ?? 0) !== 1 ? 's' : ''} in fleet
        </Text>
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}
      >
        {FILTER_TABS.map((tab) => {
          const count =
            tab.key === 'all'
              ? (data?.length ?? 0)
              : (data?.filter((d) => d.status === tab.key).length ?? 0)
          const isActive = activeTab === tab.key
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 7,
                borderRadius: 20,
                backgroundColor: isActive ? '#0ea5e9' : '#1e293b',
                borderWidth: 1,
                borderColor: isActive ? '#0ea5e9' : '#334155',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Text
                style={{
                  color: isActive ? '#ffffff' : '#94a3b8',
                  fontWeight: isActive ? '600' : '400',
                  fontSize: 13,
                }}
              >
                {tab.label}
              </Text>
              <View
                style={{
                  backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : '#334155',
                  borderRadius: 10,
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                }}
              >
                <Text
                  style={{
                    color: isActive ? '#ffffff' : '#64748b',
                    fontSize: 11,
                    fontWeight: '600',
                  }}
                >
                  {count}
                </Text>
              </View>
            </Pressable>
          )
        })}
      </ScrollView>

      {/* Driver list */}
      {filtered.length === 0 ? (
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}
        >
          <Users color="#334155" size={48} />
          <Text style={{ color: '#64748b', fontSize: 15, marginTop: 12, textAlign: 'center' }}>
            {activeTab === 'all' ? 'No drivers in your fleet' : `No ${activeTab === 'on_duty' ? 'on duty' : 'off duty'} drivers`}
          </Text>
        </View>
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(item) => item.id}
          estimatedItemSize={88}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor="#0ea5e9"
              colors={['#0ea5e9']}
            />
          }
          renderItem={({ item }) => (
            <DriverCard
              driver={item}
              onPress={() => router.push(`/(owner)/drivers/${item.id}` as any)}
            />
          )}
          contentContainerStyle={{ paddingTop: 4, paddingBottom: 32 }}
        />
      )}
    </SafeAreaView>
  )
}
