import React, { useCallback } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Package } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuthContext } from '../../../context/AuthContext'
import { driverApi } from '@drivecommand/api-client'
import { Badge } from '../../../components/ui/Badge'
import { StopTimelineItem } from '../../../components/driver/StopTimelineItem'
import { StatusUpdateButton } from '../../../components/driver/StatusUpdateButton'
import { LoadStatusTimeline } from '../../../components/driver/LoadStatusTimeline'

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

function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '—'
  try {
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

interface InfoFieldProps {
  label: string
  value: string
}

function InfoField({ label, value }: InfoFieldProps) {
  return (
    <View className="mb-3">
      <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-0.5">
        {label}
      </Text>
      <Text className="text-sm text-white" numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

export default function LoadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { token } = useAuthContext()
  const insets = useSafeAreaInsets()

  const { data: load, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['driver-load', id],
    queryFn: () => driverApi.getLoad(token!, id!),
    enabled: !!token && !!id,
  })

  const onRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  const onStatusUpdated = useCallback(() => {
    refetch()
  }, [refetch])

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-900 items-center justify-center" edges={['bottom', 'left', 'right']}>
        <ActivityIndicator size="large" color="#0ea5e9" />
        <Text className="text-slate-400 mt-3 text-sm">Loading load details...</Text>
      </SafeAreaView>
    )
  }

  // Error state
  if (isError || !load) {
    return (
      <SafeAreaView className="flex-1 bg-slate-900 items-center justify-center px-6" edges={['bottom', 'left', 'right']}>
        <AlertTriangle color="#f87171" size={40} />
        <Text className="text-white text-lg font-semibold mt-4 text-center">
          Failed to load details
        </Text>
        <Text className="text-slate-400 text-sm mt-2 text-center">
          {error instanceof Error ? error.message : 'Load not found'}
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 bg-slate-700 px-6 py-3 rounded-lg active:opacity-80"
        >
          <Text className="text-white font-semibold">Go Back</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const badge = getStatusBadge(load.status)
  const hasStatusButton =
    !['DELIVERED', 'INVOICED', 'CANCELLED'].includes(load.status)

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={['bottom', 'left', 'right']}>
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-slate-800">
        <Pressable
          onPress={() => router.back()}
          className="mr-3 p-1.5 rounded-lg active:bg-slate-700"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ArrowLeft color="#94a3b8" size={22} />
        </Pressable>
        <Text className="flex-1 text-lg font-bold text-white" numberOfLines={1}>
          Load #{load.loadNumber}
        </Text>
        <Badge label={badge.label} variant={badge.variant} />
      </View>

      {/* Scrollable content */}
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor="#0ea5e9"
            colors={['#0ea5e9']}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: hasStatusButton ? 24 : 32 + insets.bottom,
        }}
      >
        {/* Status Timeline */}
        <LoadStatusTimeline status={load.status} />

        {/* Route Info Card */}
        <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
          <Text className="text-white font-semibold text-base mb-3">Route Info</Text>
          <View className="flex-row flex-wrap">
            <View className="w-1/2">
              <InfoField label="Origin" value={load.origin} />
            </View>
            <View className="w-1/2">
              <InfoField label="Destination" value={load.destination} />
            </View>
            <View className="w-1/2">
              <InfoField label="Pickup Date" value={formatDate(load.pickupDate ?? load.createdAt)} />
            </View>
            <View className="w-1/2">
              <InfoField label="Delivery Date" value={formatDate(load.deliveryDate)} />
            </View>
            <View className="w-1/2">
              <InfoField label="Rate" value={formatCurrency(load.rate)} />
            </View>
            <View className="w-1/2">
              <InfoField label="Customer" value={load.customer.companyName} />
            </View>
          </View>
        </View>

        {/* Stop Timeline */}
        {load.stops.length > 0 && (
          <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
            <View className="flex-row items-center mb-4">
              <Package color="#64748b" size={16} style={{ marginRight: 8 }} />
              <Text className="text-white font-semibold text-base">
                Route Stops ({load.stops.length})
              </Text>
            </View>
            {load.stops.map((stop, index) => (
              <StopTimelineItem
                key={stop.id}
                stop={stop}
                isLast={index === load.stops.length - 1}
              />
            ))}
          </View>
        )}

        {/* Assigned Truck */}
        {load.truck && (
          <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
            <Text className="text-white font-semibold text-base mb-3">Assigned Truck</Text>
            <View className="flex-row flex-wrap">
              <View className="w-1/2">
                <InfoField
                  label="Vehicle"
                  value={`${load.truck.make} ${load.truck.model}`}
                />
              </View>
              <View className="w-1/2">
                <InfoField label="License Plate" value={load.truck.licensePlate} />
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Sticky status update button */}
      {hasStatusButton && (
        <View
          className="px-4 pt-3 bg-slate-900 border-t border-slate-800"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <StatusUpdateButton load={load} onStatusUpdated={onStatusUpdated} />
        </View>
      )}
    </SafeAreaView>
  )
}
