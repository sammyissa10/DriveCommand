import React, { useCallback, useState } from 'react'
import {
  Pressable,
  ScrollView,
  Text,
  View,
  RefreshControl,
  ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { FlashList } from '@shopify/flash-list'
import { SafeAreaView } from 'react-native-safe-area-context'
import { DollarSign, ChevronRight } from 'lucide-react-native'
import { useAuthContext } from '../../../context/AuthContext'
import { useThemeColors } from '../../../constants/tokens'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { EmptyState } from '../../../components/ui/EmptyState'
import { haptic } from '../../../lib/haptics'

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000'

type TabKey = 'settlements' | 'current' | 'deductions' | 'bonuses'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'settlements', label: 'Settlements' },
  { key: 'current', label: 'Current Period' },
  { key: 'deductions', label: 'Deductions' },
  { key: 'bonuses', label: 'Bonuses' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMoney(val: string | number): string {
  const n = typeof val === 'string' ? parseFloat(val) : val
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPeriod(start: string, end: string): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(new Date(start))} – ${fmt(new Date(end))}`
}

function statusColor(status: string, c: ReturnType<typeof useThemeColors>) {
  switch (status) {
    case 'PAID': return c.success
    case 'FINALIZED': return c.brand
    case 'DISPUTED': return c.warning
    default: return c.textSecondary
  }
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    FINALIZED: 'Finalized',
    PAID: 'Paid',
    VOIDED: 'Voided',
    DISPUTED: 'Disputed',
  }
  return map[status] ?? status
}

// ---------------------------------------------------------------------------
// Fetchers
// ---------------------------------------------------------------------------

async function fetchApi<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Row components
// ---------------------------------------------------------------------------

function SettlementRow({
  item,
  c,
  onPress,
}: {
  item: { id: string; periodStart: string; periodEnd: string; status: string; netPay: string }
  c: ReturnType<typeof useThemeColors>
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={() => { haptic.light(); onPress() }}
      className="flex-row items-center justify-between px-4 py-4 mx-4 mb-2 rounded-xl"
      style={{ backgroundColor: c.surfaceCard }}
    >
      <View className="flex-1 gap-1">
        <Text className="text-sm font-medium" style={{ color: c.textPrimary }}>
          {formatPeriod(item.periodStart, item.periodEnd)}
        </Text>
        <Text className="text-xs font-medium" style={{ color: statusColor(item.status, c) }}>
          {statusLabel(item.status)}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Text className="text-base font-bold" style={{ color: c.textPrimary }}>
          {formatMoney(item.netPay)}
        </Text>
        <ChevronRight size={16} color={c.textSecondary} />
      </View>
    </Pressable>
  )
}

function CurrentPeriodRow({
  item,
  c,
}: {
  item: {
    id: string
    payStatus: string
    load: { id: string; referenceNumber: string | null; status: string } | null
    payComponents: { grossAmount: string }[]
  }
  c: ReturnType<typeof useThemeColors>
}) {
  const total = item.payComponents.reduce((sum, comp) => sum + parseFloat(comp.grossAmount), 0)
  return (
    <View
      className="flex-row items-center justify-between px-4 py-4 mx-4 mb-2 rounded-xl"
      style={{ backgroundColor: c.surfaceCard }}
    >
      <View className="flex-1 gap-1">
        <Text className="text-sm font-medium" style={{ color: c.textPrimary }}>
          {item.load?.referenceNumber ?? (item.load ? `Load #${item.load.id.slice(0, 8)}` : 'Unknown load')}
        </Text>
        <Text className="text-xs" style={{ color: c.textSecondary }}>
          {item.payStatus === 'APPROVED'
            ? 'Approved • awaiting settlement'
            : 'Pending manager review'}
        </Text>
      </View>
      <Text className="text-sm font-semibold" style={{ color: c.textPrimary }}>
        {formatMoney(total.toFixed(2))}
      </Text>
    </View>
  )
}

function DeductionRow({
  item,
  c,
}: {
  item: {
    id: string
    deductionType: string
    amountPerPeriod: string | null
    totalAmount: string | null
    amountCollected: string | null
  }
  c: ReturnType<typeof useThemeColors>
}) {
  const total = parseFloat(item.totalAmount ?? '0')
  const collected = parseFloat(item.amountCollected ?? '0')
  const pct = total > 0 ? Math.round((collected / total) * 100) : 0
  const hasProgress = total > 0

  const typeLabel = item.deductionType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <View
      className="px-4 py-4 mx-4 mb-2 rounded-xl gap-2"
      style={{ backgroundColor: c.surfaceCard }}
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-medium" style={{ color: c.textPrimary }}>
          {typeLabel}
        </Text>
        {item.amountPerPeriod && (
          <Text className="text-sm" style={{ color: c.textSecondary }}>
            {formatMoney(item.amountPerPeriod)}/period
          </Text>
        )}
      </View>
      {hasProgress && (
        <>
          <View className="h-1.5 rounded-full" style={{ backgroundColor: c.border }}>
            <View
              className="h-1.5 rounded-full"
              style={{ width: `${pct}%`, backgroundColor: c.brand }}
            />
          </View>
          <Text className="text-xs" style={{ color: c.textSecondary }}>
            {pct}% paid off
          </Text>
        </>
      )}
    </View>
  )
}

function BonusRow({
  item,
  c,
}: {
  item: {
    id: string
    bonusType: string
    description: string | null
    amount: string
    paidAt: string | null
    installmentNumber: number | null
    totalInstallments: number | null
  }
  c: ReturnType<typeof useThemeColors>
}) {
  const typeLabel = item.bonusType
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <View
      className="flex-row items-center justify-between px-4 py-4 mx-4 mb-2 rounded-xl"
      style={{ backgroundColor: c.surfaceCard }}
    >
      <View className="flex-1 gap-1">
        <Text className="text-sm font-medium" style={{ color: c.textPrimary }}>
          {typeLabel}
        </Text>
        {item.description && (
          <Text className="text-xs" style={{ color: c.textSecondary }}>
            {item.description}
          </Text>
        )}
        {item.installmentNumber && item.totalInstallments && (
          <Text className="text-xs" style={{ color: c.textSecondary }}>
            Installment {item.installmentNumber} of {item.totalInstallments}
          </Text>
        )}
      </View>
      <View className="items-end gap-1">
        <Text className="text-sm font-semibold" style={{ color: c.textPrimary }}>
          {formatMoney(item.amount)}
        </Text>
        <Text
          className="text-xs font-medium"
          style={{ color: item.paidAt ? c.success : c.textSecondary }}
        >
          {item.paidAt ? 'Paid' : 'Pending'}
        </Text>
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function PayScreen() {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>('settlements')

  const settlementsQuery = useQuery({
    queryKey: ['driver-pay-settlements'],
    queryFn: () => fetchApi<{ settlements: object[] }>('/api/driver-pay/me/settlements', token!),
    enabled: !!token,
  })

  const currentPeriodQuery = useQuery({
    queryKey: ['driver-pay-current-period'],
    queryFn: () => fetchApi<{ assignments: object[] }>('/api/driver-pay/me/current-period', token!),
    enabled: !!token,
  })

  const bonusesQuery = useQuery({
    queryKey: ['driver-pay-bonuses'],
    queryFn: () => fetchApi<{ bonuses: object[] }>('/api/driver-pay/me/bonuses', token!),
    enabled: !!token,
  })

  const deductionsQuery = useQuery({
    queryKey: ['driver-pay-deductions'],
    queryFn: () => fetchApi<{ deductions: object[] }>('/api/driver-pay/me/deductions', token!),
    enabled: !!token,
  })

  const activeQuery = {
    settlements: settlementsQuery,
    current: currentPeriodQuery,
    bonuses: bonusesQuery,
    deductions: deductionsQuery,
  }[activeTab]

  const handleRefresh = useCallback(() => {
    activeQuery.refetch()
  }, [activeQuery])

  const settlements = (settlementsQuery.data?.settlements ?? []) as Array<{
    id: string; periodStart: string; periodEnd: string; status: string; netPay: string
  }>
  const currentPeriod = (currentPeriodQuery.data?.assignments ?? []) as Array<{
    id: string
    payStatus: string
    load: { id: string; referenceNumber: string | null; status: string } | null
    payComponents: { grossAmount: string }[]
  }>
  const bonuses = (bonusesQuery.data?.bonuses ?? []) as Array<{
    id: string; bonusType: string; description: string | null; amount: string
    paidAt: string | null; installmentNumber: number | null; totalInstallments: number | null
  }>
  const deductions = (deductionsQuery.data?.deductions ?? []) as Array<{
    id: string; deductionType: string; amountPerPeriod: string | null
    totalAmount: string | null; amountCollected: string | null
  }>

  const isLoading = activeQuery.isLoading
  const isRefreshing = activeQuery.isRefetching && !isLoading

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View className="px-4 pt-4 pb-3 flex-row items-center gap-3">
          <View
            className="w-9 h-9 rounded-full items-center justify-center"
            style={{ backgroundColor: `${c.brand}20` }}
          >
            <DollarSign size={18} color={c.brand} />
          </View>
          <Text className="text-2xl font-bold" style={{ color: c.textPrimary }}>
            Pay
          </Text>
        </View>

        {/* Tab bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="px-4 mb-3"
          contentContainerStyle={{ gap: 8 }}
        >
          {TABS.map((tab) => (
            <Pressable
              key={tab.key}
              onPress={() => { haptic.light(); setActiveTab(tab.key) }}
              className="px-4 py-2 rounded-full"
              style={{
                backgroundColor: activeTab === tab.key ? c.brand : c.surfaceCard,
              }}
            >
              <Text
                className="text-sm font-medium"
                style={{
                  color: activeTab === tab.key ? '#ffffff' : c.textSecondary,
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Content */}
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={c.brand} />
          </View>
        ) : (
          <>
            {activeTab === 'settlements' && (
              <FlashList
                data={settlements}
                keyExtractor={(item) => item.id}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={handleRefresh}
                    tintColor={c.brand}
                  />
                }
                renderItem={({ item }) => (
                  <SettlementRow
                    item={item}
                    c={c}
                    onPress={() => router.push(`/(driver)/pay/settlements/${item.id}` as never)}
                  />
                )}
                ListEmptyComponent={
                  <EmptyState
                    icon={<DollarSign size={40} color={c.textTertiary} />}
                    title="No settlements yet"
                    subtitle="They'll show here once approved loads are settled."
                  />
                }
                contentContainerStyle={{ paddingBottom: 24 }}
              />
            )}

            {activeTab === 'current' && (
              <FlashList
                data={currentPeriod}
                keyExtractor={(item) => item.id}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={handleRefresh}
                    tintColor={c.brand}
                  />
                }
                renderItem={({ item }) => <CurrentPeriodRow item={item} c={c} />}
                ListEmptyComponent={
                  <EmptyState
                    icon={<DollarSign size={40} color={c.textTertiary} />}
                    title="Quiet period"
                    subtitle="Your next completed load will show up here."
                  />
                }
                contentContainerStyle={{ paddingBottom: 24 }}
              />
            )}

            {activeTab === 'deductions' && (
              <FlashList
                data={deductions}
                keyExtractor={(item) => item.id}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={handleRefresh}
                    tintColor={c.brand}
                  />
                }
                renderItem={({ item }) => <DeductionRow item={item} c={c} />}
                ListEmptyComponent={
                  <EmptyState
                    icon={<DollarSign size={40} color={c.textTertiary} />}
                    title="No active deductions"
                    subtitle=""
                  />
                }
                contentContainerStyle={{ paddingBottom: 24 }}
              />
            )}

            {activeTab === 'bonuses' && (
              <FlashList
                data={bonuses}
                keyExtractor={(item) => item.id}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={handleRefresh}
                    tintColor={c.brand}
                  />
                }
                renderItem={({ item }) => <BonusRow item={item} c={c} />}
                ListEmptyComponent={
                  <EmptyState
                    icon={<DollarSign size={40} color={c.textTertiary} />}
                    title="No bonuses yet"
                    subtitle="No bonuses on record yet."
                  />
                }
                contentContainerStyle={{ paddingBottom: 24 }}
              />
            )}
          </>
        )}
      </AnimatedScreen>
    </SafeAreaView>
  )
}
