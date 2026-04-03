import React, { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FlashList } from '@shopify/flash-list'
import { Navigation, Package, Truck } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type OwnerLoadSummary, type OwnerRouteSummary } from '@drivecommand/api-client'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Badge } from '../../../components/ui/Badge'
import { CreateLoadSheet } from '../../../components/owner/CreateLoadSheet'
import { LoadCardSkeleton } from '../../../components/skeletons/LoadCardSkeleton'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { PageSpeedDial } from '../../../components/ui/PageSpeedDial'
import { useThemeColors } from '../../../constants/tokens'

// ─── Types ────────────────────────────────────────────────────────────────────

type ViewMode = 'loads' | 'routes'
type LoadTabType = 'all' | 'active' | 'pending' | 'delivered'
type RouteTabType = 'all' | 'planned' | 'active' | 'completed'
type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'muted'

// ─── Constants ────────────────────────────────────────────────────────────────

const LOAD_TABS: { key: LoadTabType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Pending' },
  { key: 'delivered', label: 'Delivered' },
]

const ROUTE_TABS: { key: RouteTabType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'planned', label: 'Planned' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLoadBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'PENDING':     return { label: 'Pending',    variant: 'muted' }
    case 'DISPATCHED':  return { label: 'Dispatched', variant: 'info' }
    case 'PICKED_UP':   return { label: 'Picked Up',  variant: 'warning' }
    case 'IN_TRANSIT':  return { label: 'En Route',   variant: 'warning' }
    case 'DELIVERED':   return { label: 'Delivered',  variant: 'success' }
    case 'INVOICED':    return { label: 'Invoiced',   variant: 'success' }
    case 'CANCELLED':   return { label: 'Cancelled',  variant: 'danger' }
    default:            return { label: status,       variant: 'muted' }
  }
}

function getRouteBadge(status: string): { label: string; variant: BadgeVariant } {
  switch (status) {
    case 'PLANNED':     return { label: 'Planned',     variant: 'muted' }
    case 'IN_PROGRESS': return { label: 'In Progress', variant: 'warning' }
    case 'COMPLETED':   return { label: 'Completed',   variant: 'success' }
    default:            return { label: status,        variant: 'muted' }
  }
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return ''
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

// ─── Cards ────────────────────────────────────────────────────────────────────

function OwnerLoadCard({ load, onPress }: { load: OwnerLoadSummary; onPress: () => void }) {
  const c = useThemeColors()
  const badge = getLoadBadge(load.status)
  const isUnassigned = !load.driver
  const rateFormatted = formatCurrency(load.rate)

  return (
    <Pressable
      onPress={onPress}
      className="rounded-xl mx-4 mb-3 p-4 active:opacity-75"
      style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="font-semibold text-base" style={{ color: c.textPrimary }}>#{load.loadNumber}</Text>
        <View className="flex-row items-center gap-2">
          {rateFormatted ? (
            <Text className="text-emerald-400 text-sm font-semibold">{rateFormatted}</Text>
          ) : null}
          <Badge label={badge.label} variant={badge.variant} />
        </View>
      </View>
      <Text className="text-sm font-medium mb-1" style={{ color: c.textSecondary }} numberOfLines={1}>
        {load.customer.companyName}
      </Text>
      <Text className="text-xs mb-2" style={{ color: c.textSecondary }} numberOfLines={1}>
        {load.origin} → {load.destination}
      </Text>
      <Text
        className="text-xs font-medium"
        style={{ color: isUnassigned ? '#f59e0b' : c.textSecondary }}
        numberOfLines={1}
      >
        {isUnassigned ? '⚠ Unassigned' : `Driver: ${load.driver!.name}`}
      </Text>
    </Pressable>
  )
}

function OwnerRouteCard({ route, onPress }: { route: OwnerRouteSummary; onPress: () => void }) {
  const c = useThemeColors()
  const badge = getRouteBadge(route.status)
  const scheduledLabel = (() => {
    try {
      return new Date(route.scheduledDate).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      })
    } catch {
      return '—'
    }
  })()

  return (
    <Pressable
      onPress={onPress}
      className="rounded-xl mx-4 mb-3 p-4 active:opacity-75"
      style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <Text className="font-semibold text-base flex-1 mr-2" style={{ color: c.textPrimary }} numberOfLines={1}>
          {route.name ?? 'Unnamed Route'}
        </Text>
        <Badge label={badge.label} variant={badge.variant} />
      </View>
      <Text className="text-xs mb-1" style={{ color: c.textSecondary }} numberOfLines={1}>
        {route.origin} → {route.destination}
      </Text>
      <Text className="text-xs mb-2" style={{ color: c.textSecondary }}>{scheduledLabel}</Text>
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-medium" style={{ color: c.textSecondary }} numberOfLines={1}>
          Driver: {route.driver.name}
        </Text>
        <Text className="text-xs" style={{ color: c.textTertiary }}>
          {route._count.loads} loads · {route._count.stops} stops
        </Text>
      </View>
    </Pressable>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OwnerLoadsScreen() {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { create, filter } = useLocalSearchParams<{ create?: string; filter?: string }>()

  const [viewMode, setViewMode] = useState<ViewMode>('loads')
  const [loadTab, setLoadTab] = useState<LoadTabType>('all')
  const [routeTab, setRouteTab] = useState<RouteTabType>('all')
  const [createSheetVisible, setCreateSheetVisible] = useState(false)

  useEffect(() => {
    if (create === '1') {
      setCreateSheetVisible(true)
      router.setParams({ create: undefined })
    }
  }, [create])

  useEffect(() => {
    if (filter === 'active') {
      setViewMode('loads')
      setLoadTab('active')
      router.setParams({ filter: undefined })
    }
  }, [filter])

  // ── Loads query
  const loadsQuery = useQuery({
    queryKey: ['owner-loads', loadTab],
    queryFn: () => ownerApi.getLoads(token!, loadTab),
    enabled: !!token && viewMode === 'loads',
  })

  // ── Routes query
  const routesQuery = useQuery({
    queryKey: ['owner-routes', routeTab],
    queryFn: () => ownerApi.getRoutes(token!, routeTab),
    enabled: !!token && viewMode === 'routes',
  })

  const onRefresh = useCallback(() => {
    if (viewMode === 'loads') loadsQuery.refetch()
    else routesQuery.refetch()
  }, [viewMode, loadsQuery, routesQuery])

  const renderLoad = useCallback(
    ({ item }: { item: OwnerLoadSummary }) => (
      <OwnerLoadCard
        load={item}
        onPress={() => router.push(`/(owner)/loads/${item.id}` as never)}
      />
    ),
    [router]
  )

  const renderRoute = useCallback(
    ({ item }: { item: OwnerRouteSummary }) => (
      <OwnerRouteCard
        route={item}
        onPress={() => router.push(`/(owner)/routes/${item.id}` as never)}
      />
    ),
    [router]
  )

  const isLoading  = viewMode === 'loads' ? loadsQuery.isLoading  : routesQuery.isLoading
  const isError    = viewMode === 'loads' ? loadsQuery.isError    : routesQuery.isError
  const isRefreshing = viewMode === 'loads' ? loadsQuery.isRefetching : routesQuery.isRefetching
  const refetch    = viewMode === 'loads' ? loadsQuery.refetch    : routesQuery.refetch

  const emptyTitle = viewMode === 'loads'
    ? (loadTab === 'all' ? 'No loads yet' : loadTab === 'active' ? 'No active loads' : loadTab === 'pending' ? 'No pending loads' : 'No delivered loads')
    : (routeTab === 'all' ? 'No routes yet' : routeTab === 'planned' ? 'No planned routes' : routeTab === 'active' ? 'No active routes' : 'No completed routes')

  const emptySubtitle = viewMode === 'loads'
    ? (loadTab === 'all' ? 'Create your first load using the + button below.' : loadTab === 'active' ? 'Dispatched and in-transit loads will appear here.' : loadTab === 'pending' ? 'New loads awaiting dispatch will appear here.' : 'Completed loads will appear here.')
    : (routeTab === 'all' ? 'Routes are created from the web portal.' : routeTab === 'planned' ? 'Planned routes awaiting dispatch will appear here.' : routeTab === 'active' ? 'Routes currently in progress will appear here.' : 'Completed routes will appear here.')

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>

        {/* Screen header + segment control */}
        <View className="px-4 pt-4 pb-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-2xl font-bold" style={{ color: c.textPrimary }}>
              {viewMode === 'loads' ? 'Loads' : 'Routes'}
            </Text>
            {/* Loads / Routes toggle */}
            <View
              className="flex-row rounded-xl p-1"
              style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
            >
              <Pressable
                onPress={() => setViewMode('loads')}
                className="px-4 py-1.5 rounded-lg"
                style={{ backgroundColor: viewMode === 'loads' ? c.brand : 'transparent' }}
              >
                <Text className="text-sm font-semibold" style={{ color: viewMode === 'loads' ? '#ffffff' : c.textSecondary }}>
                  Loads
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setViewMode('routes')}
                className="px-4 py-1.5 rounded-lg"
                style={{ backgroundColor: viewMode === 'routes' ? c.brand : 'transparent' }}
              >
                <Text className="text-sm font-semibold" style={{ color: viewMode === 'routes' ? '#ffffff' : c.textSecondary }}>
                  Routes
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Status filter tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginBottom: 12 }}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
        >
          {(viewMode === 'loads' ? LOAD_TABS : ROUTE_TABS).map((tab) => {
            const isActive = viewMode === 'loads' ? loadTab === tab.key : routeTab === tab.key
            return (
              <Pressable
                key={tab.key}
                onPress={() => viewMode === 'loads' ? setLoadTab(tab.key as LoadTabType) : setRouteTab(tab.key as RouteTabType)}
                className="rounded-full px-4 py-3"
                style={{
                  backgroundColor: isActive ? c.brand : c.surfaceCard,
                  borderWidth: isActive ? 0 : 1,
                  borderColor: c.border,
                }}
              >
                <Text className="text-sm font-semibold" style={{ color: isActive ? '#ffffff' : c.textSecondary }}>
                  {tab.label}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>

        {/* Content */}
        {isLoading ? (
          <View className="flex-1">
            <LoadCardSkeleton />
            <LoadCardSkeleton />
            <LoadCardSkeleton />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="text-red-400 text-base font-semibold mb-2">Failed to load</Text>
            <Pressable
              onPress={() => refetch()}
              className="px-6 py-3 rounded-lg active:opacity-80"
              style={{ backgroundColor: c.surfaceElevated }}
            >
              <Text className="font-semibold" style={{ color: c.textPrimary }}>Retry</Text>
            </Pressable>
          </View>
        ) : viewMode === 'loads' ? (
          <View className="flex-1">
            <FlashList
              data={loadsQuery.data ?? []}
              renderItem={renderLoad}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              refreshing={isRefreshing}
              onRefresh={onRefresh}

              contentContainerStyle={{ paddingBottom: 80 }}
              ListEmptyComponent={
                <EmptyState
                  icon={<Truck color={c.textMuted} size={40} />}
                  title={emptyTitle}
                  subtitle={emptySubtitle}
                />
              }
            />
          </View>
        ) : (
          <View className="flex-1">
            <FlashList
              data={routesQuery.data ?? []}
              renderItem={renderRoute}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              refreshing={isRefreshing}
              onRefresh={onRefresh}

              contentContainerStyle={{ paddingBottom: 80 }}
              ListEmptyComponent={
                <EmptyState
                  icon={<Navigation color={c.textMuted} size={40} />}
                  title={emptyTitle}
                  subtitle={emptySubtitle}
                />
              }
            />
          </View>
        )}

        {/* FAB — only show on loads view */}
        {viewMode === 'loads' && (
          <PageSpeedDial
            primaryLabel="New Load"
            primaryIcon={Package}
            primaryColor="#38bdf8"
            onPrimaryPress={() => setCreateSheetVisible(true)}
          />
        )}

        <CreateLoadSheet
          visible={createSheetVisible}
          onClose={() => setCreateSheetVisible(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['owner-loads'] })
            setCreateSheetVisible(false)
          }}
        />
      </AnimatedScreen>
    </SafeAreaView>
  )
}
