import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { AlertTriangle, ArrowLeft, Check, Minus, X } from 'lucide-react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast from 'react-native-toast-message'
import {
  carrierDriverApi,
  type InspectionChecklistView,
  type InspectionStepView,
} from '@drivecommand/api-client'
import { useAuthContext } from '../../../context/AuthContext'
import { useThemeColors } from '../../../constants/tokens'
import { haptic } from '../../../lib/haptics'
import { putToPresignedUrl, requestPresignedUpload } from '../../../lib/upload'
import { inspectionCopy } from '../../../lib/inspection-copy'
import { SignaturePad, uploadSignature, type SignaturePoint } from './SignaturePad'

// ---------------------------------------------------------------------------
// TripInspectionScreen — the full-screen walkaround (spec Section 12, item 2).
//
// It takes over the ENTIRE view: mounted in `(driver)/inspection/`, which is
// registered on the Tabs navigator with `tabBarStyle: { display: 'none' }`.
// That matters. The pre-existing inspection screen at `tasks/[id]` is a
// Tabs.Screen with `href: null`, which hides its tab BUTTON but leaves the tab
// BAR on screen — so it has never actually been full screen.
//
// NOT A SECOND CHECKLIST SYSTEM. Every answer is written by the endpoints that
// already existed and are untouched:
//   PASS -> POST /api/mobile/driver/tasks/[id]/complete
//   FAIL -> POST /api/mobile/driver/tasks/[id]/fail
//   N/A  -> POST /api/mobile/driver/tasks/[id]/skip
//   photo-> POST /api/mobile/driver/tasks/upload-photo  (presigned, at capture)
// The items, the critical marker and the mechanic sign-off are the existing
// Playbook / StepInstance engine.
//
// PHOTOS UPLOAD AT CAPTURE, never at submit. `processPhoto` awaits the presigned
// PUT before the thumbnail appears, and only the returned s3Key is held. Kill
// the app immediately after taking one and the object is already in the bucket.
// This is inherited behaviour from `InspectionModeScreen.uploadInspectionPhoto`,
// preserved deliberately — it is the phase's named drift risk.
//
// The offline queue CANNOT carry it, and that is stated rather than hidden:
// `PendingMutation.body` is `string // JSON serialized`, persisted through MMKV
// and flushed with a hardcoded `Content-Type: application/json`. A capture made
// with no connection surfaces `photoOfflineWarning`; the NOTE is still required
// and the failure is still recorded. Evidence degrades, the safety decision
// does not.
// ---------------------------------------------------------------------------

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000'
const MAX_PHOTOS = 3

type Answer = 'PASS' | 'FAIL' | 'NA'

interface FailDraft {
  note: string
  photos: Array<{ uri: string; s3Key: string }>
  isUploadingPhoto: boolean
  offlinePhoto: boolean
}

interface Props {
  dispatchId: string
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function TripInspectionScreen({ dispatchId }: Props) {
  const c = useThemeColors()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { token } = useAuthContext()

  const [checklist, setChecklist] = useState<InspectionChecklistView | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  /** Which screen: 0..sections.length-1 are sections, then review, then sign. */
  const [pageIndex, setPageIndex] = useState(0)
  const [busyStepId, setBusyStepId] = useState<string | null>(null)
  const [failDrafts, setFailDrafts] = useState<Record<string, FailDraft>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const padRef = useRef<View | null>(null)
  const strokesRef = useRef<SignaturePoint[][]>([])
  const [hasSignature, setHasSignature] = useState(false)
  const signedAt = useRef(new Date()).current

  // ── Load ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!token) return
    setIsLoading(true)
    setLoadError(null)
    try {
      // POST, not GET — it creates the run when the tenant has no
      // ON_DISPATCH_CREATE trigger. Idempotent: every previous answer comes
      // back, which is what makes answers survive an app kill.
      const data = await carrierDriverApi.openInspectionChecklist(token, dispatchId)
      setChecklist(data)
    } catch (err) {
      setLoadError(describe(err))
    } finally {
      setIsLoading(false)
    }
  }, [token, dispatchId])

  useEffect(() => {
    void load()
  }, [load])

  const sections = checklist?.sections ?? []
  const allSteps = useMemo(() => sections.flatMap((s) => s.steps), [sections])
  const reviewIndex = sections.length
  const signIndex = sections.length + 1
  const totalPages = sections.length + 2

  const answered = allSteps.filter((s) => s.status !== 'NOT_STARTED' && s.status !== 'IN_PROGRESS')
  const unansweredCount = allSteps.length - answered.length
  const progress = allSteps.length > 0 ? answered.length / allSteps.length : 0

  // ── Answer an item ──────────────────────────────────────────────────────
  function patchStep(stepInstanceId: string, status: InspectionStepView['status'], note?: string, photoKeys?: string[]) {
    setChecklist((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        sections: prev.sections.map((sec) => ({
          ...sec,
          steps: sec.steps.map((st) =>
            st.stepInstanceId === stepInstanceId
              ? {
                  ...st,
                  status,
                  note: note ?? st.note,
                  photoKeys: photoKeys ?? st.photoKeys,
                }
              : st
          ),
        })),
      }
    })
  }

  async function answer(step: InspectionStepView, verdict: Answer) {
    if (!token || busyStepId) return
    setBusyStepId(step.stepInstanceId)

    try {
      if (verdict === 'PASS') {
        haptic.success()
        const res = await fetch(
          `${API_BASE_URL}/api/mobile/driver/tasks/${step.stepInstanceId}/complete`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ result: { passOrFail: 'pass' } }),
          }
        )
        if (!res.ok) throw new Error(await readError(res))
        patchStep(step.stepInstanceId, 'COMPLETE')
        return
      }

      if (verdict === 'NA') {
        haptic.light()
        // N/A is the existing SKIPPED verb, not a new state. `skipReason` is
        // NOT NULL-in-spirit at the route (it 400s on an empty string), and
        // "not applicable" is the honest reason.
        const res = await fetch(
          `${API_BASE_URL}/api/mobile/driver/tasks/${step.stepInstanceId}/skip`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ reason: 'Not applicable to this vehicle' }),
          }
        )
        if (!res.ok) throw new Error(await readError(res))
        patchStep(step.stepInstanceId, 'SKIPPED')
        return
      }

      // FAIL opens the draft; nothing is written until the note is there.
      haptic.error()
      setFailDrafts((prev) => ({
        ...prev,
        [step.stepInstanceId]: prev[step.stepInstanceId] ?? {
          note: step.note ?? '',
          photos: [],
          isUploadingPhoto: false,
          offlinePhoto: false,
        },
      }))
    } catch (err) {
      haptic.error()
      Toast.show({
        type: 'error',
        text1: 'Could not save that answer',
        text2: describe(err),
      })
    } finally {
      setBusyStepId(null)
    }
  }

  async function readError(res: Response): Promise<string> {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    return body.error ?? `HTTP ${res.status}`
  }

  // ── Photo: upload AT CAPTURE ────────────────────────────────────────────
  async function addPhoto(step: InspectionStepView) {
    const draft = failDrafts[step.stepInstanceId]
    if (!draft || !token) return
    if (draft.photos.length >= MAX_PHOTOS) return

    const permission = await ImagePicker.requestCameraPermissionsAsync()
    const result = permission.granted
      ? await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images' as unknown as ImagePicker.MediaType,
          allowsEditing: false,
          quality: 0.8,
        })

    if (result.canceled || !result.assets[0]) return
    const uri = result.assets[0].uri

    setFailDrafts((p) => ({
      ...p,
      [step.stepInstanceId]: { ...p[step.stepInstanceId], isUploadingPhoto: true, offlinePhoto: false },
    }))

    try {
      const grant = await requestPresignedUpload(
        '/api/mobile/driver/tasks/upload-photo',
        token,
        { fileName: `inspection-${step.stepInstanceId}-${Date.now()}.jpg`, contentType: 'image/jpeg', sizeBytes: 1_000_000 }
      )
      const blob = await fetch(uri).then((r) => r.blob())
      // The PUT is awaited BEFORE the thumbnail appears. Only the key is kept.
      await putToPresignedUrl(grant.uploadUrl, blob, 'image/jpeg')

      setFailDrafts((p) => ({
        ...p,
        [step.stepInstanceId]: {
          ...p[step.stepInstanceId],
          photos: [...p[step.stepInstanceId].photos, { uri, s3Key: grant.s3Key }],
          isUploadingPhoto: false,
        },
      }))
      haptic.success()
    } catch (err) {
      const net = await NetInfo.fetch()
      const offline = !net.isConnected
      haptic.error()
      setFailDrafts((p) => ({
        ...p,
        [step.stepInstanceId]: {
          ...p[step.stepInstanceId],
          isUploadingPhoto: false,
          offlinePhoto: offline,
        },
      }))
      Toast.show({
        type: 'error',
        text1: offline ? 'Photo not uploaded' : 'Photo upload failed',
        // Named, never a bare "please try again".
        text2: offline ? inspectionCopy.photoOfflineWarning : describe(err),
      })
    }
  }

  function removePhoto(stepInstanceId: string, index: number) {
    setFailDrafts((p) => ({
      ...p,
      [stepInstanceId]: {
        ...p[stepInstanceId],
        photos: p[stepInstanceId].photos.filter((_, i) => i !== index),
      },
    }))
  }

  async function submitFail(step: InspectionStepView) {
    const draft = failDrafts[step.stepInstanceId]
    if (!draft || !token) return
    const note = draft.note.trim()
    const minLen = checklist?.failNoteMinLength ?? 3
    if (note.length < minLen) return

    setBusyStepId(step.stepInstanceId)
    try {
      const res = await fetch(`${API_BASE_URL}/api/mobile/driver/tasks/${step.stepInstanceId}/fail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          result: { photoUrls: draft.photos.map((p) => p.s3Key), note },
        }),
      })
      if (!res.ok) throw new Error(await readError(res))

      patchStep(step.stepInstanceId, 'FAILED', note, draft.photos.map((p) => p.s3Key))
      setFailDrafts((p) => {
        const next = { ...p }
        delete next[step.stepInstanceId]
        return next
      })
      haptic.success()
    } catch (err) {
      haptic.error()
      Toast.show({ type: 'error', text1: 'Could not record the failure', text2: describe(err) })
    } finally {
      setBusyStepId(null)
    }
  }

  // ── Sign + submit ───────────────────────────────────────────────────────
  async function handleSign() {
    if (!token || !checklist || !hasSignature) return
    setIsSubmitting(true)
    haptic.medium()

    try {
      if (checklist.signature.required && checklist.signature.stepInstanceId) {
        // Throws on a failed upload — it no longer returns a key pointing at
        // nothing, which is the defect this phase inherited.
        const { s3Key } = await uploadSignature({
          viewRef: padRef,
          strokes: strokesRef.current,
          token,
          fileBaseName: `dvir-${dispatchId}-${Date.now()}`,
          presignEndpoint: '/api/mobile/driver/documents/upload-url',
        })

        const res = await fetch(
          `${API_BASE_URL}/api/mobile/driver/tasks/${checklist.signature.stepInstanceId}/complete`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              result: {
                signatureUrl: s3Key,
                signedByName: checklist.driverName,
                signedAt: signedAt.toISOString(),
              },
            }),
          }
        )
        if (!res.ok) throw new Error(await readError(res))
      }

      const gate = await carrierDriverApi.submitInspection(token, dispatchId)
      haptic.success()

      if (gate.outcome === 'BLOCKED') {
        router.replace(`/(driver)/inspection/blocked?dispatchId=${dispatchId}` as never)
        return
      }

      Toast.show({
        type: 'success',
        text1: inspectionCopy.signedConfirmation(checklist.truckUnitNumber),
        text2: gate.message,
      })
      router.replace(`/(driver)/carrier/dispatch/${dispatchId}` as never)
    } catch (err) {
      haptic.error()
      Toast.show({ type: 'error', text1: 'Could not submit', text2: describe(err) })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Back ────────────────────────────────────────────────────────────────
  // Item 2: back navigation preserved so the driver can review before signing.
  // Every answer is already on the server, so going back re-renders stored
  // state — there is nothing to "restore".
  function goBack() {
    if (pageIndex > 0) {
      haptic.light()
      setPageIndex((i) => i - 1)
      return
    }
    Alert.alert('Leave the inspection?', 'Your answers are saved. You can come back to finish.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', onPress: () => router.back() },
    ])
  }

  // ── Render states ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView style={[s.fill, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
        <View style={s.center}>
          <ActivityIndicator size="large" color={c.brand} />
        </View>
      </SafeAreaView>
    )
  }

  if (loadError || !checklist) {
    return (
      <SafeAreaView style={[s.fill, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
        <View style={s.center}>
          <Text style={[s.errorText, { color: c.textPrimary }]}>
            {loadError ?? 'Inspection unavailable.'}
          </Text>
          <TouchableOpacity
            onPress={() => void load()}
            style={[s.secondaryBtn, { backgroundColor: c.surfaceElevated }]}
            accessibilityLabel="Try again"
            accessibilityRole="button"
          >
            <Text style={{ color: c.textPrimary, fontWeight: '600' }}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.back()}
            style={s.textBtn}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Text style={{ color: c.brand, fontWeight: '600' }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  const onReview = pageIndex === reviewIndex
  const onSign = pageIndex === signIndex
  const section = sections[pageIndex]

  return (
    <SafeAreaView style={[s.fill, { backgroundColor: c.background }]} edges={['top', 'left', 'right']}>
      {/* Top bar + progress. Progress is the brand colour, NEVER red —
          Section 15 reserves red for a failed item alone. */}
      <View style={s.topBar}>
        <TouchableOpacity
          onPress={goBack}
          style={s.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={pageIndex > 0 ? 'Previous section' : 'Leave inspection'}
          accessibilityRole="button"
        >
          <ArrowLeft color={c.textSecondary} size={22} />
        </TouchableOpacity>
        <View style={s.topBarCenter}>
          <Text style={[s.topBarTitle, { color: c.textPrimary }]} numberOfLines={1}>
            {checklist.playbookName}
          </Text>
          <Text style={[s.topBarSub, { color: c.textTertiary }]} numberOfLines={1}>
            {checklist.truckUnitNumber}
          </Text>
        </View>
        <Text style={[s.topBarCounter, { color: c.textSecondary }]}>
          {Math.min(pageIndex + 1, totalPages)}/{totalPages}
        </Text>
      </View>

      <View style={[s.progressTrack, { backgroundColor: c.border }]}>
        <View
          style={[s.progressFill, { backgroundColor: c.brand, width: `${Math.round(progress * 100)}%` }]}
        />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── A section screen ─────────────────────────────────────────── */}
        {!onReview && !onSign && section && (
          <>
            <Text style={[s.sectionKicker, { color: c.textTertiary }]}>
              {inspectionCopy.sectionProgress(pageIndex + 1, sections.length)}
            </Text>
            <Text style={[s.sectionTitle, { color: c.textPrimary }]}>{section.title}</Text>

            {section.steps.map((step) => (
              <ItemRow
                key={step.stepInstanceId}
                step={step}
                draft={failDrafts[step.stepInstanceId]}
                busy={busyStepId === step.stepInstanceId}
                minNoteLength={checklist.failNoteMinLength}
                onAnswer={(v) => void answer(step, v)}
                onNoteChange={(text) =>
                  setFailDrafts((p) => ({
                    ...p,
                    [step.stepInstanceId]: { ...p[step.stepInstanceId], note: text },
                  }))
                }
                onAddPhoto={() => void addPhoto(step)}
                onRemovePhoto={(i) => removePhoto(step.stepInstanceId, i)}
                onSubmitFail={() => void submitFail(step)}
                onCancelFail={() =>
                  setFailDrafts((p) => {
                    const next = { ...p }
                    delete next[step.stepInstanceId]
                    return next
                  })
                }
              />
            ))}
          </>
        )}

        {/* ── Review ───────────────────────────────────────────────────── */}
        {onReview && (
          <>
            <Text style={[s.sectionTitle, { color: c.textPrimary }]}>
              {inspectionCopy.reviewTitle}
            </Text>
            <Text style={[s.reviewSummary, { color: c.textSecondary }]}>
              {inspectionCopy.reviewSummary(
                allSteps.filter((x) => x.status === 'COMPLETE').length,
                allSteps.filter((x) => x.status === 'FAILED').length,
                allSteps.filter((x) => x.status === 'SKIPPED').length
              )}
            </Text>

            {allSteps.map((step) => (
              <View
                key={step.stepInstanceId}
                style={[s.reviewRow, { backgroundColor: c.surfaceCard }]}
              >
                <StatusGlyph status={step.status} />
                <View style={s.reviewRowText}>
                  <Text style={[s.reviewName, { color: c.textPrimary }]} numberOfLines={2}>
                    {step.name}
                  </Text>
                  {step.note ? (
                    <Text style={[s.reviewNote, { color: c.textSecondary }]} numberOfLines={3}>
                      {step.note}
                    </Text>
                  ) : null}
                  {step.photoKeys.length > 0 ? (
                    <Text style={[s.reviewMeta, { color: c.textTertiary }]}>
                      {step.photoKeys.length === 1
                        ? '1 photo'
                        : `${step.photoKeys.length} photos`}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}

            {unansweredCount > 0 && (
              <Text style={[s.warningText, { color: c.warning }]}>
                {inspectionCopy.unanswered(unansweredCount)}
              </Text>
            )}
          </>
        )}

        {/* ── Sign ─────────────────────────────────────────────────────── */}
        {onSign && (
          <>
            <Text style={[s.sectionTitle, { color: c.textPrimary }]}>Sign the inspection</Text>
            <Text style={[s.reviewSummary, { color: c.textSecondary }]}>
              {inspectionCopy.reviewSummary(
                allSteps.filter((x) => x.status === 'COMPLETE').length,
                allSteps.filter((x) => x.status === 'FAILED').length,
                allSteps.filter((x) => x.status === 'SKIPPED').length
              )}
            </Text>
            <View style={{ height: 16 }} />
            <SignaturePad
              driverName={checklist.driverName}
              signedAt={signedAt}
              onChange={setHasSignature}
              padRef={padRef}
              strokesRef={strokesRef}
            />
          </>
        )}
      </ScrollView>

      {/* Footer action */}
      <View style={[s.footer, { backgroundColor: c.background, paddingBottom: insets.bottom + 12 }]}>
        {onSign ? (
          <TouchableOpacity
            onPress={() => void handleSign()}
            disabled={!hasSignature || isSubmitting || unansweredCount > 0}
            style={[
              s.primaryBtn,
              { backgroundColor: c.brand },
              (!hasSignature || isSubmitting || unansweredCount > 0) && s.disabled,
            ]}
            accessibilityLabel="Submit inspection"
            accessibilityRole="button"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.primaryBtnText}>Submit inspection</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => {
              haptic.light()
              setPageIndex((i) => Math.min(i + 1, signIndex))
            }}
            disabled={onReview && unansweredCount > 0}
            style={[
              s.primaryBtn,
              { backgroundColor: c.brand },
              onReview && unansweredCount > 0 && s.disabled,
            ]}
            accessibilityLabel={onReview ? 'Continue to signature' : 'Next section'}
            accessibilityRole="button"
          >
            <Text style={s.primaryBtnText}>{onReview ? 'Continue to sign' : 'Next'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------
// One item
// ---------------------------------------------------------------------------

function StatusGlyph({ status }: { status: InspectionStepView['status'] }) {
  const c = useThemeColors()
  if (status === 'COMPLETE') return <Check color={c.success} size={20} strokeWidth={2.5} />
  if (status === 'FAILED') return <AlertTriangle color={c.danger} size={20} strokeWidth={2.5} />
  if (status === 'SKIPPED') return <Minus color={c.textMuted} size={20} strokeWidth={2.5} />
  return <View style={{ width: 20, height: 20 }} />
}

interface ItemRowProps {
  step: InspectionStepView
  draft: FailDraft | undefined
  busy: boolean
  minNoteLength: number
  onAnswer: (v: Answer) => void
  onNoteChange: (text: string) => void
  onAddPhoto: () => void
  onRemovePhoto: (index: number) => void
  onSubmitFail: () => void
  onCancelFail: () => void
}

function ItemRow({
  step,
  draft,
  busy,
  minNoteLength,
  onAnswer,
  onNoteChange,
  onAddPhoto,
  onRemovePhoto,
  onSubmitFail,
  onCancelFail,
}: ItemRowProps) {
  const c = useThemeColors()
  const inFail = draft !== undefined
  const noteOk = (draft?.note.trim().length ?? 0) >= minNoteLength

  return (
    <View style={[s.card, { backgroundColor: c.surfaceCard }]}>
      <View style={s.cardHead}>
        <View style={s.cardHeadText}>
          <Text style={[s.itemName, { color: c.textPrimary }]}>{step.name}</Text>
          {step.description ? (
            <Text style={[s.itemDesc, { color: c.textSecondary }]}>{step.description}</Text>
          ) : null}
        </View>
        <StatusGlyph status={step.status} />
      </View>

      {/* Three answers, 44pt minimum targets. */}
      {!inFail && (
        <View style={s.answerRow}>
          <TouchableOpacity
            onPress={() => onAnswer('PASS')}
            disabled={busy}
            style={[
              s.answerBtn,
              {
                backgroundColor: step.status === 'COMPLETE' ? c.successBg : c.surfaceInput,
                borderColor: step.status === 'COMPLETE' ? c.success : c.border,
              },
            ]}
            accessibilityLabel={`Pass ${step.name}`}
            accessibilityRole="button"
          >
            <Text
              style={[
                s.answerText,
                { color: step.status === 'COMPLETE' ? c.success : c.textSecondary },
              ]}
            >
              Pass
            </Text>
          </TouchableOpacity>

          {/* The ONLY red in this screen. Section 15. */}
          <TouchableOpacity
            onPress={() => onAnswer('FAIL')}
            disabled={busy}
            style={[
              s.answerBtn,
              {
                backgroundColor: step.status === 'FAILED' ? c.dangerBg : c.surfaceInput,
                borderColor: step.status === 'FAILED' ? c.danger : c.border,
              },
            ]}
            accessibilityLabel={`Fail ${step.name}`}
            accessibilityRole="button"
          >
            <Text
              style={[s.answerText, { color: step.status === 'FAILED' ? c.danger : c.textSecondary }]}
            >
              Fail
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => onAnswer('NA')}
            disabled={busy}
            style={[
              s.answerBtn,
              {
                backgroundColor: step.status === 'SKIPPED' ? c.mutedBg : c.surfaceInput,
                borderColor: step.status === 'SKIPPED' ? c.textMuted : c.border,
              },
            ]}
            accessibilityLabel={`Mark ${step.name} not applicable`}
            accessibilityRole="button"
          >
            <Text style={[s.answerText, { color: c.textSecondary }]}>N/A</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* A failed item requires a note and offers photo capture. */}
      {inFail && draft && (
        <View style={[s.failBox, { borderTopColor: c.border }]}>
          <Text style={[s.failHeader, { color: c.danger }]}>What is wrong?</Text>

          <TextInput
            value={draft.note}
            onChangeText={onNoteChange}
            multiline
            autoFocus
            style={[
              s.noteInput,
              { color: c.textPrimary, backgroundColor: c.surfaceInput, borderColor: c.border },
            ]}
            placeholderTextColor={c.textMuted}
            placeholder="e.g. Left rear tyre at 40 psi, sidewall scuffed"
            textAlignVertical="top"
          />
          {!noteOk && (
            <Text style={[s.helper, { color: c.textTertiary }]}>
              {inspectionCopy.noteRequired(minNoteLength)}
            </Text>
          )}

          <View style={s.photoRow}>
            {draft.photos.map((photo, idx) => (
              <View key={idx} style={s.photoThumbWrap}>
                <Image source={{ uri: photo.uri }} style={s.photoThumb} contentFit="cover" />
                <TouchableOpacity
                  onPress={() => onRemovePhoto(idx)}
                  style={[s.photoRemove, { backgroundColor: c.danger }]}
                  accessibilityLabel={`Remove photo ${idx + 1}`}
                  accessibilityRole="button"
                >
                  <X color="#fff" size={10} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            ))}

            {draft.photos.length < MAX_PHOTOS && (
              <TouchableOpacity
                onPress={onAddPhoto}
                disabled={draft.isUploadingPhoto}
                style={[s.photoAdd, { borderColor: c.border, backgroundColor: c.surfaceInput }]}
                accessibilityLabel="Add photo"
                accessibilityRole="button"
              >
                {draft.isUploadingPhoto ? (
                  <ActivityIndicator size="small" color={c.brand} />
                ) : (
                  <Text style={[s.photoAddText, { color: c.brand }]}>+ Photo</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          <Text style={[s.helper, { color: c.textTertiary }]}>
            {draft.offlinePhoto
              ? inspectionCopy.photoOfflineWarning
              : inspectionCopy.photoUploadedNow}
          </Text>

          <View style={s.failActions}>
            <TouchableOpacity
              onPress={onCancelFail}
              style={s.textBtn}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
            >
              <Text style={{ color: c.textSecondary, fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSubmitFail}
              disabled={!noteOk || busy || draft.isUploadingPhoto}
              style={[
                s.failSubmit,
                { backgroundColor: c.danger },
                (!noteOk || busy || draft.isUploadingPhoto) && s.disabled,
              ]}
              accessibilityLabel="Record this failure"
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.failSubmitText}>Record failure</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Styles — iOS dark aesthetic via useThemeColors(), spacing on 8/12/16/20/24
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  errorText: { fontSize: 15, textAlign: 'center' },
  secondaryBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, minHeight: 44, justifyContent: 'center' },
  textBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },

  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  topBarCenter: { flex: 1, minWidth: 0 },
  topBarTitle: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  topBarSub: { fontSize: 13, flexShrink: 1 },
  topBarCounter: { fontSize: 14, fontWeight: '600' },

  progressTrack: { height: 4, width: '100%' },
  progressFill: { height: 4 },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20, gap: 12 },

  sectionKicker: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionTitle: { fontSize: 26, fontWeight: '700', lineHeight: 32 },
  reviewSummary: { fontSize: 15, lineHeight: 22 },
  warningText: { fontSize: 14, lineHeight: 20, paddingTop: 8 },

  card: { borderRadius: 14, padding: 16, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardHeadText: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 17, fontWeight: '600', flexShrink: 1 },
  itemDesc: { fontSize: 14, lineHeight: 20, marginTop: 4, flexShrink: 1 },

  answerRow: { flexDirection: 'row', gap: 8 },
  answerBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerText: { fontSize: 15, fontWeight: '600' },

  failBox: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 12 },
  failHeader: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  noteInput: { minHeight: 88, borderRadius: 10, borderWidth: 1, padding: 12, fontSize: 15 },
  helper: { fontSize: 13, lineHeight: 18 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoThumbWrap: { width: 72, height: 72 },
  photoThumb: { width: 72, height: 72, borderRadius: 10 },
  photoRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAdd: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddText: { fontSize: 13, fontWeight: '600' },
  failActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  failSubmit: { minHeight: 44, borderRadius: 10, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  failSubmitText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  reviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 12, padding: 12 },
  reviewRowText: { flex: 1, minWidth: 0 },
  reviewName: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  reviewNote: { fontSize: 14, lineHeight: 20, marginTop: 2, flexShrink: 1 },
  reviewMeta: { fontSize: 12, marginTop: 4 },

  footer: { paddingHorizontal: 16, paddingTop: 12 },
  primaryBtn: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
})
