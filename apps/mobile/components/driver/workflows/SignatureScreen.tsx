import React, { useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowLeft } from 'lucide-react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../context/AuthContext'
import { useThemeColors } from '../../../constants/tokens'
import { haptic } from '../../../lib/haptics'
import { SignaturePad, uploadSignature, type SignaturePoint } from './SignaturePad'
import type { StepInstance } from './MyTasksScreen'

// ---------------------------------------------------------------------------
// The SIGNATURE step, reached from the task list.
//
// The canvas, the capture and the upload now live in `SignaturePad`, shared
// with the trip inspection's final screen — one signature implementation, not
// two that drift.
//
// THE DEFECT THIS FIXES. The previous version set `s3Key` whether or not the
// bytes landed, and said so in a comment that ended "Behaviour preserved
// deliberately — fixing it changes driver signature submission, which is Phase
// 9's flow and not this cleanup's business." This is Phase 9. A signed DVIR
// whose signature object was never written is exactly the artifact a roadside
// inspection asks for, and the driver was shown a green "Signature submitted"
// either way. `uploadSignature` now throws, and this screen reports the reason.
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000'

interface SignatureScreenProps {
  stepInstance: StepInstance
}

export function SignatureScreen({ stepInstance }: SignatureScreenProps) {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const [hasSignature, setHasSignature] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const padRef = useRef<View | null>(null)
  const strokesRef = useRef<SignaturePoint[][]>([])
  const signedAt = useRef(new Date()).current

  const stepSnapshot = stepInstance.stepSnapshot
  const instruction = stepSnapshot.description ?? 'Sign in the box below'

  const driverName =
    (stepInstance as unknown as { assignedUserName?: string }).assignedUserName ?? null

  async function handleSubmit() {
    if (!hasSignature || !token) return
    setIsSubmitting(true)
    haptic.medium()

    try {
      const { s3Key } = await uploadSignature({
        viewRef: padRef,
        strokes: strokesRef.current,
        token,
        fileBaseName: `signature-${stepInstance.id}`,
        presignEndpoint: '/api/mobile/driver/documents/upload-url',
      })

      const completeRes = await fetch(
        `${API_BASE_URL}/api/mobile/driver/tasks/${stepInstance.id}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({
            result: { signatureUrl: s3Key, signedAt: signedAt.toISOString() },
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      if (!completeRes.ok) {
        const body = (await completeRes.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `HTTP ${completeRes.status}`)
      }

      haptic.success()
      Toast.show({ type: 'success', text1: 'Signature submitted' })
      router.back()
    } catch (err) {
      haptic.error()
      Toast.show({
        type: 'error',
        text1: 'Submission failed',
        // The actual reason, never "please try again" over a swallowed error.
        text2: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: c.background }]}
      edges={['bottom', 'left', 'right']}
    >
      <View style={[styles.headerRow, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <ArrowLeft color={c.textSecondary} size={22} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]} numberOfLines={1}>
          {stepSnapshot.name}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.stepName, { color: c.textPrimary }]}>{stepSnapshot.name}</Text>
        <Text style={[styles.instruction, { color: c.textSecondary }]}>{instruction}</Text>

        <View style={{ height: 12 }} />

        <SignaturePad
          driverName={driverName}
          signedAt={signedAt}
          onChange={setHasSignature}
          padRef={padRef}
          strokesRef={strokesRef}
        />
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.border, paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          onPress={() => void handleSubmit()}
          disabled={!hasSignature || isSubmitting}
          style={[
            styles.submitBtn,
            { backgroundColor: c.brand },
            (!hasSignature || isSubmitting) && styles.submitBtnDisabled,
          ]}
          accessibilityLabel="I confirm and sign"
          accessibilityRole="button"
        >
          {isSubmitting ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>I confirm and sign</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  headerTitle: { flex: 1, flexShrink: 1, fontSize: 17, fontWeight: '600', marginHorizontal: 8 },
  content: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 24, gap: 8 },
  stepName: { fontSize: 24, fontWeight: '700', lineHeight: 30 },
  instruction: { fontSize: 15, lineHeight: 22 },
  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  submitBtn: { height: 56, minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
})
