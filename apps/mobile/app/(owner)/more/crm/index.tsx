import React, { useCallback } from 'react'
import {
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native'
import { FlashList } from '@shopify/flash-list'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Building2, ChevronLeft, Phone } from 'lucide-react-native'
import { useAuthContext } from '../../../../context/AuthContext'
import { ownerApi, type CRMResponse, type CustomerSummary } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../../components/ui/AnimatedScreen'
import { PageSpeedDial } from '../../../../components/ui/PageSpeedDial'
import { CRMCardSkeleton } from '../../../../components/skeletons/CRMCardSkeleton'
import { useThemeColors } from '../../../../constants/tokens'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusColor(status: string): string {
  switch (status) {
    case 'ACTIVE': return '#22c55e'
    case 'INACTIVE': return '#64748b'
    case 'PROSPECT': return '#38bdf8'
    default: return '#64748b'
  }
}

function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'VIP': return '#f59e0b'
    case 'HIGH': return '#ef4444'
    case 'MEDIUM': return '#38bdf8'
    case 'LOW': return '#64748b'
    default: return '#64748b'
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// ---------------------------------------------------------------------------
// CustomerCard Component
// ---------------------------------------------------------------------------

function CustomerCard({ customer, onPress }: { customer: CustomerSummary; onPress: () => void }) {
  const c = useThemeColors()
  const statusColor = getStatusColor(customer.status)
  const priorityColor = getPriorityColor(customer.priority)
  const initials = getInitials(customer.companyName)
  const isVIP = customer.priority === 'VIP'

  return (
    <Pressable
      onPress={onPress}
      className="mx-4 mb-3 rounded-xl px-4 py-3.5 flex-row items-center active:opacity-80"
      style={{
        backgroundColor: c.surfaceCard,
        borderWidth: 1,
        borderColor: isVIP ? '#f59e0b40' : c.border,
      }}
    >
      {/* Avatar */}
      <View
        className="w-[42px] h-[42px] rounded-[10px] items-center justify-center mr-3.5 shrink-0"
        style={{ backgroundColor: '#0ea5e920' }}
      >
        <Text className="text-sky-500 font-bold text-sm">{initials}</Text>
      </View>

      {/* Info */}
      <View className="flex-1 min-w-0">
        <Text
          className="font-bold text-[15px] mb-1"
          style={{ color: c.textPrimary }}
          numberOfLines={1}
        >
          {customer.companyName}
        </Text>
        <View className="flex-row items-center gap-2 flex-wrap">
          {/* Status badge */}
          <View
            className="px-2 py-0.5 rounded-[10px]"
            style={{ backgroundColor: statusColor + '22' }}
          >
            <Text
              className="text-[11px] font-semibold"
              style={{ color: statusColor }}
            >
              {customer.status.charAt(0) + customer.status.slice(1).toLowerCase()}
            </Text>
          </View>

          {/* VIP / Priority badge */}
          {customer.priority !== 'MEDIUM' && customer.priority !== 'LOW' && (
            <View
              className="px-2 py-0.5 rounded-[10px]"
              style={{ backgroundColor: priorityColor + '22' }}
            >
              <Text
                className="text-[11px] font-semibold"
                style={{ color: priorityColor }}
              >
                {customer.priority}
              </Text>
            </View>
          )}

          {/* Phone */}
          {customer.phone && (
            <View className="flex-row items-center gap-1">
              <Phone color={c.textTertiary} size={11} />
              <Text className="text-xs" style={{ color: c.textTertiary }} numberOfLines={1}>
                {customer.phone}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({
  value,
  label,
  valueColor,
}: {
  value: string | number
  label: string
  valueColor?: string
}) {
  const c = useThemeColors()
  return (
    <View
      className="flex-1 rounded-xl p-3.5 items-center"
      style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}
    >
      <Text
        className="text-[22px] font-bold"
        style={{ color: valueColor ?? c.textPrimary }}
      >
        {value}
      </Text>
      <Text className="text-xs mt-0.5 text-center" style={{ color: c.textTertiary }}>{label}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function CRMScreen() {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<CRMResponse>({
    queryKey: ['owner-crm'],
    queryFn: () => ownerApi.getCRM(token!),
    enabled: !!token,
    staleTime: 60_000,
  })

  const onRefresh = useCallback(() => { refetch() }, [refetch])

  const renderCustomer = useCallback(({ item: cust }: { item: CustomerSummary }) => (
    <CustomerCard
      customer={cust}
      onPress={() => router.push(`/(owner)/more/crm/${cust.id}` as never)}
    />
  ), [router])

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View
          className="flex-row items-center px-4 py-3.5"
          style={{ borderBottomWidth: 1, borderBottomColor: c.border }}
        >
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => router.back()}
            className="mr-3"
            hitSlop={8}
          >
            <ChevronLeft color={c.textPrimary} size={24} />
          </Pressable>
          <Text className="text-lg font-bold" style={{ color: c.textPrimary }}>CRM</Text>
        </View>

        {isLoading ? (
          <View className="pt-3">
            <CRMCardSkeleton />
            <CRMCardSkeleton />
            <CRMCardSkeleton />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <AlertTriangle color="#f87171" size={40} />
            <Text className="text-[17px] font-semibold mt-4 text-center" style={{ color: c.textPrimary }}>
              Failed to load customers
            </Text>
            <Text className="text-sm mt-1.5 text-center" style={{ color: c.textTertiary }}>
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="mt-5 px-6 py-3 rounded-[10px]"
              style={{ backgroundColor: c.brand }}
            >
              <Text className="text-white font-semibold">Retry</Text>
            </Pressable>
          </View>
        ) : (
          <FlashList
            data={data?.customers ?? []}
            renderItem={renderCustomer}
            keyExtractor={(cust) => cust.id}

            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={onRefresh}
                tintColor={c.brand}
                colors={[c.brand]}
              />
            }
            contentContainerStyle={{ paddingBottom: 100 }}
            ListHeaderComponent={
              <View>
                {/* Stats — 3 stats in a row */}
                <View className="px-4 pt-4 pb-2">
                  <View className="flex-row gap-2.5">
                    <StatCard value={data?.stats.total ?? 0} label="Total" />
                    <StatCard
                      value={data?.stats.active ?? 0}
                      label="Active"
                      valueColor="#22c55e"
                    />
                    <StatCard
                      value={data?.stats.vip ?? 0}
                      label="VIP"
                      valueColor="#f59e0b"
                    />
                  </View>
                </View>

                {/* Customers section header */}
                <View className="px-4 pt-4 pb-2.5">
                  <Text className="text-xs font-semibold tracking-[0.5px] uppercase" style={{ color: c.textSecondary }}>
                    Customers
                  </Text>
                </View>
              </View>
            }
            ListEmptyComponent={
              <View className="items-center justify-center px-6 pt-10">
                <Building2 color={c.surfaceElevated} size={48} />
                <Text className="text-[15px] mt-3 text-center" style={{ color: c.textTertiary }}>
                  No customers yet
                </Text>
              </View>
            }
          />
        )}

        <PageSpeedDial
          primaryLabel="New Customer"
          primaryIcon={Building2}
          primaryColor="#34d399"
          onPrimaryPress={() => router.push('/(owner)/more/crm/new' as never)}
        />
      </AnimatedScreen>
    </SafeAreaView>
  )
}
