import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import Animated, {
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { ArrowLeft, Check, X } from 'lucide-react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import { useAuthContext } from '../../../context/AuthContext'
import { useThemeColors } from '../../../constants/tokens'
import { haptic } from '../../../lib/haptics'
import type { StepInstance } from './MyTasksScreen'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000'
const { width: SCREEN_WIDTH } = Dimensions.get('window')
const MAX_PHOTOS = 3

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InspectionModeScreenProps {
  stepInstance: StepInstance // The initially opened step (from TaskActionDispatcher)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InspectionStep {
  id: string
  name: string
  description?: string | null
  playbookInstanceId: string
  playbookName: string
}

interface FailCapture {
  photos: Array<{ uri: string; s3Key: string }>
  note: string
  isSubmitting: boolean
  isUploadingPhoto: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function uploadInspectionPhoto(
  uri: string,
  token: string
): Promise<string> {
  const filename = `inspection-${Date.now()}.jpg`
  const res = await fetch(`${API_BASE_URL}/api/mobile/driver/tasks/upload-photo`, {
    method: 'POST',
    body: JSON.stringify({
      fileName: filename,
      contentType: 'image/jpeg',
      sizeBytes: 1_000_000,
    }),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error('Failed to get upload URL')
  const { uploadUrl, s3Key } = (await res.json()) as {
    uploadUrl: string
    s3Key: string
  }
  const blob = await fetch(uri).then((r) => r.blob())
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: blob,
    headers: { 'Content-Type': 'image/jpeg' },
  })
  if (!putRes.ok) throw new Error('Photo upload to storage failed')
  return s3Key
}

// ---------------------------------------------------------------------------
// InspectionModeScreen
// ---------------------------------------------------------------------------

export function InspectionModeScreen({ stepInstance }: InspectionModeScreenProps) {
  const c = useThemeColors()
  const { token } = useAuthContext()
  const router = useRouter()
  const insets = useSafeAreaInsets()

  // ── Data state ──────────────────────────────────────────────────────────
  const [steps, setSteps] = useState<InspectionStep[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)

  // ── Result tracking ──────────────────────────────────────────────────────
  const [passCount, setPassCount] = useState(0)
  const [failCount, setFailCount] = useState(0)

  // ── Fail capture state ──────────────────────────────────────────────────
  const [failCapture, setFailCapture] = useState<FailCapture | null>(null)

  // ── Encouragement text ───────────────────────────────────────────────────
  const [showEncouragement, setShowEncouragement] = useState(false)
  const encouragementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Card animation ───────────────────────────────────────────────────────
  const cardTranslateX = useSharedValue(0)
  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: cardTranslateX.value }],
  }))

  // ── Fetch all inspection steps for this playbook instance ────────────────
  const fetchSteps = useCallback(async () => {
    if (!token) return
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/mobile/driver/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to fetch tasks')
      const data = (await res.json()) as { stepInstances: StepInstance[] }

      const playbookInstanceId = stepInstance.playbookInstance.id
      const playbookName =
        stepInstance.playbookInstance.playbookSnapshot.name ?? 'Inspection'

      // Filter: same playbook instance, type INSPECTION_ITEM, not yet done
      const inspectionSteps = data.stepInstances
        .filter(
          (si) =>
            si.playbookInstance.id === playbookInstanceId &&
            si.stepSnapshot.stepType === 'INSPECTION_ITEM' &&
            (si.status === 'NOT_STARTED' || si.status === 'IN_PROGRESS')
        )
        .map((si) => ({
          id: si.id,
          name: si.stepSnapshot.name,
          description: si.stepSnapshot.description,
          playbookInstanceId,
          playbookName,
        }))

      if (inspectionSteps.length === 0) {
        // No pending inspection steps — may have already been completed
        setSteps([])
        setCurrentIndex(0)
        return
      }

      // Start at the originally opened step if it's in the list
      const initialIdx = inspectionSteps.findIndex(
        (s) => s.id === stepInstance.id
      )
      setSteps(inspectionSteps)
      setCurrentIndex(initialIdx >= 0 ? initialIdx : 0)
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load inspection steps'
      )
    } finally {
      setIsLoading(false)
    }
  }, [token, stepInstance])

  useEffect(() => {
    fetchSteps()
    return () => {
      if (encouragementTimerRef.current) {
        clearTimeout(encouragementTimerRef.current)
      }
    }
  }, [fetchSteps])

  // ── Step index derived values ────────────────────────────────────────────
  const totalSteps = steps.length
  const isComplete = !isLoading && currentIndex >= totalSteps && totalSteps > 0

  const currentStep = steps[currentIndex] ?? null
  const progress =
    totalSteps > 0 ? (currentIndex / totalSteps) * 100 : 0
  const stepNumber = currentIndex + 1

  // ── Exit confirmation ────────────────────────────────────────────────────
  function handleBack() {
    Alert.alert(
      'Exit inspection?',
      'Your progress is saved.',
      [
        { text: 'Stay', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: () => router.back(),
        },
      ]
    )
  }

  // ── Advance to next card ─────────────────────────────────────────────────
  function advanceStep(passed: boolean) {
    setCurrentIndex((i) => {
      const next = i + 1
      if (passed) {
        setPassCount((p) => p + 1)
      } else {
        setFailCount((f) => f + 1)
      }

      // Show encouragement every 3 steps
      if (next > 0 && next % 3 === 0 && next < totalSteps) {
        setShowEncouragement(true)
        encouragementTimerRef.current = setTimeout(
          () => setShowEncouragement(false),
          2000
        )
      }

      return next
    })
    // Snap to off-screen right then animate in
    cardTranslateX.value = SCREEN_WIDTH
    setFailCapture(null)
    cardTranslateX.value = withTiming(0, { duration: 280 })
  }

  // ── PASS handler ─────────────────────────────────────────────────────────
  async function handlePass() {
    if (!token || !currentStep) return
    haptic.success()
    // Slide card out to left, then advance
    cardTranslateX.value = withTiming(-SCREEN_WIDTH, { duration: 280 }, (finished) => {
      if (finished) runOnJS(advanceStep)(true)
    })
    // Fire-and-forget PASS API call
    fetch(`${API_BASE_URL}/api/mobile/driver/tasks/${currentStep.id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ result: { passOrFail: 'pass' } }),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }).catch(() => {
      Toast.show({ type: 'error', text1: 'Failed to save — will retry' })
    })
  }

  // ── FAIL handler ─────────────────────────────────────────────────────────
  function handleFailTap() {
    haptic.error()
    setFailCapture({ photos: [], note: '', isSubmitting: false, isUploadingPhoto: false })
  }

  // ── Photo capture ─────────────────────────────────────────────────────────
  async function handleAddPhoto() {
    if (!failCapture || !token) return
    if (failCapture.photos.length >= MAX_PHOTOS) {
      Toast.show({ type: 'info', text1: `Maximum ${MAX_PHOTOS} photos allowed` })
      return
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      // Fall back to library
      const libraryResult = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images' as unknown as ImagePicker.MediaType,
        allowsEditing: false,
        quality: 0.8,
      })
      if (!libraryResult.canceled && libraryResult.assets[0]) {
        await processPhoto(libraryResult.assets[0].uri)
      }
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      await processPhoto(result.assets[0].uri)
    }
  }

  async function processPhoto(uri: string) {
    if (!token || !failCapture) return
    setFailCapture((prev) =>
      prev ? { ...prev, isUploadingPhoto: true } : prev
    )
    try {
      const s3Key = await uploadInspectionPhoto(uri, token)
      setFailCapture((prev) =>
        prev
          ? {
              ...prev,
              photos: [...prev.photos, { uri, s3Key }],
              isUploadingPhoto: false,
            }
          : prev
      )
    } catch (err) {
      haptic.error()
      Toast.show({
        type: 'error',
        text1: 'Photo upload failed',
        text2: err instanceof Error ? err.message : 'Please try again',
      })
      setFailCapture((prev) =>
        prev ? { ...prev, isUploadingPhoto: false } : prev
      )
    }
  }

  function handleRemovePhoto(index: number) {
    setFailCapture((prev) =>
      prev
        ? {
            ...prev,
            photos: prev.photos.filter((_, i) => i !== index),
          }
        : prev
    )
  }

  // ── FAIL submit ──────────────────────────────────────────────────────────
  async function handleFailSubmit() {
    if (!token || !currentStep || !failCapture) return
    setFailCapture((prev) => (prev ? { ...prev, isSubmitting: true } : prev))
    haptic.medium()
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/mobile/driver/tasks/${currentStep.id}/fail`,
        {
          method: 'POST',
          body: JSON.stringify({
            result: {
              photoUrls: failCapture.photos.map((p) => p.s3Key),
              note: failCapture.note || undefined,
            },
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      if (!res.ok) throw new Error('Failed to submit fail report')
      haptic.success()
      // Animate card out left then advance
      cardTranslateX.value = withTiming(-SCREEN_WIDTH, { duration: 280 }, (finished) => {
        if (finished) runOnJS(advanceStep)(false)
      })
    } catch (err) {
      haptic.error()
      Toast.show({
        type: 'error',
        text1: 'Submit failed',
        text2: err instanceof Error ? err.message : 'Please try again',
      })
      setFailCapture((prev) =>
        prev ? { ...prev, isSubmitting: false } : prev
      )
    }
  }

  // ── Render: loading ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView
        style={[s.centerFill, { backgroundColor: c.background }]}
        edges={['top', 'bottom', 'left', 'right']}
      >
        <ActivityIndicator size="large" color={c.brand} />
      </SafeAreaView>
    )
  }

  // ── Render: error ────────────────────────────────────────────────────────
  if (loadError) {
    return (
      <SafeAreaView
        style={[s.centerFill, { backgroundColor: c.background }]}
        edges={['top', 'bottom', 'left', 'right']}
      >
        <Text style={[s.errorText, { color: c.danger }]}>{loadError}</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[s.backLinkBtn, { backgroundColor: c.surfaceElevated }]}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={{ color: c.textPrimary, fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  // ── Render: completion screen ────────────────────────────────────────────
  if (isComplete) {
    const playbookName =
      steps[0]?.playbookName ?? stepInstance.playbookInstance.playbookSnapshot.name ?? 'Inspection'

    return (
      <SafeAreaView
        style={[s.completionContainer, { backgroundColor: c.background }]}
        edges={['top', 'bottom', 'left', 'right']}
      >
        <Animated.View
          entering={FadeIn.duration(400)}
          style={s.completionContent}
        >
          <View style={[s.completionCircle, { backgroundColor: c.successBg }]}>
            <Check color={c.success} size={48} strokeWidth={2.5} />
          </View>
          <Text style={[s.completionTitle, { color: c.textPrimary }]}>
            {playbookName} Complete
          </Text>
          <Text style={[s.completionTime, { color: c.textSecondary }]}>
            Submitted at {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={[s.completionSummary, { color: c.textSecondary }]}>
            {passCount} passed · {failCount} flagged
          </Text>
          {failCount > 0 && (
            <Text style={[s.completionAlert, { color: c.warning }]}>
              Items flagged — your dispatcher has been notified
            </Text>
          )}
          <TouchableOpacity
            onPress={() => router.back()}
            style={[s.completionBtn, { backgroundColor: c.brand }]}
            accessibilityLabel="Back to My Tasks"
            accessibilityRole="button"
          >
            <Text style={s.completionBtnText}>Back to My Tasks</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    )
  }

  // ── Render: no steps edge case ───────────────────────────────────────────
  if (totalSteps === 0) {
    return (
      <SafeAreaView
        style={[s.centerFill, { backgroundColor: c.background }]}
        edges={['top', 'bottom', 'left', 'right']}
      >
        <Text style={[s.errorText, { color: c.textSecondary }]}>
          No pending inspection steps found.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[s.backLinkBtn, { backgroundColor: c.surfaceElevated }]}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={{ color: c.textPrimary, fontWeight: '600' }}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  // ── Render: main inspection card flow ────────────────────────────────────
  const step = currentStep!
  const inFailMode = failCapture !== null

  return (
    <SafeAreaView
      style={[s.container, { backgroundColor: c.background }]}
      edges={['top', 'left', 'right']}
    >
      {/* Top bar */}
      <View style={[s.topBar, { borderBottomColor: c.border }]}>
        <TouchableOpacity
          onPress={handleBack}
          style={s.topBackBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Exit inspection"
          accessibilityRole="button"
        >
          <ArrowLeft color={c.textSecondary} size={22} />
        </TouchableOpacity>
        <Text style={[s.topBarTitle, { color: c.textTertiary }]} numberOfLines={1}>
          Inspection
        </Text>
        <Text style={[s.topBarCounter, { color: c.textSecondary }]}>
          {stepNumber} / {totalSteps}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={[s.progressTrack, { backgroundColor: c.border }]}>
        <View
          style={[
            s.progressFill,
            { backgroundColor: c.success, width: `${progress}%` },
          ]}
        />
      </View>

      {/* Card */}
      <ScrollView
        style={s.scrollArea}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[s.card, { backgroundColor: c.surfaceCard }, cardStyle]}
        >
          {/* Step number badge */}
          <View style={[s.stepBadge, { backgroundColor: c.mutedBg }]}>
            <Text style={[s.stepBadgeText, { color: c.textMuted }]}>
              Step {stepNumber}
            </Text>
          </View>

          {/* Step name */}
          <Text style={[s.stepName, { color: c.textPrimary }]}>{step.name}</Text>

          {/* Description */}
          {step.description ? (
            <Text style={[s.stepDescription, { color: c.textSecondary }]}>
              {step.description}
            </Text>
          ) : null}

          {/* Fail capture (expanded in-card) */}
          {inFailMode && (
            <View style={[s.failCapture, { borderTopColor: c.border }]}>
              <Text style={[s.failCaptureHeader, { color: c.danger }]}>
                Issue Found
              </Text>

              {/* Photo row */}
              <View style={s.photoRow}>
                {failCapture!.photos.map((photo, idx) => (
                  <View key={idx} style={s.photoThumbWrapper}>
                    <Image
                      source={{ uri: photo.uri }}
                      style={s.photoThumb}
                      contentFit="cover"
                    />
                    <TouchableOpacity
                      onPress={() => handleRemovePhoto(idx)}
                      style={[s.photoRemoveBtn, { backgroundColor: c.danger }]}
                      accessibilityLabel={`Remove photo ${idx + 1}`}
                      accessibilityRole="button"
                    >
                      <X color="#fff" size={10} strokeWidth={2.5} />
                    </TouchableOpacity>
                  </View>
                ))}

                {failCapture!.photos.length < MAX_PHOTOS && (
                  <TouchableOpacity
                    onPress={handleAddPhoto}
                    disabled={failCapture!.isUploadingPhoto}
                    style={[
                      s.photoAddBtn,
                      { borderColor: c.border, backgroundColor: c.surfaceInput },
                    ]}
                    accessibilityLabel="Add photo"
                    accessibilityRole="button"
                  >
                    {failCapture!.isUploadingPhoto ? (
                      <ActivityIndicator size="small" color={c.brand} />
                    ) : (
                      <Text style={[s.photoAddText, { color: c.brand }]}>+ Add Photo</Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>

              {/* Notes */}
              <TextInput
                value={failCapture!.note}
                onChangeText={(text) =>
                  setFailCapture((prev) => (prev ? { ...prev, note: text } : prev))
                }
                multiline
                style={[
                  s.noteInput,
                  {
                    color: c.textPrimary,
                    backgroundColor: c.surfaceInput,
                    borderColor: c.border,
                  },
                ]}
                placeholderTextColor={c.textMuted}
                placeholder="Add a note (optional)"
                textAlignVertical="top"
              />

              {/* Submit & Continue */}
              <TouchableOpacity
                onPress={handleFailSubmit}
                disabled={failCapture!.isSubmitting || failCapture!.isUploadingPhoto}
                style={[
                  s.submitFailBtn,
                  { backgroundColor: c.danger },
                  (failCapture!.isSubmitting || failCapture!.isUploadingPhoto) && { opacity: 0.6 },
                ]}
                accessibilityLabel="Submit and continue"
                accessibilityRole="button"
              >
                {failCapture!.isSubmitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.submitFailBtnText}>Submit &amp; Continue</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>

        {/* Encouragement text */}
        {showEncouragement && (
          <Text style={[s.encouragement, { color: c.textTertiary }]}>
            Looking good! {currentIndex} of {totalSteps} complete
          </Text>
        )}
      </ScrollView>

      {/* Action buttons */}
      {!inFailMode && (
        <View
          style={[
            s.actionBar,
            { paddingBottom: insets.bottom + 16 },
          ]}
        >
          <TouchableOpacity
            onPress={handleFailTap}
            style={[s.failBtn, { backgroundColor: c.dangerBg, borderColor: c.danger }]}
            accessibilityLabel="Fail this step"
            accessibilityRole="button"
          >
            <Text style={[s.failBtnText, { color: c.danger }]}>FAIL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handlePass}
            style={[s.passBtn, { backgroundColor: c.successBg, borderColor: c.success }]}
            accessibilityLabel="Pass this step"
            accessibilityRole="button"
          >
            <Text style={[s.passBtnText, { color: c.success }]}>PASS</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 15,
    textAlign: 'center',
  },
  backLinkBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },

  // ── Top bar ──────────────────────────────────────────────────────────────
  topBar: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  topBackBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  topBarTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  topBarCounter: {
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Progress bar ─────────────────────────────────────────────────────────
  progressTrack: {
    height: 3,
    width: '100%',
  },
  progressFill: {
    height: 3,
  },

  // ── Card scroll area ─────────────────────────────────────────────────────
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
  },

  // ── Card ─────────────────────────────────────────────────────────────────
  card: {
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  stepBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 99,
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  stepName: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
  },
  stepDescription: {
    fontSize: 15,
    lineHeight: 22,
  },

  // ── Fail capture ─────────────────────────────────────────────────────────
  failCapture: {
    gap: 14,
    paddingTop: 16,
    marginTop: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  failCaptureHeader: {
    fontSize: 16,
    fontWeight: '700',
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoThumbWrapper: {
    position: 'relative',
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  photoRemoveBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddBtn: {
    width: 80,
    height: 80,
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  noteInput: {
    minHeight: 90,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  submitFailBtn: {
    height: 56,
    minHeight: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitFailBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // ── Encouragement ─────────────────────────────────────────────────────────
  encouragement: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 4,
  },

  // ── Action buttons ────────────────────────────────────────────────────────
  actionBar: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  failBtn: {
    flex: 1,
    height: 56,
    minHeight: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  failBtnText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1,
  },
  passBtn: {
    flex: 1,
    height: 56,
    minHeight: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  passBtnText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // ── Completion screen ─────────────────────────────────────────────────────
  completionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  completionContent: {
    alignItems: 'center',
    gap: 16,
    width: '100%',
  },
  completionCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionTitle: {
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  completionTime: {
    fontSize: 14,
  },
  completionSummary: {
    fontSize: 16,
    fontWeight: '600',
  },
  completionAlert: {
    fontSize: 14,
    textAlign: 'center',
  },
  completionBtn: {
    height: 56,
    minHeight: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    marginTop: 8,
  },
  completionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
})
