import React, { useCallback } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, RefreshControl } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { FlashList } from '@shopify/flash-list'
import { Truck } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../../../context/AuthContext'
import { carrierDriverApi, type CarrierDispatch } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { useThemeColors } from '../../../constants/tokens'

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

function getCompletedStops(stops: CarrierDispatch['stops']): number {
  return stops.filter((s) => s.status === 'completed' || s.status === 'departed').length
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ActiveDispatchCard({
  dispatch,
  onPress,
}: {
  dispatch: CarrierDispatch
  onPress: () => void
}) {
  const c = useThemeColors()
  const completedStops = getCompletedStops(dispatch.stops)
  const totalStops = dispatch.stops.length
  const progressPct = totalStops > 0 ? completedStops / totalStops : 0

  return (
    <Pressable
      onPress={onPress}
      style={[styles.activeCard, { backgroundColor: c.surfaceCard, borderColor: c.brand }]}
      accessibilityLabel={`Active dispatch ${dispatch.dispatchNumber}`}
      accessibilityRole="button"
    >
      {/* Header */}
      <View style={styles.activeCardHeader}>
        <View>
          <Text style={[styles.activeCardLabel, { color: c.brand }]}>ACTIVE DISPATCH</Text>
          <Text style={[styles.activeCardNumber, { color: c.textPrimary }]}>{dispatch.dispatchNumber}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: c.brandSubtle }]}>
          <Text style={[styles.statusBadgeText, { color: c.brand }]}>In Progress</Text>
        </View>
      </View>

      {/* Truck */}
      <View style={styles.activeCardRow}>
        <Truck size={14} color={c.textSecondary} />
        <Text style={[styles.activeCardMeta, { color: c.textSecondary }]}>
          {dispatch.truck.unitNumber}
        </Text>
        <Text style={[styles.activeCardMeta, { color: c.textSecondary }]}>
          {' · '}Departs {formatDate(dispatch.scheduledDeparture)} at {formatTime(dispatch.scheduledDeparture)}
        </Text>
      </View>

      {/* Progress */}
      <View style={styles.progressSection}>
        <View style={styles.progressLabelRow}>
          <Text style={[styles.progressLabel, { color: c.textSecondary }]}>Stop Progress</Text>
          <Text style={[styles.progressLabel, { color: c.textSecondary }]}>
            {completedStops}/{totalStops}
          </Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: c.border }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: c.brand, width: `${Math.round(progressPct * 100)}%` as `${number}%` },
            ]}
          />
        </View>
      </View>
    </Pressable>
  )
}

function UpcomingDispatchCard({
  dispatch,
  onPress,
}: {
  dispatch: CarrierDispatch
  onPress: () => void
}) {
  const c = useThemeColors()

  return (
    <Pressable
      onPress={onPress}
      style={[styles.upcomingCard, { backgroundColor: c.surfaceCard, borderColor: c.border }]}
      accessibilityLabel={`Upcoming dispatch ${dispatch.dispatchNumber}`}
      accessibilityRole="button"
    >
      <View style={styles.upcomingCardLeft}>
        <Text style={[styles.upcomingDispatchNumber, { color: c.textPrimary }]}>
          {dispatch.dispatchNumber}
        </Text>
        <Text style={[styles.upcomingMeta, { color: c.textSecondary }]}>
          {formatDate(dispatch.scheduledDeparture)} · {dispatch.truck.unitNumber}
        </Text>
      </View>
      <View style={styles.upcomingCardRight}>
        <Text style={[styles.stopCount, { color: c.textTertiary }]}>
          {dispatch.stops.length} stop{dispatch.stops.length !== 1 ? 's' : ''}
        </Text>
      </View>
    </Pressable>
  )
}

function EmptyDispatchState() {
  const c = useThemeColors()
  return (
    <View style={styles.emptyState}>
      <Truck size={48} color={c.textTertiary} />
      <Text style={[styles.emptyTitle, { color: c.textSecondary }]}>No dispatches assigned</Text>
      <Text style={[styles.emptySubtitle, { color: c.textTertiary }]}>
        Your dispatcher will assign runs here.
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CarrierHomeScreen() {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ['carrier-dispatches'],
    queryFn: () => carrierDriverApi.getMyDispatches(token!),
    enabled: !!token,
  })

  const dispatches = data ?? []
  const activeDispatch = dispatches.find((d) => d.status === 'in_progress') ?? null
  const upcomingDispatches = dispatches.filter((d) => d.status === 'planned')

  const handleDispatchPress = useCallback(
    (id: string) => {
      router.push(`/carrier/dispatch/${id}` as never)
    },
    [router]
  )

  const renderUpcomingItem = useCallback(
    ({ item }: { item: CarrierDispatch }) => (
      <UpcomingDispatchCard
        dispatch={item}
        onPress={() => handleDispatchPress(item.id)}
      />
    ),
    [handleDispatchPress]
  )

  const keyExtractor = useCallback((item: CarrierDispatch) => item.id, [])

  if (isLoading) {
    return (
      <AnimatedScreen>
        <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: c.textPrimary }]}>My Dispatches</Text>
          </View>
          {/* Skeleton placeholder */}
          <View style={[styles.skeletonCard, { backgroundColor: c.surfaceCard }]} />
          <View style={[styles.skeletonCard, { backgroundColor: c.surfaceCard, opacity: 0.6 }]} />
        </SafeAreaView>
      </AnimatedScreen>
    )
  }

  return (
    <AnimatedScreen>
      <SafeAreaView style={[styles.container, { backgroundColor: c.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>My Dispatches</Text>
        </View>

        {dispatches.length === 0 ? (
          <EmptyDispatchState />
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={c.brand}
                colors={[c.brand]}
              />
            }
          >
            {/* Active dispatch card */}
            {activeDispatch && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>ACTIVE</Text>
                <ActiveDispatchCard
                  dispatch={activeDispatch}
                  onPress={() => handleDispatchPress(activeDispatch.id)}
                />
              </View>
            )}

            {/* Upcoming dispatches */}
            {upcomingDispatches.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>UPCOMING</Text>
                <FlashList
                  data={upcomingDispatches}
                  renderItem={renderUpcomingItem}
                  keyExtractor={keyExtractor}
                  scrollEnabled={false}
                  ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
              </View>
            )}
          </ScrollView>
        )}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  scrollContent: {
    paddingBottom: 32,
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  // Active card
  activeCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 16,
    gap: 12,
  },
  activeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  activeCardLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  activeCardNumber: {
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
  activeCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeCardMeta: {
    fontSize: 13,
  },
  progressSection: {
    gap: 6,
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
  // Upcoming card
  upcomingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
  },
  upcomingCardLeft: {
    flex: 1,
    gap: 3,
  },
  upcomingDispatchNumber: {
    fontSize: 15,
    fontWeight: '600',
  },
  upcomingMeta: {
    fontSize: 13,
  },
  upcomingCardRight: {
    marginLeft: 8,
  },
  stopCount: {
    fontSize: 12,
  },
  separator: {
    height: 8,
  },
  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Skeleton
  skeletonCard: {
    height: 140,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
})
