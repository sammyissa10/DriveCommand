import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { AlertTriangle, ArrowLeft, MessageSquare, Phone } from 'lucide-react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { carrierDriverApi, type InspectionGateView } from '@drivecommand/api-client'
import { useAuthContext } from '../../../context/AuthContext'
import { useThemeColors } from '../../../constants/tokens'
import { haptic } from '../../../lib/haptics'
import { inspectionCopy } from '../../../lib/inspection-copy'

// ---------------------------------------------------------------------------
// The blocked driver screen — item 4.
//
// "Never a dead end." Three things, in this order, because that is the order a
// driver standing next to a truck at 05:00 needs them:
//
//   1. What failed — by name, with the note they wrote themselves.
//   2. That dispatch has been told. Stated as a fact because it IS one:
//      `notifyDispatchOfBlock` writes the in-app notification and AWAITS it
//      before the gate returns BLOCKED. The push is best-effort on top.
//   3. Something to do about it — Contact dispatch, and a re-check.
//
// The re-check matters as much as the contact action. When the owner records an
// override, this screen's next read returns canStart, so the driver gets out of
// here without needing anyone to tell them the block was lifted.
// ---------------------------------------------------------------------------

interface Props {
  dispatchId: string
}

export function InspectionBlockedScreen({ dispatchId }: Props) {
  const c = useThemeColors()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { token } = useAuthContext()

  const [gate, setGate] = useState<InspectionGateView | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isRechecking, setIsRechecking] = useState(false)

  const load = useCallback(
    async (silent = false) => {
      if (!token) return
      if (!silent) setIsLoading(true)
      setLoadError(null)
      try {
        const data = await carrierDriverApi.getInspectionGate(token, dispatchId)
        setGate(data)
        if (data.canStart) {
          haptic.success()
          Toast.show({
            type: 'success',
            text1: 'You are cleared to start',
            text2: data.message,
          })
          router.replace(`/(driver)/carrier/dispatch/${dispatchId}` as never)
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err))
      } finally {
        setIsLoading(false)
        setIsRechecking(false)
      }
    },
    [token, dispatchId, router]
  )

  useEffect(() => {
    void load()
  }, [load])

  async function contactDispatch() {
    haptic.medium()
    // Messages is the reliable channel — it is in-app, it is logged against the
    // tenant, and it does not depend on the driver having a dispatcher's number
    // saved. `tel:` is offered underneath only when the device can place calls.
    router.push('/(driver)/messages' as never)
  }

  async function callDispatch() {
    const url = 'tel:'
    const supported = await Linking.canOpenURL(url).catch(() => false)
    if (!supported) {
      Toast.show({ type: 'info', text1: 'This device cannot place calls' })
      return
    }
    haptic.medium()
    await Linking.openURL(url).catch((err) => {
      Toast.show({
        type: 'error',
        text1: 'Could not open the dialler',
        text2: err instanceof Error ? err.message : String(err),
      })
    })
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[s.fill, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={c.brand} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[s.fill, { backgroundColor: c.background }]} edges={['top', 'left', 'right']}>
      <View style={s.topBar}>
        <TouchableOpacity
          onPress={() => router.replace(`/(driver)/carrier/dispatch/${dispatchId}` as never)}
          style={s.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Back to trip"
          accessibilityRole="button"
        >
          <ArrowLeft color={c.textSecondary} size={22} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Red here is correct and is the only red on the screen: a failed
            safety item is exactly what Section 15 reserves it for. */}
        <View style={[s.iconCircle, { backgroundColor: c.dangerBg }]}>
          <AlertTriangle color={c.danger} size={36} strokeWidth={2.5} />
        </View>

        <Text style={[s.title, { color: c.textPrimary }]}>{inspectionCopy.blockedTitle}</Text>
        <Text style={[s.body, { color: c.textSecondary }]}>
          {gate?.message ?? loadError ?? 'A critical item failed inspection.'}
        </Text>

        {gate && gate.failures.length > 0 && (
          <View style={s.failList}>
            <Text style={[s.listHeading, { color: c.textTertiary }]}>What failed</Text>
            {gate.failures.map((f) => (
              <View key={f.stepInstanceId} style={[s.failCard, { backgroundColor: c.surfaceCard }]}>
                <View style={s.failCardHead}>
                  <Text style={[s.failName, { color: c.textPrimary }]} numberOfLines={2}>
                    {f.name}
                  </Text>
                  {f.isCritical && (
                    <View style={[s.criticalPill, { backgroundColor: c.dangerBg }]}>
                      <Text style={[s.criticalPillText, { color: c.danger }]}>Critical</Text>
                    </View>
                  )}
                </View>
                {f.note ? (
                  <Text style={[s.failNote, { color: c.textSecondary }]}>{f.note}</Text>
                ) : null}
                {f.photoCount > 0 ? (
                  <Text style={[s.failMeta, { color: c.textTertiary }]}>
                    {f.photoCount === 1 ? '1 photo attached' : `${f.photoCount} photos attached`}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        <View style={[s.noticeCard, { backgroundColor: c.surfaceElevated }]}>
          <Text style={[s.noticeText, { color: c.textSecondary }]}>
            {inspectionCopy.blockedDispatchTold}
          </Text>
        </View>

        {loadError && (
          <Text style={[s.body, { color: c.warning }]}>
            {`Could not refresh the status: ${loadError}`}
          </Text>
        )}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          onPress={() => void contactDispatch()}
          style={[s.primaryBtn, { backgroundColor: c.brand }]}
          accessibilityLabel="Contact dispatch"
          accessibilityRole="button"
        >
          <MessageSquare color="#fff" size={18} />
          <Text style={s.primaryBtnText}>Contact dispatch</Text>
        </TouchableOpacity>

        <View style={s.secondaryRow}>
          <TouchableOpacity
            onPress={() => void callDispatch()}
            style={[s.secondaryBtn, { backgroundColor: c.surfaceElevated }]}
            accessibilityLabel="Call dispatch"
            accessibilityRole="button"
          >
            <Phone color={c.textPrimary} size={16} />
            <Text style={[s.secondaryBtnText, { color: c.textPrimary }]}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              setIsRechecking(true)
              void load(true)
            }}
            disabled={isRechecking}
            style={[s.secondaryBtn, { backgroundColor: c.surfaceElevated }, isRechecking && s.disabled]}
            accessibilityLabel="Check again"
            accessibilityRole="button"
          >
            {isRechecking ? (
              <ActivityIndicator size="small" color={c.textPrimary} />
            ) : (
              <Text style={[s.secondaryBtnText, { color: c.textPrimary }]}>Check again</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 8, gap: 16 },

  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: { fontSize: 26, fontWeight: '700', lineHeight: 32, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 22, textAlign: 'center' },

  failList: { gap: 8 },
  listHeading: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  failCard: { borderRadius: 12, padding: 12, gap: 6 },
  failCardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  failName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  criticalPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, flexShrink: 0 },
  criticalPillText: { fontSize: 11, fontWeight: '700' },
  failNote: { fontSize: 14, lineHeight: 20, flexShrink: 1 },
  failMeta: { fontSize: 12 },

  noticeCard: { borderRadius: 12, padding: 16 },
  noticeText: { fontSize: 14, lineHeight: 20 },

  footer: { paddingHorizontal: 16, paddingTop: 12, gap: 12 },
  primaryBtn: {
    minHeight: 52,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryRow: { flexDirection: 'row', gap: 12 },
  secondaryBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.5 },
})
