/**
 * The optimisation card's copy, as strings.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SENTENCES ARE BUILT HERE INSTEAD OF WRITTEN IN JSX (quick-517)
 * ---------------------------------------------------------------------------
 * `template-copy.ts` next door records the whole story: a sentence assembled by
 * a renderer out of adjacent children — a count, a bare word, a pluralising
 * ternary, some literal text — rendered as "4 stopswill" on screen, twice,
 * across two investigations that both blamed JSX whitespace trimming and were
 * both wrong. What the two attempts had in common was the shape they were
 * reasoning about, not the rule they were chasing.
 *
 * Section 9's line is exactly that shape and worse — it has TWO counts in one
 * sentence:
 *
 * ```
 *   Suggested order saves 18 miles and 34 min
 * ```
 *
 * So it arrives at the component as ONE string. There is no boundary left to
 * join wrongly, and the copy is assertable without a renderer.
 *
 * The mirror lives at `apps/mobile/lib/optimisation-copy.ts`. **Keep the wording
 * in step** — a dispatcher who reads one sentence on a desktop and a different
 * one on a phone learns to trust neither.
 */

import type { OptimisationDeclineReason, OptimisationSuggestion } from './optimisation';

/** `18 miles` / `1 mile`. The pluralisation that would have been three children. */
export function milesPhrase(miles: number): string {
  const rounded = Math.round(miles * 10) / 10;
  return `${rounded} ${rounded === 1 ? 'mile' : 'miles'}`;
}

/**
 * `34 min` / `1 h 15 min`.
 *
 * Minutes up to an hour, then hours and minutes — a dispatcher reading "95 min"
 * has to do arithmetic to know whether that is worth the reorder, and the whole
 * job of this line is to be answerable at a glance.
 */
export function minutesPhrase(minutes: number): string {
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Section 9's one line, verbatim in shape: *"Suggested order saves 18 miles and
 * 34 min."*
 *
 * Both numbers are always stated, even when one of them is zero, and that is
 * deliberate: the floor is an OR, so a suggestion can clear it on time alone,
 * and a line that quietly omitted "0 miles" would look like it was hiding the
 * part that did not help. A dispatcher deciding whether to accept a reorder is
 * entitled to both halves of the trade.
 */
export function savingsSentence(suggestion: OptimisationSuggestion): string {
  return `Suggested order saves ${milesPhrase(suggestion.savedMiles)} and ${minutesPhrase(
    suggestion.savedMinutes,
  )}.`;
}

/** The two controls, named once so both surfaces label them identically. */
export const KEEP_CURRENT_ORDER_LABEL = 'Keep current order';
export const USE_SUGGESTED_ORDER_LABEL = 'Use suggested order';

/**
 * What to say when nothing is offered.
 *
 * Most of these are never rendered on the import card — Section 9 says *"below
 * the configured floor, do not offer it at all"*, and "do not offer" means the
 * card is absent, not that it shows a apologetic sentence. They exist for the
 * template screen, where a person pressed a button and is owed an answer, and
 * for the logs.
 */
export const DECLINE_SENTENCES: Record<OptimisationDeclineReason, string> = {
  NOT_ENOUGH_STOPS: 'There are too few stops for the order to matter.',
  UNRESOLVED_STOPS: 'Some stops have no facility yet, so the driving distance cannot be worked out.',
  NO_MATRIX: 'Driving distances are not available right now. Try again shortly.',
  ALREADY_BEST: 'This is already the shortest order that respects the appointments.',
  BELOW_FLOOR: 'No other order saves enough to be worth changing.',
};

export function declineSentence(reason: OptimisationDeclineReason | null): string | null {
  return reason ? DECLINE_SENTENCES[reason] : null;
}
