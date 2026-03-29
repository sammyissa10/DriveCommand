import React, { useCallback, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FlashList } from '@shopify/flash-list'
import { Package, Truck } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type OwnerLoadSummary } from '@drivecommand/api-client'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Badge } from '../../../components/ui/Badge'
import { CreateLoadSheet } from '../../../components/owner/CreateLoadSheet'
import { LoadCardSkeleton } from '../../../components/skeletons/LoadCardSkeleton'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { PageSpeedDial } from '../../../components/ui/PageSpeedDial'

type TabType = 'all' | 'active' | 'pending' | 'delivered'
type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

const STATUS_TABS: { key: TabType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Pending' },
  { key: 'delivered', label: 'Delivered' },
]

function getStatusBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', variant: 'muted' }
    case 'DISPATCHED':
      return { label: 'Dispatched', variant: 'info' }
    case 'PICKED_UP':
      return { label: 'Picked Up', variant: 'warning' }
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

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return ''
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

interface OwnerLoadCardProps {
  load: OwnerLoadSummary
  onPress: () => void
}

function OwnerLoadCard({ load, onPress }: OwnerLoadCardProps) {
  const badge = getStatusBadge(load.status)
  const driverLabel = load.driver ? load.driver.name : 'Unassigned'
  const isUnassigned = !load.driver
  const rateFormatted = formatCurrency(load.rate)

  return (
    <Pressable
      onPress={onPress}
      className="bg-slate-800 border border-slate-700 rounded-xl mx-4 mb-3 p-4 active:opacity-75"
    >
      {/* Top row: load number + rate + badge */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-white font-semibold text-base">#{load.loadNumber}</Text>
        <View className="flex-row items-center gap-2">
          {rateFormatted ? (
            <Text className="text-emerald-400 text-sm font-semibold">{rateFormatted}</Text>
          ) : null}
          <Badge label={badge.label} variant={badge.variant} />
        </View>
      </View>

      {/* Customer name */}
      <Text className="text-slate-300 text-sm font-medium mb-1" numberOfLines={1}>
        {load.customer.companyName}
      </Text>

      {/* Origin → Destination */}
      <Text className="text-slate-400 text-xs mb-2" numberOfLines={1}>
        {load.origin} → {load.destination}
      </Text>

      {/* Driver */}
      <View className="flex-row items-center">
        <Text
          className={`text-xs font-medium ${isUnassigned ? 'text-amber-400' : 'text-slate-400'}`}
          numberOfLines={1}
        >
          {isUnassigned ? '⚠ Unassigned' : `Driver: ${driverLabel}`}
        </Text>
      </View>
    </Pressable>
  )
}

export default function OwnerLoadsScreen() {
  const { token } = useAuthContext()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { create } = useLocalSearchParams<{ create?: string }>()
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [createSheetVisible, setCreateSheetVisible] = useState(create === '1')

  const { data, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ['owner-loads', activeTab],
    queryFn: () => ownerApi.getLoads(token!, activeTab),
    enabled: !!token,
  })

  const onRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const handleLoadCreated = useCallback(() => {
    // Invalidate all tab caches so the new load appears
    queryClient.invalidateQueries({ queryKey: ['owner-loads'] })
    setCreateSheetVisible(false)
  }, [queryClient])

  const renderItem = useCallback(
    ({ item }: { item: OwnerLoadSummary }) => (
      <OwnerLoadCard
        load={item}
        onPress={() => router.push(`/(owner)/loads/${item.id}` as never)}
      />
    ),
    [router]
  )

  const keyExtractor = useCallback((item: OwnerLoadSummary) => item.id, [])

  const emptyTitle = activeTab === 'all'
    ? 'No loads yet'
    : activeTab === 'active'
    ? 'No active loads'
    : activeTab === 'pending'
    ? 'No pending loads'
    : 'No delivered loads'

  const emptySubtitle = activeTab === 'all'
    ? 'Create your first load using the + button below.'
    : activeTab === 'active'
    ? 'Dispatched and in-transit loads will appear here.'
    : activeTab === 'pending'
    ? 'New loads awaiting dispatch will appear here.'
    : 'Completed loads will appear here.'

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
      {/* Screen header */}
      <View className="px-4 pt-4 pb-3">
        <Text className="text-2xl font-bold text-white">Loads</Text>
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
                icon={<Truck color="#475569" size={40} />}
                title={emptyTitle}
                subtitle={emptySubtitle}
              />
            }
          />
        </View>
      )}

      <PageSpeedDial
        primaryLabel="New Load"
        primaryIcon={Package}
        primaryColor="#38bdf8"
        onPrimaryPress={() => setCreateSheetVisible(true)}
      />

      {/* Create load bottom sheet */}
      <CreateLoadSheet
        visible={createSheetVisible}
        onClose={() => setCreateSheetVisible(false)}
        onCreated={handleLoadCreated}
      />
      </AnimatedScreen>
    </SafeAreaView>
  )
}
