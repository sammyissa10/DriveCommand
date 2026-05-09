import React, { useCallback } from 'react'
import { View, Text, Pressable, RefreshControl, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { FlashList } from '@shopify/flash-list'
import { ChevronLeft } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '@/context/AuthContext'
import {
  carrierDriverApi,
  type CarrierDispatchDetailStop,
} from '@drivecommand/api-client'
import { AnimatedScreen } from '@/components/ui/AnimatedScreen'
import { StopListItem } from '@/components/carrier/StopListItem'
import { useThemeColors } from '@/constants/tokens'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getStatusColors(
  status: string,
  c: ReturnType<typeof useThemeColors>
): { bg: string; text: string } {
  switch (status) {
    case 'in_progress':
      return { bg: c.infoBg, text: c.info }
    case 'completed':
      return { bg: c.successBg, text: c.success }
    case 'cancelled':
      return { bg: c.dangerBg, text: c.danger }
    default:
      return { bg: c.mutedBg, text: c.textTertiary }
  }
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case 'in_progress':
      return 'In Progress'
    case 'completed':
      return 'Completed'
    case 'planned':
      return 'Planned'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status.charAt(0).toUpperCase() + status.slice(1)
  }
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DispatchDetailSkeleton() {
  const c = useThemeColors()
  return (
    <View style={styles.skeletonContainer}>
      <View style={[styles.skeletonCard, { backgroundColor: c.surfaceCard }]} />
      <View style={[styles.skeletonCard, { backgroundColor: c.surfaceCard, opacity: 0.7 }]} />
      <View style={[styles.skeletonCard, { backgroundColor: c.surfaceCard, opacity: 0.5 }]} />
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function DispatchDetailScreen() {
  const c = useThemeColors()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { token } = useAuthContext()
  const router = useRouter()

  const { data: dispatch, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['carrier-dispatch', id],
    queryFn: () => carrierDriverApi.getDispatchDetail(token!, id),
    enabled: !!token && !!id,
  })

  const handleStopPress = useCallback(
    (stopId: string) => {
      router.push(`/carrier/dispatch/${id}/stop/${stopId}` as never)
    },
    [id, router]
  )

  const sortedStops = dispatch?.stops
    ? [...dispatch.stops].sort((a, b) => a.sequenceOrder - b.sequenceOrder)
    : []

  const completedStops = sortedStops.filter(
    (s) => s.status === 'completed' || s.status === 'departed'
  ).length
  const totalStops = sortedStops.length
  const progressPct = totalStops > 0 ? completedStops / totalStops : 0

  const activeStopId =
    sortedStops.find((s) => s.status !== 'completed' && s.status !== 'skipped' && s.status !== 'departed')?.id ??
    null

  const statusColor = dispatch ? getStatusColors(dispatch.status, c) : getStatusColors('', c)

  const renderStop = useCallback(
    ({ item }: { item: CarrierDispatchDetailStop }) => (
      <StopListItem
        stop={item}
        isActive={item.id === activeStopId}
        onPress={() => handleStopPress(item.id)}
      />
    ),
    [activeStopId, handleStopPress]
  )

  const keyExtractor = useCallback((item: CarrierDispatchDetailStop) => item.id, [])

  if (isLoading) {
    return (
      <AnimatedScreen>
        <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft size={22} color={c.textPrimary} />
            </Pressable>
          </View>
          <DispatchDetailSkeleton />
        </SafeAreaView>
      </AnimatedScreen>
    )
  }

  if (!dispatch) {
    return (
      <AnimatedScreen>
        <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Go back"
            >
              <ChevronLeft size={22} color={c.textPrimary} />
            </Pressable>
          </View>
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { color: c.textSecondary }]}>Dispatch not found.</Text>
          </View>
        </SafeAreaView>
      </AnimatedScreen>
    )
  }

  return (
    <AnimatedScreen>
      <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={22} color={c.textPrimary} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={[styles.dispatchNumber, { color: c.textPrimary }]}>
              {dispatch.dispatchNumber}
            </Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor.text }]}>
                {formatStatusLabel(dispatch.status)}
              </Text>
            </View>
          </View>
        </View>

        {/* Sub-header: truck + departure */}
        <View style={[styles.subHeader, { borderBottomColor: c.border }]}>
          <Text style={[styles.subHeaderText, { color: c.textSecondary }]}>
            {dispatch.truck.unitNumber}
            {' · '}
            Departs {formatDate(dispatch.scheduledDeparture)} at{' '}
            {formatTime(dispatch.scheduledDeparture)}
          </Text>
        </View>

        {/* Progress bar */}
        <View style={[styles.progressSection, { borderBottomColor: c.border }]}>
          <View style={styles.progressLabelRow}>
            <Text style={[styles.progressLabel, { color: c.textSecondary }]}>
              {completedStops} of {totalStops} stops completed
            </Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: c.brand,
                  width: `${Math.round(progressPct * 100)}%` as `${number}%`,
                },
              ]}
            />
          </View>
        </View>

        {/* Stop list */}
        <FlashList
          data={sortedStops}
          renderItem={renderStop}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={c.brand}
              colors={[c.brand]}
            />
          }
        />
      </SafeAreaView>
    </AnimatedScreen>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dispatchNumber: {
    fontSize: 18,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  subHeader: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  subHeaderText: {
    fontSize: 13,
  },
  progressSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 1,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  separator: {
    height: 8,
  },
  skeletonContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
  },
  skeletonCard: {
    height: 72,
    borderRadius: 10,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 15,
  },
})
