import React, { useCallback } from 'react'
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, ChevronRight, Truck } from 'lucide-react-native'
import { useAuthContext } from '../../../../context/AuthContext'
import { ownerApi, type TruckOption } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../../components/ui/AnimatedScreen'
import { PageSpeedDial } from '../../../../components/ui/PageSpeedDial'
import { TruckCardSkeleton } from '../../../../components/skeletons/TruckCardSkeleton'

// ---------------------------------------------------------------------------
// TruckCard Component
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { text: string; bg: string }> = {
  'In Use':           { text: '#38bdf8', bg: '#38bdf820' },
  'In Maintenance':   { text: '#f59e0b', bg: '#f59e0b20' },
  'Expired Docs':     { text: '#ef4444', bg: '#ef444420' },
  'Ready to Use':     { text: '#22c55e', bg: '#22c55e20' },
}

function TruckCard({ truck, onPress }: { truck: TruckOption; onPress: () => void }) {
  const colors = STATUS_COLORS[truck.status] ?? STATUS_COLORS['Ready to Use']

  return (
    <Pressable
      onPress={onPress}
      className="mx-4 mb-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3.5 flex-row items-center active:opacity-75"
    >
      {/* Icon */}
      <View
        className="w-[42px] h-[42px] rounded-[10px] items-center justify-center mr-3.5 shrink-0"
        style={{ backgroundColor: colors.bg }}
      >
        <Truck color={colors.text} size={20} />
      </View>

      {/* Info */}
      <View className="flex-1 min-w-0">
        <Text className="text-slate-100 font-bold text-[15px] mb-0.5" numberOfLines={1}>
          {truck.year} {truck.make} {truck.model}
        </Text>
        <Text className="text-slate-500 text-[13px]" numberOfLines={1}>
          {truck.licensePlate}
        </Text>
      </View>

      {/* Status badge + chevron */}
      <View className="flex-row items-center gap-2">
        <View className="px-2.5 py-1 rounded-[20px]" style={{ backgroundColor: colors.bg }}>
          <Text className="text-xs font-semibold" style={{ color: colors.text }}>
            {truck.status}
          </Text>
        </View>
        <ChevronRight color="#475569" size={16} />
      </View>
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TrucksScreen() {
  const { token } = useAuthContext()
  const router = useRouter()

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<TruckOption[]>({
    queryKey: ['owner-trucks'],
    queryFn: () => ownerApi.getTrucks(token!),
    enabled: !!token,
    staleTime: 60_000,
  })

  const onRefresh = useCallback(() => { refetch() }, [refetch])

  const totalCount = data?.length ?? 0
  const inUseCount = data?.filter((t) => t.status === 'In Use').length ?? 0
  const maintenanceCount = data?.filter((t) => t.status === 'In Maintenance').length ?? 0
  const expiredDocsCount = data?.filter((t) => t.status === 'Expired Docs').length ?? 0

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View className="flex-row items-center px-4 py-3.5 border-b border-slate-700">
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => router.back()}
            className="mr-3"
            hitSlop={8}
          >
            <ChevronLeft color="#f1f5f9" size={24} />
          </Pressable>
          <Text className="text-lg font-bold text-slate-100 flex-1">Trucks</Text>
        </View>

        {isLoading ? (
          <View className="pt-3">
            <TruckCardSkeleton />
            <TruckCardSkeleton />
            <TruckCardSkeleton />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <AlertTriangle color="#f87171" size={40} />
            <Text className="text-slate-100 text-[17px] font-semibold mt-4 text-center">
              Failed to load trucks
            </Text>
            <Text className="text-slate-500 text-sm mt-1.5 text-center">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="mt-5 bg-sky-500 px-6 py-3 rounded-[10px]"
            >
              <Text className="text-white font-semibold">Retry</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={onRefresh}
                tintColor="#38bdf8"
                colors={['#38bdf8']}
              />
            }
            contentContainerStyle={{ paddingBottom: 32 }}
          >
            {/* Stats grid */}
            <View className="px-4 py-4 gap-2.5">
              <View className="flex-row gap-2.5">
                {[
                  { label: 'Total', value: totalCount, color: '#f1f5f9' },
                  { label: 'In Use', value: inUseCount, color: '#38bdf8' },
                ].map((s) => (
                  <View key={s.label} className="flex-1 bg-slate-800 rounded-xl border border-slate-700 p-3.5 items-center">
                    <Text className="text-[22px] font-bold" style={{ color: s.color }}>{s.value}</Text>
                    <Text className="text-slate-500 text-xs mt-0.5">{s.label}</Text>
                  </View>
                ))}
              </View>
              <View className="flex-row gap-2.5">
                {[
                  { label: 'In Maint.', value: maintenanceCount, color: maintenanceCount > 0 ? '#f59e0b' : '#64748b' },
                  { label: 'Expired Docs', value: expiredDocsCount, color: expiredDocsCount > 0 ? '#ef4444' : '#64748b' },
                ].map((s) => (
                  <View key={s.label} className="flex-1 bg-slate-800 rounded-xl border border-slate-700 p-3.5 items-center">
                    <Text className="text-[22px] font-bold" style={{ color: s.color }}>{s.value}</Text>
                    <Text className="text-slate-500 text-xs mt-0.5">{s.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* List */}
            {totalCount === 0 ? (
              <View className="items-center justify-center px-6 pt-[60px]">
                <Truck color="#334155" size={48} />
                <Text className="text-slate-500 text-[15px] mt-3 text-center">
                  No trucks in your fleet
                </Text>
                <Pressable
                  onPress={() => router.push('/(owner)/more/trucks/new' as never)}
                  className="mt-4 bg-sky-600 px-6 py-3 rounded-xl active:opacity-75"
                >
                  <Text className="text-white font-semibold">Add First Truck</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View className="px-4 pb-2.5">
                  <Text className="text-slate-500 text-[13px]">
                    {totalCount} truck{totalCount !== 1 ? 's' : ''} in fleet
                  </Text>
                </View>
                {data?.map((truck) => (
                  <TruckCard
                    key={truck.id}
                    truck={truck}
                    onPress={() => router.push(`/(owner)/more/trucks/${truck.id}` as never)}
                  />
                ))}
              </>
            )}
          </ScrollView>
        )}
        <PageSpeedDial
          primaryLabel="Add Truck"
          primaryIcon={Truck}
          primaryColor="#f87171"
          onPrimaryPress={() => router.push('/(owner)/more/trucks/new' as never)}
        />
      </AnimatedScreen>
    </SafeAreaView>
  )
}
