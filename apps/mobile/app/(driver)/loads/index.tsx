import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { FlashList } from '@shopify/flash-list'
import { Truck } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../../../context/AuthContext'
import { driverApi, type LoadSummary } from '@drivecommand/api-client'
import { LoadCard } from '../../../components/driver/LoadCard'
import { EmptyState } from '../../../components/ui/EmptyState'
import { LoadCardSkeleton } from '../../../components/skeletons/LoadCardSkeleton'

type TabType = 'active' | 'history'

export default function LoadsScreen() {
  const { token } = useAuthContext()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('active')

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['driver-loads', activeTab],
    queryFn: () => driverApi.getLoads(token!, activeTab),
    enabled: !!token,
  })

  const onRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const renderItem = useCallback(
    ({ item }: { item: LoadSummary }) => (
      <LoadCard
        load={item}
        onPress={() => router.push(`/(driver)/loads/${item.id}` as never)}
      />
    ),
    [router]
  )

  const keyExtractor = useCallback((item: LoadSummary) => item.id, [])

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
          className={`flex-1 rounded-md py-3 items-center ${
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
          className={`flex-1 rounded-md py-3 items-center ${
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
        <View className="flex-1">
          <LoadCardSkeleton />
          <LoadCardSkeleton />
          <LoadCardSkeleton />
        </View>
      ) : (
        <View className="flex-1">
          <FlashList
            data={data ?? []}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            estimatedItemSize={88}
            showsVerticalScrollIndicator={false}
            refreshing={isRefetching}
            onRefresh={onRefresh}
            ListEmptyComponent={
              <EmptyState
                icon={<Truck color="#475569" size={40} />}
                title={activeTab === 'active' ? 'No active loads' : 'No completed loads'}
                subtitle={
                  activeTab === 'active'
                    ? 'You have no loads in progress right now.'
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
