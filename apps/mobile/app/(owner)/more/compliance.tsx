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
import { AlertTriangle, ChevronLeft, ShieldCheck } from 'lucide-react-native'
import { useAuthContext } from '../../../context/AuthContext'
import { ownerApi, type ComplianceResponse, type ComplianceAlert } from '@drivecommand/api-client'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { ComplianceRowSkeleton } from '../../../components/skeletons/ComplianceRowSkeleton'

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
      className="mx-4 mb-3 rounded-xl border bg-slate-800 px-4 py-3.5 flex-row items-center"
      style={{ borderColor: isExpired ? '#ef444430' : '#f59e0b30' }}
    >
      {/* Indicator dot */}
      <View
        className="w-2.5 h-2.5 rounded-full mr-3.5 shrink-0"
        style={{ backgroundColor: statusColor }}
      />

      {/* Info */}
      <View className="flex-1 min-w-0">
        <Text
          className="text-slate-100 font-semibold text-[15px] mb-0.5"
          numberOfLines={1}
        >
          {alert.entityName}
        </Text>
        <Text className="text-slate-500 text-[13px]" numberOfLines={1}>
          {alert.documentType}
        </Text>
      </View>

      {/* Right side */}
      <View className="items-end shrink-0 ml-2.5">
        <View
          className="px-2.5 py-1 rounded-[20px]"
          style={{
            backgroundColor: statusBg,
            marginBottom: daysText ? 4 : 0,
          }}
        >
          <Text
            className="text-xs font-semibold"
            style={{ color: statusColor }}
          >
            {statusLabel}
          </Text>
        </View>
        {daysText && (
          <Text className="text-slate-500 text-[11px]">{daysText}</Text>
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
    <View className="flex-1 bg-slate-800 rounded-xl border border-slate-700 p-3.5 items-center">
      <Text
        className="text-[22px] font-bold"
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
          <Text className="text-lg font-bold text-slate-100">Compliance</Text>
        </View>

        {isLoading ? (
          <View className="pt-3">
            <ComplianceRowSkeleton />
            <ComplianceRowSkeleton />
            <ComplianceRowSkeleton />
          </View>
        ) : isError ? (
          <View className="flex-1 items-center justify-center px-6">
            <AlertTriangle color="#f87171" size={40} />
            <Text className="text-slate-100 text-[17px] font-semibold mt-4 text-center">
              Failed to load compliance data
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
              <View className="flex-row gap-3">
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
            <View className="px-4 pt-4 pb-2.5">
              <Text className="text-slate-400 text-xs font-semibold tracking-[0.5px] uppercase">
                Alerts
              </Text>
            </View>

            {(data?.alerts.length ?? 0) === 0 ? (
              <View className="items-center justify-center px-6 pt-10">
                <ShieldCheck color="#22c55e" size={48} />
                <Text className="text-green-500 text-base font-semibold mt-3 text-center">
                  All Clear
                </Text>
                <Text className="text-slate-500 text-sm mt-1.5 text-center">
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
