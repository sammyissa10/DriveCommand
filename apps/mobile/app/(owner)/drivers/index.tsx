import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, RefreshControl } from 'react-native'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { FlashList } from '@shopify/flash-list'
import { AlertTriangle, Clock, Users } from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '@/context/AuthContext'
import { ownerApi, type OwnerDriverSummary } from '@drivecommand/api-client'
import { haptic } from '@/lib/haptics'
import { formatHosMeta, hosMetaTone } from '@/lib/hos-format'
import {
  Screen,
  LargeTitleHeader,
  SearchField,
  SegmentedControl,
  KPIRow,
  KPICard,
  EntityRow,
  MonogramAvatar,
  StatusPill,
  EmptyState,
  EntityListSkeleton,
  Text,
  Icon,
  Pressable,
  dsColors,
  icon,
  type StatusTone,
  type MetaTone,
} from '@/components/ui/ds'

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

type Segment = 'all' | 'on_duty' | 'off_duty' | 'invited'
const SEGMENTS: { label: string; value: Segment }[] = [
  { label: 'All', value: 'all' },
  { label: 'On Duty', value: 'on_duty' },
  { label: 'Off Duty', value: 'off_duty' },
  { label: 'Invited', value: 'invited' },
]

/** Dispatch bucket — "who can take this load" at a glance. */
type Dispatch = 'available' | 'on_load' | 'low_hours'

/** KPI quick-filters. Tapping one narrows the list; tapping again clears it. */
const KPIS: { key: Dispatch; label: string; tone: StatusTone }[] = [
  { key: 'available', label: 'Available', tone: 'success' },
  { key: 'on_load', label: 'On Load', tone: 'accent' },
  { key: 'low_hours', label: 'Low Hours', tone: 'warning' },
]

// ---------------------------------------------------------------------------
// Row derivations (pure — no math, just classification + labels)
// ---------------------------------------------------------------------------

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Classify an accepted driver into a dispatch bucket. Invited rows are excluded. */
function dispatchOf(d: OwnerDriverSummary): Dispatch | null {
  if (d.invited) return null
  if (d.activeLoad) return 'on_load'
  if (d.hos?.isLow) return 'low_hours'
  return 'available'
}

/** Duty status pill mapping per the design-system status → token table. */
function dutyPill(d: OwnerDriverSummary): { label: string; tone: StatusTone } {
  if (d.invited) return { label: 'Invited', tone: 'neutral' }
  switch (d.hosStatus) {
    case 'DRIVING':
      return { label: 'Driving', tone: 'accent' }
    case 'ON_DUTY':
      return { label: 'On Duty', tone: 'success' }
    case 'SLEEPER_BERTH':
      return { label: 'Sleeper', tone: 'neutral' }
    default:
      return { label: 'Off Duty', tone: 'neutral' }
  }
}

/** Live subline — active assignment context, never generic filler. */
function subline(d: OwnerDriverSummary): string {
  if (d.invited) return d.email
  if (d.activeLoad) {
    return `#${d.activeLoad.loadNumber} · ${d.activeLoad.origin} → ${d.activeLoad.destination}`
  }
  return 'No active load'
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

const DriverRow = React.memo(function DriverRow({
  driver,
  onPress,
  onHoursPress,
}: {
  driver: OwnerDriverSummary
  onPress: () => void
  onHoursPress: () => void
}) {
  const pill = dutyPill(driver)
  const hasCompliance = !driver.invited && driver.complianceStatus !== 'ok'
  const metaTone: MetaTone = driver.hos ? hosMetaTone(driver.hos) : 'muted'

  return (
    <EntityRow
      leading={<MonogramAvatar name={driver.name} warning={hasCompliance} />}
      title={titleCase(driver.name)}
      subline={subline(driver)}
      meta={driver.hos ? formatHosMeta(driver.hos) : undefined}
      metaTone={metaTone}
      metaIcon={
        driver.hos ? (
          <Icon
            icon={Clock}
            size={icon.sm - 2}
            className={
              metaTone === 'danger'
                ? 'text-ds-danger'
                : metaTone === 'warning'
                  ? 'text-ds-warning'
                  : 'text-ds-txt3'
            }
          />
        ) : undefined
      }
      onMetaPress={driver.hos ? onHoursPress : undefined}
      metaAccessibilityLabel={`${driver.name} hours of service — open Hours`}
      pill={<StatusPill label={pill.label} tone={pill.tone} />}
      onPress={onPress}
      accessibilityLabel={`${titleCase(driver.name)}, ${pill.label}`}
    />
  )
})

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function OwnerDriversScreen() {
  const { token } = useAuthContext()
  const router = useRouter()
  const { driverId } = useLocalSearchParams<{ driverId?: string }>()

  const [segment, setSegment] = useState<Segment>('all')
  const [kpiFilter, setKpiFilter] = useState<Dispatch | null>(null)
  const [search, setSearch] = useState('')

  // Deep-link support: a ?driverId= param routes straight to that driver's detail.
  useEffect(() => {
    if (driverId) {
      router.setParams({ driverId: undefined })
      router.push(`/(owner)/drivers/${driverId}` as never)
    }
  }, [driverId])

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<OwnerDriverSummary[]>({
    queryKey: ['owner-drivers'],
    queryFn: () => ownerApi.getDrivers(token!),
    enabled: !!token,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const drivers = data ?? []

  // KPI counts are over accepted drivers only (invited rows aren't dispatchable).
  const counts = useMemo(() => {
    const c: Record<Dispatch, number> = { available: 0, on_load: 0, low_hours: 0 }
    for (const d of drivers) {
      const bucket = dispatchOf(d)
      if (bucket) c[bucket] += 1
    }
    return c
  }, [drivers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return drivers.filter((d) => {
      // Segment filter
      if (segment === 'invited' && !d.invited) return false
      if (segment === 'on_duty' && (d.invited || d.status !== 'on_duty')) return false
      if (segment === 'off_duty' && (d.invited || d.status !== 'off_duty')) return false
      // KPI dispatch filter (ANDs with the segment; invited rows never match)
      if (kpiFilter && dispatchOf(d) !== kpiFilter) return false
      // Search by name or email
      if (q && !d.name.toLowerCase().includes(q) && !d.email.toLowerCase().includes(q)) {
        return false
      }
      return true
    })
  }, [drivers, segment, kpiFilter, search])

  const onRefresh = useCallback(() => refetch(), [refetch])

  const openDetail = useCallback(
    (d: OwnerDriverSummary) => {
      if (d.invited) {
        haptic.light()
        Toast.show({
          type: 'info',
          text1: 'Invitation pending',
          text2: `${titleCase(d.name)} hasn't accepted yet.`,
          visibilityTime: 2500,
        })
        return
      }
      router.push(`/(owner)/drivers/${d.id}` as never)
    },
    [router]
  )

  const openHours = useCallback(
    (d: OwnerDriverSummary) => {
      router.push(`/(owner)/drivers/${d.id}?tab=hours` as never)
    },
    [router]
  )

  const renderItem = useCallback(
    ({ item }: { item: OwnerDriverSummary }) => (
      <View className="px-5 pb-3">
        <DriverRow
          driver={item}
          onPress={() => openDetail(item)}
          onHoursPress={() => openHours(item)}
        />
      </View>
    ),
    [openDetail, openHours]
  )

  const toggleKpi = useCallback(
    (key: Dispatch) => setKpiFilter((prev) => (prev === key ? null : key)),
    []
  )

  const header = (
    <View className="px-5">
      <LargeTitleHeader
        title="Drivers"
        subtitle={`${drivers.length} in fleet`}
        onAdd={() => router.push('/(owner)/drivers/invite' as never)}
        addLabel="Invite driver"
      />
      <View className="pb-3">
        <KPIRow>
          {KPIS.map((k) => (
            <KPICard
              key={k.key}
              value={counts[k.key]}
              label={k.label}
              tone={k.tone}
              active={kpiFilter === k.key}
              onPress={() => toggleKpi(k.key)}
            />
          ))}
        </KPIRow>
      </View>
      <View className="pb-3">
        <SearchField value={search} onChangeText={setSearch} placeholder="Search drivers" />
      </View>
      <View className="pb-3">
        <SegmentedControl options={SEGMENTS} value={segment} onChange={setSegment} />
      </View>
    </View>
  )

  // ── Error
  if (isError) {
    return (
      <Screen>
        <LargeTitleHeader
          title="Drivers"
          onAdd={() => router.push('/(owner)/drivers/invite' as never)}
          addLabel="Invite driver"
        />
        <View className="flex-1 items-center justify-center">
          <Icon icon={AlertTriangle} size={40} className="text-ds-danger" strokeWidth={1.5} />
          <Text variant="body" className="mt-4 text-center text-[15px]">
            Couldn&apos;t load drivers
          </Text>
          <Text variant="caption" className="mt-1 text-center">
            {error instanceof Error ? error.message : 'Something went wrong.'}
          </Text>
          <Pressable
            onPress={() => refetch()}
            className="mt-5 h-12 items-center justify-center rounded-[13px] bg-ds-accent px-6"
          >
            <Text className="font-semibold text-white">Retry</Text>
          </Pressable>
        </View>
      </Screen>
    )
  }

  // ── Loading
  if (isLoading) {
    return (
      <Screen>
        <LargeTitleHeader title="Drivers" />
        <View className="pt-2">
          <EntityListSkeleton count={7} />
        </View>
      </Screen>
    )
  }

  // ── Loaded
  return (
    <Screen padded={false}>
      <FlashList
        data={filtered}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View className="px-5">
            <EmptyState
              icon={Users}
              title={
                search || kpiFilter || segment !== 'all'
                  ? 'No drivers match these filters'
                  : 'No drivers in your fleet yet'
              }
              message={
                search || kpiFilter || segment !== 'all'
                  ? 'Clear a filter to see more.'
                  : 'Tap + to invite your first driver.'
              }
            />
          </View>
        }
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={dsColors.accent}
            colors={[dsColors.accent]}
          />
        }
      />
    </Screen>
  )
}
