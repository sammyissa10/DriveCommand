import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import Toast from 'react-native-toast-message'
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronLeft,
  FileText,
  Info,
  RefreshCw,
} from 'lucide-react-native'
import { ownerImportsApi, type ImportView } from '@drivecommand/api-client'
import { useAuthContext } from '../../../context/AuthContext'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { ImportResolutionCard } from '../../../components/imports/ImportResolution'
import { haptic } from '../../../lib/haptics'
import {
  mimeFromUri,
  nextStagedId,
  sizeOf,
  uploadImportPage,
} from '../../../lib/document-import'
import { useThemeColors, radii, spacing, typography } from '../../../constants/tokens'

/**
 * Extraction progress and the summary card (spec Section 4.1, screens 2 and 3).
 *
 * BACKGROUNDING. Every number on this screen comes from the server, read from
 * the `document_import_pages` rows written as each page settles. So the phone
 * going to sleep, the OS killing the fetch, or the user switching apps costs
 * nothing: on return, the AppState listener re-reads the truth, and if the run
 * stalled, "Keep reading" resumes from the last page that landed rather than
 * paying for the whole document again.
 */

const POLL_MS = 2000
const TOUCH = 44

export default function ImportDetailScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const { token } = useAuthContext()
  const { id, start } = useLocalSearchParams<{ id: string; start?: string }>()

  const [view, setView] = useState<ImportView | null>(null)
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const started = useRef(false)

  const inFlight = view?.status === 'UPLOADED' || view?.status === 'EXTRACTING'

  const refresh = useCallback(async () => {
    if (!token || !id) return
    try {
      setView(await ownerImportsApi.get(token, id))
    } catch {
      /* a failed poll is not worth a toast — the next one will land */
    }
  }, [token, id])

  const extract = useCallback(async () => {
    if (!token || !id) return
    setWorking(true)
    setNotice(null)
    try {
      const result = await ownerImportsApi.extract(token, id)
      if (result.import) setView(result.import)
      else await refresh()
    } catch {
      // The request died; the server may still be working. Never say the pages
      // were lost — they were not.
      setNotice('Lost contact while reading. Checking where it got to…')
      await refresh()
    } finally {
      setWorking(false)
    }
  }, [token, id, refresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // Start reading once, when arriving from the staging screen.
  useEffect(() => {
    if (start !== '1' || started.current || !view) return
    if (view.status !== 'UPLOADED') return
    started.current = true
    void extract()
  }, [start, view, extract])

  useEffect(() => {
    if (!inFlight) return
    const t = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(t)
  }, [inFlight, refresh])

  // Coming back from the background re-reads immediately rather than waiting
  // for the next tick — the user wants to know where it got to now.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh()
    })
    return () => sub.remove()
  }, [refresh])

  async function cancel() {
    if (!token || !id) return
    haptic.medium()
    setWorking(true)
    try {
      await ownerImportsApi.cancel(token, id)
      await refresh()
    } finally {
      setWorking(false)
    }
  }

  async function reshoot(pageNumber: number) {
    if (!token || !id) return
    haptic.light()

    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Toast.show({ type: 'error', text1: 'Camera access needed', text2: 'Allow it in Settings.' })
      return
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8 })
    if (result.canceled) return
    const asset = result.assets[0]
    if (!asset) return

    setWorking(true)
    setNotice(null)
    try {
      const key = await uploadImportPage(token, {
        id: nextStagedId(),
        uri: asset.uri,
        name: `page-${pageNumber}-${Date.now()}.jpg`,
        mimeType: mimeFromUri(asset.uri, 'image/jpeg'),
        sizeBytes: await sizeOf(asset.uri),
      })
      await ownerImportsApi.reshootPage(token, id, pageNumber, key)
      setNotice(`Page ${pageNumber} replaced. Reading it now — the other pages are already done.`)
      await extract()
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not replace that page.')
    } finally {
      setWorking(false)
    }
  }

  // -------------------------------------------------------------------------

  if (!view) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.brand} />
      </SafeAreaView>
    )
  }

  const pct = view.pageCount > 0 ? (view.pagesDone / view.pageCount) * 100 : 0
  const failedPages = view.pages.filter((p) => p.status === 'failed')

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl * 2 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
            <Pressable
              onPress={() => router.replace('/(owner)' as never)}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={{ width: TOUCH, height: TOUCH, marginLeft: -spacing.md, alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronLeft color={c.brand} size={26} />
            </Pressable>
          </View>

          <Text style={{ ...typography.largeTitle, color: c.textPrimary }}>
            {inFlight ? 'Reading document' : view.status === 'NEEDS_REVIEW' ? 'We found this' : 'Import'}
          </Text>
          {/* What the document is, not what the camera called the file. */}
          <Text numberOfLines={1} style={{ ...typography.footnote, color: c.textSecondary, marginTop: spacing.xs }}>
            {view.summary?.title ?? view.originalName ?? 'Untitled document'}
          </Text>

          {notice ? (
            <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: c.surfaceCard }}>
              <Info color={c.textSecondary} size={18} />
              <Text style={{ ...typography.footnote, color: c.textPrimary, flex: 1 }}>{notice}</Text>
            </View>
          ) : null}

          {/* Extracting */}
          {inFlight ? (
            <View style={{ marginTop: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: c.surfaceCard, gap: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <ActivityIndicator color={c.brand} size="small" />
                  <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}>
                    Reading page {Math.min(view.pagesDone + 1, view.pageCount)} of {view.pageCount}
                  </Text>
                </View>
                <Text style={{ ...typography.footnote, color: c.textSecondary }}>
                  {view.pagesDone}/{view.pageCount}
                </Text>
              </View>

              <View style={{ height: 6, borderRadius: radii.full, backgroundColor: c.surfaceElevated, overflow: 'hidden' }}>
                <View style={{ width: `${pct}%`, height: '100%', backgroundColor: c.brand }} />
              </View>

              <Text style={{ ...typography.caption1, color: c.textTertiary }}>
                This carries on even if you leave the app. Nothing is lost.
              </Text>

              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <ActionRow label="Cancel" onPress={cancel} disabled={working} c={c} />
                <ActionRow label="Keep reading" icon={RefreshCw} onPress={() => void extract()} disabled={working} c={c} />
              </View>
            </View>
          ) : null}

          {/* Failed */}
          {view.status === 'FAILED' ? (
            <View style={{ marginTop: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: c.dangerBg, gap: spacing.md }}>
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <AlertTriangle color={c.danger} size={18} />
                <Text style={{ ...typography.subhead, color: c.textPrimary, flex: 1 }}>
                  {view.failureMessage ?? 'That document could not be read.'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {view.failureCode === 'ZERO_CONSIGNMENTS' ? (
                  <ActionRow
                    label="Take clearer photos"
                    icon={Camera}
                    onPress={() => router.replace('/(owner)/imports/new' as never)}
                    c={c}
                  />
                ) : null}
                <ActionRow label="Try again" icon={RefreshCw} onPress={() => void extract()} disabled={working} c={c} />
              </View>
            </View>
          ) : null}

          {view.status === 'CANCELLED' ? (
            <View style={{ marginTop: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: c.surfaceCard, gap: spacing.md }}>
              <Text style={{ ...typography.subhead, color: c.textPrimary }}>
                This import was cancelled. The pages are still here — reading them again picks up
                where it stopped.
              </Text>
              <ActionRow
                label="Start a new import"
                onPress={() => router.replace('/(owner)/imports/new' as never)}
                c={c}
              />
            </View>
          ) : null}

          {/* One bad page, not sixteen */}
          {failedPages.length > 0 ? (
            <View style={{ marginTop: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: c.warningBg, gap: spacing.md }}>
              <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}>
                {failedPages.length} page{failedPages.length === 1 ? '' : 's'} could not be read. The
                rest went through.
              </Text>
              {failedPages.map((p) => (
                <View key={p.pageNumber} style={{ gap: spacing.sm }}>
                  <Text style={{ ...typography.footnote, color: c.textSecondary }}>
                    Page {p.pageNumber} — {p.failureMessage ?? 'unreadable'}
                  </Text>
                  <Pressable
                    onPress={() => reshoot(p.pageNumber)}
                    disabled={working}
                    accessibilityRole="button"
                    accessibilityLabel={`Re-shoot page ${p.pageNumber}`}
                    style={{
                      minHeight: TOUCH,
                      borderRadius: radii.md,
                      backgroundColor: c.surfaceElevated,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: spacing.sm,
                    }}
                  >
                    <Camera color={c.brand} size={17} />
                    <Text style={{ ...typography.subhead, color: c.brand, fontWeight: '600' }}>
                      Re-shoot page {p.pageNumber}
                    </Text>
                  </Pressable>
                </View>
              ))}
              <Text style={{ ...typography.caption1, color: c.textTertiary }}>
                Only the replaced page is read again — the others are already done.
              </Text>
            </View>
          ) : null}

          {/* The summary card, or the one question standing in its way.
              `ImportResolutionCard` decides which: an unresolved client or
              contract takes the screen to itself, and the card is drawn once
              neither does (spec Section 4.2). */}
          {view.status === 'NEEDS_REVIEW' && view.summary && token ? (
            <>
              <ImportResolutionCard token={token} view={view} onChange={setView} />

              {/* What the document said, underneath the card that says what it
                  means — and only once the card is what is on screen. While a
                  decision step is up, the rule is one question and nothing else
                  competing with it. */}
              {view.resolution?.resolved ? (
                <View style={{ marginTop: spacing.lg, padding: spacing.lg, borderRadius: radii.lg, borderWidth: 1, borderColor: c.divider, gap: spacing.sm }}>
                  <Text style={{ ...typography.caption1, color: c.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    On the document
                  </Text>
                  <SummaryRow
                    label="Type"
                    value={view.summary.documentType?.replace(/_/g, ' ').toLowerCase() ?? '—'}
                    c={c}
                  />
                  <SummaryRow label="Number" value={view.summary.documentNumber ?? '—'} c={c} />
                  {view.summary.totalPieces != null ? (
                    <SummaryRow label="Pieces" value={String(view.summary.totalPieces)} c={c} />
                  ) : null}
                  {view.summary.originName ? (
                    <SummaryRow label="Named on it" value={view.summary.originName} c={c} />
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}

          {/* Pages */}
          <Text style={{ ...typography.headline, color: c.textPrimary, marginTop: spacing.xl, marginBottom: spacing.sm }}>
            {view.pageCount} page{view.pageCount === 1 ? '' : 's'}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {view.pages.map((p) => (
              <View
                key={p.pageNumber}
                style={{
                  width: 84,
                  borderRadius: radii.sm,
                  overflow: 'hidden',
                  backgroundColor: c.surfaceCard,
                  borderWidth: p.status === 'failed' ? 1.5 : 0,
                  borderColor: c.danger,
                }}
              >
                <View style={{ height: 100, alignItems: 'center', justifyContent: 'center' }}>
                  {p.previewUrl ? (
                    <Image source={{ uri: p.previewUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                  ) : (
                    <FileText color={c.textSecondary} size={20} />
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm, paddingVertical: 6 }}>
                  <Text style={{ ...typography.caption1, color: c.textSecondary }}>{p.pageNumber}</Text>
                  {p.status === 'done' ? (
                    <CheckCircle2 color={c.success} size={13} />
                  ) : p.status === 'failed' ? (
                    <AlertTriangle color={c.danger} size={13} />
                  ) : (
                    <Text style={{ ...typography.caption1, color: c.textTertiary }}>…</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------

type Colors = ReturnType<typeof useThemeColors>

function ActionRow({
  label,
  icon: Icon,
  onPress,
  disabled,
  c,
}: {
  label: string
  icon?: typeof RefreshCw
  onPress: () => void
  disabled?: boolean
  c: Colors
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flex: 1,
        minHeight: TOUCH,
        borderRadius: radii.md,
        backgroundColor: c.surfaceElevated,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: spacing.sm,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {Icon ? <Icon color={c.textSecondary} size={16} /> : null}
      <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  )
}

function SummaryRow({ label, value, c }: { label: string; value: string; c: Colors }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
      <Text style={{ ...typography.subhead, color: c.textSecondary }}>{label}</Text>
      <Text numberOfLines={1} style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600', flexShrink: 1 }}>
        {value}
      </Text>
    </View>
  )
}
