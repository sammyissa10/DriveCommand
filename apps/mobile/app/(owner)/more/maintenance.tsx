import React, { useCallback, useState } from 'react'
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
import { AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Wrench } from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type ScheduledServiceWithTruck, type TruckOption } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { ScheduleServiceSheet } from '../../../components/owner/ScheduleServiceSheet'
import { haptic } from '../../../lib/haptics'
import { useThemeColors } from '../../../constants/tokens'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

function StatusBadge({ status }: { status: 'overdue' | 'due_soon' | 'ok' }) {
  const label = status === 'overdue' ? 'Overdue' : status === 'due_soon' ? 'Due Soon' : 'OK'
  const color = status === 'overdue' ? '#ef4444' : status === 'due_soon' ? '#f59e0b' : '#22c55e'
  const bg = status === 'overdue' ? '#ef444420' : status === 'due_soon' ? '#f59e0b20' : '#22c55e20'
  return (
    <View className="px-2 py-0.5 rounded-full" style={{ backgroundColor: bg }}>
      <Text className="text-[11px] font-semibold" style={{ color }}>{label}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function MaintenanceScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const { token } = useAuthContext()

  const [truckPickerVisible, setTruckPickerVisible] = useState(false)
  const [scheduleSheetVisible, setScheduleSheetVisible] = useState(false)
  const [selectedTruckId, setSelectedTruckId] = useState<string | null>(null)

  const {
    data: services,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery<ScheduledServiceWithTruck[]>({
    queryKey: ['all-scheduled-services'],
    queryFn: () => ownerApi.getAllScheduledServices(token!),
    enabled: !!token,
  })

  const { data: trucks } = useQuery<TruckOption[]>({
    // TKT-0076: the picker variant — samples excluded, and its OWN cache key so
    // it cannot collide with the trucks LIST, which still shows them.
    queryKey: ['owner-truck-options'],
    queryFn: () => ownerApi.getTruckOptions(token!),
    enabled: !!token,
  })

  const onRefresh = useCallback(() => { refetch() }, [refetch])

  const alertItems = services?.filter((s) => s.status === 'overdue' || s.status === 'due_soon') ?? []
  const allScheduled = services ?? []

  // Group all scheduled by truck
  const grouped = allScheduled.reduce<Record<string, { truck: ScheduledServiceWithTruck['truck']; items: ScheduledServiceWithTruck[] }>>((acc, s) => {
    if (!acc[s.truck.id]) {
      acc[s.truck.id] = { truck: s.truck, items: [] }
    }
    acc[s.truck.id].items.push(s)
    return acc
  }, {})

  const groupedArray = Object.values(grouped)

  function handleTruckSelected(truckId: string) {
    setSelectedTruckId(truckId)
    setTruckPickerVisible(false)
    setScheduleSheetVisible(true)
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View
          className="flex-row items-center px-4 py-3.5"
          style={{ borderBottomWidth: 1, borderBottomColor: c.border }}
        >
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => router.back()}
            className="mr-3"
            hitSlop={8}
          >
            <ChevronLeft color={c.textPrimary} size={24} />
          </Pressable>
          <Text className="text-lg font-bold flex-1" style={{ color: c.textPrimary }}>Maintenance</Text>
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={c.brand} />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <AlertTriangle color="#f87171" size={40} />
            <Text className="text-[17px] font-semibold mt-4 text-center" style={{ color: c.textPrimary }}>
              Failed to load maintenance
            </Text>
            <Text className="text-sm mt-1.5 text-center" style={{ color: c.textTertiary }}>
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </Text>
            <Pressable onPress={() => refetch()} className="mt-5 px-6 py-3 rounded-[10px]" style={{ backgroundColor: c.brand }}>
              <Text className="text-white font-semibold">Retry</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={onRefresh}
                tintColor={c.brand}
                colors={[c.brand]}
              />
            }
            contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
          >
            {/* Due Soon Section */}
            <View className="mb-5">
              <Text
                className="text-[11px] font-semibold tracking-widest uppercase mb-2"
                style={{ color: c.textTertiary }}
              >
                ALERTS
              </Text>

              {alertItems.length === 0 ? (
                <View
                  className="rounded-xl p-4 flex-row items-center gap-3"
                  style={{ backgroundColor: '#22c55e15', borderWidth: 1, borderColor: '#22c55e30' }}
                >
                  <CheckCircle color="#22c55e" size={20} />
                  <Text className="text-sm font-medium flex-1" style={{ color: '#22c55e' }}>
                    All Clear — No overdue or due-soon services
                  </Text>
                </View>
              ) : (
                <View
                  className="rounded-xl overflow-hidden"
                  style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: '#f59e0b40' }}
                >
                  {alertItems.map((item, index) => (
                    <View key={item.id}>
                      {index > 0 && <View className="h-px ml-4" style={{ backgroundColor: c.border }} />}
                      <Pressable
                        onPress={() => {
                          haptic.light()
                          router.push(`/(owner)/more/trucks/${item.truck.id}` as never)
                        }}
                        className="px-4 py-3 flex-row items-center active:opacity-75"
                      >
                        <View className="flex-1 min-w-0 mr-3">
                          <Text className="text-[13px] font-semibold" style={{ color: c.textPrimary }} numberOfLines={1}>
                            {item.truck.make} {item.truck.model} · {item.truck.licensePlate}
                          </Text>
                          <Text className="text-[12px] mt-0.5" style={{ color: c.textSecondary }}>
                            {item.serviceType}
                            {item.dueDate ? `  ·  Due ${formatDate(item.dueDate)}` : ''}
                            {item.dueMileage ? `  ·  Due at ${item.dueMileage.toLocaleString()} mi` : ''}
                          </Text>
                        </View>
                        <StatusBadge status={item.status} />
                        <ChevronRight color={c.textTertiary} size={16} style={{ marginLeft: 8 }} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* All Scheduled Section */}
            <View className="mb-5">
              <Text
                className="text-[11px] font-semibold tracking-widest uppercase mb-2"
                style={{ color: c.textTertiary }}
              >
                ALL SCHEDULED SERVICES
              </Text>

              {groupedArray.length === 0 ? (
                <View
                  className="rounded-xl p-4 items-center"
                  style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
                >
                  <Wrench color={c.textTertiary} size={28} />
                  <Text className="text-sm mt-2" style={{ color: c.textTertiary }}>No scheduled services</Text>
                  <Text className="text-xs mt-0.5 text-center" style={{ color: c.textMuted }}>
                    Use the button below to schedule a service for a truck
                  </Text>
                </View>
              ) : (
                groupedArray.map((group) => (
                  <View
                    key={group.truck.id}
                    className="rounded-xl overflow-hidden mb-3"
                    style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
                  >
                    {/* Truck header */}
                    <Pressable
                      onPress={() => {
                        haptic.light()
                        router.push(`/(owner)/more/trucks/${group.truck.id}` as never)
                      }}
                      className="flex-row items-center px-4 py-3 active:opacity-75"
                      style={{ borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: `${c.brand}08` }}
                    >
                      <Wrench color={c.brand} size={14} />
                      <Text className="font-semibold text-[13px] flex-1 ml-2" style={{ color: c.textPrimary }}>
                        {group.truck.make} {group.truck.model} · {group.truck.licensePlate}
                      </Text>
                      <ChevronRight color={c.textTertiary} size={14} />
                    </Pressable>

                    {/* Services */}
                    {group.items.map((item, index) => (
                      <View key={item.id}>
                        {index > 0 && <View className="h-px ml-4" style={{ backgroundColor: c.border }} />}
                        <View className="px-4 py-3 flex-row items-center">
                          <View className="flex-1 min-w-0 mr-3">
                            <Text className="text-[13px] font-medium" style={{ color: c.textPrimary }}>
                              {item.serviceType}
                            </Text>
                            <Text className="text-[11px] mt-0.5" style={{ color: c.textTertiary }}>
                              {item.dueDate ? `Due ${formatDate(item.dueDate)}` : ''}
                              {item.dueDate && item.dueMileage ? '  ·  ' : ''}
                              {item.dueMileage ? `${item.dueMileage.toLocaleString()} mi` : ''}
                            </Text>
                          </View>
                          <StatusBadge status={item.status} />
                        </View>
                      </View>
                    ))}
                  </View>
                ))
              )}
            </View>

            {/* FAB-style schedule button */}
            <Pressable
              onPress={() => { haptic.medium(); setTruckPickerVisible(true) }}
              className="rounded-xl py-4 items-center flex-row justify-center gap-2 active:opacity-75"
              style={{ backgroundColor: c.brand }}
            >
              <Wrench color="white" size={18} />
              <Text style={{ color: 'white', fontWeight: '700', fontSize: 15 }}>Schedule a Service</Text>
            </Pressable>
          </ScrollView>
        )}

        {/* Truck picker bottom sheet */}
        <BottomSheet
          visible={truckPickerVisible}
          onClose={() => setTruckPickerVisible(false)}
          title="Select Truck"
          snapPoint="60%"
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {!trucks || trucks.length === 0 ? (
              <Text className="text-sm text-center" style={{ color: c.textTertiary }}>No trucks found</Text>
            ) : (
              trucks.map((truck, index) => (
                <View key={truck.id}>
                  {index > 0 && <View className="h-px" style={{ backgroundColor: c.border }} />}
                  <Pressable
                    onPress={() => handleTruckSelected(truck.id)}
                    className="flex-row items-center py-3.5 active:opacity-70"
                  >
                    <View className="flex-1">
                      <Text className="text-[15px] font-medium" style={{ color: c.textPrimary }}>
                        {truck.year} {truck.make} {truck.model}
                      </Text>
                      <Text className="text-[12px] mt-0.5" style={{ color: c.textTertiary }}>
                        {truck.licensePlate}
                      </Text>
                    </View>
                    <ChevronRight color={c.textTertiary} size={16} />
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        </BottomSheet>

        {/* Schedule Service Sheet */}
        {selectedTruckId && (
          <ScheduleServiceSheet
            visible={scheduleSheetVisible}
            onClose={() => setScheduleSheetVisible(false)}
            truckId={selectedTruckId}
            token={token!}
            onSuccess={() => refetch()}
          />
        )}
      </AnimatedScreen>
    </SafeAreaView>
  )
}
