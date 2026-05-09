import React, { useCallback, useState } from 'react'
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
import { AlertTriangle, ArrowLeft, FileText, Package } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../context/AuthContext'
import { driverApi } from '@drivecommand/api-client'
import { Badge } from '../../../components/ui/Badge'
import { StopTimelineItem } from '../../../components/driver/StopTimelineItem'
import { StatusUpdateButton } from '../../../components/driver/StatusUpdateButton'
import { LoadStatusTimeline } from '../../../components/driver/LoadStatusTimeline'
import { Skeleton } from '../../../components/ui/Skeleton'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { useThemeColors } from '../../../constants/tokens'

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
  const c = useThemeColors()
  return (
    <View className="mb-3">
      <Text className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: c.textTertiary }}>
        {label}
      </Text>
      <Text className="text-sm" style={{ color: c.textPrimary }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

export default function LoadDetailScreen() {
  const c = useThemeColors()
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { token } = useAuthContext()
  const insets = useSafeAreaInsets()
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false)

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

  async function handleRateConfirmation() {
    if (!token || isDownloadingPDF || !load) return
    setIsDownloadingPDF(true)
    try {
      const result = await driverApi.getRateConfirmation(token, load.id)
      const fileUri = (FileSystem.documentDirectory ?? '') + result.filename
      await FileSystem.writeAsStringAsync(fileUri, result.pdf, {
        encoding: FileSystem.EncodingType.Base64,
      })
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Rate Confirmation',
      })
    } catch (err) {
      Toast.show({
        type: 'error',
        text1: 'Download Failed',
        text2: err instanceof Error ? err.message : 'Could not download rate confirmation',
      })
    } finally {
      setIsDownloadingPDF(false)
    }
  }

  // Loading state — skeleton
  if (isLoading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
        {/* Header skeleton */}
        <View
          className="flex-row items-center px-4 py-3 gap-3"
          style={{ borderBottomWidth: 1, borderBottomColor: c.border }}
        >
          <Skeleton width={28} height={28} borderRadius={6} />
          <Skeleton width={160} height={18} />
          <Skeleton width={64} height={22} borderRadius={10} style={{ marginLeft: 'auto' }} />
        </View>
        {/* Content skeleton */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
          <Skeleton width="100%" height={48} borderRadius={8} />
          <Skeleton width="100%" height={180} borderRadius={12} />
          <Skeleton width="100%" height={120} borderRadius={12} />
        </View>
      </SafeAreaView>
    )
  }

  // Error state
  if (isError || !load) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center px-6" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
        <AlertTriangle color="#f87171" size={40} />
        <Text className="text-lg font-semibold mt-4 text-center" style={{ color: c.textPrimary }}>
          Failed to load details
        </Text>
        <Text className="text-sm mt-2 text-center" style={{ color: c.textSecondary }}>
          {error instanceof Error ? error.message : 'Load not found'}
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-6 px-6 py-3 rounded-lg active:opacity-80"
          style={{ backgroundColor: c.surfaceElevated }}
        >
          <Text className="font-semibold" style={{ color: c.textPrimary }}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  const badge = getStatusBadge(load.status)
  const hasStatusButton =
    !['DELIVERED', 'INVOICED', 'CANCELLED'].includes(load.status)
  const canViewRateConfirmation =
    ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(load.status)

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
      {/* Header */}
      <View
        className="flex-row items-center px-4 py-3"
        style={{ borderBottomWidth: 1, borderBottomColor: c.border }}
      >
        <Pressable
          onPress={() => router.back()}
          className="mr-3 p-1.5 rounded-lg active:opacity-80"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ArrowLeft color={c.textSecondary} size={22} />
        </Pressable>
        <Text className="flex-1 text-lg font-bold" style={{ color: c.textPrimary }} numberOfLines={1}>
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
            tintColor={c.brand}
            colors={[c.brand]}
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
        <View
          className="rounded-xl p-4 mb-4"
          style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
        >
          <Text className="font-semibold text-base mb-3" style={{ color: c.textPrimary }}>Route Info</Text>
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

          {/* Rate Confirmation PDF button */}
          {canViewRateConfirmation && (
            <Pressable
              onPress={handleRateConfirmation}
              disabled={isDownloadingPDF}
              className="flex-row items-center justify-center rounded-lg py-3 mt-3 active:opacity-80"
              style={{ borderWidth: 1, borderColor: c.border }}
            >
              {isDownloadingPDF ? (
                <ActivityIndicator size="small" color={c.textSecondary} />
              ) : (
                <>
                  <FileText color={c.textSecondary} size={16} style={{ marginRight: 8 }} />
                  <Text className="font-medium text-sm" style={{ color: c.textSecondary }}>Rate Confirmation PDF</Text>
                </>
              )}
            </Pressable>
          )}
        </View>

        {/* Stop Timeline */}
        {load.stops.length > 0 && (
          <View
            className="rounded-xl p-4 mb-4"
            style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
          >
            <View className="flex-row items-center mb-4">
              <Package color={c.textTertiary} size={16} style={{ marginRight: 8 }} />
              <Text className="font-semibold text-base" style={{ color: c.textPrimary }}>
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
          <View
            className="rounded-xl p-4 mb-4"
            style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
          >
            <Text className="font-semibold text-base mb-3" style={{ color: c.textPrimary }}>Assigned Truck</Text>
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
          className="px-4 pt-3"
          style={{ backgroundColor: c.background, borderTopWidth: 1, borderTopColor: c.border, paddingBottom: insets.bottom + 12 }}
        >
          <StatusUpdateButton load={load} onStatusUpdated={onStatusUpdated} />
        </View>
      )}
      </AnimatedScreen>
    </SafeAreaView>
  )
}
