/**
 * quick-547 — the transient answer overlay for the full-screen walkaround.
 *
 * PURE. No React, no Prisma, no I/O, no `'use client'`. Same three-file
 * discipline as the rest of Phase 9 — `inspection-gate.ts` decides,
 * `inspection-lookup.ts` reads, `inspection-service.ts` writes — and this file
 * is the decision half of one narrow question: *what does the screen show
 * between the tap and the server tree landing?* It has no runtime of its own,
 * so it can be tested without a database and without a browser.
 *
 * WHY IT EXISTS. `/inspection/[dispatchId]` is a Server Component that hands
 * the checklist down as a prop, and every answer action ends in
 * `revalidatePath`. That is the only change signal there has ever been, and the
 * client never applied it: the driver tapped Pass, the write succeeded, and the
 * chip still read "Not answered". This module is the client-side half that
 * makes the tap visible immediately, WITHOUT ever showing a tick for a write
 * that did not land.
 *
 * THE OVERLAY IS A CLAIM, NOT AN ANSWER. Every entry describes one write that
 * is in flight right now. The runner holds it in `useOptimistic`, which React
 * discards automatically when the transition that set it ends — so a failed
 * write cannot render as answered, structurally, rather than because some later
 * edit remembered to clear it. That is the same shape of reasoning as
 * `autoLinkTarget()` and the T3/T4 verdict union: make the wrong state
 * unrepresentable rather than guarded.
 */

import type {
  InspectionChecklistView,
  InspectionStepView,
} from '@/lib/carrier/inspection-handlers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InspectionStepStatus = InspectionStepView['status'];

/** The three statuses that mean "a human has answered this item". */
export type AnsweredStatus = Extract<
  InspectionStepStatus,
  'COMPLETE' | 'FAILED' | 'SKIPPED'
>;

/** The three things a driver can tap. Named as the button is labelled. */
export type OptimisticVerb = 'pass' | 'fail' | 'na';

/**
 * Verb to status, in ONE place.
 *
 * The runner used to know this mapping implicitly, by calling a differently
 * named action per button and never naming the resulting status at all. Now
 * that the screen renders the status before the server confirms it, the mapping
 * is a real fact the client asserts, and a fact asserted in two places is a
 * fact that will disagree with itself.
 */
export const STATUS_FOR_VERB: Record<OptimisticVerb, AnsweredStatus> = {
  pass: 'COMPLETE',
  fail: 'FAILED',
  na: 'SKIPPED',
};

/**
 * One in-flight answer.
 *
 * `verb` — not a `saving: boolean` — is the discriminant the runner reads for
 * the busy affordance, and the choice is deliberate. A boolean would be `true`
 * on every entry the overlay can ever hold (React drops them the moment the
 * transition ends), so it would carry no information at all; `verb` carries the
 * one thing the card actually needs, which is WHICH of its three buttons is the
 * one spinning. Read it with `pendingVerbFor`.
 *
 * `note` and `photoKeys` are optional and, when present, are shown. That is
 * honest rather than optimistic: the note is the text the driver just typed and
 * is travelling in the same request, and the photo bytes are already in R2 —
 * upload-at-capture put them there before this claim existed.
 */
export interface OptimisticAnswer {
  stepInstanceId: string;
  /** The status this in-flight write is claiming. */
  status: AnsweredStatus;
  /** Which button the driver tapped; read by the runner for the spinner. */
  verb: OptimisticVerb;
  note?: string | null;
  photoKeys?: string[];
}

/** The collection the runner holds. Ordered: later entries win (see below). */
export type OptimisticAnswers = readonly OptimisticAnswer[];

export interface InspectionProgress {
  total: number;
  answered: number;
  remaining: number;
}

// ---------------------------------------------------------------------------
// Predicates
// ---------------------------------------------------------------------------

/**
 * "Somebody has answered this item."
 *
 * Exported so the progress bar, the per-section counter and the card's own chip
 * all ask the same question. Three inlined copies of
 * `status !== 'NOT_STARTED' && status !== 'IN_PROGRESS'` is three chances for
 * the header to disagree with the item directly beneath it.
 */
export function isAnswered(step: Pick<InspectionStepView, 'status'>): boolean {
  return step.status !== 'NOT_STARTED' && step.status !== 'IN_PROGRESS';
}

/**
 * The verb in flight for one step, or null.
 *
 * Walks backwards so the newest claim wins, matching `applyOptimisticAnswers`.
 * Deliberately answers even for a step whose server value already supersedes
 * the claim: the status is not applied in that case, but the spinner still must
 * be, because a write IS in flight and a button that looks idle while it runs
 * invites the second tap this whole task exists to stop.
 */
export function pendingVerbFor(
  overlay: OptimisticAnswers,
  stepInstanceId: string,
): OptimisticVerb | null {
  for (let i = overlay.length - 1; i >= 0; i -= 1) {
    if (overlay[i].stepInstanceId === stepInstanceId) return overlay[i].verb;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The overlay
// ---------------------------------------------------------------------------

/**
 * Merge the in-flight claims onto the server's view. Returns a NEW view; never
 * mutates `view`, its sections, or its steps.
 *
 * TWO RULES, and each is the reason a plausible simpler version is wrong.
 *
 * 1. A SERVER STATUS ALWAYS SUPERSEDES A CLAIM. The moment the server's value
 *    for a step is anything other than `NOT_STARTED`/`IN_PROGRESS`, the claim
 *    is spent and is dropped. A claim describes a write in flight; once there
 *    is a real recorded answer, continuing to paint over it would let a stale
 *    overlay mask a real answer — including one somebody else recorded, and
 *    including a FAILED that the driver must never be shown as a pass.
 *
 *    The accepted cost, stated rather than hidden: RE-ANSWERING an item that is
 *    already answered (Pass → "Change to fail", which the runner allows and
 *    Phase 9 deliberately kept one-directional) gets no optimistic preview. The
 *    chip holds its old value, spinning, until the refreshed server tree lands.
 *    That is the conservative direction and it is the right one: the screen is
 *    never ahead of the record, only occasionally behind it.
 *
 * 2. A CLAIM NAMING A STEP THAT IS NOT IN THE VIEW IS INERT. It is never
 *    appended as a new step. Appending would invent a checklist item — a row on
 *    a DVIR that no playbook contains and no mechanic will ever see — which is
 *    strictly worse than the missing tick this module was written to fix.
 *
 * Untouched steps and untouched sections come back by IDENTITY, not as copies.
 * That keeps React's reconciliation cheap and, more usefully, makes "nothing
 * here was touched" an assertable fact in the tests.
 */
export function applyOptimisticAnswers(
  view: InspectionChecklistView,
  overlay: OptimisticAnswers,
): InspectionChecklistView {
  if (overlay.length === 0) return { ...view };

  // Last claim wins. A driver who taps Pass and then, before it lands, opens
  // the fail form and reports a fault meant the fault.
  const claims = new Map<string, OptimisticAnswer>();
  for (const entry of overlay) claims.set(entry.stepInstanceId, entry);

  const sections = view.sections.map((section) => {
    let changed = false;
    const steps = section.steps.map((step) => {
      const claim = claims.get(step.stepInstanceId);
      if (!claim) return step;
      // Rule 1.
      if (isAnswered(step)) return step;
      changed = true;
      return {
        ...step,
        status: claim.status,
        note: claim.note ?? step.note,
        photoKeys: claim.photoKeys ?? step.photoKeys,
      };
    });
    return changed ? { ...section, steps } : section;
  });

  // Rule 2 needs no code: a claim whose id matched nothing was simply never
  // read out of the map. The step count is arithmetically unchanged because
  // `map` cannot lengthen an array.
  return { ...view, sections };
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

/**
 * Progress counts ONLY steps this driver can answer (quick-543).
 *
 * A DISPATCHER-assigned step left NOT_STARTED would otherwise sit in the
 * denominator forever: the bar would stop one short of full, "1 item still
 * needs an answer" would never clear, and the driver would hunt for a step
 * they are not allowed to touch. The gate already ignores these — its outcomes
 * have always been INSPECTION_ITEM-only — so counting them here was the screen
 * disagreeing with the verdict it was about to receive.
 *
 * quick-547 moved this out of `InspectionRunner`'s `totals` useMemo so that the
 * header counter and the per-item chips are computed by the same function over
 * the same (optimistic) view. That is the entire reason it left the component:
 * two derivations of "answered" are two things that can disagree, and the one
 * the driver can see is the one that would be wrong.
 */
export function inspectionProgress(view: InspectionChecklistView): InspectionProgress {
  const mine = view.sections.flatMap((s) => s.steps).filter((s) => s.answerableByDriver);
  const answered = mine.filter(isAnswered).length;
  return { total: mine.length, answered, remaining: mine.length - answered };
}

/** The same count, for one section. Same predicates, by construction. */
export function sectionRemainingCount(
  section: { steps: InspectionStepView[] } | undefined,
): number {
  if (!section) return 0;
  return section.steps.filter((s) => s.answerableByDriver && !isAnswered(s)).length;
}
