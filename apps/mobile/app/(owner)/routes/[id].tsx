import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Navigation, User, ChevronDown } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type RouteStop, type DriverOption } from '@drivecommand/api-client'
import { Badge } from '../../../components/ui/Badge'
import { StopTimelineItem } from '../../../components/driver/StopTimelineItem'
import { BottomSheet } from '../../../components/ui/BottomSheet'
import { LoadDetailSkeleton } from '../../../components/skeletons/LoadDetailSkeleton'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { haptic } from '../../../lib/haptics'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

function getStatusBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'PLANNED':
      return { label: 'Planned', variant: 'muted' }
    case 'IN_PROGRESS':
      return { label: 'In Progress', variant: 'warning' }
    case 'COMPLETED':
      return { label: 'Completed', variant: 'success' }
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

// ─── Route Status options ────────────────────────────────────────────────────

const ROUTE_STATUSES = [
  { value: 'PLANNED', label: 'Planned' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
]

// ─── Driver Picker Sheet ────────────────────────────────────────────────────

interface DriverPickerSheetProps {
  visible: boolean
  onClose: () => void
  currentDriverId: string | null
  onSelect: (driverId: string) => void
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
                  disabled={isPending || isSelected}
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

// ─── Edit Route Sheet ────────────────────────────────────────────────────────

interface EditRouteSheetProps {
  visible: boolean
  onClose: () => void
  currentName: string | null
  currentStatus: string
  scheduledDate: string
  currentDriverId: string | null
  currentDriverName: string
  onSave: (payload: { name?: string; status?: string; driverId?: string }) => void
  isPending: boolean
  token: string
}

function EditRouteSheet({
  visible,
  onClose,
  currentName,
  currentStatus,
  scheduledDate,
  currentDriverId,
  currentDriverName,
  onSave,
  isPending,
  token,
}: EditRouteSheetProps) {
  const [name, setName] = useState(currentName ?? '')
  const [status, setStatus] = useState(currentStatus)
  const [driverPickerVisible, setDriverPickerVisible] = useState(false)
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(currentDriverId)
  const [selectedDriverName, setSelectedDriverName] = useState(currentDriverName)

  const { data: drivers, isLoading: loadingDrivers } = useQuery({
    queryKey: ['owner-active-drivers'],
    queryFn: () => ownerApi.getActiveDrivers(token),
    enabled: !!token && driverPickerVisible,
    staleTime: 60_000,
  })

  const handleSave = () => {
    const payload: { name?: string; status?: string; driverId?: string } = {}
    if (name !== (currentName ?? '')) payload.name = name
    if (status !== currentStatus) payload.status = status
    if (selectedDriverId && selectedDriverId !== currentDriverId) payload.driverId = selectedDriverId
    onSave(payload)
  }

  const handleDriverSelect = (driverId: string) => {
    const driver = drivers?.find((d) => d.id === driverId)
    if (driver) {
      setSelectedDriverId(driverId)
      setSelectedDriverName(driver.name)
    }
    setDriverPickerVisible(false)
  }

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title="Edit Route" snapPoint="80%">
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Name */}
          <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            Route Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Enter route name"
            placeholderTextColor="#64748b"
            className="bg-slate-700 border border-slate-600 rounded-xl px-3 py-3 text-white text-sm mb-4"
          />

          {/* Status */}
          <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            Status
          </Text>
          <View className="mb-4">
            {ROUTE_STATUSES.map((s) => {
              const isCurrentStatus = s.value === status
              const badge = getStatusBadge(s.value)
              return (
                <Pressable
                  key={s.value}
                  onPress={() => setStatus(s.value)}
                  className={`flex-row items-center justify-between p-3 rounded-xl mb-2 border ${
                    isCurrentStatus
                      ? 'bg-sky-900/30 border-sky-600'
                      : 'bg-slate-700/50 border-slate-600 active:opacity-75'
                  }`}
                >
                  <Text className={`text-sm ${isCurrentStatus ? 'text-sky-300' : 'text-white'}`}>
                    {s.label}
                  </Text>
                  {isCurrentStatus ? (
                    <Text className="text-xs text-sky-400 font-medium">Selected</Text>
                  ) : (
                    <Badge label={badge.label} variant={badge.variant} />
                  )}
                </Pressable>
              )
            })}
          </View>

          {/* Scheduled Date (read-only) */}
          <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            Scheduled Date
          </Text>
          <View className="bg-slate-700/50 border border-slate-600 rounded-xl px-3 py-3 mb-4">
            <Text className="text-slate-400 text-sm">{formatDate(scheduledDate)}</Text>
          </View>

          {/* Driver */}
          <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            Driver
          </Text>
          <Pressable
            onPress={() => setDriverPickerVisible(true)}
            className="flex-row items-center justify-between bg-slate-700/50 border border-slate-600 rounded-xl px-3 py-3 mb-6 active:opacity-75"
          >
            <Text className="text-white text-sm">{selectedDriverName}</Text>
            <ChevronDown color="#64748b" size={16} />
          </Pressable>

          {/* Save Button */}
          <Pressable
            onPress={handleSave}
            disabled={isPending}
            className={`rounded-xl py-3.5 items-center ${
              isPending ? 'bg-sky-900 opacity-60' : 'bg-sky-600 active:opacity-80'
            }`}
          >
            {isPending ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-semibold text-base">Save Changes</Text>
            )}
          </Pressable>
        </ScrollView>
      </BottomSheet>

      {/* Nested driver picker */}
      <DriverPickerSheet
        visible={driverPickerVisible}
        onClose={() => setDriverPickerVisible(false)}
        currentDriverId={selectedDriverId}
        onSelect={handleDriverSelect}
        drivers={drivers ?? []}
        loading={loadingDrivers}
        isPending={false}
      />
    </>
  )
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function OwnerRouteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { token } = useAuthContext()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()

  const [editSheetVisible, setEditSheetVisible] = useState(false)

  const { data: route, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['owner-route', id],
    queryFn: () => ownerApi.getRoute(token!, id!),
    enabled: !!token && !!id,
  })

  const invalidateRoute = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['owner-route', id] })
    queryClient.invalidateQueries({ queryKey: ['owner-routes'] })
  }, [queryClient, id])

  const { mutate: updateRoute, isPending: isUpdating } = useMutation({
    mutationFn: (payload: { name?: string; status?: string; driverId?: string }) =>
      ownerApi.updateRoute(token!, id!, payload),
    onSuccess: () => {
      haptic.success()
      invalidateRoute()
      Toast.show({
        type: 'success',
        text1: 'Updated',
        text2: 'Route updated successfully.',
        visibilityTime: 3000,
      })
      setEditSheetVisible(false)
    },
    onError: (err: Error) => {
      haptic.error()
      Toast.show({
        type: 'error',
        text1: 'Update failed',
        text2: err.message || 'Please try again.',
        visibilityTime: 4000,
      })
    },
  })

  const onRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  // Loading state — skeleton
  if (isLoading) {
    return <LoadDetailSkeleton />
  }

  // Error state
  if (isError || !route) {
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
          {error instanceof Error ? error.message : 'Route not found'}
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

  const badge = getStatusBadge(route.status)
  const routeName = route.name ?? 'Unnamed Route'
  const isCompleted = route.status === 'COMPLETED'

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
            {routeName}
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
                <InfoField label="Name" value={routeName} />
              </View>
              <View className="w-1/2">
                <InfoField label="Status" value={badge.label} />
              </View>
              <View className="w-1/2">
                <InfoField label="Origin" value={route.origin} />
              </View>
              <View className="w-1/2">
                <InfoField label="Destination" value={route.destination} />
              </View>
              <View className="w-1/2">
                <InfoField label="Scheduled Date" value={formatDate(route.scheduledDate)} />
              </View>
              <View className="w-1/2">
                <InfoField label="Driver" value={route.driver.name} />
              </View>
            </View>
          </View>

          {/* Stops Section */}
          {route.stops.length > 0 && (
            <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
              <View className="flex-row items-center mb-4">
                <Navigation color="#64748b" size={16} style={{ marginRight: 8 }} />
                <Text className="text-white font-semibold text-base">
                  Route Stops ({route.stops.length})
                </Text>
              </View>
              {(route.stops as RouteStop[]).map((stop: RouteStop, index: number) => (
                <StopTimelineItem
                  key={stop.id}
                  stop={stop}
                  isLast={index === route.stops.length - 1}
                />
              ))}
            </View>
          )}

          {/* Associated Loads Section */}
          {route.loads.length > 0 && (
            <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
              <Text className="text-white font-semibold text-base mb-3">
                Associated Loads ({route.loads.length})
              </Text>
              {route.loads.map((load: { id: string; loadNumber: string; status: string; origin: string; destination: string; rate: number | null }) => {
                const loadBadge = (() => {
                  switch (load.status) {
                    case 'PENDING': return { label: 'Pending', variant: 'muted' as BadgeVariant }
                    case 'DISPATCHED': return { label: 'Dispatched', variant: 'info' as BadgeVariant }
                    case 'PICKED_UP': return { label: 'Picked Up', variant: 'warning' as BadgeVariant }
                    case 'IN_TRANSIT': return { label: 'En Route', variant: 'warning' as BadgeVariant }
                    case 'DELIVERED': return { label: 'Delivered', variant: 'success' as BadgeVariant }
                    case 'INVOICED': return { label: 'Invoiced', variant: 'success' as BadgeVariant }
                    case 'CANCELLED': return { label: 'Cancelled', variant: 'danger' as BadgeVariant }
                    default: return { label: load.status, variant: 'muted' as BadgeVariant }
                  }
                })()
                return (
                  <Pressable
                    key={load.id}
                    onPress={() => router.push(`/(owner)/loads/${load.id}` as never)}
                    className="flex-row items-center justify-between p-3 bg-slate-700/50 rounded-xl mb-2 border border-slate-600 active:opacity-75"
                  >
                    <View className="flex-1 mr-2">
                      <Text className="text-white text-sm font-semibold mb-0.5">
                        #{load.loadNumber}
                      </Text>
                      <Text className="text-slate-400 text-xs" numberOfLines={1}>
                        {load.origin} → {load.destination}
                      </Text>
                    </View>
                    <Badge label={loadBadge.label} variant={loadBadge.variant} />
                  </Pressable>
                )
              })}
            </View>
          )}

          {/* Actions Card — only show if not completed */}
          {!isCompleted && (
            <View className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
              <Text className="text-white font-semibold text-base mb-3">Actions</Text>
              <Pressable
                onPress={() => setEditSheetVisible(true)}
                disabled={isUpdating}
                className="flex-row items-center justify-between p-3 bg-slate-700 rounded-xl border border-slate-600 active:opacity-75"
              >
                <View className="flex-row items-center gap-3">
                  <User color="#94a3b8" size={18} />
                  <Text className="text-white text-sm font-medium">Edit Route</Text>
                </View>
                <ChevronDown color="#64748b" size={16} />
              </Pressable>
            </View>
          )}

          {/* Completed banner */}
          {isCompleted && (
            <View className="bg-green-950/30 border border-green-900/50 rounded-xl p-4 mb-4">
              <Text className="text-green-400 text-sm font-semibold">Route Completed</Text>
              <Text className="text-slate-500 text-xs mt-1">
                This route has been completed and is read-only.
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Edit Route Sheet */}
        <EditRouteSheet
          visible={editSheetVisible}
          onClose={() => setEditSheetVisible(false)}
          currentName={route.name}
          currentStatus={route.status}
          scheduledDate={route.scheduledDate}
          currentDriverId={route.driver.id}
          currentDriverName={route.driver.name}
          onSave={updateRoute}
          isPending={isUpdating}
          token={token!}
        />
      </AnimatedScreen>
    </SafeAreaView>
  )
}
