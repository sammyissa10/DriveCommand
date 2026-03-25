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
import { AlertTriangle, ChevronLeft, ShieldCheck } from 'lucide-react-native'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type ComplianceResponse, type ComplianceAlert } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'

// ---------------------------------------------------------------------------
// AlertRow Component
// ---------------------------------------------------------------------------

function AlertRow({ alert }: { alert: ComplianceAlert }) {
  const isExpired = alert.status === 'EXPIRED'
  const statusColor = isExpired ? '#ef4444' : '#f59e0b'
  const statusBg = isExpired ? '#ef444418' : '#f59e0b18'
  const statusLabel = isExpired ? 'Expired' : 'Expiring Soon'

  const daysText =
    alert.daysUntilExpiry !== null
      ? isExpired
        ? `${Math.abs(alert.daysUntilExpiry)}d overdue`
        : `${alert.daysUntilExpiry}d left`
      : null

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: isExpired ? '#ef444430' : '#f59e0b30',
        backgroundColor: '#1e293b',
        paddingHorizontal: 16,
        paddingVertical: 14,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {/* Indicator dot */}
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: statusColor,
          marginRight: 14,
          flexShrink: 0,
        }}
      />

      {/* Info */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ color: '#f1f5f9', fontWeight: '600', fontSize: 15, marginBottom: 2 }}
          numberOfLines={1}
        >
          {alert.entityName}
        </Text>
        <Text style={{ color: '#64748b', fontSize: 13 }} numberOfLines={1}>
          {alert.documentType}
        </Text>
      </View>

      {/* Right side */}
      <View style={{ alignItems: 'flex-end', flexShrink: 0, marginLeft: 10 }}>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 20,
            backgroundColor: statusBg,
            marginBottom: daysText ? 4 : 0,
          }}
        >
          <Text style={{ color: statusColor, fontSize: 12, fontWeight: '600' }}>{statusLabel}</Text>
        </View>
        {daysText && (
          <Text style={{ color: '#64748b', fontSize: 11 }}>{daysText}</Text>
        )}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// StatCard Component
// ---------------------------------------------------------------------------

function StatCard({
  value,
  label,
  valueColor,
}: {
  value: number | string
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
      <Text
        style={{ color: valueColor ?? '#f1f5f9', fontSize: 22, fontWeight: '700' }}
      >
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

export default function ComplianceScreen() {
  const { token } = useAuthContext()
  const router = useRouter()

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<ComplianceResponse>({
    queryKey: ['owner-compliance'],
    queryFn: () => ownerApi.getCompliance(token!),
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
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#f1f5f9' }}>Compliance</Text>
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
              Failed to load compliance data
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
                  value={data?.summary.expiredCount ?? 0}
                  label="Expired"
                  valueColor={
                    (data?.summary.expiredCount ?? 0) > 0 ? '#ef4444' : '#22c55e'
                  }
                />
                <StatCard
                  value={data?.summary.expiringSoonCount ?? 0}
                  label="Expiring Soon"
                  valueColor={
                    (data?.summary.expiringSoonCount ?? 0) > 0 ? '#f59e0b' : '#22c55e'
                  }
                />
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <StatCard
                  value={data?.summary.totalDriversTracked ?? 0}
                  label="Drivers Tracked"
                  valueColor="#38bdf8"
                />
                <StatCard
                  value={data?.summary.totalTrucksTracked ?? 0}
                  label="Trucks Tracked"
                  valueColor="#38bdf8"
                />
              </View>
            </View>

            {/* Alerts section */}
            <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 }}>
              <Text style={{ color: '#94a3b8', fontSize: 12, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                Alerts
              </Text>
            </View>

            {(data?.alerts.length ?? 0) === 0 ? (
              <View
                style={{
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 24,
                  paddingTop: 40,
                }}
              >
                <ShieldCheck color="#22c55e" size={48} />
                <Text
                  style={{
                    color: '#22c55e',
                    fontSize: 16,
                    fontWeight: '600',
                    marginTop: 12,
                    textAlign: 'center',
                  }}
                >
                  All Clear
                </Text>
                <Text style={{ color: '#64748b', fontSize: 14, marginTop: 6, textAlign: 'center' }}>
                  No compliance issues found
                </Text>
              </View>
            ) : (
              data?.alerts.map((alert, idx) => (
                <AlertRow key={`${alert.entityName}-${alert.documentType}-${idx}`} alert={alert} />
              ))
            )}
          </ScrollView>
        )}
      </AnimatedScreen>
    </SafeAreaView>
  )
}
