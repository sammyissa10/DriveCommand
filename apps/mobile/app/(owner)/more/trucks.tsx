import React, { useCallback } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, Truck } from 'lucide-react-native'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type TruckOption } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'

// ---------------------------------------------------------------------------
// TruckCard Component
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { text: string; bg: string }> = {
  'In Use':           { text: '#38bdf8', bg: '#38bdf820' },
  'In Maintenance':   { text: '#f59e0b', bg: '#f59e0b20' },
  'Expired Docs':     { text: '#ef4444', bg: '#ef444420' },
  'Ready to Use':     { text: '#22c55e', bg: '#22c55e20' },
}

function TruckCard({ truck }: { truck: TruckOption }) {
  const colors = STATUS_COLORS[truck.status] ?? STATUS_COLORS['Ready to Use']

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#334155',
        backgroundColor: '#1e293b',
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {/* Icon */}
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 10,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
          flexShrink: 0,
        }}
      >
        <Truck color={colors.text} size={20} />
      </View>

      {/* Info */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 15, marginBottom: 3 }}
          numberOfLines={1}
        >
          {truck.year} {truck.make} {truck.model}
        </Text>
        <Text style={{ color: '#64748b', fontSize: 13 }} numberOfLines={1}>
          {truck.licensePlate}
        </Text>
      </View>

      {/* Status badge */}
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 20,
          backgroundColor: colors.bg,
          flexShrink: 0,
        }}
      >
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600' }}>
          {truck.status}
        </Text>
      </View>
    </View>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: '#334155',
          }}
        >
          <Pressable onPress={() => router.back()} style={{ marginRight: 12 }} hitSlop={8}>
            <ChevronLeft color="#f1f5f9" size={24} />
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#f1f5f9' }}>Trucks</Text>
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#38bdf8" size="large" />
          </View>
        ) : isError ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 24,
            }}
          >
            <AlertTriangle color="#f87171" size={40} />
            <Text
              style={{
                color: '#f1f5f9',
                fontSize: 17,
                fontWeight: '600',
                marginTop: 16,
                textAlign: 'center',
              }}
            >
              Failed to load trucks
            </Text>
            <Text style={{ color: '#64748b', fontSize: 14, marginTop: 6, textAlign: 'center' }}>
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={{
                marginTop: 20,
                backgroundColor: '#0ea5e9',
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
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
            <View style={{ paddingHorizontal: 16, paddingVertical: 16, gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[
                  { label: 'Total', value: totalCount, color: '#f1f5f9' },
                  { label: 'In Use', value: inUseCount, color: '#38bdf8' },
                ].map((s) => (
                  <View key={s.label} style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', padding: 14, alignItems: 'center' }}>
                    <Text style={{ color: s.color, fontSize: 22, fontWeight: '700' }}>{s.value}</Text>
                    <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{s.label}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[
                  { label: 'In Maint.', value: maintenanceCount, color: maintenanceCount > 0 ? '#f59e0b' : '#64748b' },
                  { label: 'Expired Docs', value: expiredDocsCount, color: expiredDocsCount > 0 ? '#ef4444' : '#64748b' },
                ].map((s) => (
                  <View key={s.label} style={{ flex: 1, backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', padding: 14, alignItems: 'center' }}>
                    <Text style={{ color: s.color, fontSize: 22, fontWeight: '700' }}>{s.value}</Text>
                    <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{s.label}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* List */}
            {totalCount === 0 ? (
              <View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 24,
                  paddingTop: 60,
                }}
              >
                <Truck color="#334155" size={48} />
                <Text
                  style={{ color: '#64748b', fontSize: 15, marginTop: 12, textAlign: 'center' }}
                >
                  No trucks in your fleet
                </Text>
              </View>
            ) : (
              <>
                <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
                  <Text style={{ color: '#64748b', fontSize: 13 }}>
                    {totalCount} truck{totalCount !== 1 ? 's' : ''} in fleet
                  </Text>
                </View>
                {data?.map((truck) => (
                  <TruckCard key={truck.id} truck={truck} />
                ))}
              </>
            )}
          </ScrollView>
        )}
      </AnimatedScreen>
    </SafeAreaView>
  )
}
