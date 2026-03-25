import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { FlashList } from '@shopify/flash-list'
import { Truck } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type OwnerLoadSummary } from '@drivecommand/api-client'
import { EmptyState } from '../../../components/ui/EmptyState'
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner'
import { Badge } from '../../../components/ui/Badge'

type TabType = 'active' | 'history'
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

interface OwnerLoadCardProps {
  load: OwnerLoadSummary
  onPress: () => void
}

function OwnerLoadCard({ load, onPress }: OwnerLoadCardProps) {
  const badge = getStatusBadge(load.status)
  const truckLabel = load.truck
    ? `${load.truck.make} ${load.truck.model} · ${load.truck.licensePlate}`
    : 'No truck assigned'
  const driverLabel = load.driver ? load.driver.name : 'No driver assigned'

  return (
    <Pressable
      onPress={onPress}
      className="bg-slate-800 border border-slate-700 rounded-xl mx-4 mb-3 p-4 active:opacity-75"
    >
      {/* Top row: load number + badge */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-white font-semibold text-base">
          #{load.loadNumber}
        </Text>
        <Badge label={badge.label} variant={badge.variant} />
      </View>

      {/* Origin → Destination */}
      <Text className="text-slate-300 text-sm mb-1" numberOfLines={1}>
        {load.origin} → {load.destination}
      </Text>

      {/* Customer */}
      <Text className="text-slate-400 text-xs mb-2" numberOfLines={1}>
        {load.customer.companyName}
      </Text>

      {/* Truck + Driver */}
      <View className="flex-row flex-wrap gap-x-4">
        <Text
          className={`text-xs ${load.truck ? 'text-sky-400' : 'text-slate-500'}`}
          numberOfLines={1}
        >
          {truckLabel}
        </Text>
        <Text
          className={`text-xs ${load.driver ? 'text-slate-400' : 'text-slate-500'}`}
          numberOfLines={1}
        >
          {driverLabel}
        </Text>
      </View>
    </Pressable>
  )
}

export default function OwnerLoadsScreen() {
  const { token } = useAuthContext()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('active')

  const { data, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ['owner-loads', activeTab],
    queryFn: () => ownerApi.getLoads(token!, activeTab),
    enabled: !!token,
  })

  const onRefresh = useCallback(() => {
    refetch()
  }, [refetch])

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

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={['bottom', 'left', 'right']}>
      {/* Screen header */}
      <View className="px-4 pt-4 pb-3">
        <Text className="text-2xl font-bold text-white">Loads</Text>
      </View>

      {/* Active / History toggle tabs */}
      <View className="flex-row mx-4 mb-3 bg-slate-800 rounded-lg p-1">
        <Pressable
          onPress={() => setActiveTab('active')}
          className={`flex-1 rounded-md py-2 items-center ${
            activeTab === 'active' ? 'bg-sky-600' : 'bg-transparent'
          }`}
        >
          <Text
            className={`text-sm font-semibold ${
              activeTab === 'active' ? 'text-white' : 'text-slate-400'
            }`}
          >
            Active
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('history')}
          className={`flex-1 rounded-md py-2 items-center ${
            activeTab === 'history' ? 'bg-sky-600' : 'bg-transparent'
          }`}
        >
          <Text
            className={`text-sm font-semibold ${
              activeTab === 'history' ? 'text-white' : 'text-slate-400'
            }`}
          >
            History
          </Text>
        </Pressable>
      </View>

      {/* Content */}
      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <LoadingSpinner />
          <Text className="text-slate-400 mt-3 text-sm">Loading loads...</Text>
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
            ListEmptyComponent={
              <EmptyState
                icon={<Truck color="#475569" size={40} />}
                title={activeTab === 'active' ? 'No active loads' : 'No completed loads'}
                subtitle={
                  activeTab === 'active'
                    ? 'No loads in progress for your fleet.'
                    : 'Completed loads will appear here.'
                }
              />
            }
          />
        </View>
      )}
    </SafeAreaView>
  )
}
