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
import { AlertTriangle, Building2, ChevronLeft, Phone } from 'lucide-react-native'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type CRMResponse, type CustomerSummary } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'

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

function CustomerCard({ customer }: { customer: CustomerSummary }) {
  const statusColor = getStatusColor(customer.status)
  const priorityColor = getPriorityColor(customer.priority)
  const initials = getInitials(customer.companyName)
  const isVIP = customer.priority === 'VIP'

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: isVIP ? '#f59e0b40' : '#334155',
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
          borderRadius: 10,
          backgroundColor: '#0ea5e920',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: 14,
          flexShrink: 0,
        }}
      >
        <Text style={{ color: '#0ea5e9', fontWeight: '700', fontSize: 14 }}>{initials}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ color: '#f1f5f9', fontWeight: '700', fontSize: 15, marginBottom: 4 }}
          numberOfLines={1}
        >
          {customer.companyName}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Status badge */}
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 10,
              backgroundColor: statusColor + '22',
            }}
          >
            <Text style={{ color: statusColor, fontSize: 11, fontWeight: '600' }}>
              {customer.status.charAt(0) + customer.status.slice(1).toLowerCase()}
            </Text>
          </View>

          {/* VIP / Priority badge */}
          {customer.priority !== 'MEDIUM' && customer.priority !== 'LOW' && (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 10,
                backgroundColor: priorityColor + '22',
              }}
            >
              <Text style={{ color: priorityColor, fontSize: 11, fontWeight: '600' }}>
                {customer.priority}
              </Text>
            </View>
          )}

          {/* Phone */}
          {customer.phone && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Phone color="#64748b" size={11} />
              <Text style={{ color: '#64748b', fontSize: 12 }} numberOfLines={1}>
                {customer.phone}
              </Text>
            </View>
          )}
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
      <Text style={{ color: valueColor ?? '#f1f5f9', fontSize: 22, fontWeight: '700' }}>
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

export default function CRMScreen() {
  const { token } = useAuthContext()
  const router = useRouter()

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<CRMResponse>({
    queryKey: ['owner-crm'],
    queryFn: () => ownerApi.getCRM(token!),
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
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#f1f5f9' }}>CRM</Text>
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
              Failed to load customers
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
            {/* Stats — 3 stats in a row */}
            <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
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
            <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
              <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Customers
              </Text>
            </View>

            {(data?.customers.length ?? 0) === 0 ? (
              <View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 24,
                  paddingTop: 40,
                }}
              >
                <Building2 color="#334155" size={48} />
                <Text
                  style={{ color: '#64748b', fontSize: 15, marginTop: 12, textAlign: 'center' }}
                >
                  No customers yet
                </Text>
              </View>
            ) : (
              data?.customers.map((c) => <CustomerCard key={c.id} customer={c} />)
            )}
          </ScrollView>
        )}
      </AnimatedScreen>
    </SafeAreaView>
  )
}
