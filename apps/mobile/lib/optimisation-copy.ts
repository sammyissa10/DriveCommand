/**
 * The optimisation card's copy on mobile — the mirror of
 * `apps/web/src/lib/document-import/optimisation-copy.ts`.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SENTENCES ARE BUILT HERE INSTEAD OF IN JSX (quick-517)
 * ---------------------------------------------------------------------------
 * `template-copy.ts` next door carries the full account: a sentence assembled by
 * a renderer out of adjacent children — a count, a bare word, a pluralising
 * ternary, some literal text — rendered as "4 stopswill" on screen, twice,
 * across two investigations that both blamed whitespace trimming and were both
 * wrong. Section 9's line has TWO counts in it, so it is built as one string.
 *
 * **KEEP THE WORDING IN STEP WITH THE WEB FILE.** A dispatcher who reads one
 * sentence on a laptop and a different one on a phone learns to trust neither.
 * The savings line itself arrives pre-assembled from the server
 * (`OptimisationView.sentence`) — these functions exist for the parts a screen
 * composes locally, and for the two button labels.
 */

/** `18 miles` / `1 mile`. The pluralisation that would have been three children. */
export function milesPhrase(miles: number): string {
  const rounded = Math.round(miles * 10) / 10
  return `${rounded} ${rounded === 1 ? 'mile' : 'miles'}`
}

/** `34 min` / `1 h 15 min`. Hours past sixty, so the line is answerable at a glance. */
export function minutesPhrase(minutes: number): string {
  const total = Math.round(minutes)
  if (total < 60) return `${total} min`
  const hours = Math.floor(total / 60)
  const rest = total % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

/**
 * The fallback savings line, for a payload that predates the server-assembled
 * one. Same wording as the web twin, character for character.
 */
export function savingsSentence(savedMiles: number, savedMinutes: number): string {
  return `Suggested order saves ${milesPhrase(savedMiles)} and ${minutesPhrase(savedMinutes)}.`
}

/** The sentence under the line. One string, for the reason in the header. */
export const OPTIMISATION_CONSTRAINTS_NOTE =
  'Pickups still come before their deliveries, firm appointments keep their order, and the end stop stays last.'

export const KEEP_CURRENT_ORDER_LABEL = 'Keep current order'
export const USE_SUGGESTED_ORDER_LABEL = 'Use suggested order'

/** The end stop row's explanation. Kept here so both surfaces say it identically. */
export const END_STOP_EXPLANATION =
  'Where this truck finishes the day. It becomes a real stop, so the arrival is tracked and the miles and hours close out.'
