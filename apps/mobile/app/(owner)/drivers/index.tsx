import React, { useCallback, useState } from 'react'
import {
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
import { AlertTriangle, UserPlus, Users } from 'lucide-react-native'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type OwnerDriverSummary } from '@drivecommand/api-client'
import { DriverCardSkeleton } from '../../../components/skeletons/DriverCardSkeleton'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { PageSpeedDial } from '../../../components/ui/PageSpeedDial'
import { haptic } from '../../../lib/haptics'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FilterTab = 'all' | 'on_duty' | 'off_duty'

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'on_duty', label: 'On Duty' },
  { key: 'off_duty', label: 'Off Duty' },
]

function getAvatarColor(name: string): string {
  const COLORS = [
    '#0ea5e9', '#8b5cf6', '#f59e0b', '#10b981',
    '#ef4444', '#ec4899', '#06b6d4', '#f97316',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function getHOSInfo(hosStatus: string | null, hasActiveLoad: boolean): { label: string; color: string } {
  if (hosStatus === 'DRIVING')      return { label: 'Driving',  color: '#22c55e' }
  if (hosStatus === 'ON_DUTY')      return { label: 'On Duty',  color: '#38bdf8' }
  if (hosStatus === 'SLEEPER_BERTH') return { label: 'Sleeper', color: '#8b5cf6' }
  if (hasActiveLoad)                return { label: 'On Load',  color: '#38bdf8' }
  return { label: 'Off Duty', color: '#475569' }
}

// ---------------------------------------------------------------------------
// DriverRow Component
// ---------------------------------------------------------------------------

interface DriverRowProps {
  driver: OwnerDriverSummary
  onPress: () => void
}

function DriverRow({ driver, onPress }: DriverRowProps) {
  const avatarColor = getAvatarColor(driver.name)
  const initials = getInitials(driver.name)
  const { label: statusLabel, color: statusColor } = getHOSInfo(driver.hosStatus, !!driver.currentLoadNumber)
  const isActive = driver.hosStatus === 'DRIVING' || driver.hosStatus === 'ON_DUTY'

  return (
    <View style={{
      marginHorizontal: 16,
      marginBottom: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: '#334155',
      backgroundColor: '#1e293b',
      overflow: 'hidden',
    }}>
    <Pressable
      onPress={() => { haptic.light(); onPress() }}
      android_ripple={{ color: 'rgba(56,189,248,0.08)', borderless: false }}
      style={({ pressed }) => ({
        backgroundColor: pressed ? '#1a2d45' : 'transparent',
        minHeight: 68,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14 }}>
        {/* Avatar */}
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: avatarColor + '22',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 14,
            flexShrink: 0,
          }}
        >
          <Text style={{ color: avatarColor, fontWeight: '700', fontSize: 15 }}>
            {initials}
          </Text>
        </View>

        {/* Info */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 16, marginBottom: 3 }}
            numberOfLines={1}
          >
            {toTitleCase(driver.name)}
</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: statusColor, marginRight: 5 }} />
            <Text style={{ color: statusColor, fontSize: 13, fontWeight: '500' }}>
              {statusLabel}
            </Text>
            {driver.currentLoadNumber && (
              <>
                <Text style={{ color: '#475569', fontSize: 13, marginHorizontal: 5 }}>·</Text>
                <Text style={{ color: '#38bdf8', fontSize: 13, fontWeight: '500' }}>
                  #{driver.currentLoadNumber}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Chevron */}
        <Text style={{ color: '#475569', fontSize: 20, marginLeft: 8, flexShrink: 0 }}>›</Text>
      </View>
    </Pressable>
    </View>
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

  const onRefresh = useCallback(() => { refetch() }, [refetch])

  const renderDriverItem = useCallback(
    ({ item }: { item: OwnerDriverSummary }) => (
      <DriverRow
        driver={item}
        onPress={() => router.push(`/(owner)/drivers/${item.id}` as any)}
      />
    ),
    [router]
  )

  const keyExtractor = useCallback((item: OwnerDriverSummary) => item.id, [])

  const filtered = !data
    ? []
    : activeTab === 'all'
      ? data
      : data.filter((d) => d.status === activeTab)

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }} edges={['bottom', 'left', 'right']}>
        <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16 }}>
          <View style={{ width: 80, height: 24, backgroundColor: '#1e293b', borderRadius: 6, marginBottom: 6 }} />
          <View style={{ width: 130, height: 13, backgroundColor: '#1e293b', borderRadius: 4 }} />
        </View>
        {[...Array(6)].map((_, i) => <DriverCardSkeleton key={i} />)}
      </SafeAreaView>
    )
  }

  if (isError) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }} edges={['bottom', 'left', 'right']}>
        <AlertTriangle color="#f87171" size={40} />
        <Text style={{ color: '#f1f5f9', fontSize: 17, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>Failed to load drivers</Text>
        <Text style={{ color: '#64748b', fontSize: 14, marginTop: 6, textAlign: 'center' }}>
          {error instanceof Error ? error.message : 'An unexpected error occurred'}
        </Text>
        <Pressable
          onPress={() => refetch()}
          style={{ marginTop: 20, backgroundColor: '#0ea5e9', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12 }}>
          <Text style={{ color: '#f1f5f9', fontSize: 24, fontWeight: '700' }}>Drivers</Text>
          <Text style={{ color: '#475569', fontSize: 13, marginTop: 2 }}>
            {data?.length ?? 0} driver{(data?.length ?? 0) !== 1 ? 's' : ''} in fleet
          </Text>
        </View>

        {/* Filter chips */}
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
                onPress={() => { haptic.light(); setActiveTab(tab.key) }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor: isActive ? '#38bdf8' : '#1e293b',
                  borderWidth: 1,
                  borderColor: isActive ? '#38bdf8' : '#334155',
                  gap: 6,
                }}
              >
                <Text style={{ color: isActive ? '#0f172a' : '#94a3b8', fontWeight: '600', fontSize: 13 }}>
                  {tab.label}
                </Text>
                <View style={{
                  backgroundColor: isActive ? 'rgba(15,23,42,0.2)' : '#334155',
                  borderRadius: 10,
                  paddingHorizontal: 6,
                  paddingVertical: 1,
                }}>
                  <Text style={{ color: isActive ? '#0f172a' : '#64748b', fontSize: 11, fontWeight: '700' }}>
                    {count}
                  </Text>
                </View>
              </Pressable>
            )
          })}
        </ScrollView>

        {/* List container */}
        <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
          {filtered.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
              <Users color="#334155" size={48} />
              <Text style={{ color: '#64748b', fontSize: 15, marginTop: 12, textAlign: 'center' }}>
                {activeTab === 'all' ? 'No drivers in your fleet' : `No ${activeTab === 'on_duty' ? 'on duty' : 'off duty'} drivers`}
              </Text>
            </View>
          ) : (
            <FlashList
              data={filtered}
              estimatedItemSize={68}
              refreshControl={
                <RefreshControl
                  refreshing={isRefetching}
                  onRefresh={onRefresh}
                  tintColor="#38bdf8"
                  colors={['#38bdf8']}
                />
              }
              renderItem={renderDriverItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
            />
          )}
        </View>

        <PageSpeedDial
          primaryLabel="Invite Driver"
          primaryIcon={UserPlus}
          primaryColor="#a78bfa"
          onPrimaryPress={() => router.push('/(owner)/drivers/invite' as any)}
        />
      </AnimatedScreen>
    </SafeAreaView>
  )
}
