import React, { useCallback } from 'react'
import {
  ActivityIndicator,
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
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#334155',
        backgroundColor: '#1e293b',
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {/* Avatar */}
      <View
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: '#8b5cf620',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
          flexShrink: 0,
        }}
      >
        <Text style={{ color: '#8b5cf6', fontWeight: '700', fontSize: 14 }}>{initials}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 15, marginBottom: 3 }}
          numberOfLines={1}
        >
          {record.driverName}
        </Text>
        <Text style={{ color: '#64748b', fontSize: 13 }} numberOfLines={1}>
          {period}
        </Text>
      </View>

      {/* Right side */}
      <View style={{ alignItems: 'flex-end', flexShrink: 0, marginLeft: 10 }}>
        <Text style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 16, marginBottom: 4 }}>
          {formatCurrency(record.totalPay)}
        </Text>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 3,
            borderRadius: 20,
            backgroundColor: statusColor + '22',
          }}
        >
          <Text style={{ color: statusColor, fontSize: 11, fontWeight: '600' }}>
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
    <View
      style={{
        flex: 1,
        backgroundColor: '#1e293b',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#334155',
        padding: 14,
        alignItems: 'center',
      }}
    >
      <Text style={{ color: valueColor ?? '#f1f5f9', fontSize: 18, fontWeight: '700' }}>
        {value}
      </Text>
      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2, textAlign: 'center' }}>
        {label}
      </Text>
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
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#f1f5f9' }}>Payroll</Text>
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
              Failed to load payroll
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
                <StatCard value={data?.stats.total ?? 0} label="Total Records" />
                <StatCard
                  value={data?.stats.draft ?? 0}
                  label="Draft"
                  valueColor="#64748b"
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
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
            <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
              <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Recent Records
              </Text>
            </View>

            {(data?.records.length ?? 0) === 0 ? (
              <View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 24,
                  paddingTop: 40,
                }}
              >
                <DollarSign color="#334155" size={48} />
                <Text
                  style={{ color: '#64748b', fontSize: 15, marginTop: 12, textAlign: 'center' }}
                >
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
