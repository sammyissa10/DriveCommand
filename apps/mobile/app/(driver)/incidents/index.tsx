import React, { useCallback } from 'react'
import { Pressable, RefreshControl, Text, View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Plus } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../../../context/AuthContext'
import { driverApi } from '@drivecommand/api-client'
import type { Incident } from '@drivecommand/api-client'

const SEVERITY_COLORS: Record<string, string> = {
  LOW: '#4ade80',
  MEDIUM: '#fbbf24',
  HIGH: '#f87171',
}

const CATEGORY_LABELS: Record<string, string> = {
  ACCIDENT: 'Accident',
  VIOLATION: 'Violation',
  MECHANICAL: 'Mechanical Issue',
  HAZARD: 'Hazard',
  OTHER: 'Other',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function IncidentsScreen() {
  const { token } = useAuthContext()
  const router = useRouter()

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['driver-incidents'],
    queryFn: () => driverApi.getIncidents(token!),
    enabled: !!token,
  })

  const onRefresh = useCallback(() => { refetch() }, [refetch])
  const incidents = data?.incidents ?? []

  const renderItem = useCallback(({ item: incident }: { item: Incident }) => (
    <View
      className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-3"
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-white font-semibold text-sm">
          {CATEGORY_LABELS[incident.category] ?? incident.category}
        </Text>
        <View
          style={{ backgroundColor: SEVERITY_COLORS[incident.severity] + '22', borderColor: SEVERITY_COLORS[incident.severity] + '66', borderWidth: 1 }}
          className="px-2 py-0.5 rounded-full"
        >
          <Text style={{ color: SEVERITY_COLORS[incident.severity] }} className="text-xs font-semibold">
            {incident.severity}
          </Text>
        </View>
      </View>
      <Text className="text-slate-300 text-sm mb-2" numberOfLines={2}>
        {incident.description}
      </Text>
      <Text className="text-slate-500 text-xs">
        {formatDate(incident.reportedAt)}
      </Text>
    </View>
  ), [])

  const ListEmptyComponent = useCallback(() => {
    if (isLoading) {
      return (
        <View className="items-center justify-center py-20">
          <Text className="text-slate-400 text-sm">Loading incidents...</Text>
        </View>
      )
    }
    return (
      <View className="items-center justify-center py-20 px-8">
        <AlertTriangle color="#334155" size={48} />
        <Text className="text-white text-lg font-semibold mt-4 text-center">No incidents reported</Text>
        <Text className="text-slate-500 text-sm mt-2 text-center">
          Your submitted incident reports will appear here.
        </Text>
      </View>
    )
  }, [isLoading])

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={['bottom', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-3">
        <Text className="text-2xl font-bold text-white">Incidents</Text>
        <Pressable
          onPress={() => router.push('/(driver)/incidents/new' as never)}
          className="bg-sky-600 flex-row items-center gap-1.5 px-3 py-2 rounded-lg active:opacity-80"
        >
          <Plus color="#ffffff" size={16} />
          <Text className="text-white text-sm font-semibold">Report</Text>
        </Pressable>
      </View>

      <FlashList
        data={incidents}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        estimatedItemSize={120}
        ListEmptyComponent={ListEmptyComponent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={onRefresh} tintColor="#0ea5e9" colors={['#0ea5e9']} />
        }
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  )
}
