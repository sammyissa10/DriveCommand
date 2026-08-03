import React from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronLeft, MapPin } from 'lucide-react-native'
import { ownerTripsApi, type OwnerTripDetail } from '@drivecommand/api-client'
import { useAuthContext } from '../../../context/AuthContext'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { useThemeColors, radii, spacing, typography } from '../../../constants/tokens'

/**
 * Carrier trip detail — read-only.
 *
 * The mobile owner portal had no carrier trip surface: `loads` and `routes`
 * belong to the legacy universe, not to `dispatches`. Without somewhere to
 * land, "open the existing trip" could not exist on this platform, so the
 * duplicate-detection flow offered only one of its two required actions.
 *
 * Deliberately minimal — enough to confirm "yes, this document already became
 * that trip, and here is what is on it". The owner boards are Phase 11.
 */

const TOUCH = 44

const STATUS_LABEL: Record<string, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  tonu: 'TONU',
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function OwnerTripDetailScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const { token } = useAuthContext()
  const { id } = useLocalSearchParams<{ id: string }>()

  const { data, isLoading, isError, error } = useQuery<OwnerTripDetail>({
    queryKey: ['owner-trip', id],
    queryFn: () => ownerTripsApi.get(token!, id!),
    enabled: !!token && !!id,
  })

  function statusTone(status: string): string {
    if (status === 'completed') return c.success
    if (status === 'in_progress') return c.brand
    if (status === 'cancelled') return c.danger
    if (status === 'tonu') return c.warning
    return c.textSecondary
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl * 2 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={{
                width: TOUCH,
                height: TOUCH,
                marginLeft: -spacing.md,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft color={c.brand} size={26} />
            </Pressable>
          </View>

          {isLoading ? (
            <View style={{ paddingVertical: spacing.xxl * 2, alignItems: 'center' }}>
              <ActivityIndicator color={c.brand} />
            </View>
          ) : isError || !data ? (
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.md,
                padding: spacing.lg,
                borderRadius: radii.lg,
                backgroundColor: c.dangerBg,
              }}
            >
              <AlertTriangle color={c.danger} size={18} />
              <Text style={{ ...typography.subhead, color: c.textPrimary, flex: 1 }}>
                {error instanceof Error ? error.message : 'That trip could not be loaded.'}
              </Text>
            </View>
          ) : (
            <>
              <Text style={{ ...typography.largeTitle, color: c.textPrimary }}>{data.tripNumber}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: radii.full,
                    backgroundColor: statusTone(data.status),
                  }}
                />
                <Text style={{ ...typography.footnote, color: c.textSecondary }}>
                  {STATUS_LABEL[data.status] ?? data.status.replace(/_/g, ' ')}
                </Text>
              </View>

              <View
                style={{
                  marginTop: spacing.lg,
                  padding: spacing.lg,
                  borderRadius: radii.lg,
                  backgroundColor: c.surfaceCard,
                  gap: spacing.md,
                }}
              >
                <Row label="Driver" value={data.driverName ?? 'Unassigned'} c={c} />
                <Row label="Truck" value={data.truckUnit ? `Unit ${data.truckUnit}` : 'Unassigned'} c={c} />
                <Row label="Departs" value={fmtDateTime(data.scheduledDeparture)} c={c} />
                {data.scheduledArrival ? (
                  <Row label="Arrives" value={fmtDateTime(data.scheduledArrival)} c={c} />
                ) : null}
                {data.plannedMiles != null ? (
                  <Row label="Planned miles" value={String(data.plannedMiles)} c={c} />
                ) : null}
              </View>

              <Text
                style={{
                  ...typography.headline,
                  color: c.textPrimary,
                  marginTop: spacing.xl,
                  marginBottom: spacing.sm,
                }}
              >
                {data.stops.length} stop{data.stops.length === 1 ? '' : 's'}
              </Text>

              {data.stops.map((s) => (
                <View
                  key={s.id}
                  style={{
                    flexDirection: 'row',
                    gap: spacing.md,
                    padding: spacing.md,
                    borderRadius: radii.lg,
                    backgroundColor: c.surfaceCard,
                    marginBottom: spacing.sm,
                  }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: radii.full,
                      backgroundColor: c.surfaceElevated,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ ...typography.caption1, color: c.textSecondary, fontWeight: '700' }}>
                      {s.sequenceOrder}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}
                    >
                      {s.facilityName}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <MapPin color={c.textTertiary} size={12} />
                      <Text numberOfLines={1} style={{ ...typography.caption1, color: c.textSecondary }}>
                        {[s.city, s.state].filter(Boolean).join(', ') || '—'}
                        {' · '}
                        {s.stopType.replace(/_/g, ' ')}
                        {s.pieces != null ? ` · ${s.pieces} pcs` : ''}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}

type Colors = ReturnType<typeof useThemeColors>

function Row({ label, value, c }: { label: string; value: string; c: Colors }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
      <Text style={{ ...typography.subhead, color: c.textSecondary }}>{label}</Text>
      <Text
        numberOfLines={1}
        style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600', flexShrink: 1 }}
      >
        {value}
      </Text>
    </View>
  )
}
