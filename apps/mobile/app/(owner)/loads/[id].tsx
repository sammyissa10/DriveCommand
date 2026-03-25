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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Package, Truck, User, ChevronDown, XCircle } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type RouteStop, type DriverOption } from '@drivecommand/api-client'
import { Badge } from '../../../components/ui/Badge'
import { StopTimelineItem } from '../../../components/driver/StopTimelineItem'
import { TruckPickerSheet } from '../../../components/owner/TruckPickerSheet'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { Skeleton } from '../../../components/ui/Skeleton'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { haptic } from '../../../lib/haptics'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

function getStatusBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', variant: 'muted' }
    case 'DISPATCHED':
      return { label: 'Dispatched', variant: 'info' }
    case 'PICKED_UP':
      return { label: 'Picked Up', variant: 'warning' }
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

// ─── Status options ordered for owner ──────────────────────────────────────

const ALL_STATUSES = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'DISPATCHED', label: 'Dispatched' },
  { value: 'PICKED_UP', label: 'Picked Up' },
  { value: 'IN_TRANSIT', label: 'En Route' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'INVOICED', label: 'Invoiced' },
]

// ─── Driver Picker Sheet ────────────────────────────────────────────────────

interface DriverPickerSheetProps {
  visible: boolean
  onClose: () => void
  currentDriverId: string | null
  onSelect: (driverId: string | null) => void
  drivers: DriverOption[]
  loading: boolean
  isPending: boolean
}

function DriverPickerSheet({
  visible,
  onClose,
  currentDriverId,
  onSelect,
  drivers,
  loading,
  isPending,
}: DriverPickerSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Assign Driver" snapPoint="60%">
      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#0ea5e9" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Unassign option */}
          {currentDriverId && (
            <Pressable
              onPress={() => onSelect(null)}
              disabled={isPending}
              className="flex-row items-center p-3 rounded-xl mb-2 border border-slate-600 bg-slate-700/50 active:opacity-75"
            >
              <Text className="text-red-400 font-semibold text-sm flex-1">Unassign Driver</Text>
              {isPending && <ActivityIndicator size="small" color="#f87171" />}
            </Pressable>
          )}

          {drivers.length === 0 ? (
            <View className="items-center py-8">
              <Text className="text-slate-400 text-sm">No active drivers found</Text>
            </View>
          ) : (
            drivers.map((driver) => {
              const isSelected = driver.id === currentDriverId
              return (
                <Pressable
                  key={driver.id}
                  onPress={() => onSelect(driver.id)}
                  disabled={isPending}
                  className={`flex-row items-center p-3 rounded-xl mb-2 border ${
                    isSelected
                      ? 'bg-sky-900/40 border-sky-500'
                      : 'bg-slate-700/50 border-slate-600 active:opacity-75'
                  }`}
                >
                  <Text className="text-white text-sm flex-1" numberOfLines={1}>
                    {driver.name}
                  </Text>
                  {isSelected && <View className="w-2 h-2 rounded-full bg-sky-400" />}
                </Pressable>
              )
            })
          )}
        </ScrollView>
      )}
    </BottomSheet>
  )
}

// ─── Status Picker Sheet ────────────────────────────────────────────────────

interface StatusPickerSheetProps {
  visible: boolean
  onClose: () => void
  currentStatus: string
  onSelect: (status: string) => void
  isPending: boolean
}

function StatusPickerSheet({
  visible,
  onClose,
  currentStatus,
  onSelect,
  isPending,
}: StatusPickerSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Change Status" snapPoint="60%">
      <ScrollView showsVerticalScrollIndicator={false}>
        {ALL_STATUSES.map((s) => {
          const isCurrentStatus = s.value === currentStatus
          const badge = getStatusBadge(s.value)
          return (
            <Pressable
              key={s.value}
              onPress={() => {
                if (!isCurrentStatus) onSelect(s.value)
              }}
              disabled={isPending || isCurrentStatus}
              className={`flex-row items-center justify-between p-3 rounded-xl mb-2 border ${
                isCurrentStatus
                  ? 'bg-sky-900/30 border-sky-600 opacity-60'
                  : 'bg-slate-700/50 border-slate-600 active:opacity-75'
              }`}
            >
              <Text className={`text-sm ${isCurrentStatus ? 'text-sky-300' : 'text-white'}`}>
                {s.label}
              </Text>
              {isCurrentStatus && (
                <Text className="text-xs text-sky-400 font-medium">Current</Text>
              )}
              {!isCurrentStatus && (
                <Badge label={badge.label} variant={badge.variant} />
              )}
            </Pressable>
          )
        })}
      </ScrollView>
    </BottomSheet>
  )
}

// ─── Cancel Confirmation Sheet ──────────────────────────────────────────────

interface CancelConfirmSheetProps {
  visible: boolean
  onClose: () => void
  onConfirm: () => void
  isPending: boolean
  loadNumber: string
}

function CancelConfirmSheet({
  visible,
  onClose,
  onConfirm,
  isPending,
  loadNumber,
}: CancelConfirmSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Cancel Load" snapPoint="40%">
      <View className="flex-1 justify-between">
        <View>
          <View className="flex-row items-center gap-3 mb-3">
            <XCircle color="#f87171" size={24} />
            <Text className="text-white text-base font-semibold">
              Cancel Load #{loadNumber}?
            </Text>
          </View>
          <Text className="text-slate-400 text-sm leading-5">
            This will mark the load as CANCELLED. This action cannot be easily undone.
            The load will remain visible in history.
          </Text>
        </View>

        <View className="flex-row gap-3 mt-6">
          <Pressable
            onPress={onClose}
            disabled={isPending}
            className="flex-1 bg-slate-700 rounded-xl py-3.5 items-center active:opacity-75"
          >
            <Text className="text-white font-semibold">Keep Load</Text>
          </Pressable>
          <Pressable
            onPress={onConfirm}
            disabled={isPending}
            className={`flex-1 rounded-xl py-3.5 items-center ${
              isPending ? 'bg-red-900 opacity-60' : 'bg-red-600 active:opacity-80'
            }`}
          >
            {isPending ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-semibold">Cancel Load</Text>
            )}
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  )
}

// ─── Main screen ────────────────────────────────────────────────────────────

export default function OwnerLoadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { token } = useAuthContext()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const [truckPickerVisible, setTruckPickerVisible] = useState(false)
  const [driverPickerVisible, setDriverPickerVisible] = useState(false)
  const [statusPickerVisible, setStatusPickerVisible] = useState(false)
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState(false)

  const { data: load, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['owner-load', id],
    queryFn: () => ownerApi.getLoad(token!, id!),
    enabled: !!token && !!id,
  })

  const { data: drivers, isLoading: loadingDrivers } = useQuery({
    queryKey: ['owner-active-drivers'],
    queryFn: () => ownerApi.getActiveDrivers(token!),
    enabled: !!token && driverPickerVisible,
    staleTime: 60_000,
  })

  const invalidateLoad = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['owner-load', id] })
    queryClient.invalidateQueries({ queryKey: ['owner-loads'] })
  }, [queryClient, id])

  const onTruckAssigned = useCallback(() => {
    invalidateLoad()
  }, [invalidateLoad])

  const { mutate: updateLoad, isPending: isUpdating } = useMutation({
    mutationFn: (payload: { status?: string; driverId?: string | null; notes?: string }) =>
      ownerApi.updateLoad(token!, id!, payload),
    onSuccess: (_data, variables) => {
      haptic.success()
      invalidateLoad()
      const msg = variables.status === 'CANCELLED'
        ? 'Load has been cancelled.'
        : variables.driverId !== undefined
        ? variables.driverId
          ? 'Driver assigned successfully.'
          : 'Driver unassigned.'
        : 'Load status updated.'
      Toast.show({
        type: 'success',
        text1: 'Updated',
        text2: msg,
        visibilityTime: 3000,
      })
      setDriverPickerVisible(false)
      setStatusPickerVisible(false)
      setCancelConfirmVisible(false)
    },
    onError: (error: Error) => {
      haptic.error()
      Toast.show({
        type: 'error',
        text1: 'Update failed',
        text2: error.message || 'Please try again.',
        visibilityTime: 4000,
      })
    },
  })

  const handleAssignDriver = useCallback(
    (driverId: string | null) => {
      updateLoad({ driverId })
    },
    [updateLoad]
  )

  const handleStatusChange = useCallback(
    (status: string) => {
      updateLoad({ status })
    },
    [updateLoad]
  )

  const handleCancelLoad = useCallback(() => {
    updateLoad({ status: 'CANCELLED' })
  }, [updateLoad])

  const onRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  // Loading state — skeleton
  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-900" edges={['bottom', 'left', 'right']}>
        {/* Header skeleton */}
        <View
          className="flex-row items-center px-4 border-b border-slate-800 gap-3"
          style={{ paddingVertical: 12 }}
        >
          <Skeleton width={28} height={28} borderRadius={6} />
          <Skeleton width={160} height={18} />
          <Skeleton width={64} height={22} borderRadius={10} style={{ marginLeft: 'auto' }} />
        </View>
        {/* Content skeleton */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
          <Skeleton width="100%" height={56} borderRadius={12} />
          <Skeleton width="100%" height={200} borderRadius={12} />
          <Skeleton width="100%" height={100} borderRadius={12} />
        </View>
      </SafeAreaView>
    )
  }

  // Error state
  if (isError || !load) {
    return (
      <SafeAreaView
        className="flex-1 bg-slate-900 items-center justify-center px-6"
        edges={['bottom', 'left', 'right']}
      >
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
  const isCancelled = load.status === 'CANCELLED'
  const isDeliveredOrInvoiced = load.status === 'DELIVERED' || load.status === 'INVOICED'

  return (
    <SafeAreaView className="flex-1 bg-slate-900" edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
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
          paddingBottom: 32 + insets.bottom,
        }}
      >
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
              <InfoField
                label="Pickup Date"
                value={formatDate(load.pickupDate ?? load.createdAt)}
              />
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
            {(load.stops as RouteStop[]).map((stop: RouteStop, index: number) => (
              <StopTimelineItem
                key={stop.id}
                stop={stop}
                isLast={index === load.stops.length - 1}
              />
            ))}
          </View>
        )}

        {/* Assigned Truck */}
        <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-row items-center gap-2">
              <Truck color="#64748b" size={16} />
              <Text className="text-white font-semibold text-base">Assigned Truck</Text>
            </View>
            {!isCancelled && (
              <Pressable
                onPress={() => setTruckPickerVisible(true)}
                className="bg-sky-600 rounded-lg py-2 px-4 active:opacity-75"
              >
                <Text className="text-white text-sm font-semibold">
                  {load.truck ? 'Change Truck' : 'Assign Truck'}
                </Text>
              </Pressable>
            )}
          </View>

          {load.truck ? (
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
          ) : (
            <Text className="text-slate-500 text-sm">No truck assigned to this load.</Text>
          )}
        </View>

        {/* Owner Actions — only show if not cancelled */}
        {!isCancelled && (
          <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
            <Text className="text-white font-semibold text-base mb-3">Actions</Text>

            {/* Assign Driver */}
            <Pressable
              onPress={() => setDriverPickerVisible(true)}
              disabled={isUpdating}
              className="flex-row items-center justify-between p-3 bg-slate-700 rounded-xl mb-2 border border-slate-600 active:opacity-75"
            >
              <View className="flex-row items-center gap-3">
                <User color="#94a3b8" size={18} />
                <View>
                  <Text className="text-white text-sm font-medium">
                    {load.driver ? 'Change Driver' : 'Assign Driver'}
                  </Text>
                  {load.driver && (
                    <Text className="text-slate-400 text-xs mt-0.5">
                      Currently: {load.driver.name}
                    </Text>
                  )}
                </View>
              </View>
              <ChevronDown color="#64748b" size={16} />
            </Pressable>

            {/* Change Status */}
            {!isDeliveredOrInvoiced && (
              <Pressable
                onPress={() => setStatusPickerVisible(true)}
                disabled={isUpdating}
                className="flex-row items-center justify-between p-3 bg-slate-700 rounded-xl mb-2 border border-slate-600 active:opacity-75"
              >
                <View className="flex-row items-center gap-3">
                  <View className="w-4 h-4 rounded-full bg-sky-500/30 border border-sky-500 items-center justify-center">
                    <View className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                  </View>
                  <View>
                    <Text className="text-white text-sm font-medium">Change Status</Text>
                    <Text className="text-slate-400 text-xs mt-0.5">
                      Current: {getStatusBadge(load.status).label}
                    </Text>
                  </View>
                </View>
                <ChevronDown color="#64748b" size={16} />
              </Pressable>
            )}

            {/* Cancel Load — destructive */}
            <Pressable
              onPress={() => { haptic.warning(); setCancelConfirmVisible(true) }}
              disabled={isUpdating}
              className="flex-row items-center gap-3 p-3 bg-red-950/40 rounded-xl border border-red-900/50 active:opacity-75"
            >
              <XCircle color="#f87171" size={18} />
              <Text className="text-red-400 text-sm font-medium">Cancel Load</Text>
            </Pressable>
          </View>
        )}

        {/* Cancelled banner */}
        {isCancelled && (
          <View className="bg-red-950/30 border border-red-900/50 rounded-xl p-4 mb-4">
            <View className="flex-row items-center gap-2">
              <XCircle color="#f87171" size={16} />
              <Text className="text-red-400 text-sm font-semibold">Load Cancelled</Text>
            </View>
            <Text className="text-slate-500 text-xs mt-1">
              This load has been cancelled and is read-only.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Truck Picker Sheet */}
      <TruckPickerSheet
        visible={truckPickerVisible}
        onClose={() => setTruckPickerVisible(false)}
        loadId={load.id}
        currentTruckId={load.truck?.id ?? null}
        onAssigned={onTruckAssigned}
      />

      {/* Driver Picker Sheet */}
      <DriverPickerSheet
        visible={driverPickerVisible}
        onClose={() => setDriverPickerVisible(false)}
        currentDriverId={load.driver?.id ?? null}
        onSelect={handleAssignDriver}
        drivers={drivers ?? []}
        loading={loadingDrivers}
        isPending={isUpdating}
      />

      {/* Status Picker Sheet */}
      <StatusPickerSheet
        visible={statusPickerVisible}
        onClose={() => setStatusPickerVisible(false)}
        currentStatus={load.status}
        onSelect={handleStatusChange}
        isPending={isUpdating}
      />

      {/* Cancel Confirmation */}
      <CancelConfirmSheet
        visible={cancelConfirmVisible}
        onClose={() => setCancelConfirmVisible(false)}
        onConfirm={handleCancelLoad}
        isPending={isUpdating}
        loadNumber={load.loadNumber}
      />
      </AnimatedScreen>
    </SafeAreaView>
  )
}
