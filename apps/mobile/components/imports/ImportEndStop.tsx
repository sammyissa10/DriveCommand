import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native'
import { Check, Home, ShieldAlert } from 'lucide-react-native'
import {
  ownerImportsApi,
  type EndStopFacilityView,
  type EndStopPolicy,
  type EndStopSlotView,
} from '@drivecommand/api-client'
import { BottomSheet } from '../ui/BottomSheet'
import { END_STOP_EXPLANATION } from '../../lib/optimisation-copy'
import { haptic } from '../../lib/haptics'
import { useThemeColors, radii, spacing, typography } from '../../constants/tokens'

/**
 * The "Ends at" row on the summary card (spec Section 9, Part A), on mobile.
 *
 * ```
 *   Ends at   MILWAUKEE YARD                    Change
 *             Your company's default
 * ```
 *
 * Loads its own slot: the resolution payload the card holds is Phase 3's shape,
 * and the end stop resolves against three layers — tenant default, template
 * override, per-trip choice — that live behind their own read-only GET.
 *
 * ---------------------------------------------------------------------------
 * "USE MY COMPANY DEFAULT" IS A POST, NOT A RELOAD (quick-516, one slot over)
 * ---------------------------------------------------------------------------
 * The server short-circuits on the presence of `resolution_provenance.endStop`,
 * so once someone has chosen, re-reading returns their choice forever. Undoing
 * it means DELETING the key — `resetEndStop`. Wiring that control to `onChanged`
 * would re-read the state it was trying to leave and look broken while behaving
 * exactly as written, which is precisely how "Look again" failed on the template
 * row.
 *
 * There is no policy that means "undecided": `NONE` says this trip ends nowhere,
 * which is a real and different answer.
 *
 * ---------------------------------------------------------------------------
 * PRIVACY IS NOT DONE HERE
 * ---------------------------------------------------------------------------
 * A driver residence reaches this component only when the viewer is entitled to
 * it — the filter is in the query layer (`facility-visibility.ts`), never a UI
 * conditional, because every one of these payloads is also reachable as JSON.
 * The home icon and the shield below are LABELS on something already authorised,
 * not the control that authorises it.
 *
 * DESIGN (Section 15). No borders; surfaces separate by `surfaceElevated`.
 * Spacing on the token scale. Every target at least 44px.
 */

const TOUCH = 44

type Colors = ReturnType<typeof useThemeColors>

export function ImportEndStop({
  token,
  importId,
  onChanged,
}: {
  token: string
  importId: string
  /** Reloads the card — a per-trip end stop can change what the trip's miles say. */
  onChanged?: () => void
}) {
  const c = useThemeColors()
  const [slot, setSlot] = useState<EndStopSlotView | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    ownerImportsApi
      .getEndStop(token, importId)
      .then((v) => {
        if (live) setSlot(v)
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : 'Could not load the end stop.')
      })
    return () => {
      live = false
    }
  }, [token, importId])

  async function run(work: () => Promise<EndStopSlotView>) {
    setBusy(true)
    setError(null)
    try {
      const next = await work()
      setSlot(next)
      setOpen(false)
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change the end stop.')
    } finally {
      setBusy(false)
    }
  }

  if (!slot) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md }}>
        <Text style={{ ...typography.subhead, color: c.textSecondary, width: 78 }}>Ends at</Text>
        {error ? (
          <Text style={{ ...typography.caption1, color: c.danger, flex: 1 }}>{error}</Text>
        ) : (
          <ActivityIndicator color={c.textTertiary} />
        )}
      </View>
    )
  }

  const label =
    slot.state === 'RESOLVED' && slot.facility
      ? slot.facility.name
      : (slot.options.find((o) => o.policy === slot.policy)?.label ?? '—')

  const sub = slot.blockedReason ?? slot.facility?.address ?? slot.why.detail

  return (
    <View style={{ paddingVertical: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Text style={{ ...typography.subhead, color: c.textSecondary, width: 78 }}>Ends at</Text>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
          {slot.facility?.isDriverResidence ? <Home color={c.textTertiary} size={13} /> : null}
          <Text
            numberOfLines={1}
            style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600', flex: 1 }}
          >
            {label}
          </Text>
        </View>
        <Pressable
          onPress={() => {
            haptic.light()
            setError(null)
            setOpen(true)
          }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Change the end stop"
          style={{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: spacing.sm }}
        >
          <Text style={{ ...typography.caption1, color: c.textTertiary }}>Change</Text>
        </Pressable>
      </View>

      <Text style={{ ...typography.caption1, color: c.textTertiary, paddingLeft: 78 + spacing.md }}>
        {sub}
      </Text>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Where the day ends">
        <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.lg }}>
          <Text style={{ ...typography.footnote, color: c.textSecondary }}>
            {END_STOP_EXPLANATION}
          </Text>

          {slot.options.map((option) => {
            const selected = option.policy === slot.policy
            return (
              <Pressable
                key={option.policy}
                disabled={busy || !option.available}
                onPress={() => {
                  haptic.medium()
                  void run(() =>
                    ownerImportsApi.setEndStop(token, importId, option.policy as EndStopPolicy, null),
                  )
                }}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                style={{
                  minHeight: TOUCH,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  borderRadius: radii.md,
                  backgroundColor: selected ? c.surfaceElevated : c.surfaceCard,
                  opacity: option.available ? 1 : 0.55,
                }}
              >
                {selected ? <Check color={c.brand} size={16} /> : <View style={{ width: 16 }} />}
                <View style={{ flex: 1 }}>
                  <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}>
                    {option.label}
                  </Text>
                  {option.unavailableReason ? (
                    <Text style={{ ...typography.caption1, color: c.textTertiary }}>
                      {option.unavailableReason}
                    </Text>
                  ) : null}
                </View>
                {option.policy === 'DRIVER_RESIDENCE' ? (
                  <ShieldAlert color={c.textTertiary} size={14} />
                ) : null}
              </Pressable>
            )
          })}

          {/* The parking picker, only when it is the answer. A separate choice
              because Section 9 makes this one "per template or trip": the policy
              names a kind of place, the person names the place. */}
          {slot.policy === 'DESIGNATED_PARKING' ? (
            <ParkingPicker
              c={c}
              busy={busy}
              chosenId={slot.facility?.id ?? null}
              candidates={slot.parkingCandidates}
              onPick={(facility) => {
                haptic.medium()
                void run(() =>
                  ownerImportsApi.setEndStop(token, importId, 'DESIGNATED_PARKING', facility.id),
                )
              }}
            />
          ) : null}

          {error ? (
            <Text style={{ ...typography.footnote, color: c.danger }}>{error}</Text>
          ) : null}

          {/* Deletes the stored decision. Shown only when there is one to delete,
              and never once the stop has been created. */}
          {slot.persisted && !slot.materialised ? (
            <Pressable
              disabled={busy}
              onPress={() => {
                haptic.light()
                void run(() => ownerImportsApi.resetEndStop(token, importId))
              }}
              accessibilityRole="button"
              accessibilityLabel="Use my company default"
              style={{ minHeight: TOUCH, justifyContent: 'center', alignItems: 'center' }}
            >
              <Text style={{ ...typography.subhead, color: c.textSecondary }}>
                Use my company default
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </BottomSheet>
    </View>
  )
}

function ParkingPicker({
  c,
  busy,
  chosenId,
  candidates,
  onPick,
}: {
  c: Colors
  busy: boolean
  chosenId: string | null
  candidates: EndStopFacilityView[]
  onPick: (facility: EndStopFacilityView) => void
}) {
  if (candidates.length === 0) {
    return (
      <Text style={{ ...typography.caption1, color: c.textTertiary }}>
        No yards or terminals are set up yet. Add one under Facilities.
      </Text>
    )
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ ...typography.footnote, color: c.textPrimary, fontWeight: '600' }}>
        Which yard?
      </Text>
      {candidates.map((facility) => (
        <Pressable
          key={facility.id}
          disabled={busy}
          onPress={() => onPick(facility)}
          accessibilityRole="button"
          accessibilityLabel={facility.name}
          style={{
            minHeight: TOUCH,
            justifyContent: 'center',
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderRadius: radii.md,
            backgroundColor: chosenId === facility.id ? c.surfaceElevated : c.surfaceCard,
          }}
        >
          <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600' }}>
            {facility.name}
          </Text>
          <Text style={{ ...typography.caption1, color: c.textTertiary }}>{facility.address}</Text>
        </Pressable>
      ))}
    </View>
  )
}
