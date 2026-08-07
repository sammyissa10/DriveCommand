import React, { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Info,
  Lock,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react-native'
import {
  ownerImportsApi,
  type BulkAppliedField,
  type RequiredDocument,
  type StopBulkInput,
  type StopLineItem,
  type StopReference,
  type StopReferenceType,
  type StopReviewRow,
  type StopReviewView,
  type StopType,
} from '@drivecommand/api-client'
import { BottomSheet } from '../ui/BottomSheet'
import { haptic } from '../../lib/haptics'
import { useThemeColors, radii, spacing, typography } from '../../constants/tokens'

/**
 * Stop review on the phone (spec Section 10).
 *
 * Same server, same view, same blocks as the web screen — `getStopReview`
 * decides what is on the list and what is disabled, so the two surfaces cannot
 * disagree about whether a document is ready. What differs here is the
 * rendering: 44px targets, a bottom sheet instead of an inline editor, and
 * arrows instead of a drag.
 *
 * ---------------------------------------------------------------------------
 * REORDER IS ARROWS, NOT A DRAG — AND THAT IS A STATED DEVIATION
 * ---------------------------------------------------------------------------
 * Phase 5's prompt says "reorder via the existing gesture handler on mobile".
 * There is no gesture handler in this app. `react-native-gesture-handler` is not
 * in `apps/mobile/package.json`, is not hoisted to the root, and this phase may
 * not install anything (spec Section 15: *"Stack: locked… If a capability
 * genuinely is not there, flag it rather than installing"*). Audit D4 found the
 * same gap and recommended arrows; Phase 2's staging screen already shipped
 * them for page order.
 *
 * So: two 44px arrows per row. They meet the touch-target rule outright, they
 * need no gesture arbitration inside a `FlashList`, and they work in gloves at
 * 5:30am. What they send is the identical full permutation the browser's drag
 * sends, so the persistence and the validation are the same code.
 *
 * ---------------------------------------------------------------------------
 * BULK APPLY OPERATES ON THE SELECTION
 * ---------------------------------------------------------------------------
 * `selected` is a Set of stop indexes held here and sent verbatim. `FlashList`
 * recycles rows aggressively — a row scrolled out of view is genuinely unmounted
 * — and that is exactly why the selection must not live in the rows. It does
 * not: unmounting a row changes nothing about the Set, and the server acts on
 * every index in it.
 */

const TOUCH = 44

type Colors = ReturnType<typeof useThemeColors>

const STOP_TYPES: StopType[] = ['pickup', 'delivery', 'fuel_stop', 'layover', 'relay_handoff']

const STOP_TYPE_LABEL: Record<StopType, string> = {
  pickup: 'Pickup',
  delivery: 'Delivery',
  fuel_stop: 'Fuel stop',
  layover: 'Layover',
  relay_handoff: 'Relay handoff',
}

const REFERENCE_TYPES: StopReferenceType[] = [
  'SHIPMENT',
  'PRO',
  'ORDER',
  'PO',
  'BOL',
  'LOAD',
  'SEAL',
  'OTHER',
]

const BULK_FIELD_LABEL: Record<BulkAppliedField, string> = {
  notes: 'note',
  requiredDocuments: 'required documents',
  appointment: 'appointment window',
  stopType: 'stop type',
  totals: 'quantities',
}

// ---------------------------------------------------------------------------

export function StopReview({
  token,
  importId,
  initial,
  title,
}: {
  token: string
  importId: string
  initial: StopReviewView
  title: string
}) {
  const c = useThemeColors()
  const [view, setView] = useState<StopReviewView>(initial)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [warningsOpen, setWarningsOpen] = useState(true)
  const [detail, setDetail] = useState<number | null>(null)
  const [bulkPanel, setBulkPanel] = useState<BulkPanel>(null)
  const [pending, setPending] = useState<{ input: StopBulkInput; question: string } | null>(null)

  const selectedList = useMemo(() => Array.from(selected).sort((a, b) => a - b), [selected])
  const blockedIndexes = useMemo(
    () => new Set(view.blocks.flatMap((b) => b.stopIndexes)),
    [view.blocks],
  )

  const refresh = useCallback(async () => {
    try {
      setView(await ownerImportsApi.getStopReview(token, importId))
    } catch {
      /* a failed refresh leaves the last good view — never blank the screen */
    }
  }, [token, importId])

  const toggle = useCallback((index: number) => {
    haptic.light()
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  /**
   * Move one stop one position, and send the whole permutation.
   *
   * The selection is remapped through the same permutation, so the stops a
   * person picked are still the stops that are picked — losing the selection on
   * every move would make "select, reorder, bulk apply" impossible on a phone,
   * where a reorder is several taps rather than one drag.
   */
  async function move(from: number, direction: -1 | 1) {
    const to = from + direction
    if (to < 0 || to >= view.stops.length) return
    haptic.light()

    const moved = [...view.stops]
    const [row] = moved.splice(from, 1)
    moved.splice(to, 0, row)
    const order = moved.map((s) => s.index)

    const previous = view
    setView({ ...view, stops: moved.map((s, i) => ({ ...s, sequence: i + 1 })) })

    setBusy(true)
    setError(null)
    try {
      setView(await ownerImportsApi.reorderStops(token, importId, order))
      setSelected(
        new Set(
          selectedList.map((oldIndex) => order.indexOf(oldIndex)).filter((i) => i >= 0),
        ),
      )
    } catch (e) {
      setView(previous)
      setError(e instanceof Error ? e.message : 'Could not save the new order.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmBulk() {
    if (!pending) return
    haptic.medium()
    setBusy(true)
    setError(null)
    try {
      const result = await ownerImportsApi.bulkApplyStops(
        token,
        importId,
        selectedList,
        pending.input,
      )
      setView(result.view)
      const skipped = result.skipped.length
      setNotice(
        skipped === 0
          ? `Applied to ${result.applied} stop${result.applied === 1 ? '' : 's'}.`
          : `Applied to ${result.applied} of ${selectedList.length}. Stop${skipped === 1 ? '' : 's'} ${result.skipped
              .map((i) => i + 1)
              .join(', ')} had nothing to change.`,
      )
      setPending(null)
      setBulkPanel(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply that.')
    } finally {
      setBusy(false)
    }
  }

  const detailRow = detail !== null ? view.stops.find((s) => s.index === detail) ?? null : null

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <FlashList
        data={view.stops}
        keyExtractor={(item) => String(item.index)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 200 }}
        ListHeaderComponent={
          <View style={{ gap: spacing.md, marginBottom: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={{ ...typography.largeTitle, color: c.textPrimary }}>Stops</Text>
                <Text numberOfLines={1} style={{ ...typography.footnote, color: c.textSecondary }}>
                  {title}
                </Text>
              </View>
              <Text style={{ ...typography.title1, color: c.textTertiary }}>{view.total}</Text>
            </View>

            <Text style={{ ...typography.footnote, color: c.textSecondary }}>{view.note}</Text>

            {/* One dismissible summary. Never a modal (Section 10). */}
            {view.warnings.length > 0 && warningsOpen ? (
              <View
                style={{
                  flexDirection: 'row',
                  gap: spacing.md,
                  padding: spacing.lg,
                  borderRadius: radii.lg,
                  backgroundColor: c.surfaceCard,
                }}
              >
                <Info color={c.textSecondary} size={16} />
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}>
                    {view.warnings.length} thing{view.warnings.length === 1 ? '' : 's'} worth a look.
                    None of them stops you.
                  </Text>
                  {view.warnings.map((w) => (
                    <Text key={w.code} style={{ ...typography.caption1, color: c.textSecondary }}>
                      {w.message}
                    </Text>
                  ))}
                </View>
                <Pressable
                  onPress={() => setWarningsOpen(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss warnings"
                  hitSlop={12}
                  style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
                >
                  <X color={c.textTertiary} size={16} />
                </Pressable>
              </View>
            ) : null}

            {error ? <Banner text={error} tone="danger" onClose={() => setError(null)} c={c} /> : null}
            {notice ? <Banner text={notice} tone="info" onClose={() => setNotice(null)} c={c} /> : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Pressable
                onPress={() =>
                  setSelected(
                    selected.size === view.stops.length
                      ? new Set()
                      : new Set(view.stops.map((s) => s.index)),
                  )
                }
                accessibilityRole="button"
                accessibilityLabel={
                  selected.size === view.stops.length ? 'Clear selection' : 'Select every stop'
                }
                style={{ minHeight: TOUCH, justifyContent: 'center', paddingRight: spacing.sm }}
              >
                <Text style={{ ...typography.footnote, color: c.brand, fontWeight: '600' }}>
                  {selected.size === view.stops.length ? 'Clear all' : 'Select all'}
                </Text>
              </Pressable>
              <Text style={{ ...typography.caption1, color: c.textTertiary, flex: 1 }}>
                {selected.size > 0
                  ? `${selected.size} selected`
                  : 'Select stops to change several at once'}
              </Text>
              {busy ? <ActivityIndicator color={c.textTertiary} size="small" /> : null}
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <StopRow
            row={item}
            position={index}
            total={view.stops.length}
            selected={selected.has(item.index)}
            hasIssue={blockedIndexes.has(item.index)}
            busy={busy}
            onToggle={() => toggle(item.index)}
            onOpen={() => setDetail(item.index)}
            onMove={(d) => void move(index, d)}
            c={c}
          />
        )}
        ListEmptyComponent={
          <Text style={{ ...typography.footnote, color: c.textSecondary, padding: spacing.lg }}>
            No stops were read from this document. Re-shoot the pages from the import screen.
          </Text>
        }
        ListFooterComponent={
          <View style={{ marginTop: spacing.xl, gap: spacing.sm }}>
            <Pressable
              disabled={!view.canProceed || busy}
              accessibilityRole="button"
              accessibilityLabel="Continue"
              accessibilityState={{ disabled: !view.canProceed || busy }}
              style={{
                minHeight: 52,
                borderRadius: radii.md,
                backgroundColor: c.brandDark,
                opacity: !view.canProceed || busy ? 0.5 : 1,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: spacing.sm,
              }}
            >
              <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16 }}>Continue</Text>
              <ArrowRight color="#ffffff" size={17} />
            </Pressable>
            {/* The reason, named inline. Not a toast on press. */}
            <Text style={{ ...typography.caption1, color: c.textTertiary, textAlign: 'center' }}>
              {view.blockedReason ?? 'Route matching and assignment arrive in the next phases.'}
            </Text>
          </View>
        }
      />

      {/* ---- the bulk bar, over the list, fed by the selection ---- */}
      {selectedList.length > 0 ? (
        <BulkBar
          count={selectedList.length}
          panel={bulkPanel}
          setPanel={setBulkPanel}
          onPropose={(input, question) => {
            setBulkPanel(null)
            setPending({ input, question })
          }}
          onClearSelection={() => setSelected(new Set())}
          c={c}
        />
      ) : null}

      {/* Every bulk action confirms with the count and the fields (Section 10). */}
      <BottomSheet
        visible={pending !== null}
        onClose={() => setPending(null)}
        title="Apply to the selection?"
        snapPoint="40%"
      >
        <View style={{ gap: spacing.lg }}>
          <Text style={{ ...typography.subhead, color: c.textPrimary }}>{pending?.question}</Text>
          <Text style={{ ...typography.caption1, color: c.textTertiary }}>
            This applies to all {selectedList.length} selected{' '}
            {selectedList.length === 1 ? 'stop' : 'stops'}, including any scrolled out of view.
          </Text>
          <PrimaryAction
            label={`Apply to ${selectedList.length} stop${selectedList.length === 1 ? '' : 's'}`}
            icon={Check}
            onPress={confirmBulk}
            busy={busy}
            c={c}
          />
          <SecondaryAction label="Cancel" onPress={() => setPending(null)} c={c} />
        </View>
      </BottomSheet>

      {/* ---- the detail editor ---- */}
      <BottomSheet
        visible={detailRow !== null}
        onClose={() => setDetail(null)}
        title={detailRow ? `Stop ${detailRow.sequence}` : ''}
        snapPoint="80%"
      >
        {detailRow ? (
          <StopDetail
            token={token}
            importId={importId}
            row={detailRow}
            onSaved={(next) => setView(next)}
            onFacilityResolved={() => void refresh()}
            c={c}
          />
        ) : null}
      </BottomSheet>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

/**
 * One row: select · sequence · facility name · badge · quantity · references ·
 * two arrows. Exactly what Section 10 draws, plus the reorder control the phone
 * needs instead of a handle.
 *
 * Long names truncate to two lines and the whole value is on the detail sheet a
 * tap away — `numberOfLines` ellipsises rather than clipping, so no glyph is
 * ever cut in half.
 */
function StopRow({
  row,
  position,
  total,
  selected,
  hasIssue,
  busy,
  onToggle,
  onOpen,
  onMove,
  c,
}: {
  row: StopReviewRow
  position: number
  total: number
  selected: boolean
  hasIssue: boolean
  busy: boolean
  onToggle: () => void
  onOpen: () => void
  onMove: (direction: -1 | 1) => void
  c: Colors
}) {
  const primary = row.facility?.name || row.name || row.documentName || 'Unnamed stop'

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.sm,
        borderRadius: radii.md,
        backgroundColor: selected ? c.surfaceElevated : 'transparent',
      }}
    >
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={`Select ${primary}`}
        style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            borderWidth: selected ? 0 : 1.5,
            borderColor: c.border,
            backgroundColor: selected ? c.brand : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {selected ? <Check color="#ffffff" size={14} /> : null}
        </View>
      </Pressable>

      <Text style={{ ...typography.caption1, color: c.textTertiary, width: 18 }}>{row.sequence}</Text>

      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Open ${primary}`}
        style={{ flex: 1, minHeight: TOUCH, justifyContent: 'center', gap: 2 }}
      >
        <Text
          numberOfLines={2}
          style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}
        >
          {primary}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text style={{ ...typography.caption1, color: c.textTertiary }}>
            {row.rollups.label} · {row.referenceCount}ref
          </Text>
          {row.rollups.pieces.overridden || row.rollups.weight.overridden ? (
            <Lock color={c.textTertiary} size={11} />
          ) : null}
          {hasIssue ? (
            <Text style={{ ...typography.caption2, color: c.textSecondary }}>needs a look</Text>
          ) : null}
        </View>
      </Pressable>

      <StopBadge state={row.state} c={c} />

      {/* Reorder. See the file header for why these are arrows. */}
      <View style={{ gap: 0 }}>
        <Pressable
          onPress={() => onMove(-1)}
          disabled={position === 0 || busy}
          accessibilityRole="button"
          accessibilityLabel={`Move ${primary} up`}
          style={{
            width: TOUCH,
            height: TOUCH / 2 + 2,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: position === 0 || busy ? 0.3 : 1,
          }}
        >
          <ChevronUp color={c.textSecondary} size={18} />
        </Pressable>
        <Pressable
          onPress={() => onMove(1)}
          disabled={position === total - 1 || busy}
          accessibilityRole="button"
          accessibilityLabel={`Move ${primary} down`}
          style={{
            width: TOUCH,
            height: TOUCH / 2 + 2,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: position === total - 1 || busy ? 0.3 : 1,
          }}
        >
          <ChevronDown color={c.textSecondary} size={18} />
        </Pressable>
      </View>
    </View>
  )
}

/**
 * Colour AND icon AND text (Section 15). "New" is neutral, not red — a stop the
 * system has never seen is the ordinary case on a first import, not an error.
 */
function StopBadge({ state, c }: { state: StopReviewRow['state']; c: Colors }) {
  const spec =
    state === 'LINKED'
      ? { bg: c.successBg, fg: c.success, Icon: Check, label: 'Linked' }
      : state === 'PROPOSED'
        ? { bg: c.surfaceElevated, fg: c.textSecondary, Icon: Sparkles, label: 'Proposed' }
        : { bg: c.surfaceElevated, fg: c.textSecondary, Icon: Plus, label: 'New' }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: radii.full,
        backgroundColor: spec.bg,
      }}
    >
      <spec.Icon color={spec.fg} size={11} />
      <Text style={{ ...typography.caption2, color: spec.fg, fontWeight: '600' }}>{spec.label}</Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Bulk bar
// ---------------------------------------------------------------------------

type BulkPanel = 'note' | 'docs' | 'type' | 'clear' | null

function BulkBar({
  count,
  panel,
  setPanel,
  onPropose,
  onClearSelection,
  c,
}: {
  count: number
  panel: BulkPanel
  setPanel: (p: BulkPanel) => void
  onPropose: (input: StopBulkInput, question: string) => void
  onClearSelection: () => void
  c: Colors
}) {
  const [note, setNote] = useState('')
  const [docs, setDocs] = useState<RequiredDocument[]>([])
  const [stopType, setStopType] = useState<StopType>('delivery')
  const [clearFields, setClearFields] = useState<BulkAppliedField[]>([])

  const stops = `${count} stop${count === 1 ? '' : 's'}`

  return (
    <View
      style={{
        position: 'absolute',
        left: spacing.md,
        right: spacing.md,
        bottom: spacing.xl,
        borderRadius: radii.lg,
        backgroundColor: c.surfaceElevated,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '700' }}>
          {count} selected
        </Text>
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={onClearSelection}
          accessibilityRole="button"
          accessibilityLabel="Clear selection"
          hitSlop={8}
          style={{ minHeight: 32, justifyContent: 'center' }}
        >
          <Text style={{ ...typography.caption1, color: c.textTertiary }}>Clear selection</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
        <Chip label="Note" active={panel === 'note'} onPress={() => setPanel(panel === 'note' ? null : 'note')} c={c} />
        <Chip label="Docs" active={panel === 'docs'} onPress={() => setPanel(panel === 'docs' ? null : 'docs')} c={c} />
        <Chip label="Type" active={panel === 'type'} onPress={() => setPanel(panel === 'type' ? null : 'type')} c={c} />
        <Chip
          label="Copy quantities"
          icon={Copy}
          active={false}
          onPress={() =>
            onPropose(
              { copyQuantitiesFromAbove: true },
              `Copy the quantities from the stop above onto ${stops}?`,
            )
          }
          c={c}
        />
        <Chip
          label="Clear"
          icon={Undo2}
          active={panel === 'clear'}
          onPress={() => setPanel(panel === 'clear' ? null : 'clear')}
          c={c}
        />
      </ScrollView>

      {panel === 'note' ? (
        <View style={{ gap: spacing.sm }}>
          <Field value={note} onChangeText={setNote} label="Note to apply" placeholder="Call ahead 30 min" c={c} />
          <SecondaryAction
            label="Review and apply"
            onPress={() => note.trim() && onPropose({ notes: note.trim() }, `Apply “${note.trim()}” to ${stops}?`)}
            c={c}
          />
        </View>
      ) : null}

      {panel === 'docs' ? (
        <View style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            {(['BOL', 'POD'] as RequiredDocument[]).map((doc) => (
              <Toggle
                key={doc}
                label={doc}
                on={docs.includes(doc)}
                onPress={() => setDocs(docs.includes(doc) ? docs.filter((d) => d !== doc) : [...docs, doc])}
                c={c}
              />
            ))}
          </View>
          <SecondaryAction
            label="Review and apply"
            onPress={() =>
              onPropose(
                { requiredDocuments: docs },
                docs.length === 0
                  ? `Require no documents at ${stops}?`
                  : `Require ${docs.join(' and ')} at ${stops}?`,
              )
            }
            c={c}
          />
        </View>
      ) : null}

      {panel === 'type' ? (
        <View style={{ gap: spacing.sm }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {STOP_TYPES.map((t) => (
              <Chip key={t} label={STOP_TYPE_LABEL[t]} active={stopType === t} onPress={() => setStopType(t)} c={c} />
            ))}
          </ScrollView>
          <SecondaryAction
            label="Review and apply"
            onPress={() => onPropose({ stopType }, `Set ${stops} to ${STOP_TYPE_LABEL[stopType]}?`)}
            c={c}
          />
        </View>
      ) : null}

      {panel === 'clear' ? (
        <View style={{ gap: spacing.sm }}>
          <Text style={{ ...typography.caption1, color: c.textTertiary }}>
            Only takes back what this bar applied. A value someone typed on a stop is left alone.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            {(Object.keys(BULK_FIELD_LABEL) as BulkAppliedField[]).map((f) => (
              <Chip
                key={f}
                label={BULK_FIELD_LABEL[f]}
                active={clearFields.includes(f)}
                onPress={() =>
                  setClearFields(
                    clearFields.includes(f) ? clearFields.filter((x) => x !== f) : [...clearFields, f],
                  )
                }
                c={c}
              />
            ))}
          </ScrollView>
          <SecondaryAction
            label="Review and apply"
            onPress={() =>
              clearFields.length > 0 &&
              onPropose(
                { clear: clearFields },
                `Clear the bulk-applied ${clearFields.map((f) => BULK_FIELD_LABEL[f]).join(', ')} on ${stops}?`,
              )
            }
            c={c}
          />
        </View>
      ) : null}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

/**
 * Section 10's field list, in Section 10's order, and ONE array drives both
 * modes — the same construction the web editor uses, for the same reason: a
 * field that moves between view and edit makes a dispatcher re-read the screen.
 */
const FIELDS = [
  'facility',
  'sequence',
  'type',
  'references',
  'lineItems',
  'rollups',
  'appointment',
  'requiredDocuments',
  'contact',
  'notes',
  'pages',
] as const

type Field = (typeof FIELDS)[number]

const FIELD_LABEL: Record<Field, string> = {
  facility: 'Facility',
  sequence: 'Sequence',
  type: 'Stop type',
  references: 'References',
  lineItems: 'Line items',
  rollups: 'Quantities',
  appointment: 'Appointment window',
  requiredDocuments: 'Required documents',
  contact: 'Contact',
  notes: 'Notes',
  pages: 'Document pages',
}

function StopDetail({
  token,
  importId,
  row,
  onSaved,
  onFacilityResolved,
  c,
}: {
  token: string
  importId: string
  row: StopReviewRow
  onSaved: (next: StopReviewView) => void
  onFacilityResolved: () => void
  c: Colors
}) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(row.name)
  const [stopType, setStopType] = useState<StopType | null>(row.stopType)
  const [references, setReferences] = useState<StopReference[]>(row.references.map((r) => ({ ...r })))
  const [lineItems, setLineItems] = useState<StopLineItem[]>(row.lineItems.map((i) => ({ ...i })))
  // Only an OVERRIDDEN rollup pre-fills. A computed total left in the box would
  // be saved back as an override the next time anything else changed.
  const [pieces, setPieces] = useState(row.rollups.pieces.overridden ? String(row.rollups.pieces.value ?? '') : '')
  const [weight, setWeight] = useState(row.rollups.weight.overridden ? String(row.rollups.weight.value ?? '') : '')
  const [pallets, setPallets] = useState(row.rollups.pallets !== null ? String(row.rollups.pallets) : '')
  const [earliest, setEarliest] = useState(row.appointment?.earliest ?? '')
  const [latest, setLatest] = useState(row.appointment?.latest ?? '')
  const [isFirm, setIsFirm] = useState(row.appointment?.isFirm ?? false)
  const [docs, setDocs] = useState<RequiredDocument[]>([...row.requiredDocuments])
  const [contactName, setContactName] = useState(row.contact?.name ?? '')
  const [contactPhone, setContactPhone] = useState(row.contact?.phone ?? '')
  const [notes, setNotes] = useState(row.notes ?? '')

  const num = (text: string): number | null => {
    const t = text.trim()
    if (!t) return null
    const v = Number(t)
    return Number.isFinite(v) ? v : null
  }

  async function save() {
    if (!name.trim()) {
      setError('A stop name is required.')
      return
    }
    haptic.medium()
    setSaving(true)
    setError(null)
    try {
      const hasWindow = Boolean(earliest.trim() || latest.trim())
      onSaved(
        await ownerImportsApi.updateStop(token, importId, row.index, {
          name: name.trim(),
          stopType,
          references: references.filter((r) => r.value.trim()),
          lineItems,
          pieces: num(pieces),
          weight: num(weight),
          pallets: num(pallets),
          weightUom: row.rollups.weightUom ?? 'LBS',
          appointment: hasWindow
            ? { earliest: earliest.trim() || null, latest: latest.trim() || null, isFirm }
            : null,
          requiredDocuments: docs,
          contact:
            contactName.trim() || contactPhone.trim()
              ? { name: contactName.trim() || null, phone: contactPhone.trim() || null }
              : null,
          notes: notes.trim() || null,
        }),
      )
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that stop.')
    } finally {
      setSaving(false)
    }
  }

  async function linkFacility(facilityId: string) {
    haptic.light()
    setSaving(true)
    setError(null)
    try {
      await ownerImportsApi.linkStopFacility(token, importId, row.index, facilityId)
      onFacilityResolved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link that facility.')
    } finally {
      setSaving(false)
    }
  }

  async function createFacility() {
    if (!row.prefill) return
    haptic.medium()
    setSaving(true)
    setError(null)
    try {
      await ownerImportsApi.createStopFacility(token, importId, row.index, {
        name: row.prefill.name,
        facilityType: row.prefill.facilityType,
        addressLine1: row.prefill.addressLine1 ?? undefined,
        addressLine2: row.prefill.addressLine2 ?? undefined,
        city: row.prefill.city ?? undefined,
        state: row.prefill.state ?? undefined,
        zip: row.prefill.zip ?? undefined,
      })
      onFacilityResolved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create that facility.')
    } finally {
      setSaving(false)
    }
  }

  function renderField(field: Field) {
    switch (field) {
      case 'facility':
        return (
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ ...typography.subhead, color: c.textPrimary, flex: 1 }}>
                {row.facility ? `${row.facility.name} — ${row.facility.address}` : row.documentAddress || 'No address on the document'}
              </Text>
              <StopBadge state={row.state} c={c} />
            </View>
            {row.why ? (
              <Text style={{ ...typography.caption1, color: c.textTertiary }}>{row.why.detail}</Text>
            ) : null}
            {!row.persisted && row.facility ? (
              <Text style={{ ...typography.caption1, color: c.textTertiary }}>
                Matched on this read. It is written the moment you change anything on this import.
              </Text>
            ) : null}
            {/* Nothing here fires on open. A T3 or T4 resolves only from a press. */}
            {row.proposals.map((p) => (
              <Pressable
                key={p.facilityId}
                onPress={() => void linkFacility(p.facilityId)}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={`Link ${p.name}`}
                style={{
                  minHeight: TOUCH,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  padding: spacing.md,
                  borderRadius: radii.md,
                  backgroundColor: c.surfaceElevated,
                  opacity: saving ? 0.5 : 1,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2} style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}>
                    {p.name}
                  </Text>
                  <Text numberOfLines={2} style={{ ...typography.caption1, color: c.textTertiary }}>
                    {p.address}
                  </Text>
                </View>
                <Text style={{ ...typography.caption1, color: c.textTertiary }}>
                  {Math.round(p.score * 100)}%
                </Text>
              </Pressable>
            ))}
            {row.requiresHumanTap && row.prefill ? (
              <SecondaryAction
                label={`Create “${row.prefill.name}”`}
                icon={Plus}
                onPress={() => void createFacility()}
                c={c}
              />
            ) : null}
          </View>
        )

      case 'sequence':
        return (
          <Text style={{ ...typography.subhead, color: c.textSecondary }}>
            {row.sequence} of the running order — use the arrows on the list to change it
          </Text>
        )

      case 'type':
        return editing ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }}>
            <Chip label="Not set" active={stopType === null} onPress={() => setStopType(null)} c={c} />
            {STOP_TYPES.map((t) => (
              <Chip key={t} label={STOP_TYPE_LABEL[t]} active={stopType === t} onPress={() => setStopType(t)} c={c} />
            ))}
          </ScrollView>
        ) : (
          <Value text={row.stopType ? STOP_TYPE_LABEL[row.stopType] : '—'} c={c} />
        )

      case 'references':
        return editing ? (
          <View style={{ gap: spacing.sm }}>
            {references.map((ref, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Pressable
                  onPress={() => {
                    const next = [...references]
                    const at = REFERENCE_TYPES.indexOf(ref.type)
                    next[i] = { ...ref, type: REFERENCE_TYPES[(at + 1) % REFERENCE_TYPES.length] }
                    setReferences(next)
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Change reference type, currently ${ref.type}`}
                  style={{ minHeight: TOUCH, width: 84, justifyContent: 'center' }}
                >
                  <Text style={{ ...typography.caption1, color: c.brand, fontWeight: '600' }}>{ref.type}</Text>
                </Pressable>
                <TextInput
                  value={ref.value}
                  onChangeText={(v) => {
                    const next = [...references]
                    next[i] = { ...ref, value: v }
                    setReferences(next)
                  }}
                  accessibilityLabel={`${ref.type} value`}
                  placeholderTextColor={c.textTertiary}
                  style={{
                    flex: 1,
                    minHeight: TOUCH,
                    borderRadius: radii.md,
                    backgroundColor: c.surfaceElevated,
                    paddingHorizontal: spacing.md,
                    color: c.textPrimary,
                    fontSize: 16,
                  }}
                />
                <Pressable
                  onPress={() => setReferences(references.filter((_, j) => j !== i))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${ref.type} reference`}
                  style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Trash2 color={c.textTertiary} size={16} />
                </Pressable>
              </View>
            ))}
            <SecondaryAction
              label="Add reference"
              icon={Plus}
              onPress={() => setReferences([...references, { type: 'OTHER', value: '' }])}
              c={c}
            />
          </View>
        ) : row.references.length === 0 ? (
          <Value text="—" c={c} />
        ) : (
          <View style={{ gap: 2 }}>
            {row.references.map((r, i) => (
              <Text key={`${r.type}-${i}`} style={{ ...typography.subhead, color: c.textPrimary }}>
                <Text style={{ color: c.textTertiary }}>{r.type} </Text>
                {r.value}
              </Text>
            ))}
          </View>
        )

      case 'lineItems':
        return editing ? (
          <View style={{ gap: spacing.sm }}>
            {lineItems.map((item, i) => (
              <View key={i} style={{ gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: c.surfaceElevated }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <SmallInput
                    value={item.sku ?? ''}
                    onChangeText={(v) => {
                      const next = [...lineItems]
                      next[i] = { ...item, sku: v || null }
                      setLineItems(next)
                    }}
                    label={`Line item ${i + 1} SKU`}
                    placeholder="SKU"
                    width={90}
                    c={c}
                  />
                  <SmallInput
                    value={item.description ?? ''}
                    onChangeText={(v) => {
                      const next = [...lineItems]
                      next[i] = { ...item, description: v || null }
                      setLineItems(next)
                    }}
                    label={`Line item ${i + 1} description`}
                    placeholder="Description"
                    flex
                    c={c}
                  />
                  <Pressable
                    onPress={() => setLineItems(lineItems.filter((_, j) => j !== i))}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove line item ${i + 1}`}
                    style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Trash2 color={c.textTertiary} size={16} />
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <SmallInput
                    value={item.quantity != null ? String(item.quantity) : ''}
                    onChangeText={(v) => {
                      const next = [...lineItems]
                      next[i] = { ...item, quantity: num(v) }
                      setLineItems(next)
                    }}
                    label={`Line item ${i + 1} quantity`}
                    placeholder="Qty"
                    width={70}
                    numeric
                    c={c}
                  />
                  <SmallInput
                    value={item.uom ?? ''}
                    onChangeText={(v) => {
                      const next = [...lineItems]
                      next[i] = { ...item, uom: v || null }
                      setLineItems(next)
                    }}
                    label={`Line item ${i + 1} unit`}
                    placeholder="UOM"
                    width={70}
                    c={c}
                  />
                  <SmallInput
                    value={item.weight != null ? String(item.weight) : ''}
                    onChangeText={(v) => {
                      const next = [...lineItems]
                      next[i] = { ...item, weight: num(v) }
                      setLineItems(next)
                    }}
                    label={`Line item ${i + 1} weight`}
                    placeholder="Weight"
                    width={90}
                    numeric
                    c={c}
                  />
                </View>
              </View>
            ))}
            <SecondaryAction
              label="Add line item"
              icon={Plus}
              onPress={() =>
                setLineItems([
                  ...lineItems,
                  { sku: null, description: null, quantity: null, uom: null, weight: null, hazmat: false },
                ])
              }
              c={c}
            />
          </View>
        ) : row.lineItems.length === 0 ? (
          <Value text="—" c={c} />
        ) : (
          <View style={{ gap: 2 }}>
            {row.lineItems.map((item, i) => (
              <Text key={i} numberOfLines={2} style={{ ...typography.subhead, color: c.textPrimary }}>
                {[item.sku, item.description, item.quantity != null ? `${item.quantity} ${item.uom ?? ''}`.trim() : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            ))}
          </View>
        )

      case 'rollups':
        return editing ? (
          <View style={{ gap: spacing.sm }}>
            <RollupInput label="Pieces" value={pieces} computed={row.rollups.pieces.computed} onChange={setPieces} c={c} />
            <RollupInput label="Weight" value={weight} computed={row.rollups.weight.computed} onChange={setWeight} c={c} />
            <RollupInput label="Pallets" value={pallets} computed={null} onChange={setPallets} c={c} />
            <Text style={{ ...typography.caption1, color: c.textTertiary }}>
              Leave a box empty to let the line items decide. Type a number to override it — the
              override is marked on the stop.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 2 }}>
            <RollupLine label="Pieces" rollup={row.rollups.pieces} c={c} />
            <RollupLine label="Weight" rollup={row.rollups.weight} suffix={row.rollups.weightUom ?? 'LBS'} c={c} />
            <Text style={{ ...typography.subhead, color: c.textPrimary }}>
              <Text style={{ color: c.textTertiary }}>Pallets </Text>
              {row.rollups.pallets ?? '—'}
            </Text>
          </View>
        )

      case 'appointment':
        return editing ? (
          <View style={{ gap: spacing.sm }}>
            <Field value={earliest} onChangeText={setEarliest} label="Earliest" placeholder="YYYY-MM-DDTHH:MM" c={c} />
            <Field value={latest} onChangeText={setLatest} label="Latest" placeholder="YYYY-MM-DDTHH:MM" c={c} />
            <Toggle label="Firm window" on={isFirm} onPress={() => setIsFirm(!isFirm)} c={c} />
          </View>
        ) : (
          <Value
            text={
              row.appointment
                ? `${row.appointment.earliest ?? 'any time'} → ${row.appointment.latest ?? 'any time'}${row.appointment.isFirm ? ' · firm' : ''}`
                : '—'
            }
            c={c}
          />
        )

      case 'requiredDocuments':
        return editing ? (
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            {(['BOL', 'POD'] as RequiredDocument[]).map((doc) => (
              <Toggle
                key={doc}
                label={doc}
                on={docs.includes(doc)}
                onPress={() => setDocs(docs.includes(doc) ? docs.filter((d) => d !== doc) : [...docs, doc])}
                c={c}
              />
            ))}
          </View>
        ) : (
          <Value text={row.requiredDocuments.length ? row.requiredDocuments.join(' · ') : '—'} c={c} />
        )

      case 'contact':
        return editing ? (
          <View style={{ gap: spacing.sm }}>
            <Field value={contactName} onChangeText={setContactName} label="Contact name" c={c} />
            <Field value={contactPhone} onChangeText={setContactPhone} label="Contact phone" c={c} />
          </View>
        ) : (
          <Value text={row.contact ? [row.contact.name, row.contact.phone].filter(Boolean).join(' · ') : '—'} c={c} />
        )

      case 'notes':
        return editing ? (
          <Field value={notes} onChangeText={setNotes} label="Notes" multiline c={c} />
        ) : (
          <View style={{ gap: spacing.xs }}>
            <Value text={row.notes ?? '—'} c={c} />
            {row.bulkAppliedFields.includes('notes') ? (
              <Text style={{ ...typography.caption2, color: c.textTertiary }}>Applied in bulk</Text>
            ) : null}
          </View>
        )

      case 'pages':
        // Read-only in both modes: page numbers are where the text was found,
        // and editing them would break the driver's page slice (Section 11).
        return (
          <Value
            text={
              row.pageNumbers.length === 0
                ? '—'
                : `${row.pageNumbers.length === 1 ? 'Page' : 'Pages'} ${row.pageNumbers.join(', ')}`
            }
            c={c}
          />
        )
    }
  }

  return (
    <ScrollView contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.xxl * 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        {editing ? (
          <Field value={name} onChangeText={setName} label="Stop name" c={c} />
        ) : (
          <Text style={{ ...typography.title3, color: c.textPrimary, flex: 1 }}>
            {row.facility?.name || row.name || 'Unnamed stop'}
          </Text>
        )}
        {!editing ? (
          <Pressable
            onPress={() => setEditing(true)}
            accessibilityRole="button"
            accessibilityLabel="Edit this stop"
            style={{ width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' }}
          >
            <Pencil color={c.brand} size={18} />
          </Pressable>
        ) : null}
      </View>

      {FIELDS.map((field) => (
        <View key={field} style={{ gap: spacing.xs }}>
          <Text style={{ ...typography.caption1, color: c.textSecondary }}>{FIELD_LABEL[field]}</Text>
          {renderField(field)}
        </View>
      ))}

      {error ? <Text style={{ ...typography.footnote, color: c.danger }}>{error}</Text> : null}

      {editing ? (
        <View style={{ gap: spacing.sm }}>
          <PrimaryAction label="Save stop" icon={Check} onPress={save} busy={saving} c={c} />
          <SecondaryAction label="Cancel" onPress={() => setEditing(false)} c={c} />
        </View>
      ) : null}
    </ScrollView>
  )
}

// ---------------------------------------------------------------------------
// Small shared controls — local, on `useThemeColors`, nothing installed
// ---------------------------------------------------------------------------

function Value({ text, c }: { text: string; c: Colors }) {
  return <Text style={{ ...typography.subhead, color: c.textPrimary }}>{text}</Text>
}

function RollupLine({
  label,
  rollup,
  suffix,
  c,
}: {
  label: string
  rollup: StopReviewRow['rollups']['pieces']
  suffix?: string
  c: Colors
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Text style={{ ...typography.subhead, color: c.textTertiary, width: 60 }}>{label}</Text>
      <Text style={{ ...typography.subhead, color: c.textPrimary }}>
        {rollup.value ?? '—'}
        {rollup.value !== null && suffix ? ` ${suffix.toLowerCase()}` : ''}
      </Text>
      {/* The visible override mark Section 10 asks for. Not red — a hand-typed
          quantity is a decision, not an error. */}
      {rollup.overridden ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Lock color={c.textTertiary} size={11} />
          <Text style={{ ...typography.caption2, color: c.textTertiary }}>
            typed{rollup.computed !== null ? ` · line items: ${rollup.computed}` : ''}
          </Text>
        </View>
      ) : rollup.computed !== null ? (
        <Text style={{ ...typography.caption2, color: c.textTertiary }}>from the line items</Text>
      ) : null}
    </View>
  )
}

function RollupInput({
  label,
  value,
  computed,
  onChange,
  c,
}: {
  label: string
  value: string
  computed: number | null
  onChange: (v: string) => void
  c: Colors
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <Text style={{ ...typography.subhead, color: c.textTertiary, width: 60 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        accessibilityLabel={label}
        placeholder={computed !== null ? String(computed) : '—'}
        placeholderTextColor={c.textTertiary}
        style={{
          width: 100,
          minHeight: TOUCH,
          borderRadius: radii.md,
          backgroundColor: c.surfaceElevated,
          paddingHorizontal: spacing.md,
          color: c.textPrimary,
          fontSize: 16,
        }}
      />
      {value.trim() ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Lock color={c.textTertiary} size={11} />
          <Text style={{ ...typography.caption2, color: c.textTertiary }}>override</Text>
        </View>
      ) : computed !== null ? (
        <Text style={{ ...typography.caption2, color: c.textTertiary }}>line items: {computed}</Text>
      ) : null}
    </View>
  )
}

function Field({
  value,
  onChangeText,
  label,
  placeholder,
  multiline,
  c,
}: {
  value: string
  onChangeText: (v: string) => void
  label: string
  placeholder?: string
  multiline?: boolean
  c: Colors
}) {
  return (
    <View style={{ gap: spacing.xs, flex: 1 }}>
      <Text style={{ ...typography.caption1, color: c.textSecondary }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.textTertiary}
        multiline={multiline}
        accessibilityLabel={label}
        style={{
          minHeight: multiline ? TOUCH * 1.6 : TOUCH,
          borderRadius: radii.md,
          backgroundColor: c.surfaceElevated,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          color: c.textPrimary,
          fontSize: 16,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  )
}

function SmallInput({
  value,
  onChangeText,
  label,
  placeholder,
  width,
  flex,
  numeric,
  c,
}: {
  value: string
  onChangeText: (v: string) => void
  label: string
  placeholder?: string
  width?: number
  flex?: boolean
  numeric?: boolean
  c: Colors
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.textTertiary}
      accessibilityLabel={label}
      keyboardType={numeric ? 'decimal-pad' : 'default'}
      style={{
        width,
        flex: flex ? 1 : undefined,
        minHeight: TOUCH,
        borderRadius: radii.sm,
        backgroundColor: c.surfaceCard,
        paddingHorizontal: spacing.sm,
        color: c.textPrimary,
        fontSize: 15,
      }}
    />
  )
}

function Chip({
  label,
  active,
  onPress,
  icon: Icon,
  c,
}: {
  label: string
  active: boolean
  onPress: () => void
  icon?: typeof Copy
  c: Colors
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={{
        minHeight: TOUCH,
        paddingHorizontal: spacing.md,
        borderRadius: radii.full,
        backgroundColor: active ? c.brand : c.surfaceCard,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: spacing.xs,
      }}
    >
      {Icon ? <Icon color={active ? '#ffffff' : c.textSecondary} size={14} /> : null}
      <Text
        style={{
          ...typography.footnote,
          color: active ? '#ffffff' : c.textPrimary,
          fontWeight: '600',
        }}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function Toggle({ label, on, onPress, c }: { label: string; on: boolean; onPress: () => void; c: Colors }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      style={{ minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: on ? 0 : 1.5,
          borderColor: c.border,
          backgroundColor: on ? c.brand : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {on ? <Check color="#ffffff" size={14} /> : null}
      </View>
      <Text style={{ ...typography.subhead, color: c.textPrimary }}>{label}</Text>
    </Pressable>
  )
}

function Banner({
  text,
  tone,
  onClose,
  c,
}: {
  text: string
  tone: 'danger' | 'info'
  onClose: () => void
  c: Colors
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radii.lg,
        // Red only for errors (Section 15).
        backgroundColor: tone === 'danger' ? c.dangerBg : c.surfaceCard,
      }}
    >
      <Info color={tone === 'danger' ? c.danger : c.textSecondary} size={16} />
      <Text style={{ ...typography.footnote, color: c.textPrimary, flex: 1 }}>{text}</Text>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={12}
        style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
      >
        <X color={c.textTertiary} size={16} />
      </Pressable>
    </View>
  )
}

function PrimaryAction({
  label,
  icon: Icon,
  onPress,
  busy,
  disabled,
  c,
}: {
  label: string
  icon?: typeof Check
  onPress: () => void | Promise<void>
  busy?: boolean
  disabled?: boolean
  c: Colors
}) {
  const off = busy || disabled
  return (
    <Pressable
      onPress={() => void onPress()}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        minHeight: 52,
        borderRadius: radii.md,
        backgroundColor: c.brandDark,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: spacing.sm,
        opacity: off ? 0.5 : 1,
      }}
    >
      {busy ? <ActivityIndicator color="#ffffff" size="small" /> : Icon ? <Icon color="#ffffff" size={17} /> : null}
      <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 16 }}>{label}</Text>
    </Pressable>
  )
}

function SecondaryAction({
  label,
  icon: Icon,
  onPress,
  c,
}: {
  label: string
  icon?: typeof Plus
  onPress: () => void
  c: Colors
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        minHeight: TOUCH,
        borderRadius: radii.md,
        backgroundColor: c.surfaceCard,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: spacing.sm,
      }}
    >
      {Icon ? <Icon color={c.brand} size={16} /> : null}
      <Text numberOfLines={1} style={{ ...typography.subhead, color: c.brand, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  )
}
