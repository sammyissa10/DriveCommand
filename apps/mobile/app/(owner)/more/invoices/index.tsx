import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, ChevronRight, FileText } from 'lucide-react-native'
import { useAuthContext } from '../../../../context/AuthContext'
import { ownerApi, type InvoicesResponse, type InvoiceSummary } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../../components/ui/AnimatedScreen'

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
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        marginHorizontal: 16,
        marginBottom: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#334155',
        backgroundColor: '#1e293b',
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      {/* Top row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Text
          style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 15, flex: 1 }}
          numberOfLines={1}
        >
          #{invoice.invoiceNumber}
        </Text>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 20,
            backgroundColor: statusColor + '22',
            marginRight: 8,
          }}
        >
          <Text style={{ color: statusColor, fontSize: 12, fontWeight: '600' }}>
            {getStatusLabel(invoice.status)}
          </Text>
        </View>
        <ChevronRight color="#475569" size={16} />
      </View>

      {/* Bottom row */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: '#94a3b8', fontSize: 13 }} numberOfLines={1}>
            {invoice.customerName}
          </Text>
          {invoice.dueDate && (
            <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
              Due {formatDate(invoice.dueDate)}
            </Text>
          )}
        </View>
        <Text style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 16, marginLeft: 12 }}>
          ${invoice.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
        </Text>
      </View>
    </TouchableOpacity>
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
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{
        flex: 1,
        backgroundColor: active ? '#1e3a5f' : '#1e293b',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: active ? '#38bdf8' : '#334155',
        padding: 14,
        alignItems: 'center',
      }}
    >
      <Text style={{ color: valueColor ?? '#f1f5f9', fontSize: 18, fontWeight: '700' }}>
        {value}
      </Text>
      <Text style={{ color: active ? '#38bdf8' : '#64748b', fontSize: 12, marginTop: 2, textAlign: 'center' }}>
        {label}
      </Text>
    </TouchableOpacity>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderBottomWidth: 1,
            borderBottomColor: '#334155',
          }}
        >
          <Pressable onPress={() => router.back()} style={{ marginRight: 12 }} hitSlop={8}>
            <ChevronLeft color="#f1f5f9" size={24} />
          </Pressable>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#f1f5f9' }}>Invoices</Text>
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#38bdf8" size="large" />
          </View>
        ) : isError ? (
          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 24,
            }}
          >
            <AlertTriangle color="#f87171" size={40} />
            <Text
              style={{
                color: '#f1f5f9',
                fontSize: 17,
                fontWeight: '600',
                marginTop: 16,
                textAlign: 'center',
              }}
            >
              Failed to load invoices
            </Text>
            <Text style={{ color: '#64748b', fontSize: 14, marginTop: 6, textAlign: 'center' }}>
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={{
                marginTop: 20,
                backgroundColor: '#0ea5e9',
                paddingHorizontal: 24,
                paddingVertical: 12,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
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
            <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
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
              <View style={{ flexDirection: 'row', gap: 12 }}>
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
            <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 6 }}>
              {FILTERS.map((f) => {
                const active = activeFilter === f.key
                return (
                  <TouchableOpacity
                    key={f.key}
                    onPress={() => setActiveFilter(f.key)}
                    style={{
                      flex: 1,
                      paddingVertical: 7,
                      borderRadius: 20,
                      backgroundColor: active ? '#38bdf8' : '#1e293b',
                      borderWidth: 1,
                      borderColor: active ? '#38bdf8' : '#334155',
                      alignItems: 'center',
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: active ? '#0f172a' : '#94a3b8', fontSize: 11, fontWeight: '600' }}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            {/* Invoices section header */}
            <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
              <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {activeFilter === 'ALL' ? 'Recent Invoices' : `${FILTERS.find(f => f.key === activeFilter)?.label} Invoices`}
                {' '}
                <Text style={{ color: '#475569' }}>({filteredInvoices.length})</Text>
              </Text>
            </View>

            {filteredInvoices.length === 0 ? (
              <View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 24,
                  paddingTop: 40,
                }}
              >
                <FileText color="#334155" size={48} />
                <Text
                  style={{ color: '#64748b', fontSize: 15, marginTop: 12, textAlign: 'center' }}
                >
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
