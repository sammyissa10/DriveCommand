import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import Toast from 'react-native-toast-message'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Camera,
  ChevronLeft,
  Clock,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react-native'
import { ownerImportsApi, type ImportListItem } from '@drivecommand/api-client'
import { useAuthContext } from '../../../context/AuthContext'
import { AnimatedScreen } from '../../../components/ui/AnimatedScreen'
import { haptic } from '../../../lib/haptics'
import {
  MAX_IMPORT_BYTES,
  mimeFromUri,
  nextStagedId,
  sizeOf,
  uploadImportPage,
  type StagedPage,
} from '../../../lib/document-import'
import { useThemeColors, radii, spacing, typography } from '../../../constants/tokens'

/**
 * Import document — source selection and multi-page staging (spec Section 4.1,
 * screens 1 and 2).
 *
 * REORDER IS BUTTONS, NOT DRAG. `react-native-gesture-handler` is not installed
 * in this app and this phase may not install anything (audit D4, option A). Two
 * 44px arrows per row meet the touch-target rule outright, work inside a scroll
 * view with no gesture arbitration, and are usable in gloves at 5:30am — which
 * is the actual scenario. The web side does have real drag, because dnd-kit is
 * already there.
 *
 * The array order of `pages` IS the page order. It is uploaded in that order
 * and posted as an ordered key list, which is the single representation the
 * server stores.
 */

const TOUCH = 44

export default function NewImportScreen() {
  const c = useThemeColors()
  const router = useRouter()
  const { token } = useAuthContext()

  const [pages, setPages] = useState<StagedPage[]>([])
  const [busy, setBusy] = useState(false)
  const [uploaded, setUploaded] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState<{
    message: string
    importId: string
    createdTripId: string | null
  } | null>(null)

  const [recent, setRecent] = useState<ImportListItem[] | null>(null)
  const [showRecent, setShowRecent] = useState(false)
  const retakeIndex = useRef<number | null>(null)

  useEffect(() => {
    if (!token) return
    ownerImportsApi
      .listRecent(token)
      .then(setRecent)
      .catch(() => setRecent([]))
  }, [token])

  // -------------------------------------------------------------------------
  // Adding pages
  // -------------------------------------------------------------------------

  const addFromAsset = useCallback(
    async (uri: string, nameHint: string, mimeHint?: string) => {
      const sizeBytes = await sizeOf(uri)
      if (sizeBytes > MAX_IMPORT_BYTES) {
        setError(`"${nameHint}" is larger than 25MB.`)
        return null
      }
      return {
        id: nextStagedId(),
        uri,
        name: nameHint,
        mimeType: mimeHint ?? mimeFromUri(uri),
        sizeBytes,
      } satisfies StagedPage
    },
    [],
  )

  async function takePhotos() {
    haptic.light()
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      Toast.show({ type: 'error', text1: 'Camera access needed', text2: 'Allow it in Settings.' })
      return
    }

    // One shot per launch is how the native camera works. The user comes
    // straight back to staging and taps Add page for the next one, which is
    // also how they photograph a manifest — page, page, page.
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.8 })
    if (result.canceled) return
    const asset = result.assets[0]
    if (!asset) return

    const staged = await addFromAsset(asset.uri, `page-${Date.now()}.jpg`, 'image/jpeg')
    if (staged) {
      setError(null)
      setDuplicate(null)
      if (retakeIndex.current !== null) {
        const at = retakeIndex.current
        retakeIndex.current = null
        setPages((prev) => prev.map((p, i) => (i === at ? staged : p)))
      } else {
        setPages((prev) => [...prev, staged])
      }
    }
  }

  async function pickFromLibrary() {
    haptic.light()
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      Toast.show({ type: 'error', text1: 'Photo access needed', text2: 'Allow it in Settings.' })
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.8,
      allowsMultipleSelection: true,
    })
    if (result.canceled) return

    const staged: StagedPage[] = []
    for (const asset of result.assets) {
      const s = await addFromAsset(asset.uri, asset.fileName ?? `page-${Date.now()}.jpg`)
      if (s) staged.push(s)
    }
    if (staged.length) {
      setError(null)
      setDuplicate(null)
      setPages((prev) => [...prev, ...staged])
    }
  }

  async function pickDocument() {
    haptic.light()
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'text/csv', 'text/comma-separated-values', 'image/*'],
      multiple: true,
      copyToCacheDirectory: true,
    })
    if (result.canceled) return

    const staged: StagedPage[] = []
    for (const asset of result.assets) {
      const s = await addFromAsset(
        asset.uri,
        asset.name ?? `document-${Date.now()}`,
        asset.mimeType ?? mimeFromUri(asset.name ?? ''),
      )
      if (s) staged.push(s)
    }
    if (staged.length) {
      setError(null)
      setDuplicate(null)
      setPages((prev) => [...prev, ...staged])
    }
  }

  function move(index: number, delta: number) {
    const to = index + delta
    if (to < 0 || to >= pages.length) return
    haptic.light()
    setPages((prev) => {
      const copy = [...prev]
      const [moved] = copy.splice(index, 1)
      copy.splice(to, 0, moved)
      return copy
    })
  }

  function remove(index: number) {
    haptic.light()
    setPages((prev) => prev.filter((_, i) => i !== index))
  }

  function retake(index: number) {
    retakeIndex.current = index
    void takePhotos()
  }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  async function submit(mode: 'new' | 'correction' = 'new') {
    if (!token || pages.length === 0 || busy) return
    haptic.medium()
    setBusy(true)
    setError(null)
    setDuplicate(null)
    setUploaded(0)

    try {
      const keys: string[] = []
      for (const [i, page] of pages.entries()) {
        try {
          const key = await uploadImportPage(token, page)
          keys.push(key)
          setPages((prev) => prev.map((p, j) => (j === i ? { ...p, storageKey: key, error: undefined } : p)))
          setUploaded(i + 1)
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Upload failed'
          setPages((prev) => prev.map((p, j) => (j === i ? { ...p, error: message } : p)))
          throw new Error(
            `Page ${i + 1} did not upload. Nothing else was lost — tap Read document to try again.`,
          )
        }
      }

      const result = await ownerImportsApi.create(token, keys, mode)
      if (!result.ok) {
        setDuplicate({
          message: result.duplicate.error,
          importId: result.duplicate.duplicate.importId,
          createdTripId: result.duplicate.duplicate.createdTripId,
        })
        return
      }

      router.replace(`/(owner)/imports/${result.importId}?start=1` as never)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  // -------------------------------------------------------------------------

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['bottom', 'left', 'right']}>
      <AnimatedScreen>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl * 2 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={{ width: TOUCH, height: TOUCH, marginLeft: -spacing.md, alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronLeft color={c.brand} size={26} />
            </Pressable>
          </View>

          <Text style={{ ...typography.largeTitle, color: c.textPrimary }}>Import document</Text>
          <Text style={{ ...typography.footnote, color: c.textSecondary, marginTop: spacing.xs }}>
            Photograph the manifest a page at a time, or pick a PDF or CSV. Pages can be arranged
            before it is read.
          </Text>

          {/* Screen 1 — sources */}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg }}>
            <SourceTile icon={Camera} label="Take photos" onPress={takePhotos} disabled={busy} c={c} />
            <SourceTile icon={Upload} label="Upload file" onPress={pickDocument} disabled={busy} c={c} />
            <SourceTile
              icon={Clock}
              label="Choose recent"
              onPress={() => {
                haptic.light()
                setShowRecent((v) => !v)
              }}
              disabled={busy || !recent?.length}
              active={showRecent}
              c={c}
            />
          </View>

          <Pressable
            onPress={pickFromLibrary}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Choose photos from the library"
            style={{ minHeight: TOUCH, justifyContent: 'center', marginTop: spacing.sm }}
          >
            <Text style={{ ...typography.subhead, color: c.brand, textAlign: 'center' }}>
              Choose photos from the library
            </Text>
          </Pressable>

          {showRecent && recent?.length ? (
            <View style={{ marginTop: spacing.md, borderRadius: radii.lg, backgroundColor: c.surfaceCard, overflow: 'hidden' }}>
              {recent.map((r, i) => (
                <Pressable
                  key={r.id}
                  onPress={() => router.push(`/(owner)/imports/${r.id}` as never)}
                  style={{
                    minHeight: 56,
                    paddingHorizontal: spacing.lg,
                    paddingVertical: spacing.md,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: spacing.md,
                    borderTopWidth: i === 0 ? 0 : 1,
                    borderTopColor: c.divider,
                  }}
                >
                  <FileText color={c.textSecondary} size={16} />
                  <Text numberOfLines={1} style={{ ...typography.subhead, color: c.textPrimary, flex: 1 }}>
                    {r.originalName ?? 'Untitled document'}
                  </Text>
                  <Text style={{ ...typography.caption1, color: c.textTertiary }}>
                    {r.status.replace(/_/g, ' ').toLowerCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Screen 2 — staging */}
          {pages.length > 0 ? (
            <View style={{ marginTop: spacing.xl }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
                <Text style={{ ...typography.headline, color: c.textPrimary }}>
                  {pages.length} page{pages.length === 1 ? '' : 's'}
                </Text>
                <Text style={{ ...typography.caption1, color: c.textTertiary }}>
                  Arrows reorder
                </Text>
              </View>

              {pages.map((page, index) => (
                <PageRow
                  key={page.id}
                  page={page}
                  index={index}
                  total={pages.length}
                  disabled={busy}
                  onUp={() => move(index, -1)}
                  onDown={() => move(index, 1)}
                  onRetake={() => retake(index)}
                  onRemove={() => remove(index)}
                  c={c}
                />
              ))}
            </View>
          ) : null}

          {/* Inline notices — never a modal (spec Section 15) */}
          {error ? (
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.md,
                marginTop: spacing.lg,
                padding: spacing.lg,
                borderRadius: radii.lg,
                backgroundColor: c.dangerBg,
              }}
            >
              <AlertTriangle color={c.danger} size={18} />
              <Text style={{ ...typography.subhead, color: c.textPrimary, flex: 1 }}>{error}</Text>
            </View>
          ) : null}

          {duplicate ? (
            <View
              style={{
                marginTop: spacing.lg,
                padding: spacing.lg,
                borderRadius: radii.lg,
                backgroundColor: c.warningBg,
                gap: spacing.md,
              }}
            >
              <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}>
                {duplicate.message}
              </Text>
              <Text style={{ ...typography.footnote, color: c.textSecondary }}>
                {duplicate.createdTripId
                  ? 'A trip was already created from it. Open the import to see that trip, or import this again as a correction — the earlier import steps aside and this one takes its place.'
                  : 'Open what is already there, or import this again as a correction — the earlier import steps aside and this one takes its place.'}
              </Text>
              <Pressable
                onPress={() => router.replace(`/(owner)/imports/${duplicate.importId}` as never)}
                style={{
                  minHeight: TOUCH,
                  borderRadius: radii.md,
                  backgroundColor: c.surfaceElevated,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}>
                  Open the existing import
                </Text>
              </Pressable>
              <Pressable
                onPress={() => submit('correction')}
                disabled={busy}
                style={{
                  minHeight: TOUCH,
                  borderRadius: radii.md,
                  backgroundColor: c.surfaceCard,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ ...typography.subhead, color: c.brand, fontWeight: '600' }}>
                  Import as a correction
                </Text>
              </Pressable>
            </View>
          ) : null}

          {busy ? (
            <View style={{ marginTop: spacing.lg }}>
              <Text style={{ ...typography.footnote, color: c.textSecondary, marginBottom: spacing.sm }}>
                Uploading page {Math.min(uploaded + 1, pages.length)} of {pages.length}
              </Text>
              <View style={{ height: 6, borderRadius: radii.full, backgroundColor: c.surfaceElevated, overflow: 'hidden' }}>
                <View
                  style={{
                    width: `${(uploaded / Math.max(pages.length, 1)) * 100}%`,
                    height: '100%',
                    backgroundColor: c.brand,
                  }}
                />
              </View>
            </View>
          ) : null}

          <Pressable
            onPress={() => submit('new')}
            disabled={pages.length === 0 || busy}
            accessibilityRole="button"
            accessibilityLabel="Read document"
            style={{
              marginTop: spacing.xl,
              minHeight: 52,
              borderRadius: radii.md,
              backgroundColor: pages.length === 0 || busy ? c.brandDark : c.brand,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: spacing.sm,
              opacity: pages.length === 0 ? 0.5 : 1,
            }}
          >
            {busy ? <ActivityIndicator color="#ffffff" size="small" /> : null}
            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16 }}>Read document</Text>
          </Pressable>
        </ScrollView>
      </AnimatedScreen>
    </SafeAreaView>
  )
}

// ---------------------------------------------------------------------------

type Colors = ReturnType<typeof useThemeColors>

function SourceTile({
  icon: Icon,
  label,
  onPress,
  disabled,
  active,
  c,
}: {
  icon: typeof Camera
  label: string
  onPress: () => void
  disabled?: boolean
  active?: boolean
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
        minHeight: 88,
        borderRadius: radii.lg,
        backgroundColor: c.surfaceCard,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        padding: spacing.md,
        opacity: disabled ? 0.4 : 1,
        borderWidth: active ? 1.5 : 0,
        borderColor: c.brand,
      }}
    >
      <Icon color={c.brand} size={22} />
      <Text style={{ ...typography.caption1, color: c.textPrimary, textAlign: 'center' }}>{label}</Text>
    </Pressable>
  )
}

function PageRow({
  page,
  index,
  total,
  disabled,
  onUp,
  onDown,
  onRetake,
  onRemove,
  c,
}: {
  page: StagedPage
  index: number
  total: number
  disabled: boolean
  onUp: () => void
  onDown: () => void
  onRetake: () => void
  onRemove: () => void
  c: Colors
}) {
  const isImage = page.mimeType.startsWith('image/')
  const Icon = page.mimeType.includes('csv') ? FileSpreadsheet : FileText

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radii.lg,
        backgroundColor: c.surfaceCard,
        marginBottom: spacing.sm,
      }}
    >
      <View style={{ gap: 2 }}>
        <Pressable
          onPress={onUp}
          disabled={disabled || index === 0}
          accessibilityRole="button"
          accessibilityLabel={`Move page ${index + 1} up`}
          style={{
            width: TOUCH,
            height: TOUCH / 2 + 2,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: index === 0 ? 0.25 : 1,
          }}
        >
          <ArrowUp color={c.textSecondary} size={18} />
        </Pressable>
        <Pressable
          onPress={onDown}
          disabled={disabled || index === total - 1}
          accessibilityRole="button"
          accessibilityLabel={`Move page ${index + 1} down`}
          style={{
            width: TOUCH,
            height: TOUCH / 2 + 2,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: index === total - 1 ? 0.25 : 1,
          }}
        >
          <ArrowDown color={c.textSecondary} size={18} />
        </Pressable>
      </View>

      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: radii.sm,
          backgroundColor: c.background,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isImage ? (
          <Image source={{ uri: page.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <Icon color={c.textSecondary} size={22} />
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}>
          Page {index + 1}
        </Text>
        <Text numberOfLines={1} style={{ ...typography.caption1, color: c.textSecondary }}>
          {page.error ?? page.name}
        </Text>
      </View>

      <Pressable
        onPress={onRetake}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Retake page ${index + 1}`}
        style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}
      >
        <RefreshCw color={c.textSecondary} size={17} />
      </Pressable>
      <Pressable
        onPress={onRemove}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Remove page ${index + 1}`}
        style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}
      >
        <Trash2 color={c.textTertiary} size={17} />
      </Pressable>
    </View>
  )
}
