import React, { useCallback, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { FlashList } from '@shopify/flash-list'
import { Navigation } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type OwnerRouteSummary } from '@drivecommand/api-client'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Badge } from '../../../components/ui/Badge'
import { LoadCardSkeleton } from '../../../components/skeletons/LoadCardSkeleton'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'

type TabType = 'all' | 'planned' | 'active' | 'completed'
type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

const STATUS_TABS: { key: TabType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'planned', label: 'Planned' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
]

function getStatusBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'PLANNED':
      return { label: 'Planned', variant: 'muted' }
    case 'IN_PROGRESS':
      return { label: 'In Progress', variant: 'warning' }
    case 'COMPLETED':
      return { label: 'Completed', variant: 'success' }
    default:
      return { label: status, variant: 'muted' }
  }
}

interface OwnerRouteCardProps {
  route: OwnerRouteSummary
  onPress: () => void
}

function OwnerRouteCard({ route, onPress }: OwnerRouteCardProps) {
  const badge = getStatusBadge(route.status)
  const routeName = route.name ?? 'Unnamed Route'
  const scheduledLabel = (() => {
    try {
      return new Date(route.scheduledDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return '—'
    }
  })()

  return (
    <Pressable
      onPress={onPress}
      className="bg-slate-800 border border-slate-700 rounded-xl mx-4 mb-3 p-4 active:opacity-75"
    >
      {/* Top row: route name + badge */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-white font-semibold text-base flex-1 mr-2" numberOfLines={1}>
          {routeName}
        </Text>
        <Badge label={badge.label} variant={badge.variant} />
      </View>

      {/* Origin → Destination */}
      <Text className="text-slate-400 text-xs mb-1" numberOfLines={1}>
        {route.origin} → {route.destination}
      </Text>

      {/* Scheduled date */}
      <Text className="text-slate-400 text-xs mb-2">{scheduledLabel}</Text>

      {/* Driver + counts */}
      <View className="flex-row items-center justify-between">
        <Text className="text-slate-400 text-xs font-medium" numberOfLines={1}>
          Driver: {route.driver.name}
        </Text>
        <Text className="text-slate-500 text-xs">
          {route._count.loads} loads, {route._count.stops} stops
        </Text>
      </View>
    </Pressable>
  )
}

export default function OwnerRoutesScreen() {
  const { token } = useAuthContext()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('all')

  const { data, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ['owner-routes', activeTab],
    queryFn: () => ownerApi.getRoutes(token!, activeTab),
    enabled: !!token,
  })

  const onRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const renderItem = useCallback(
    ({ item }: { item: OwnerRouteSummary }) => (
      <OwnerRouteCard
        route={item}
        onPress={() => router.push(`/(owner)/routes/${item.id}` as never)}
      />
    ),
    [router]
  )

  const keyExtractor = useCallback((item: OwnerRouteSummary) => item.id, [])

  const emptyTitle =
    activeTab === 'all'
      ? 'No routes yet'
      : activeTab === 'planned'
      ? 'No planned routes'
      : activeTab === 'active'
      ? 'No active routes'
      : 'No completed routes'

  const emptySubtitle =
    activeTab === 'all'
      ? 'Routes are created from the web portal.'
      : activeTab === 'planned'
      ? 'Planned routes awaiting dispatch will appear here.'
      : activeTab === 'active'
      ? 'Routes currently in progress will appear here.'
      : 'Completed routes will appear here.'

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Screen header */}
        <View className="px-4 pt-4 pb-3">
          <Text className="text-2xl font-bold text-white">Routes</Text>
        </View>

        {/* Status filter tabs — horizontally scrollable */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginBottom: 12 }}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
        >
          {STATUS_TABS.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              className={`rounded-full px-4 py-3 ${
                activeTab === tab.key
                  ? 'bg-sky-600'
                  : 'bg-slate-800 border border-slate-700'
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  activeTab === tab.key ? 'text-white' : 'text-slate-400'
                }`}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Content */}
        {isLoading ? (
          <View className="flex-1">
            <LoadCardSkeleton />
            <LoadCardSkeleton />
            <LoadCardSkeleton />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-red-400 text-base font-semibold mb-2">Failed to load</Text>
            <Pressable
              onPress={() => refetch()}
              className="bg-slate-700 px-6 py-3 rounded-lg active:opacity-80"
            >
              <Text className="text-white font-semibold">Retry</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-1">
            <FlashList
              data={data ?? []}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              showsVerticalScrollIndicator={false}
              refreshing={isRefetching}
              onRefresh={onRefresh}
              estimatedItemSize={120}
              contentContainerStyle={{ paddingBottom: 80 }}
              ListEmptyComponent={
                <EmptyState
                  icon={<Navigation color="#475569" size={40} />}
                  title={emptyTitle}
                  subtitle={emptySubtitle}
                />
              }
            />
          </View>
        )}
      </AnimatedScreen>
    </SafeAreaView>
  )
}
