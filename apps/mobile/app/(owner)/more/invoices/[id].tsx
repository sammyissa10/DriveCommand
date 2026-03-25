import React from 'react'
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft } from 'lucide-react-native'
import { useAuthContext } from '../../../../context/AuthContext'
import { ownerApi, type InvoiceDetail } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../../components/ui/AnimatedScreen'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

// ---------------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: string }) {
  return (
    <Text style={{ color: '#94a3b8', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 10 }}>
      {children}
    </Text>
  )
}

function DetailRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
      <Text style={{ color: '#64748b', fontSize: 13, flex: 1 }}>{label}</Text>
      <Text style={{ color: valueColor ?? '#f1f5f9', fontSize: 13, fontWeight: '600', textAlign: 'right', flex: 1 }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function InvoiceDetailScreen() {
  const { token } = useAuthContext()
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()

  const { data, isLoading, isError, error, refetch } = useQuery<InvoiceDetail>({
    queryKey: ['invoice-detail', id],
    queryFn: () => ownerApi.getInvoice(token!, id),
    enabled: !!token && !!id,
    staleTime: 60_000,
  })

  const statusColor = data ? getStatusColor(data.status) : '#64748b'

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
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#f1f5f9', flex: 1 }} numberOfLines={1}>
            {data ? `INV-${data.invoiceNumber}` : 'Invoice'}
          </Text>
          {data && (
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 20,
                backgroundColor: statusColor + '22',
              }}
            >
              <Text style={{ color: statusColor, fontSize: 12, fontWeight: '700' }}>
                {data.status}
              </Text>
            </View>
          )}
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#38bdf8" size="large" />
          </View>
        ) : isError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
            <AlertTriangle color="#f87171" size={40} />
            <Text style={{ color: '#f1f5f9', fontSize: 17, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>
              Failed to load invoice
            </Text>
            <Text style={{ color: '#64748b', fontSize: 14, marginTop: 6, textAlign: 'center' }}>
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={{ marginTop: 20, backgroundColor: '#0ea5e9', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
            </Pressable>
          </View>
        ) : data ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 }}>

            {/* Invoice Details */}
            <SectionLabel>Invoice Details</SectionLabel>
            <View style={{ backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 16, marginBottom: 20 }}>
              <DetailRow label="Customer" value={data.customerName} />
              <DetailRow label="Issue Date" value={formatDate(data.issueDate)} />
              <DetailRow label="Due Date" value={formatDate(data.dueDate)} />
              {data.paidDate && (
                <DetailRow label="Paid Date" value={formatDate(data.paidDate)} valueColor="#22c55e" />
              )}
              {data.notes && (
                <DetailRow label="Notes" value={data.notes} />
              )}
            </View>

            {/* Line Items */}
            <SectionLabel>Line Items</SectionLabel>
            <View style={{ backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', marginBottom: 20, overflow: 'hidden' }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#334155', backgroundColor: '#0f1f35' }}>
                <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '600', flex: 1 }}>DESCRIPTION</Text>
                <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '600', width: 36, textAlign: 'center' }}>QTY</Text>
                <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '600', width: 80, textAlign: 'right' }}>UNIT PRICE</Text>
                <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '600', width: 80, textAlign: 'right' }}>AMOUNT</Text>
              </View>

              {/* Items */}
              {data.items.map((item, idx) => (
                <View
                  key={item.id}
                  style={{
                    flexDirection: 'row',
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderBottomWidth: idx < data.items.length - 1 ? 1 : 0,
                    borderBottomColor: '#334155',
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#f1f5f9', fontSize: 13, flex: 1 }} numberOfLines={2}>{item.description}</Text>
                  <Text style={{ color: '#94a3b8', fontSize: 13, width: 36, textAlign: 'center' }}>{item.quantity}</Text>
                  <Text style={{ color: '#94a3b8', fontSize: 13, width: 80, textAlign: 'right' }}>${formatCurrency(item.unitPrice)}</Text>
                  <Text style={{ color: '#f1f5f9', fontSize: 13, fontWeight: '600', width: 80, textAlign: 'right' }}>${formatCurrency(item.amount)}</Text>
                </View>
              ))}

              {/* Totals */}
              <View style={{ borderTopWidth: 1, borderTopColor: '#334155', paddingHorizontal: 14, paddingVertical: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ color: '#64748b', fontSize: 13 }}>Subtotal</Text>
                  <Text style={{ color: '#94a3b8', fontSize: 13 }}>${formatCurrency(data.subtotal)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ color: '#64748b', fontSize: 13 }}>Tax</Text>
                  <Text style={{ color: '#94a3b8', fontSize: 13 }}>${formatCurrency(data.tax)}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#334155' }}>
                  <Text style={{ color: '#f1f5f9', fontSize: 15, fontWeight: '700' }}>Total</Text>
                  <Text style={{ color: '#f1f5f9', fontSize: 15, fontWeight: '700' }}>${formatCurrency(data.totalAmount)}</Text>
                </View>
              </View>
            </View>

            {/* Record History */}
            <SectionLabel>Record History</SectionLabel>
            <View style={{ backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 16, marginBottom: 8 }}>
              <DetailRow label="Created by" value={data.createdByName ?? '—'} />
              <DetailRow label="Created" value={formatDate(data.createdAt)} />
              <DetailRow label="Last changed by" value={data.updatedByName ?? '—'} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10 }}>
                <Text style={{ color: '#64748b', fontSize: 13, flex: 1 }}>Last changed</Text>
                <Text style={{ color: '#f1f5f9', fontSize: 13, fontWeight: '600', textAlign: 'right', flex: 1 }}>
                  {formatDate(data.updatedAt)}
                </Text>
              </View>
            </View>

          </ScrollView>
        ) : null}
      </AnimatedScreen>
    </SafeAreaView>
  )
}
