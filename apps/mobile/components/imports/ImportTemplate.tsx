import React, { useState } from 'react'
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { AlertTriangle, Ban, Check, ChevronRight, Info, Route, Sparkles } from 'lucide-react-native'
import {
  ownerImportsApi,
  type TemplateCandidateView,
  type TemplateSlotView,
} from '@drivecommand/api-client'
import { BottomSheet } from '../ui/BottomSheet'
import { haptic } from '../../lib/haptics'
import { useThemeColors, radii, spacing, typography } from '../../constants/tokens'

/**
 * The Template row and its three presentations (spec Section 8), on mobile.
 *
 * ```
 *   score >= 0.75   collapse into the summary card, with a why
 *   0.45 - 0.75     up to three ranked candidates, each with a stop diff
 *   score <  0.45   only "Continue without a template"
 * ```
 *
 * **The band is decided server-side and arrives as `state`.** Nothing here
 * compares a score to a number: both thresholds live in `template-constants.ts`
 * on the server and nowhere else, which is this phase's own verification step.
 * That is also why the two surfaces cannot disagree about whether a document
 * matched — the same `bandFor` answered for both.
 *
 * DESIGN (Section 15). No borders — surfaces separate by `surfaceElevated`
 * against `surfaceCard`. Spacing on the 8/12/16/20/24 token scale. One accent
 * on one primary action: the apply button. Red only for errors, so the "New"
 * and "Not on today's manifest" badges are neutral chips with words in them.
 * Every target is at least 44px.
 *
 * EVERY ACTIONABLE THING IS A REAL CONTROL. Candidates are `Pressable`, with no
 * nested pressables inside them.
 *
 * ---------------------------------------------------------------------------
 * "CHANGE" IS A QUESTION, NOT AN ANSWER (quick-516)
 * ---------------------------------------------------------------------------
 * It used to call `decline()`, so changing a template meant giving one up: the
 * row wrote `via: 'NONE'` on the first tap and there was no way to reach a
 * lower-scoring route. It now opens a chooser over `slot.alternatives` — every
 * candidate the server scored, uncapped, plus "No template" as an explicit
 * option. Opening it writes nothing.
 *
 * "Look again" was wired to `onChanged`, a reload, which re-read the decision it
 * was meant to clear. It now calls `resetTemplate`, the mutation that clears it,
 * and says what the fresh look found.
 */

const TOUCH = 44

type Colors = ReturnType<typeof useThemeColors>

export function ImportTemplate({
  token,
  importId,
  slot,
  onChanged,
}: {
  token: string
  importId: string
  slot: TemplateSlotView
  /** Reloads the whole resolution — committing a template also commits the
   *  client and the contract behind it (`ensureTemplateCommitted` composes
   *  `ensureContractCommitted`), so refreshing only this row would leave two
   *  slots on screen that the server has since written. */
  onChanged: () => void
}) {
  const c = useThemeColors()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<TemplateCandidateView | null>(null)
  const [applied, setApplied] = useState<string | null>(null)
  const [choosing, setChoosing] = useState(false)
  /** What the last "Look again" found. Says so even when the answer is nothing. */
  const [notice, setNotice] = useState<string | null>(null)

  async function run<T>(work: () => Promise<T>): Promise<T | null> {
    setBusy(true)
    setError(null)
    try {
      return await work()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the template.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function select(candidate: TemplateCandidateView) {
    haptic.medium()
    const done = await run(() => ownerImportsApi.selectTemplate(token, importId, candidate.id))
    if (done) onChanged()
  }

  async function decline() {
    haptic.light()
    setChoosing(false)
    const done = await run(() => ownerImportsApi.declineTemplate(token, importId))
    if (done) onChanged()
  }

  /**
   * Picked from the chooser. Selects, then hands straight to the same
   * `ApplyConfirm` the middle band reaches through "Use this template" — not a
   * second flow, and not an apply. See the web twin for why the confirmation
   * follows here and not after a middle-band pick.
   */
  async function chooseAndConfirm(candidate: TemplateCandidateView) {
    haptic.medium()
    setChoosing(false)
    setNotice(null)
    const done = await run(() => ownerImportsApi.selectTemplate(token, importId, candidate.id))
    if (!done) return
    onChanged()
    setConfirming(candidate)
  }

  /**
   * "Look again" — the mutation. Clears the decision so matching runs again, then
   * reports what came back, including when nothing did.
   */
  async function lookAgain() {
    haptic.light()
    setNotice(null)
    const fresh = await run(() => ownerImportsApi.resetTemplate(token, importId))
    if (!fresh) return
    setNotice(
      fresh.state === 'RESOLVED' && fresh.value
        ? `Looked again — “${fresh.value.name}” matches at ${fresh.value.scorePercent}%.`
        : fresh.state === 'CANDIDATES'
          ? `Looked again — ${fresh.candidates.length} saved route${fresh.candidates.length === 1 ? '' : 's'} to choose from.`
          : fresh.state === 'BLOCKED'
            ? (fresh.blockedReason ?? 'Looked again — this cannot be matched yet.')
            : 'Looked again — nothing saved matches today’s run.',
    )
    onChanged()
  }

  async function apply() {
    setConfirming(null)
    haptic.medium()
    const result = await run(() => ownerImportsApi.applyTemplate(token, importId))
    if (!result) return
    // Says what actually happened rather than repeating the question.
    setApplied(
      [
        `${result.matched} stop${result.matched === 1 ? '' : 's'} took the template order`,
        result.appended ? `${result.appended} new at the end` : null,
        result.notOnManifest ? `${result.notOnManifest} kept as skipped` : null,
        result.windowsKept
          ? `${result.windowsKept} window${result.windowsKept === 1 ? '' : 's'} left as printed`
          : null,
        // See the web twin: deferral is unconditional and is not a failure
        // (quick-515).
        result.windowsDeferred
          ? `${result.windowsDeferred} window${result.windowsDeferred === 1 ? '' : 's'} come from the route and are set when you finish the trip`
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
    )
    onChanged()
  }

  // ---- Not askable yet -----------------------------------------------------
  if (slot.state === 'BLOCKED') {
    return (
      <Row c={c}>
        <Text style={{ ...typography.subhead, color: c.textTertiary, flex: 1 }}>{slot.blockedReason}</Text>
      </Row>
    )
  }

  // ---- A decision is in place ----------------------------------------------
  if (slot.state === 'RESOLVED' && slot.value) {
    return (
      <View style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Text style={{ ...typography.subhead, color: c.textSecondary, width: 78 }}>Template</Text>
          <Text
            numberOfLines={1}
            style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600', flex: 1 }}
          >
            {slot.value.name}
          </Text>
          <Pressable
            onPress={() => {
              haptic.light()
              setError(null)
              setNotice(null)
              setChoosing(true)
            }}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Change the template"
            style={{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: spacing.sm }}
          >
            <Text style={{ ...typography.caption1, color: c.textTertiary }}>Change</Text>
          </Pressable>
        </View>

        <View style={{ paddingLeft: 78 + spacing.md, gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            {slot.value.widened ? <Chip c={c} label="Other contract" /> : null}
            {slot.value.isSuggested ? <Chip c={c} label="Suggested" icon={<Sparkles color={c.textSecondary} size={11} />} /> : null}
          </View>
          <Text style={{ ...typography.caption1, color: c.textTertiary }}>{slot.value.diffNote}</Text>
          {slot.why ? (
            <Text style={{ ...typography.caption1, color: c.textTertiary }}>
              {slot.why.detail}
              {slot.why.score != null ? ` (${Math.round(slot.why.score * 100)}%)` : ''}
              {slot.persisted ? '' : ' · saved when you next change something'}
            </Text>
          ) : null}
        </View>

        {notice ? <NoticeLine c={c} message={notice} /> : null}

        {applied ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, paddingLeft: 78 + spacing.md }}>
            <Check color={c.textTertiary} size={14} />
            <Text style={{ ...typography.caption1, color: c.textSecondary, flex: 1 }}>{applied}</Text>
          </View>
        ) : null}

        {error ? <ErrorLine c={c} message={error} /> : null}

        {slot.applied ? (
          <View style={{ flexDirection: 'row', gap: spacing.sm, paddingLeft: 78 + spacing.md }}>
            <Check color={c.textTertiary} size={14} />
            <Text style={{ ...typography.caption1, color: c.textSecondary, flex: 1 }}>
              This template&apos;s order and standing details are on the stops.
            </Text>
          </View>
        ) : (
          <View style={{ paddingLeft: 78 + spacing.md, gap: spacing.xs }}>
            <Pressable
              onPress={() => setConfirming(slot.value)}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Use this template"
              style={{
                minHeight: TOUCH,
                borderRadius: radii.md,
                backgroundColor: c.brand,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: spacing.sm,
                opacity: busy ? 0.6 : 1,
                paddingHorizontal: spacing.lg,
              }}
            >
              {busy ? <ActivityIndicator color="#fff" size="small" /> : <Route color="#fff" size={16} />}
              <Text style={{ ...typography.subhead, color: '#fff', fontWeight: '600' }}>
                Use this template
              </Text>
            </Pressable>
            <Text style={{ ...typography.caption1, color: c.textTertiary }}>
              Sets the order, the windows and the paperwork. Today&apos;s quantities and references
              stay as they are.
            </Text>
          </View>
        )}

        <ApplyConfirm
          c={c}
          candidate={confirming}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void apply()}
        />

        <TemplateChooser
          c={c}
          visible={choosing}
          current={slot.value}
          alternatives={slot.alternatives}
          busy={busy}
          onClose={() => setChoosing(false)}
          onPick={(candidate) => void chooseAndConfirm(candidate)}
          onNone={() => void decline()}
        />
      </View>
    )
  }

  // ---- A person chose to run without one -----------------------------------
  if (slot.state === 'DECLINED') {
    return (
      <View style={{ paddingVertical: spacing.md, gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Text style={{ ...typography.subhead, color: c.textSecondary, width: 78 }}>Template</Text>
          <Text style={{ ...typography.subhead, color: c.textTertiary, flex: 1 }}>
            No template — this trip runs on its own.
          </Text>
          <Pressable
            onPress={() => void lookAgain()}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Look for templates again"
            style={{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: spacing.sm }}
          >
            {busy ? (
              <ActivityIndicator color={c.textTertiary} size="small" />
            ) : (
              <Text style={{ ...typography.caption1, color: c.textTertiary }}>Look again</Text>
            )}
          </Pressable>
        </View>
        {notice ? <NoticeLine c={c} message={notice} /> : null}
        {error ? <ErrorLine c={c} message={error} /> : null}
      </View>
    )
  }

  // ---- 0.45 .. 0.75 : the ranked list --------------------------------------
  if (slot.state === 'CANDIDATES') {
    return (
      <View style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Text style={{ ...typography.subhead, color: c.textSecondary, width: 78 }}>Template</Text>
          <Text style={{ ...typography.subhead, color: c.textPrimary, flex: 1 }}>
            {slot.candidates.length === 1
              ? 'One saved route looks close'
              : `${slot.candidates.length} saved routes look close`}
          </Text>
        </View>

        {slot.widened ? (
          <Text style={{ ...typography.caption1, color: c.textTertiary, paddingLeft: 78 + spacing.md }}>
            This contract has no saved routes, so these are the client&apos;s.
          </Text>
        ) : null}

        {notice ? <NoticeLine c={c} message={notice} /> : null}

        <View style={{ gap: spacing.sm }}>
          {slot.candidates.map((candidate) => (
            <CandidateRow
              key={candidate.id}
              c={c}
              candidate={candidate}
              disabled={busy}
              onPress={() => void select(candidate)}
            />
          ))}
        </View>

        {error ? <ErrorLine c={c} message={error} /> : null}
        <ContinueWithout c={c} onPress={() => void decline()} disabled={busy} />
      </View>
    )
  }

  // ---- < 0.45 : nothing is offered -----------------------------------------
  return (
    <View style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <Text style={{ ...typography.subhead, color: c.textSecondary, width: 78 }}>Template</Text>
        <Text style={{ ...typography.subhead, color: c.textTertiary, flex: 1 }}>
          Nothing saved looks like today&apos;s run.
        </Text>
      </View>
      {notice ? <NoticeLine c={c} message={notice} /> : null}
      {error ? <ErrorLine c={c} message={error} /> : null}
      <ContinueWithout c={c} onPress={() => void decline()} disabled={busy} />
    </View>
  )
}

// ---------------------------------------------------------------------------

function Row({ c, children }: { c: Colors; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md }}>
      <Text style={{ ...typography.subhead, color: c.textSecondary, width: 78 }}>Template</Text>
      {children}
    </View>
  )
}

/** A neutral chip. Words, never colour alone (Section 15). */
function Chip({ c, label, icon }: { c: Colors; label: string; icon?: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radii.sm,
        backgroundColor: c.surfaceElevated,
      }}
    >
      {icon}
      <Text style={{ ...typography.caption2, color: c.textSecondary }}>{label}</Text>
    </View>
  )
}

/**
 * One candidate, as a row.
 *
 * The middle band's presentation, lifted out so the chooser draws the identical
 * thing (quick-516) rather than a thinner list that would make "the 0.50 one" a
 * guess. A single `Pressable` with inert chips inside it — no nested pressables.
 */
function CandidateRow({
  c,
  candidate,
  disabled,
  onPress,
  current = false,
}: {
  c: Colors
  candidate: TemplateCandidateView
  disabled: boolean
  onPress: () => void
  /** The template already on the row. Shown, chipped, and not pickable. */
  current?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || current}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || current, selected: current }}
      accessibilityLabel={
        current
          ? `${candidate.name}, the template already in use`
          : `Use ${candidate.name}, ${candidate.scorePercent} percent match`
      }
      style={{
        minHeight: TOUCH,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.md,
        padding: spacing.md,
        borderRadius: radii.md,
        backgroundColor: c.surfaceElevated,
        opacity: disabled || current ? 0.6 : 1,
      }}
    >
      <Route color={c.textSecondary} size={16} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: spacing.xs }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs }}>
          <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }} numberOfLines={1}>
            {candidate.name}
          </Text>
          <Chip c={c} label={`${candidate.scorePercent}% match`} />
          {current ? <Chip c={c} label="Current" /> : null}
          {candidate.widened ? <Chip c={c} label="Other contract" /> : null}
          {candidate.isSuggested ? <Chip c={c} label="Suggested" /> : null}
        </View>
        <Text style={{ ...typography.caption1, color: c.textTertiary }}>
          {candidate.stopCount} stop{candidate.stopCount === 1 ? '' : 's'} · {candidate.diffNote}
        </Text>
        {candidate.countMismatch ? (
          <Text style={{ ...typography.caption1, color: c.textTertiary }}>
            Scored down — a different number of stops from today&apos;s.
          </Text>
        ) : null}
        <StopDiff c={c} candidate={candidate} />
      </View>
      {current ? null : <ChevronRight color={c.textTertiary} size={16} style={{ marginTop: 2 }} />}
    </Pressable>
  )
}

/**
 * The chooser behind "Change".
 *
 * Every candidate the server scored — `slot.alternatives`, uncapped — with the
 * selected one chipped `Current` and not pickable, and "No template" as an option
 * of its own. Opening it writes nothing, which is the whole fix: the tap used to
 * be the decline.
 *
 * A `ScrollView` because the list is uncapped and each row carries its diff; the
 * sheet has to survive a client with eight saved routes on a 360pt screen.
 */
function TemplateChooser({
  c,
  visible,
  current,
  alternatives,
  busy,
  onClose,
  onPick,
  onNone,
}: {
  c: Colors
  visible: boolean
  current: TemplateCandidateView | null
  alternatives: TemplateCandidateView[]
  busy: boolean
  onClose: () => void
  onPick: (candidate: TemplateCandidateView) => void
  onNone: () => void
}) {
  const others = alternatives.filter((a) => a.id !== current?.id)

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Which saved route is this?">
      <View style={{ gap: spacing.md, paddingBottom: spacing.lg }}>
        <Text style={{ ...typography.caption1, color: c.textTertiary }}>
          Picking one selects it — you confirm before anything on the stop list moves.
        </Text>

        <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: spacing.sm }}>
          {current ? (
            <CandidateRow c={c} candidate={current} disabled={busy} onPress={onClose} current />
          ) : null}
          {others.map((candidate) => (
            <CandidateRow
              key={candidate.id}
              c={c}
              candidate={candidate}
              disabled={busy}
              onPress={() => onPick(candidate)}
            />
          ))}
        </ScrollView>

        {others.length === 0 ? (
          <Text style={{ ...typography.caption1, color: c.textTertiary }}>
            Nothing else saved looks like today&apos;s run.
          </Text>
        ) : null}

        <Pressable
          onPress={onNone}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="No template, this trip runs on its own"
          style={{
            minHeight: TOUCH,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            padding: spacing.md,
            borderRadius: radii.md,
            backgroundColor: c.surfaceElevated,
            opacity: busy ? 0.6 : 1,
          }}
        >
          <Ban color={c.textSecondary} size={16} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}>
              No template
            </Text>
            <Text style={{ ...typography.caption1, color: c.textTertiary }}>
              This trip runs on its own. Nothing already on the stops is undone.
            </Text>
          </View>
        </Pressable>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={{ minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ ...typography.subhead, color: c.textSecondary }}>Cancel</Text>
        </Pressable>
      </View>
    </BottomSheet>
  )
}

/** What just happened, in the row. Neutral — this is never an error. */
function NoticeLine({ c, message }: { c: Colors; message: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, paddingLeft: 78 + spacing.md }}>
      <Info color={c.textTertiary} size={14} style={{ marginTop: 2 }} />
      <Text style={{ ...typography.caption1, color: c.textSecondary, flex: 1 }}>{message}</Text>
    </View>
  )
}

/** The stop diff under a candidate — Section 8 requires one per candidate. */
function StopDiff({ c, candidate }: { c: Colors; candidate: TemplateCandidateView }) {
  const notable = candidate.diff.rows.filter((r) => r.origin !== 'MATCHED')
  if (notable.length === 0) {
    return (
      <Text style={{ ...typography.caption1, color: c.textTertiary }}>
        Every stop on this route is on today&apos;s document.
      </Text>
    )
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 }}>
      {notable.slice(0, 4).map((row, i) => (
        <Chip
          key={`${row.origin}-${row.facilityId ?? i}`}
          c={c}
          label={`${row.origin === 'IMPORT_ONLY' ? '+ ' : '− '}${row.name || 'Unnamed stop'}`}
        />
      ))}
      {notable.length > 4 ? <Chip c={c} label={`+${notable.length - 4} more`} /> : null}
    </View>
  )
}

function ContinueWithout({ c, onPress, disabled }: { c: Colors; onPress: () => void; disabled: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Continue without a template"
      style={{
        minHeight: TOUCH,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: radii.md,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Text style={{ ...typography.subhead, color: c.textSecondary }}>Continue without a template</Text>
    </Pressable>
  )
}

function ErrorLine({ c, message }: { c: Colors; message: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <AlertTriangle color={c.danger} size={14} style={{ marginTop: 2 }} />
      <Text style={{ ...typography.caption1, color: c.danger, flex: 1 }}>{message}</Text>
    </View>
  )
}

/**
 * The confirmation before the merge.
 *
 * Applying reorders the stop list, so it names what will happen and to how many
 * — the same rule the bulk bar follows on the stop review screen, and the same
 * copy the web surface uses, because they are the same merge.
 */
function ApplyConfirm({
  c,
  candidate,
  onCancel,
  onConfirm,
}: {
  c: Colors
  candidate: TemplateCandidateView | null
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <BottomSheet visible={candidate != null} onClose={onCancel} title="Use this template?">
      {candidate ? (
        <View style={{ gap: spacing.md, paddingBottom: spacing.lg }}>
          <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}>
            {candidate.name}
          </Text>
          <Text style={{ ...typography.subhead, color: c.textSecondary }}>
            {candidate.diff.matched} stop{candidate.diff.matched === 1 ? '' : 's'} will take this
            route&apos;s order, paperwork, standing notes and appointment windows (set from the
            route when the trip is finished).
          </Text>
          {candidate.diff.importOnly > 0 ? (
            <Text style={{ ...typography.subhead, color: c.textSecondary }}>
              {candidate.diff.importOnly} stop{candidate.diff.importOnly === 1 ? '' : 's'} on
              today&apos;s document {candidate.diff.importOnly === 1 ? 'is' : 'are'} not on this
              route. They go at the end, badged New, and you can move them.
            </Text>
          ) : null}
          {candidate.diff.templateOnly > 0 ? (
            <Text style={{ ...typography.subhead, color: c.textSecondary }}>
              {candidate.diff.templateOnly} stop{candidate.diff.templateOnly === 1 ? '' : 's'} on
              this route {candidate.diff.templateOnly === 1 ? 'is' : 'are'} not on today&apos;s
              manifest. They stay in the list, skipped, and one tap keeps any of them.
            </Text>
          ) : null}
          <Text style={{ ...typography.caption1, color: c.textTertiary }}>
            Today&apos;s quantities, references and per-stop notes are not changed. A window printed
            on this document is kept as printed.
          </Text>

          <Pressable
            onPress={onConfirm}
            accessibilityRole="button"
            accessibilityLabel="Confirm, use this template"
            style={{
              minHeight: TOUCH,
              borderRadius: radii.md,
              backgroundColor: c.brand,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...typography.subhead, color: '#fff', fontWeight: '600' }}>
              Use this template
            </Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            style={{ minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ ...typography.subhead, color: c.textSecondary }}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
    </BottomSheet>
  )
}

/**
 * The post-commit template question (spec Section 8, items 5 and 7).
 *
 * Renders nothing until the import is committed AND the server has RECORDED an
 * offer. Phase 8 owns the commit, so this draws nothing today — and it will
 * light up without this file changing, because it is driven by what was
 * recorded rather than by a flag a component sets for itself. That is also what
 * makes "offered once, never silent" true: the record is written by the commit,
 * not by someone opening this screen.
 */
export function ImportTemplateOffer({ token, importId }: { token: string; importId: string }) {
  const c = useThemeColors()
  const [offer, setOffer] = useState<Awaited<ReturnType<typeof ownerImportsApi.getTemplateOffer>> | null>(null)
  const [busy, setBusy] = useState(false)

  const load = React.useCallback(async () => {
    try {
      setOffer(await ownerImportsApi.getTemplateOffer(token, importId))
    } catch {
      // A question we could not fetch is a question we do not ask. The trip is
      // already committed and there is nothing the dispatcher can do here.
    }
  }, [token, importId])

  React.useEffect(() => {
    void load()
  }, [load])

  if (!offer || offer.kind === 'NONE') return null

  const isUpdate = offer.kind === 'UPDATE_TEMPLATE'
  const isAuto = offer.kind === 'AUTO_CREATED'

  async function answer(action: 'save' | 'update' | 'dismiss') {
    haptic.medium()
    setBusy(true)
    try {
      if (action === 'save') await ownerImportsApi.saveAsRouteTemplate(token, importId)
      else await ownerImportsApi.answerTemplateOffer(token, importId, action)
      await load()
    } catch (e) {
      Alert.alert('Could not save that', e instanceof Error ? e.message : 'Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={{ backgroundColor: c.surfaceCard, borderRadius: radii.lg, padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {isAuto ? <Sparkles color={c.textSecondary} size={16} /> : <Route color={c.textSecondary} size={16} />}
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}>
            {isAuto
              ? 'Saved as a suggested route'
              : isUpdate
                ? 'This trip ran differently from its template'
                : 'Save this run as a route template?'}
          </Text>
          <Text style={{ ...typography.caption1, color: c.textSecondary }}>
            {isAuto
              ? `${offer.templateName ? `“${offer.templateName}” is` : 'It is'} in Suggested templates until someone confirms it.`
              : isUpdate
                ? `${offer.changedSummary}. Update “${offer.templateName}” so tomorrow starts from what actually ran?`
                : 'Next time this document arrives, the order, the windows and the paperwork come back on their own.'}
          </Text>
        </View>
      </View>

      {isAuto ? null : offer.answered ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Check color={c.textTertiary} size={14} />
          <Text style={{ ...typography.caption1, color: c.textSecondary, flex: 1 }}>
            Asked and answered. This will not come up again.
          </Text>
        </View>
      ) : (
        <View style={{ gap: spacing.sm }}>
          <Pressable
            onPress={() => void answer(isUpdate ? 'update' : 'save')}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={isUpdate ? 'Update the template' : 'Save as route template'}
            style={{
              minHeight: TOUCH,
              borderRadius: radii.md,
              backgroundColor: c.brand,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={{ ...typography.subhead, color: '#fff', fontWeight: '600' }}>
                {isUpdate ? 'Update the template' : 'Save as route template'}
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => void answer('dismiss')}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={isUpdate ? 'Leave the template as it is' : 'No thanks'}
            style={{ minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ ...typography.subhead, color: c.textSecondary }}>
              {isUpdate ? 'Leave it as it is' : 'No thanks'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}
