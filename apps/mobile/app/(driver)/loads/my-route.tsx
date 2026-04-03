import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Send } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../../../context/AuthContext'
import { driverApi } from '@drivecommand/api-client'
import { Badge } from '../../../components/ui/Badge'
import { Skeleton } from '../../../components/ui/Skeleton'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { RouteLoadTimelineItem } from '../../../components/driver/RouteLoadTimelineItem'
import { MessageBubble } from '../../../components/driver/MessageBubble'
import { useThemeColors } from '../../../constants/tokens'

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

function getRouteBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', variant: 'muted' }
    case 'ACTIVE':
    case 'IN_PROGRESS':
      return { label: 'Active', variant: 'info' }
    case 'COMPLETED':
      return { label: 'Completed', variant: 'success' }
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

export default function MyRouteScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const { token } = useAuthContext()
  const queryClient = useQueryClient()
  const [messageText, setMessageText] = useState('')

  // Fetch route data — shares cache key with RouteCard in plan 01
  const {
    data: routeData,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['driver-route'],
    queryFn: () => driverApi.getMyRoute(token!),
    enabled: !!token,
  })

  const route = routeData?.route ?? null

  // Fetch route messages
  const {
    data: messages,
    isLoading: messagesLoading,
  } = useQuery({
    queryKey: ['driver-route-messages', route?.id],
    queryFn: () => driverApi.getRouteMessages(token!, route!.id),
    enabled: !!token && !!route?.id,
  })

  // Send route message mutation
  const sendMutation = useMutation({
    mutationFn: (body: string) => driverApi.sendRouteMessage(token!, route!.id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-route-messages', route?.id] })
      setMessageText('')
    },
    onError: () => {
      Alert.alert('Send Failed', 'Could not send your message. Please try again.')
    },
  })

  const handleSend = useCallback(() => {
    const text = messageText.trim()
    if (!text || !route || sendMutation.isPending) return
    sendMutation.mutate(text)
  }, [messageText, route, sendMutation])

  const onRefresh = useCallback(() => {
    refetch()
  }, [refetch])

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
          <View style={{ flex: 1, gap: 4 }}>
            <Skeleton width={100} height={18} />
            <Skeleton width={160} height={14} />
          </View>
          <Skeleton width={64} height={22} borderRadius={10} />
        </View>
        {/* Content skeleton */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
          <Skeleton width="100%" height={120} borderRadius={12} />
          <Skeleton width="100%" height={100} borderRadius={12} />
          <Skeleton width="100%" height={80} borderRadius={12} />
        </View>
      </SafeAreaView>
    )
  }

  // Error state
  if (isError || !routeData) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: c.background }}
        edges={['bottom', 'left', 'right']}
      >
        <AlertTriangle color="#f87171" size={40} />
        <Text className="text-lg font-semibold mt-4 text-center" style={{ color: c.textPrimary }}>
          Failed to load route
        </Text>
        <Text className="text-sm mt-2 text-center" style={{ color: c.textSecondary }}>
          {error instanceof Error ? error.message : 'Could not load route data'}
        </Text>
        <Pressable
          onPress={() => refetch()}
          className="mt-4 px-6 py-3 rounded-lg active:opacity-80"
          style={{ backgroundColor: c.brand }}
        >
          <Text className="font-semibold" style={{ color: '#ffffff' }}>Retry</Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          className="mt-3 px-6 py-3 rounded-lg active:opacity-80"
          style={{ backgroundColor: c.surfaceElevated }}
        >
          <Text className="font-semibold" style={{ color: c.textPrimary }}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  // No route assigned state
  if (!route) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
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
          <Text className="flex-1 text-lg font-bold" style={{ color: c.textPrimary }}>My Route</Text>
        </View>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="text-lg font-semibold text-center" style={{ color: c.textPrimary }}>No Active Route</Text>
          <Text className="text-sm mt-2 text-center" style={{ color: c.textSecondary }}>
            You have no route assigned at this time.
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  const badge = getRouteBadge(route.status)
  const loadList = route.loads ?? []
  const messageList = messages ?? []

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
          <View className="flex-1 mr-3">
            <Text className="text-xl font-bold" style={{ color: c.textPrimary }} numberOfLines={1}>
              My Route
            </Text>
            <Text className="text-sm" style={{ color: c.textSecondary }} numberOfLines={1}>
              {route.origin} → {route.destination}
            </Text>
          </View>
          <Badge label={badge.label} variant={badge.variant} />
        </View>

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
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
              paddingBottom: 32,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {/* ------------------------------------------------------------------ */}
            {/* Section 1: Loads on this Route                                      */}
            {/* ------------------------------------------------------------------ */}
            <Text className="text-lg font-semibold mb-3" style={{ color: c.textPrimary }}>Route Legs</Text>

            {loadList.length === 0 ? (
              <View
                className="rounded-xl p-4 mb-6"
                style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
              >
                <Text className="text-sm text-center" style={{ color: c.textSecondary }}>
                  No loads assigned to this route
                </Text>
              </View>
            ) : (
              <View
                className="rounded-xl p-4 mb-6"
                style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
              >
                {loadList.map((load, index) => (
                  <RouteLoadTimelineItem
                    key={load.id}
                    load={load}
                    isLast={index === loadList.length - 1}
                    legNumber={load.sequence !== null && load.sequence !== undefined ? load.sequence : index + 1}
                    onPress={() => router.push(`/(driver)/loads/${load.id}`)}
                  />
                ))}
              </View>
            )}

            {/* ------------------------------------------------------------------ */}
            {/* Section 2: Route & Truck Details                                    */}
            {/* ------------------------------------------------------------------ */}
            <Text className="text-lg font-semibold mb-3" style={{ color: c.textPrimary }}>Route Details</Text>

            <View
              className="rounded-xl p-4 mb-6"
              style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
            >
              {/* Route info fields */}
              <View className="flex-row mb-2">
                <View className="flex-1">
                  <Text className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: c.textTertiary }}>
                    Scheduled Date
                  </Text>
                  <Text className="text-sm" style={{ color: c.textPrimary }}>{formatDate(route.scheduledDate)}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: c.textTertiary }}>
                    Status
                  </Text>
                  <Text className="text-sm capitalize" style={{ color: c.textPrimary }}>
                    {route.status.replace(/_/g, ' ').toLowerCase()}
                  </Text>
                </View>
              </View>

              {route.name ? (
                <View className="mb-2">
                  <Text className="text-xs font-medium uppercase tracking-wide mb-0.5" style={{ color: c.textTertiary }}>
                    Route Name
                  </Text>
                  <Text className="text-sm" style={{ color: c.textPrimary }}>{route.name}</Text>
                </View>
              ) : null}

              {/* Truck details */}
              {route.truck ? (
                <>
                  <View
                    className="mt-3 pt-3"
                    style={{ borderTopWidth: 1, borderTopColor: c.border }}
                  >
                    <Text className="text-sm font-semibold mb-2" style={{ color: c.textPrimary }}>Truck Details</Text>
                    <Text className="text-sm mb-1" style={{ color: c.textPrimary }}>
                      {route.truck.year} {route.truck.make} {route.truck.model}
                    </Text>
                    {route.truck.vin ? (
                      <Text className="text-xs" style={{ color: c.textSecondary }}>VIN: {route.truck.vin}</Text>
                    ) : null}
                    {route.truck.licensePlate ? (
                      <Text className="text-xs" style={{ color: c.textSecondary }}>
                        Plate: {route.truck.licensePlate}
                      </Text>
                    ) : null}
                  </View>
                </>
              ) : (
                <View
                  className="mt-3 pt-3"
                  style={{ borderTopWidth: 1, borderTopColor: c.border }}
                >
                  <Text className="text-sm" style={{ color: c.textSecondary }}>No truck assigned</Text>
                </View>
              )}
            </View>

            {/* ------------------------------------------------------------------ */}
            {/* Section 3: Route Messages                                           */}
            {/* ------------------------------------------------------------------ */}
            <Text className="text-lg font-semibold mb-3" style={{ color: c.textPrimary }}>Route Messages</Text>

            <View
              className="rounded-xl mb-4"
              style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
            >
              {/* Message list */}
              {messagesLoading ? (
                <View className="p-4" style={{ gap: 8 }}>
                  <Skeleton width="60%" height={40} borderRadius={12} />
                  <Skeleton width="70%" height={40} borderRadius={12} style={{ alignSelf: 'flex-end' }} />
                  <Skeleton width="55%" height={40} borderRadius={12} />
                </View>
              ) : messageList.length === 0 ? (
                <View className="p-4 items-center">
                  <Text className="text-sm" style={{ color: c.textSecondary }}>No messages yet</Text>
                </View>
              ) : (
                <View className="pt-3 pb-1">
                  {messageList.map((msg) => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}
                </View>
              )}

              {/* Message input row */}
              <View
                className="px-3 py-3 flex-row items-end gap-2"
                style={{ borderTopWidth: 1, borderTopColor: c.border }}
              >
                <TextInput
                  className="flex-1 rounded-xl px-4 py-3 text-sm"
                  style={{ backgroundColor: c.surfaceElevated, color: c.textPrimary }}
                  placeholder="Message your dispatcher..."
                  placeholderTextColor={c.textMuted}
                  value={messageText}
                  onChangeText={setMessageText}
                  multiline
                  maxLength={1000}
                  returnKeyType="default"
                />
                <TouchableOpacity
                  onPress={handleSend}
                  disabled={!messageText.trim() || sendMutation.isPending}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  className="rounded-xl p-3"
                  style={{ backgroundColor: messageText.trim() && !sendMutation.isPending ? c.brand : c.surfaceElevated }}
                >
                  {sendMutation.isPending ? (
                    <ActivityIndicator size="small" color={c.textSecondary} />
                  ) : (
                    <Send
                      size={20}
                      color={messageText.trim() && !sendMutation.isPending ? '#ffffff' : c.textMuted}
                    />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
