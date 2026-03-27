import React, { useCallback, useState } from 'react'
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
import { AlertTriangle, ChevronLeft, ChevronRight, FileText } from 'lucide-react-native'
import { useAuthContext } from '../../../../context/AuthContext'
import { ownerApi, type InvoicesResponse, type InvoiceSummary } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../../components/ui/AnimatedScreen'
import { InvoiceRowSkeleton } from '../../../../components/skeletons/InvoiceRowSkeleton'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`
  return `$${amount.toFixed(0)}`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'PAID': return '#22c55e'
    case 'OVERDUE': return '#ef4444'
    case 'SENT': return '#38bdf8'
    case 'DRAFT': return '#64748b'
    case 'CANCELLED': return '#475569'
    default: return '#64748b'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'PAID': return 'Paid'
    case 'OVERDUE': return 'Overdue'
    case 'SENT': return 'Sent'
    case 'DRAFT': return 'Draft'
    case 'CANCELLED': return 'Cancelled'
    default: return status
  }
}

// ---------------------------------------------------------------------------
// InvoiceRow Component
// ---------------------------------------------------------------------------

function InvoiceRow({ invoice, onPress }: { invoice: InvoiceSummary; onPress: () => void }) {
  const statusColor = getStatusColor(invoice.status)

  return (
    <Pressable
      onPress={onPress}
      className="mx-4 mb-3 rounded-xl border border-slate-700 bg-slate-800 px-4 py-3.5 active:opacity-75"
    >
      {/* Top row */}
      <View className="flex-row items-center mb-2">
        <Text
          className="text-slate-100 font-bold text-[15px] flex-1"
          numberOfLines={1}
        >
          #{invoice.invoiceNumber}
        </Text>
        <View
          className="px-2.5 py-1 rounded-[20px] mr-2"
          style={{ backgroundColor: statusColor + '22' }}
        >
          <Text
            className="text-xs font-semibold"
            style={{ color: statusColor }}
          >
            {getStatusLabel(invoice.status)}
          </Text>
        </View>
        <ChevronRight color="#475569" size={16} />
      </View>

      {/* Bottom row */}
      <View className="flex-row items-center">
        <View className="flex-1 min-w-0">
          <Text className="text-slate-400 text-[13px]" numberOfLines={1}>
            {invoice.customerName}
          </Text>
          {invoice.dueDate && (
            <Text className="text-slate-500 text-xs mt-0.5">
              Due {formatDate(invoice.dueDate)}
            </Text>
          )}
        </View>
        <Text className="text-slate-100 font-bold text-base ml-3">
          ${invoice.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
        </Text>
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
  active,
  onPress,
}: {
  value: string | number
  label: string
  valueColor?: string
  active?: boolean
  onPress?: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 rounded-xl border p-3.5 items-center active:opacity-75"
      style={{
        backgroundColor: active ? '#1e3a5f' : '#1e293b',
        borderColor: active ? '#38bdf8' : '#334155',
      }}
    >
      <Text
        className="text-lg font-bold"
        style={{ color: valueColor ?? '#f1f5f9' }}
      >
        {value}
      </Text>
      <Text
        className="text-xs mt-0.5 text-center"
        style={{ color: active ? '#38bdf8' : '#64748b' }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

type FilterKey = 'ALL' | 'PAID' | 'SENT' | 'DRAFT' | 'OVERDUE' | 'CANCELLED'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'PAID', label: 'Paid' },
  { key: 'SENT', label: 'Sent' },
  { key: 'DRAFT', label: 'Draft' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'CANCELLED', label: 'Cancelled' },
]

export default function InvoicesScreen() {
  const { token } = useAuthContext()
  const router = useRouter()
  const [activeFilter, setActiveFilter] = useState<FilterKey>('ALL')

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<InvoicesResponse>({
    queryKey: ['owner-invoices'],
    queryFn: () => ownerApi.getInvoices(token!),
    enabled: !!token,
    staleTime: 60_000,
  })

  const onRefresh = useCallback(() => { refetch() }, [refetch])

  const filteredInvoices = activeFilter === 'ALL'
    ? (data?.invoices ?? [])
    : (data?.invoices ?? []).filter((inv) => inv.status === activeFilter)

  return (
    <SafeAreaView className="flex-1 bg-slate-950" edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View className="flex-row items-center px-4 py-3.5 border-b border-slate-700">
          <Pressable onPress={() => router.back()} className="mr-3" hitSlop={8}>
            <ChevronLeft color="#f1f5f9" size={24} />
          </Pressable>
          <Text className="text-lg font-bold text-slate-100">Invoices</Text>
        </View>

        {isLoading ? (
          <View className="pt-3">
            <InvoiceRowSkeleton />
            <InvoiceRowSkeleton />
            <InvoiceRowSkeleton />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <AlertTriangle color="#f87171" size={40} />
            <Text className="text-slate-100 text-[17px] font-semibold mt-4 text-center">
              Failed to load invoices
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
                <StatCard
                  value={data?.stats.total ?? 0}
                  label="Total"
                  active={activeFilter === 'ALL'}
                  onPress={() => setActiveFilter('ALL')}
                />
                <StatCard
                  value={data?.stats.draft ?? 0}
                  label="Draft"
                  valueColor={activeFilter === 'DRAFT' ? undefined : '#64748b'}
                  active={activeFilter === 'DRAFT'}
                  onPress={() => setActiveFilter('DRAFT')}
                />
              </View>
              <View className="flex-row gap-3">
                <StatCard
                  value={formatCurrency(data?.stats.outstandingAmount ?? 0)}
                  label="Outstanding"
                  valueColor={activeFilter === 'OVERDUE' ? undefined : '#f59e0b'}
                  active={activeFilter === 'OVERDUE'}
                  onPress={() => setActiveFilter('OVERDUE')}
                />
                <StatCard
                  value={formatCurrency(data?.stats.paidAmount ?? 0)}
                  label="Paid"
                  valueColor={activeFilter === 'PAID' ? undefined : '#22c55e'}
                  active={activeFilter === 'PAID'}
                  onPress={() => setActiveFilter('PAID')}
                />
              </View>
            </View>

            {/* Filter chips — flat row, evenly distributed */}
            <View className="flex-row px-4 pt-3 pb-1 gap-1.5">
              {FILTERS.map((f) => {
                const active = activeFilter === f.key
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => setActiveFilter(f.key)}
                    className="flex-1 py-[7px] rounded-[20px] border items-center active:opacity-75"
                    style={{
                      backgroundColor: active ? '#38bdf8' : '#1e293b',
                      borderColor: active ? '#38bdf8' : '#334155',
                    }}
                  >
                    <Text
                      className="text-[11px] font-semibold"
                      style={{ color: active ? '#0f172a' : '#94a3b8' }}
                    >
                      {f.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            {/* Invoices section header */}
            <View className="px-4 pt-3.5 pb-2.5">
              <Text className="text-slate-400 text-xs font-semibold tracking-[0.5px] uppercase">
                {activeFilter === 'ALL' ? 'Recent Invoices' : `${FILTERS.find(f => f.key === activeFilter)?.label} Invoices`}
                {' '}
                <Text className="text-slate-600">({filteredInvoices.length})</Text>
              </Text>
            </View>

            {filteredInvoices.length === 0 ? (
              <View className="items-center justify-center px-6 pt-10">
                <FileText color="#334155" size={48} />
                <Text className="text-slate-500 text-[15px] mt-3 text-center">
                  {activeFilter === 'ALL' ? 'No invoices yet' : `No ${FILTERS.find(f => f.key === activeFilter)?.label.toLowerCase()} invoices`}
                </Text>
              </View>
            ) : (
              filteredInvoices.map((inv) => (
                <InvoiceRow
                  key={inv.id}
                  invoice={inv}
                  onPress={() => router.push(`/(owner)/more/invoices/${inv.id}` as any)}
                />
              ))
            )}
          </ScrollView>
        )}
      </AnimatedScreen>
    </SafeAreaView>
  )
}
