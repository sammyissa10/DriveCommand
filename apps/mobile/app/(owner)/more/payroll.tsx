import React, { useCallback } from 'react'
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, DollarSign } from 'lucide-react-native'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type PayrollResponse, type PayrollRecordSummary } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { PayrollRowSkeleton } from '../../../components/skeletons/PayrollRowSkeleton'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`
  return `$${amount.toFixed(0)}`
}

function formatDateShort(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'PAID': return '#22c55e'
    case 'APPROVED': return '#38bdf8'
    case 'DRAFT': return '#64748b'
    default: return '#64748b'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'PAID': return 'Paid'
    case 'APPROVED': return 'Approved'
    case 'DRAFT': return 'Draft'
    default: return status
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// ---------------------------------------------------------------------------
// PayrollRow Component
// ---------------------------------------------------------------------------

function PayrollRow({ record }: { record: PayrollRecordSummary }) {
  const statusColor = getStatusColor(record.status)
  const initials = getInitials(record.driverName)
  const period = `${formatDateShort(record.periodStart)} – ${formatDateShort(record.periodEnd)}`

  return (
    <View className="mx-4 mb-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3.5 flex-row items-center">
      {/* Avatar */}
      <View
        className="w-[42px] h-[42px] rounded-full items-center justify-center mr-3.5 shrink-0"
        style={{ backgroundColor: '#8b5cf620' }}
      >
        <Text style={{ color: '#8b5cf6', fontWeight: '700', fontSize: 14 }}>{initials}</Text>
      </View>

      {/* Info */}
      <View className="flex-1 min-w-0">
        <Text
          className="text-slate-100 font-bold text-[15px] mb-0.5"
          numberOfLines={1}
        >
          {record.driverName}
        </Text>
        <Text className="text-slate-500 text-[13px]" numberOfLines={1}>
          {period}
        </Text>
      </View>

      {/* Right side */}
      <View className="items-end shrink-0 ml-2.5">
        <Text className="text-white font-bold text-base mb-1">
          {formatCurrency(record.totalPay)}
        </Text>
        <View
          className="px-2.5 py-0.5 rounded-[20px]"
          style={{ backgroundColor: statusColor + '22' }}
        >
          <Text
            className="text-[11px] font-semibold"
            style={{ color: statusColor }}
          >
            {getStatusLabel(record.status)}
          </Text>
        </View>
      </View>
    </View>
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
  return (
    <View className="flex-1 bg-slate-800 rounded-xl border border-slate-700 p-3.5 items-center">
      <Text
        className="text-lg font-bold"
        style={{ color: valueColor ?? '#f1f5f9' }}
      >
        {value}
      </Text>
      <Text className="text-slate-500 text-xs mt-0.5 text-center">{label}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PayrollScreen() {
  const { token } = useAuthContext()
  const router = useRouter()

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<PayrollResponse>({
    queryKey: ['owner-payroll'],
    queryFn: () => ownerApi.getPayroll(token!),
    enabled: !!token,
    staleTime: 60_000,
  })

  const onRefresh = useCallback(() => { refetch() }, [refetch])

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View className="flex-row items-center px-4 py-3.5 border-b border-slate-700">
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => router.back()}
            className="mr-3"
            hitSlop={8}
          >
            <ChevronLeft color="#f1f5f9" size={24} />
          </Pressable>
          <Text className="text-lg font-bold text-slate-100">Payroll</Text>
        </View>

        {isLoading ? (
          <View className="pt-3">
            <PayrollRowSkeleton />
            <PayrollRowSkeleton />
            <PayrollRowSkeleton />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <AlertTriangle color="#f87171" size={40} />
            <Text className="text-slate-100 text-[17px] font-semibold mt-4 text-center">
              Failed to load payroll
            </Text>
            <Text className="text-slate-500 text-sm mt-1.5 text-center">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </Text>
            <Pressable
              onPress={() => refetch()}
              className="mt-5 bg-sky-500 px-6 py-3 rounded-[10px]"
            >
              <Text className="text-white font-semibold">Retry</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={onRefresh}
                tintColor="#38bdf8"
                colors={['#38bdf8']}
              />
            }
            contentContainerStyle={{ paddingBottom: 32 }}
          >
            {/* Stats grid 2x2 */}
            <View className="px-4 pt-4 pb-2">
              <View className="flex-row gap-3 mb-3">
                <StatCard value={data?.stats.total ?? 0} label="Total Records" />
                <StatCard
                  value={data?.stats.draft ?? 0}
                  label="Draft"
                  valueColor="#64748b"
                />
              </View>
              <View className="flex-row gap-3">
                <StatCard
                  value={data?.stats.approved ?? 0}
                  label="Approved"
                  valueColor="#38bdf8"
                />
                <StatCard
                  value={formatCurrency(data?.stats.totalPaid ?? 0)}
                  label="Total Paid"
                  valueColor="#22c55e"
                />
              </View>
            </View>

            {/* Records section header */}
            <View className="px-4 pt-4 pb-2.5">
              <Text className="text-slate-400 text-xs font-semibold tracking-[0.5px] uppercase">
                Recent Records
              </Text>
            </View>

            {(data?.records.length ?? 0) === 0 ? (
              <View className="items-center justify-center px-6 pt-10">
                <DollarSign color="#334155" size={48} />
                <Text className="text-slate-500 text-[15px] mt-3 text-center">
                  No payroll records yet
                </Text>
              </View>
            ) : (
              data?.records.map((r) => <PayrollRow key={r.id} record={r} />)
            )}
          </ScrollView>
        )}
      </AnimatedScreen>
    </SafeAreaView>
  )
}
