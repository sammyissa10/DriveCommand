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
import {
  AlertCircle,
  AlertTriangle,
  ChevronLeft,
  FileText,
  Shield,
  Wrench,
} from 'lucide-react-native'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type SafetyAlertsResponse, type SafetyAlert } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateMedium(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

const SEVERITY_COLORS = {
  high:   { dot: '#ef4444', text: '#ef4444', bg: '#ef444420' },
  medium: { dot: '#f59e0b', text: '#f59e0b', bg: '#f59e0b20' },
  low:    { dot: '#22c55e', text: '#22c55e', bg: '#22c55e20' },
}

const SEVERITY_LABELS: Record<string, string> = {
  high:   'High',
  medium: 'Medium',
  low:    'Low',
}

// ---------------------------------------------------------------------------
// AlertCard
// ---------------------------------------------------------------------------

function AlertCard({ alert }: { alert: SafetyAlert }) {
  const colors = SEVERITY_COLORS[alert.severity] ?? SEVERITY_COLORS.medium

  const CategoryIcon =
    alert.category === 'DOCUMENT'    ? FileText :
    alert.category === 'MAINTENANCE' ? Wrench :
    AlertCircle

  return (
    <View
      style={{
        backgroundColor: '#1e293b',
        borderWidth: 1,
        borderColor: '#334155',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      {/* Severity dot */}
      <View style={{ paddingTop: 2 }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: colors.dot,
            marginTop: 2,
          }}
        />
      </View>

      {/* Category icon */}
      <View style={{ paddingTop: 1 }}>
        <CategoryIcon color={colors.text} size={16} />
      </View>

      {/* Content */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: '#f1f5f9', fontSize: 14, fontWeight: '500', lineHeight: 20 }}>
          {alert.description}
        </Text>
        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
          {alert.affectedEntity}
        </Text>
      </View>

      {/* Date */}
      <Text style={{ color: '#64748b', fontSize: 12, flexShrink: 0 }}>
        {formatDateMedium(alert.date)}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// SummaryCard
// ---------------------------------------------------------------------------

interface SummaryCardProps {
  label: string
  count: number
  color: string
  bg: string
}

function SummaryCard({ label, count, color, bg }: SummaryCardProps) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: bg,
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 10,
        alignItems: 'center',
      }}
    >
      <Text style={{ color, fontSize: 22, fontWeight: '700' }}>{count}</Text>
      <Text style={{ color, fontSize: 11, fontWeight: '600', marginTop: 2, opacity: 0.85 }}>{label}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function SafetyAlertsScreen() {
  const router = useRouter()
  const { token } = useAuthContext()

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<SafetyAlertsResponse>({
    queryKey: ['owner-safety-alerts'],
    queryFn: () => ownerApi.getSafetyAlerts(token!),
    enabled: !!token,
  })

  const onRefresh = useCallback(() => { refetch() }, [refetch])

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#020617' }} edges={['bottom', 'left', 'right']}>
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
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            onPress={() => router.back()}
            style={{ marginRight: 12 }}
            hitSlop={8}
          >
            <ChevronLeft color="#f1f5f9" size={24} />
          </Pressable>
          <Text style={{ color: '#f1f5f9', fontSize: 18, fontWeight: '700', flex: 1 }}>
            Safety Alerts
          </Text>
        </View>

        {isLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#38bdf8" />
          </View>
        ) : isError ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
            <AlertTriangle color="#f87171" size={40} />
            <Text style={{ color: '#f1f5f9', fontSize: 17, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>
              Failed to load safety alerts
            </Text>
            <Text style={{ color: '#64748b', fontSize: 14, marginTop: 6, textAlign: 'center' }}>
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={{ marginTop: 20, backgroundColor: '#0284c7', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 }}
            >
              <Text style={{ color: 'white', fontWeight: '600' }}>Retry</Text>
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
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Summary cards */}
            {data && (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                <SummaryCard
                  label="High"
                  count={data.summary.highCount}
                  color="#ef4444"
                  bg="#ef444420"
                />
                <SummaryCard
                  label="Medium"
                  count={data.summary.mediumCount}
                  color="#f59e0b"
                  bg="#f59e0b20"
                />
                <SummaryCard
                  label="Low"
                  count={data.summary.lowCount}
                  color="#22c55e"
                  bg="#22c55e20"
                />
              </View>
            )}

            {/* Alert list */}
            {!data || data.alerts.length === 0 ? (
              <View style={{ alignItems: 'center', paddingTop: 60, paddingBottom: 40 }}>
                <Shield color="#475569" size={48} />
                <Text style={{ color: '#f1f5f9', fontSize: 17, fontWeight: '600', marginTop: 16 }}>
                  No alerts
                </Text>
                <Text style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>
                  Your fleet is in good shape
                </Text>
              </View>
            ) : (
              <>
                <Text
                  style={{
                    color: '#64748b',
                    fontSize: 11,
                    fontWeight: '600',
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  {data.summary.totalCount} Alert{data.summary.totalCount !== 1 ? 's' : ''}
                </Text>
                {data.alerts.map((alert, index) => (
                  <AlertCard key={`${alert.category}-${alert.date}-${index}`} alert={alert} />
                ))}
              </>
            )}
          </ScrollView>
        )}
      </AnimatedScreen>
    </SafeAreaView>
  )
}
