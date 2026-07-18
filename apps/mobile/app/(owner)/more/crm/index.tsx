import React, { useCallback, useMemo, useState } from 'react'
import { View, RefreshControl } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, Users } from 'lucide-react-native'
import { useAuthContext } from '../../../../context/AuthContext'
import { haptic } from '../../../../lib/haptics'
import { ownerApi, type CRMResponse, type CustomerSummary } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../../components/ui/AnimatedScreen'
import {
  Screen,
  LargeTitleHeader,
  KPIRow,
  KPICard,
  SearchField,
  SegmentedControl,
  EntityRow,
  MonogramAvatar,
  VIPTag,
  EmptyState,
  Skeleton,
  EntityListSkeleton,
  Text,
  Pressable,
  Icon,
  icon as iconSize,
} from '../../../../components/ui/ds'

// ---------------------------------------------------------------------------
// Formatting — compact so a row meta line never wraps
// ---------------------------------------------------------------------------

function moneyCompact(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

function rowMeta(c: CustomerSummary): string {
  const loads = `${c.totalLoads} load${c.totalLoads === 1 ? '' : 's'}`
  return `${loads} · ${moneyCompact(c.totalRevenue)}`
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

type ClientFilter = 'all' | 'vip' | 'recent'

const FILTER_OPTIONS: { label: string; value: ClientFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'VIP', value: 'vip' },
  { label: 'Recent', value: 'recent' },
]

function BackRow() {
  const router = useRouter()
  if (!router.canGoBack()) return <View className="h-2" />
  return (
    <View className="px-5">
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={12}
        className="h-11 w-11 -ml-2 items-center justify-center"
      >
        <Icon icon={ChevronLeft} size={iconSize.lg} className="text-ds-accent" />
      </Pressable>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ClientsOverviewScreen() {
  const { token } = useAuthContext()
  const router = useRouter()

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ClientFilter>('all')

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<CRMResponse>({
    queryKey: ['owner-crm'],
    queryFn: () => ownerApi.getCRM(token!),
    enabled: !!token,
    staleTime: 60_000,
  })

  const customers = data?.customers ?? []
  const stats = data?.stats

  // Filter (segment + KPI) then search — the two compose — then sort.
  const visible = useMemo(() => {
    let list = customers
    if (filter === 'vip') list = list.filter((c) => c.priority === 'VIP')

    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (c) =>
          c.companyName.toLowerCase().includes(q) ||
          (c.contactName?.toLowerCase().includes(q) ?? false),
      )
    }

    const sorted = [...list]
    if (filter === 'recent') {
      sorted.sort(
        (a, b) =>
          (b.lastLoadDate ? Date.parse(b.lastLoadDate) : 0) -
          (a.lastLoadDate ? Date.parse(a.lastLoadDate) : 0),
      )
    } else {
      // "Who is worth my time" — book value desc.
      sorted.sort((a, b) => b.totalRevenue - a.totalRevenue)
    }
    return sorted
  }, [customers, filter, query])

  const onRefresh = useCallback(() => {
    haptic.light()
    refetch()
  }, [refetch])

  const openCreate = useCallback(() => {
    // Quick Create bottom sheet is Prompt 2 — until then, the existing create route.
    router.push('/(owner)/more/crm/new' as never)
  }, [router])

  const toggleVip = useCallback(() => {
    setFilter((f) => (f === 'vip' ? 'all' : 'vip'))
  }, [])

  const renderItem = useCallback(
    ({ item }: { item: CustomerSummary }) => (
      <EntityRow
        leading={<MonogramAvatar name={item.companyName} />}
        title={item.companyName}
        titleAccessory={item.priority === 'VIP' ? <VIPTag /> : undefined}
        subline={item.contactName ?? item.phone ?? undefined}
        meta={rowMeta(item)}
        onPress={() => router.push(`/(owner)/more/crm/${item.id}` as never)}
        accessibilityLabel={`${item.companyName}, ${rowMeta(item)}`}
      />
    ),
    [router],
  )

  const countLabel = stats ? `${stats.total} client${stats.total === 1 ? '' : 's'}` : undefined

  // ---- Loading (content-shaped skeleton, never a spinner) ----
  if (isLoading) {
    return (
      <Screen padded={false}>
        <AnimatedScreen>
          <BackRow />
          <View className="gap-3 px-5">
            <LargeTitleHeader title="Clients" subtitle="Loading…" />
            <KPIRow>
              <View className="flex-1">
                <Skeleton height={74} rounded={18} />
              </View>
              <View className="flex-1">
                <Skeleton height={74} rounded={18} />
              </View>
              <View className="flex-1">
                <Skeleton height={74} rounded={18} />
              </View>
            </KPIRow>
            <Skeleton height={44} rounded={13} />
            <Skeleton height={36} rounded={11} />
            <View className="h-2" />
            <EntityListSkeleton count={6} />
          </View>
        </AnimatedScreen>
      </Screen>
    )
  }

  // ---- Error (retry, input preserved by staying on screen) ----
  if (isError) {
    return (
      <Screen padded={false}>
        <AnimatedScreen>
          <BackRow />
          <View className="flex-1 items-center justify-center px-8">
            <Icon icon={Users} size={40} strokeWidth={1.5} className="text-ds-txt3" />
            <Text variant="body" className="mt-4 text-center text-[15px]">
              Couldn’t load clients
            </Text>
            <Text variant="caption" className="mt-1 text-center">
              Check your connection and try again.
            </Text>
            <Pressable
              onPress={() => refetch()}
              accessibilityRole="button"
              accessibilityLabel="Retry"
              hitSlop={12}
              className="mt-4 min-h-[48px] justify-center"
            >
              <Text variant="rowTitle" className="text-ds-accent">
                Retry
              </Text>
            </Pressable>
          </View>
        </AnimatedScreen>
      </Screen>
    )
  }

  // ---- Loaded ----
  const isFiltering = query.trim().length > 0 || filter !== 'all'

  return (
    <Screen padded={false}>
      <AnimatedScreen>
        <BackRow />
        <FlashList
          data={visible}
          renderItem={renderItem}
          keyExtractor={(c) => c.id}
          ItemSeparatorComponent={() => <View className="h-3" />}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View className="gap-3 pb-3">
              <LargeTitleHeader
                title="Clients"
                subtitle={countLabel}
                onAdd={openCreate}
                addLabel="Add client"
              />
              <KPIRow>
                <KPICard value={moneyCompact(stats?.revenue ?? 0)} label="Revenue" />
                <KPICard value={stats?.loads ?? 0} label="Loads" />
                <KPICard
                  value={stats?.vip ?? 0}
                  label="VIP"
                  tone="vip"
                  active={filter === 'vip'}
                  onPress={toggleVip}
                />
              </KPIRow>
              <SearchField
                value={query}
                onChangeText={setQuery}
                placeholder="Search company or contact"
              />
              <SegmentedControl options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
            </View>
          }
          ListEmptyComponent={
            isFiltering ? (
              <EmptyState
                icon={Users}
                title="No matching clients"
                message="Try a different search or filter."
              />
            ) : (
              <EmptyState
                icon={Users}
                title="No clients yet"
                message="Tap + in the top right to add your first client."
              />
            )
          }
        />
      </AnimatedScreen>
    </Screen>
  )
}
