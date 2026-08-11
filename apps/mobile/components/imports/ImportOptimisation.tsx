import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { Route } from 'lucide-react-native'
import { ownerImportsApi, type OptimisationView } from '@drivecommand/api-client'
import {
  KEEP_CURRENT_ORDER_LABEL,
  OPTIMISATION_CONSTRAINTS_NOTE,
  USE_SUGGESTED_ORDER_LABEL,
  savingsSentence,
} from '../../lib/optimisation-copy'
import { haptic } from '../../lib/haptics'
import { useThemeColors, radii, spacing, typography } from '../../constants/tokens'

/**
 * The optimisation card (spec Section 9, Part B), on mobile.
 *
 * ```
 *  +---------------------------------------------+
 *  | Suggested order saves 18 miles and 34 min   |
 *  |                                             |
 *  | [ Use suggested order ]  Keep current order |
 *  +---------------------------------------------+
 * ```
 *
 * ---------------------------------------------------------------------------
 * RENDERING NOTHING IS THE COMMON CASE, AND IT IS THE FEATURE
 * ---------------------------------------------------------------------------
 * Section 9: *"Below a configurable floor, do not offer it at all — noise erodes
 * trust."* The floor lives in `optimisation-constants.ts` on the server and
 * nowhere else; this component compares nothing to a number and holds no
 * threshold. It draws when the server says `offered`, and returns null when the
 * saving is small, when the order is already the best one, when the stops have
 * not changed since the applied template, and when the routing engine is
 * unavailable.
 *
 * "Keep current order" writes NOTHING. Declining a suggestion is the absence of
 * a request, not a request; it dismisses the card and the order a person set
 * stays exactly as it was. Only "Use suggested order" reaches the server, and
 * even that recomputes the suggestion there rather than sending an order up from
 * here — a client that could name its own permutation would be a reorder
 * endpoint wearing an optimiser's name.
 *
 * The savings line is ONE string, assembled server-side. See
 * `lib/optimisation-copy.ts` for why a sentence with two counts in it is never
 * built out of adjacent children on this app's screens (quick-517).
 *
 * DESIGN (Section 15). One accent on one primary action. No borders — the card
 * separates from the list by `surfaceElevated`. Targets at least 44px.
 */

const TOUCH = 44

export function ImportOptimisation({
  token,
  importId,
  onApplied,
}: {
  token: string
  importId: string
  /** Reload the stop list — the running order has just changed on the server. */
  onApplied: () => void
}) {
  const c = useThemeColors()
  const [view, setView] = useState<OptimisationView | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    ownerImportsApi
      .getOptimisation(token, importId)
      .then((v) => {
        if (live) setView(v)
      })
      // Silent. A routing engine that is down must not put an error on a screen
      // where nobody asked a question — no suggestion is the correct degraded
      // state, and it is indistinguishable from "nothing to suggest", which is
      // what a dispatcher would have seen anyway.
      .catch(() => {})
    return () => {
      live = false
    }
  }, [token, importId])

  async function apply() {
    haptic.medium()
    setBusy(true)
    setError(null)
    try {
      await ownerImportsApi.applyOptimisation(token, importId)
      setDismissed(true)
      onApplied()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply that order.')
    } finally {
      setBusy(false)
    }
  }

  if (dismissed) return null
  if (!view?.offered) return null

  // `sentence` is the server's, already assembled. The local fallback exists for
  // a payload from an older deploy and says the same words.
  const sentence =
    view.sentence ?? savingsSentence(view.suggestion.savedMiles, view.suggestion.savedMinutes)

  return (
    <View
      style={{
        backgroundColor: c.surfaceElevated,
        borderRadius: radii.lg,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Route color={c.textSecondary} size={16} style={{ marginTop: 2 }} />
        <Text style={{ ...typography.subhead, color: c.textPrimary, fontWeight: '600', flex: 1 }}>
          {sentence}
        </Text>
      </View>

      <Text style={{ ...typography.caption1, color: c.textTertiary, paddingLeft: 16 + spacing.sm }}>
        {OPTIMISATION_CONSTRAINTS_NOTE}
      </Text>

      {error ? (
        <Text style={{ ...typography.footnote, color: c.danger, paddingLeft: 16 + spacing.sm }}>
          {error}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: 16 + spacing.sm }}>
        <Pressable
          disabled={busy}
          onPress={() => void apply()}
          accessibilityRole="button"
          accessibilityLabel={USE_SUGGESTED_ORDER_LABEL}
          style={{
            minHeight: TOUCH,
            justifyContent: 'center',
            alignItems: 'center',
            paddingHorizontal: spacing.lg,
            borderRadius: radii.md,
            backgroundColor: c.brand,
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ ...typography.subhead, color: '#fff', fontWeight: '600' }}>
              {USE_SUGGESTED_ORDER_LABEL}
            </Text>
          )}
        </Pressable>

        {/* Writes nothing. See the header. */}
        <Pressable
          disabled={busy}
          onPress={() => {
            haptic.light()
            setDismissed(true)
          }}
          accessibilityRole="button"
          accessibilityLabel={KEEP_CURRENT_ORDER_LABEL}
          style={{ minHeight: TOUCH, justifyContent: 'center', paddingHorizontal: spacing.sm }}
        >
          <Text style={{ ...typography.subhead, color: c.textSecondary }}>
            {KEEP_CURRENT_ORDER_LABEL}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
