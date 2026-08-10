/**
 * The apply-confirmation's copy, as strings (quick-517).
 *
 * ---------------------------------------------------------------------------
 * WHY THE SENTENCES ARE BUILT HERE INSTEAD OF WRITTEN IN JSX
 * ---------------------------------------------------------------------------
 * The dialog rendered "4 stopswill" and "2 stopson" on screen. The suspected
 * cause both times it was looked at was JSX whitespace trimming around a count
 * expression — and both times the *source* turned out to already be the safe
 * shape. Compiling the components with the project's own `tsc` shows the space
 * present in the emitted children array:
 *
 * ```js
 * [candidate.diff.matched, " stop", n === 1 ? '' : 's', " will take this route's …"]
 * ```
 *
 * So chasing the trimming rule was chasing the wrong thing twice. What both
 * attempts had in common is the *shape* they were reasoning about: a sentence
 * assembled by the renderer out of four adjacent children, three of which are
 * whitespace-sensitive text nodes. Whatever ate the space — a trimming rule, a
 * parser recovery, React Native's text-fragment measurement, a reflow by a
 * formatter — could only act because the gap between "stops" and "will" was a
 * boundary between two nodes rather than a character inside one.
 *
 * These functions remove the boundary. Each sentence arrives at the component as
 * **one string**, rendered as a single child, so there is nothing left to join
 * wrongly and no rule left to get right. `applyConfirmSentences` is pure, so the
 * copy is also assertable without a renderer — see `template-copy.test.ts`, and
 * `TemplateDecision.test.tsx` for the rendered proof.
 *
 * The wording is unchanged from Phase 6 / quick-515, deliberately: this is a
 * spacing fix, not a rewrite of text a dispatcher has already learned.
 */

import type { TemplateDiff } from './template-matching';

/** `4 stops` / `1 stop`. The pluralisation that was three JSX children. */
export function countOf(n: number, noun: string, plural = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : plural}`;
}

/** `is` / `are`, agreeing with the count. */
const isAre = (n: number): string => (n === 1 ? 'is' : 'are');

/**
 * Every sentence the apply confirmation shows, in order, for one candidate.
 *
 * Zero-count sentences are omitted rather than rendered as "0 stops …", the same
 * rule `describeDiff` follows. The closing sentence is always present: what the
 * import keeps is the reassurance the dialog exists to give.
 */
export function applyConfirmSentences(diff: TemplateDiff): string[] {
  const sentences: string[] = [
    `${countOf(diff.matched, 'stop')} will take this route’s order, paperwork, standing notes and appointment windows (set from the route when the trip is finished).`,
  ];

  if (diff.importOnly > 0) {
    sentences.push(
      `${countOf(diff.importOnly, 'stop')} on today’s document ${isAre(diff.importOnly)} not on this route. They go at the end, badged New, and you can move them where they belong.`,
    );
  }

  if (diff.templateOnly > 0) {
    sentences.push(
      `${countOf(diff.templateOnly, 'stop')} on this route ${isAre(diff.templateOnly)} not on today’s manifest. They stay in the list, skipped, and one tap keeps any of them.`,
    );
  }

  // A stop leaving the list is something to say out loud, not something to let a
  // dispatcher discover (quick-518). Named by what it is — a stop the last
  // template added, not a stop from the document — so nobody reads it as freight
  // being dropped.
  if (diff.templateInsertedDropped > 0) {
    sentences.push(
      `${countOf(diff.templateInsertedDropped, 'skipped stop')} added by the last template ${isAre(diff.templateInsertedDropped)} removed and worked out again for this one. Nothing from the document is touched.`,
    );
  }

  return sentences;
}

/**
 * The footer line, kept separate because it is styled differently on both
 * surfaces (muted, smaller) and is not about a count.
 */
export const APPLY_CONFIRM_FOOTNOTE =
  'Today’s quantities, references and per-stop notes are not changed. A window printed on this document is kept as printed.';
