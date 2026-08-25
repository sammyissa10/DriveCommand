import React, { useCallback, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ClipboardCheck, ShieldCheck } from 'lucide-react-native'
import Toast from 'react-native-toast-message'
import {
  carrierDriverApi,
  TripStartBlockedError,
  type InspectionGateView,
} from '@drivecommand/api-client'
import { useAuthContext } from '../../context/AuthContext'
import { useThemeColors } from '../../constants/tokens'
import { haptic } from '../../lib/haptics'

// ---------------------------------------------------------------------------
// The driver's Start trip, with the gate in front of it (spec Section 12).
//
// There was no Start button on this screen at all before Phase 9 — the driver
// dispatch detail rendered stops and nothing else, and trips were started from
// the owner portal. So this is new surface, not a widening of an existing one.
//
// It re-reads the gate on every screen focus. That is what makes an owner
// override reach the driver without a push: they back out, come back, and the
// card says they can go.
// ---------------------------------------------------------------------------

interface Props {
  dispatchId: string
  tripStatus: string
}

export function TripStartCard({ dispatchId, tripStatus }: Props) {
  const c = useThemeColors()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { token } = useAuthContext()
  const [isStarting, setIsStarting] = useState(false)

  const { data: gate, isLoading, refetch } = useQuery<InspectionGateView>({
    queryKey: ['inspection-gate', dispatchId],
    queryFn: () => carrierDriverApi.getInspectionGate(token!, dispatchId),
    enabled: !!token && !!dispatchId,
  })

  useFocusEffect(
    useCallback(() => {
      void refetch()
    }, [refetch])
  )

  // Once a trip is running the gate has done its job and the card is noise.
  if (tripStatus !== 'planned') return null

  if (isLoading || !gate) {
    return (
      <View style={[s.card, { backgroundColor: c.surfaceCard }]}>
        <ActivityIndicator size="small" color={c.brand} />
      </View>
    )
  }

  const blocked = gate.outcome === 'BLOCKED'
  const needsInspection = gate.outcome === 'INSPECTION_REQUIRED'

  async function handleStart() {
    if (!token) return
    setIsStarting(true)
    haptic.medium()
    try {
      await carrierDriverApi.startTrip(token, dispatchId)
      haptic.success()
      Toast.show({ type: 'success', text1: 'Trip started' })
      await queryClient.invalidateQueries({ queryKey: ['carrier-dispatch', dispatchId] })
      await refetch()
    } catch (err) {
      haptic.error()
      // The gate's refusal and a network failure are different situations and
      // get different treatment — a 422 routes to the blocked screen, anything
      // else is a toast the driver can retry.
      if (err instanceof TripStartBlockedError) {
        if (err.outcome === 'BLOCKED') {
          router.push(`/(driver)/inspection/blocked?dispatchId=${dispatchId}` as never)
        } else {
          void refetch()
          Toast.show({ type: 'info', text1: 'Not ready yet', text2: err.message })
        }
      } else {
        Toast.show({
          type: 'error',
          text1: 'Could not start the trip',
          text2: err instanceof Error ? err.message : String(err),
        })
      }
    } finally {
      setIsStarting(false)
    }
  }

  function openChecklist() {
    haptic.light()
    router.push(`/(driver)/inspection/${dispatchId}` as never)
  }

  return (
    <View style={[s.card, { backgroundColor: c.surfaceCard }]}>
      <View style={s.headRow}>
        <GateIcon outcome={gate.outcome} />
        <Text
          style={[s.message, { color: blocked ? c.danger : c.textSecondary }]}
        >
          {gate.message}
        </Text>
      </View>

      {blocked ? (
        <TouchableOpacity
          onPress={() => router.push(`/(driver)/inspection/blocked?dispatchId=${dispatchId}` as never)}
          style={[s.btn, { backgroundColor: c.dangerBg, borderColor: c.danger, borderWidth: 1 }]}
          accessibilityLabel="See what failed"
          accessibilityRole="button"
        >
          <Text style={[s.btnTextOutline, { color: c.danger }]}>See what failed</Text>
        </TouchableOpacity>
      ) : needsInspection ? (
        <TouchableOpacity
          onPress={openChecklist}
          style={[s.btn, { backgroundColor: c.brand }]}
          accessibilityLabel="Start inspection"
          accessibilityRole="button"
        >
          <Text style={s.btnText}>Start inspection</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => void handleStart()}
          disabled={isStarting}
          style={[s.btn, { backgroundColor: c.brand }, isStarting && s.disabled]}
          accessibilityLabel="Start trip"
          accessibilityRole="button"
        >
          {isStarting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={s.btnText}>Start trip</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  )
}

function GateIcon({ outcome }: { outcome: InspectionGateView['outcome'] }) {
  const c = useThemeColors()
  switch (outcome) {
    case 'BLOCKED':
      return <AlertTriangle color={c.danger} size={20} strokeWidth={2.5} />
    case 'INSPECTION_REQUIRED':
      return <ClipboardCheck color={c.textSecondary} size={20} strokeWidth={2.5} />
    case 'OWNER_OVERRIDE':
      return <ShieldCheck color={c.textSecondary} size={20} strokeWidth={2.5} />
    default:
      return <CheckCircle2 color={c.success} size={20} strokeWidth={2.5} />
  }
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 12, borderRadius: 14, padding: 16, gap: 12 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  // flexShrink is explicit: RN defaults it to 0, unlike web, so a long gate
  // message would size the row to its full width and push the card past 360pt.
  message: { flex: 1, flexShrink: 1, fontSize: 14, lineHeight: 20 },
  btn: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  btnTextOutline: { fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.5 },
})
