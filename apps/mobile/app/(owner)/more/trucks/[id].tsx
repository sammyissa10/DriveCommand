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
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, Truck } from 'lucide-react-native'
import { useAuthContext } from '../../../../context/AuthContext'
import { ownerApi, type TruckDetail } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../../components/ui/AnimatedScreen'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, { text: string; bg: string }> = {
  'In Use':         { text: '#38bdf8', bg: '#38bdf820' },
  'In Maintenance': { text: '#f59e0b', bg: '#f59e0b20' },
  'Expired Docs':   { text: '#ef4444', bg: '#ef444420' },
  'Ready to Use':   { text: '#22c55e', bg: '#22c55e20' },
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return '—'
  }
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-4">
      <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</Text>
      <Text className="text-sm text-slate-100 font-medium">{value}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TruckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { token } = useAuthContext()

  const { data: truck, isLoading, isError, error, refetch, isRefetching } = useQuery<TruckDetail>({
    queryKey: ['owner-truck', id],
    queryFn: () => ownerApi.getTruck(token!, id!),
    enabled: !!token && !!id,
  })

  const onRefresh = useCallback(() => { refetch() }, [refetch])

  const colors = STATUS_COLORS[truck?.status ?? ''] ?? STATUS_COLORS['Ready to Use']
  const docMeta = truck?.documentMetadata

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
          <View className="flex-1 min-w-0">
            {truck ? (
              <Text className="text-lg font-bold text-slate-100" numberOfLines={1}>
                {truck.year} {truck.make} {truck.model}
              </Text>
            ) : (
              <Text className="text-lg font-bold text-slate-100">Truck Detail</Text>
            )}
          </View>
          {truck && (
            <View className="px-2.5 py-1 rounded-full ml-2" style={{ backgroundColor: colors.bg }}>
              <Text className="text-xs font-semibold" style={{ color: colors.text }}>
                {truck.status}
              </Text>
            </View>
          )}
        </View>

        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#38bdf8" />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <AlertTriangle color="#f87171" size={40} />
            <Text className="text-slate-100 text-[17px] font-semibold mt-4 text-center">
              Failed to load truck
            </Text>
            <Text className="text-slate-500 text-sm mt-1.5 text-center">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </Text>
            <Pressable onPress={() => refetch()} className="mt-5 bg-sky-500 px-6 py-3 rounded-[10px]">
              <Text className="text-white font-semibold">Retry</Text>
            </Pressable>
          </View>
        ) : truck ? (
          <ScrollView
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={onRefresh}
                tintColor="#38bdf8"
                colors={['#38bdf8']}
              />
            }
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          >
            {/* Vehicle Information */}
            <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
              <View className="flex-row items-center gap-2 mb-4">
                <Truck color="#64748b" size={16} />
                <Text className="text-white font-semibold text-base">Vehicle Information</Text>
              </View>
              <View className="flex-row flex-wrap">
                <View className="w-1/2">
                  <InfoRow label="Make" value={truck.make} />
                </View>
                <View className="w-1/2">
                  <InfoRow label="Model" value={truck.model} />
                </View>
                <View className="w-1/2">
                  <InfoRow label="Year" value={String(truck.year)} />
                </View>
                <View className="w-1/2">
                  <InfoRow label="License Plate" value={truck.licensePlate} />
                </View>
                <View className="w-full">
                  <InfoRow label="VIN" value={truck.vin} />
                </View>
                <View className="w-1/2">
                  <InfoRow label="Odometer" value={`${truck.odometer.toLocaleString()} mi`} />
                </View>
                <View className="w-1/2">
                  <InfoRow label="Status" value={truck.status} />
                </View>
              </View>
            </View>

            {/* Document Information */}
            <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
              <Text className="text-white font-semibold text-base mb-4">Document Information</Text>
              {docMeta && (docMeta.registrationNumber || docMeta.registrationExpiry || docMeta.insuranceNumber || docMeta.insuranceExpiry) ? (
                <View className="flex-row flex-wrap">
                  {docMeta.registrationNumber && (
                    <View className="w-1/2">
                      <InfoRow label="Registration #" value={docMeta.registrationNumber} />
                    </View>
                  )}
                  {docMeta.registrationExpiry && (
                    <View className="w-1/2">
                      <InfoRow label="Reg. Expiry" value={formatDate(docMeta.registrationExpiry)} />
                    </View>
                  )}
                  {docMeta.insuranceNumber && (
                    <View className="w-1/2">
                      <InfoRow label="Insurance #" value={docMeta.insuranceNumber} />
                    </View>
                  )}
                  {docMeta.insuranceExpiry && (
                    <View className="w-1/2">
                      <InfoRow label="Ins. Expiry" value={formatDate(docMeta.insuranceExpiry)} />
                    </View>
                  )}
                </View>
              ) : (
                <Text className="text-slate-500 text-sm">No document information recorded</Text>
              )}
            </View>

            {/* Record History */}
            <View className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <Text className="text-white font-semibold text-base mb-4">Record History</Text>
              <View className="flex-row flex-wrap">
                <View className="w-1/2">
                  <InfoRow label="Created" value={formatDate(truck.createdAt)} />
                </View>
                <View className="w-1/2">
                  <InfoRow label="Last Updated" value={formatDate(truck.updatedAt)} />
                </View>
              </View>
            </View>
          </ScrollView>
        ) : null}
      </AnimatedScreen>
    </SafeAreaView>
  )
}
