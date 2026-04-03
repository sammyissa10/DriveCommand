import React, { useCallback, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { FlashList } from '@shopify/flash-list'
import { Truck } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../../../context/AuthContext'
import { driverApi, type LoadSummary } from '@drivecommand/api-client'
import { LoadCard } from '../../../components/driver/LoadCard'
import { RouteCard } from '../../../components/driver/RouteCard'
import { EmptyState } from '../../../components/ui/EmptyState'
import { LoadCardSkeleton } from '../../../components/skeletons/LoadCardSkeleton'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { useThemeColors } from '../../../constants/tokens'

type TabType = 'active' | 'history'

export default function LoadsScreen() {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabType>('active')

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['driver-loads', activeTab],
    queryFn: () => driverApi.getLoads(token!, activeTab),
    enabled: !!token,
  })

  const { data: routeData } = useQuery({
    queryKey: ['driver-route'],
    queryFn: () => driverApi.getMyRoute(token!),
    enabled: !!token,
  })

  const route = routeData?.route ?? null

  const handleRoutePress = useCallback(() => {
    router.push('/(driver)/loads/my-route' as never)
  }, [router])

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

  const listHeader = useMemo(
    () =>
      route ? (
        <RouteCard route={route} onPress={handleRoutePress} />
      ) : null,
    [route, handleRoutePress]
  )

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
      {/* Screen header */}
      <View className="px-4 pt-4 pb-3">
        <Text className="text-2xl font-bold" style={{ color: c.textPrimary }}>Loads</Text>
      </View>

      {/* Active / History toggle tabs */}
      <View className="flex-row mx-4 mb-3 rounded-lg p-1" style={{ backgroundColor: c.surfaceCard }}>
        <Pressable
          onPress={() => setActiveTab('active')}
          className="flex-1 rounded-md py-3 items-center"
          style={{ backgroundColor: activeTab === 'active' ? c.brand : 'transparent' }}
        >
          <Text
            className="text-sm font-semibold"
            style={{ color: activeTab === 'active' ? '#ffffff' : c.textSecondary }}
          >
            Active
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setActiveTab('history')}
          className="flex-1 rounded-md py-3 items-center"
          style={{ backgroundColor: activeTab === 'history' ? c.brand : 'transparent' }}
        >
          <Text
            className="text-sm font-semibold"
            style={{ color: activeTab === 'history' ? '#ffffff' : c.textSecondary }}
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
            ListHeaderComponent={listHeader}
            ListEmptyComponent={
              <EmptyState
                icon={<Truck color={c.textMuted} size={40} />}
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
      </AnimatedScreen>
    </SafeAreaView>
  )
}
