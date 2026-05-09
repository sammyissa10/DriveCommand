import React, { useCallback, useState } from 'react'
import { LayoutAnimation, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Navigation, Plus } from 'lucide-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type OwnerRouteSummary } from '@drivecommand/api-client'
import { EmptyState } from '../../../components/ui/EmptyState'
import { Badge } from '../../../components/ui/Badge'
import { LoadCardSkeleton } from '../../../components/skeletons/LoadCardSkeleton'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { useThemeColors } from '../../../constants/tokens'
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

// ─── CollapsibleSection ───────────────────────────────────────────────────────

interface CollapsibleSectionProps {
  title: string
  count: number
  defaultOpen: boolean
  children: React.ReactNode
}

function CollapsibleSection({ title, count, defaultOpen, children }: CollapsibleSectionProps) {
  const c = useThemeColors()
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setIsOpen((prev) => !prev)
  }

  return (
    <View className="mb-2">
      <Pressable
        onPress={toggle}
        className="flex-row items-center justify-between px-4 py-3 active:opacity-75"
        accessibilityRole="button"
        accessibilityLabel={`${title} section, ${count} routes, ${isOpen ? 'collapse' : 'expand'}`}
      >
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-semibold uppercase tracking-wide" style={{ color: c.textSecondary }}>
            {title}
          </Text>
          <View
            className="rounded-full px-2 py-0.5"
            style={{ backgroundColor: c.surfaceElevated }}
          >
            <Text className="text-xs font-medium" style={{ color: c.textTertiary }}>{count}</Text>
          </View>
        </View>
        <ChevronDown
          color={c.textTertiary}
          size={16}
          style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}
        />
      </Pressable>
      {isOpen && <View>{children}</View>}
    </View>
  )
}

// ─── OwnerRouteCard ───────────────────────────────────────────────────────────

interface OwnerRouteCardProps {
  route: OwnerRouteSummary
  onPress: () => void
}

function OwnerRouteCard({ route, onPress }: OwnerRouteCardProps) {
  const c = useThemeColors()
  const badge = getStatusBadge(route.status)
  const routeName = route.name ?? 'Unnamed Route'
  const scheduledLabel = (() => {
    try {
      return new Date(route.scheduledDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return '—'
    }
  })()

  const truckLabel = route.truck
    ? `${route.truck.make} ${route.truck.model} (${route.truck.licensePlate})`
    : 'No truck assigned'

  return (
    <Pressable
      onPress={onPress}
      className="rounded-xl mx-4 mb-3 p-4 active:opacity-75"
      style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
    >
      {/* Top row: route name + badge */}
      <View className="flex-row items-center justify-between mb-2">
        <Text className="font-semibold text-base flex-1 mr-2" style={{ color: c.textPrimary }} numberOfLines={1}>
          {routeName}
        </Text>
        <Badge label={badge.label} variant={badge.variant} />
      </View>

      {/* Origin → Destination */}
      <Text className="text-xs mb-1" style={{ color: c.textSecondary }} numberOfLines={1}>
        {route.origin} → {route.destination}
      </Text>

      {/* Scheduled date */}
      <Text className="text-xs mb-2" style={{ color: c.textSecondary }}>{scheduledLabel}</Text>

      {/* Driver + Truck + counts */}
      <View className="gap-1">
        <Text className="text-xs font-medium" style={{ color: c.textSecondary }} numberOfLines={1}>
          Driver: {route.driver.name}
        </Text>
        <View className="flex-row items-center justify-between">
          <Text className="text-xs" style={{ color: c.textTertiary }} numberOfLines={1}>
            Truck: {truckLabel}
          </Text>
          <Text className="text-xs" style={{ color: c.textTertiary }}>
            {route._count.loads} loads, {route._count.stops} stops
          </Text>
        </View>
      </View>
    </Pressable>
  )
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function OwnerRoutesScreen() {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()

  const { data, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ['owner-routes'],
    queryFn: () => ownerApi.getRoutes(token!, 'all'),
    enabled: !!token,
  })

  const onRefresh = useCallback(() => {
    refetch()
  }, [refetch])

  // Group routes by status
  const routes = data ?? []
  const activeRoutes = routes.filter((r) => r.status === 'IN_PROGRESS')
  const scheduledRoutes = routes.filter((r) => r.status === 'PLANNED')
  const completedRoutes = routes.filter((r) => r.status === 'COMPLETED')
  const allEmpty = routes.length === 0

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Screen header */}
        <View className="px-4 pt-4 pb-3">
          <Text className="text-2xl font-bold" style={{ color: c.textPrimary }}>Routes</Text>
        </View>

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
        ) : allEmpty ? (
          <View className="flex-1 items-center justify-center px-6">
            <EmptyState
              icon={<Navigation color={c.textTertiary} size={40} />}
              title="No routes yet"
              subtitle="Create your first route using the button below."
            />
          </View>
        ) : (
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
            contentContainerStyle={{ paddingBottom: 100, paddingTop: 4 }}
          >
            {/* Active section */}
            {activeRoutes.length > 0 && (
              <CollapsibleSection title="Active" count={activeRoutes.length} defaultOpen={true}>
                {activeRoutes.map((route) => (
                  <OwnerRouteCard
                    key={route.id}
                    route={route}
                    onPress={() => router.push(`/(owner)/routes/${route.id}` as never)}
                  />
                ))}
              </CollapsibleSection>
            )}

            {/* Scheduled section */}
            {scheduledRoutes.length > 0 && (
              <CollapsibleSection title="Scheduled" count={scheduledRoutes.length} defaultOpen={true}>
                {scheduledRoutes.map((route) => (
                  <OwnerRouteCard
                    key={route.id}
                    route={route}
                    onPress={() => router.push(`/(owner)/routes/${route.id}` as never)}
                  />
                ))}
              </CollapsibleSection>
            )}

            {/* Completed section — collapsed by default */}
            {completedRoutes.length > 0 && (
              <CollapsibleSection title="Completed" count={completedRoutes.length} defaultOpen={false}>
                {completedRoutes.map((route) => (
                  <OwnerRouteCard
                    key={route.id}
                    route={route}
                    onPress={() => router.push(`/(owner)/routes/${route.id}` as never)}
                  />
                ))}
              </CollapsibleSection>
            )}
          </ScrollView>
        )}

        {/* FAB — Create Route */}
        <Pressable
          onPress={() => {
            haptic.medium()
            router.push('/(owner)/routes/new' as never)
          }}
          className="absolute bottom-6 right-6 w-14 h-14 rounded-full items-center justify-center active:opacity-80"
          style={{
            backgroundColor: c.brand,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 8,
          }}
          accessibilityRole="button"
          accessibilityLabel="Create new route"
        >
          <Plus color="white" size={24} />
        </Pressable>
      </AnimatedScreen>
    </SafeAreaView>
  )
}
