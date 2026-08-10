/**
 * The apply-confirmation's copy, as strings (quick-517).
 *
 * ---------------------------------------------------------------------------
 * A VERBATIM MIRROR OF apps/web/src/lib/document-import/template-copy.ts
 * ---------------------------------------------------------------------------
 * Keep the two in step. The wording must not diverge — it is the same merge being
 * described to the same dispatcher, and Phase 6 already states that rule for every
 * sentence in this dialog. A mirror rather than an import because the two apps
 * cannot import each other's source, and copy does not belong in
 * `packages/validation` (schemas) or `packages/api-client` (transport). Every
 * other sentence in `ImportTemplate.tsx` is mirrored from its web twin the same
 * way; this moves the mirroring from JSX into one function, which is strictly
 * fewer places to drift.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SENTENCES ARE BUILT HERE INSTEAD OF WRITTEN IN JSX
 * ---------------------------------------------------------------------------
 * The dialog rendered "4 stopswill" and "2 stopson" on screen. Both investigations
 * blamed JSX whitespace trimming around the count expression, and both times the
 * source already had the safe shape — compiling with `tsc --jsx react-jsx` shows
 * the space present in the emitted children array. What the two attempts had in
 * common was the shape they reasoned about: a sentence the renderer assembles from
 * four adjacent children, three of them whitespace-sensitive text nodes. Whatever
 * ate the gap between "stops" and "will" could only do so because that gap was a
 * boundary between nodes rather than a character inside one — on this surface, a
 * `<Text>` with four children whose fragments are measured and laid out
 * separately. One string per sentence removes the boundary, and with it the whole
 * class.
 */

import type { TemplateDiff } from '@drivecommand/api-client'

/** `4 stops` / `1 stop`. The pluralisation that was three JSX children. */
export function countOf(n: number, noun: string, plural = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : plural}`
}

/** `is` / `are`, agreeing with the count. */
const isAre = (n: number): string => (n === 1 ? 'is' : 'are')

/**
 * Every sentence the apply confirmation shows, in order, for one candidate.
 *
 * Zero-count sentences are omitted rather than rendered as "0 stops …", the same
 * rule `describeDiff` follows.
 */
export function applyConfirmSentences(diff: TemplateDiff): string[] {
  const sentences: string[] = [
    `${countOf(diff.matched, 'stop')} will take this route’s order, paperwork, standing notes and appointment windows (set from the route when the trip is finished).`,
  ]

  if (diff.importOnly > 0) {
    sentences.push(
      `${countOf(diff.importOnly, 'stop')} on today’s document ${isAre(diff.importOnly)} not on this route. They go at the end, badged New, and you can move them where they belong.`,
    )
  }

  if (diff.templateOnly > 0) {
    sentences.push(
      `${countOf(diff.templateOnly, 'stop')} on this route ${isAre(diff.templateOnly)} not on today’s manifest. They stay in the list, skipped, and one tap keeps any of them.`,
    )
  }

  return sentences
}

/** The footer line. Styled differently and not about a count. */
export const APPLY_CONFIRM_FOOTNOTE =
  'Today’s quantities, references and per-stop notes are not changed. A window printed on this document is kept as printed.'
