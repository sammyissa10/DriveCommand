/**
 * quick-550 — what happens when the driver taps "Sign and submit", as a pure
 * decision.
 *
 * PURE. No React, no Prisma, no I/O, no `'use client'` — deliberately, because
 * the same facts have to be stated in two places that share no runtime: the
 * client validator inside `SignatureScreen.submit()`, and the `signInspection`
 * server action, which is a `'use server'` module and cannot import anything
 * that touches a DOM. Same three-file discipline as the rest of Phase 9 —
 * `inspection-gate.ts` decides, `inspection-lookup.ts` reads,
 * `inspection-service.ts` writes — and this file is the decision half of one
 * narrow question.
 *
 * ---------------------------------------------------------------------------
 * WHY IT EXISTS: ONE CHECK STOOD FOR TWO CONDITIONS
 * ---------------------------------------------------------------------------
 *
 * `SignatureScreen.submit()` opened with an unconditional rasterise:
 *
 *     const blob = await handleRef.current?.toBlob();
 *     if (!blob) { setError('The signature came out empty. Sign again.'); return; }
 *
 * — placed ABOVE the guard that already, correctly, skipped the upload when the
 * playbook has no SIGNATURE step. On such a playbook `<SignaturePad>` never
 * mounts, so `handleRef.current` stays null, the OPTIONAL CHAIN short-circuits
 * to `undefined`, `!blob` is true, and the driver was told to sign again on a
 * screen that shows no canvas to sign on. `canSign` (variant-aware, correct)
 * enabled the button; the validator then refused it. The whole walkaround was
 * unsubmittable, in front of `Trip.start`.
 *
 * "There is no pad" and "the pad is blank" are DIFFERENT FACTS with different
 * remedies, and neither is the other's error message. Un-collapsing them is the
 * entire fix, and `SIGNATURE_PAD_MISSING_ERROR` is what un-collapses them: it
 * describes the pad failing to load, never the driver failing to sign.
 *
 * ---------------------------------------------------------------------------
 * WHY A PLAN AND NOT A BOOLEAN
 * ---------------------------------------------------------------------------
 *
 * The decision is deliberately TWO-STAGE. `planSignatureSubmission` answers
 * "should the canvas be consulted at all?" WITHOUT being handed a blob — it
 * cannot be, since it is pure and a blob only exists after an `await` on the
 * DOM. That is the point: the caller can only obtain a blob inside the
 * `RASTERISE` branch, so the canvas call sits STRUCTURALLY inside the branch
 * rather than on a line a later edit can drift back above the guard. A boolean
 * return would have left the rasterise where it was and merely added a
 * condition next to it.
 *
 * Same shape of reasoning as `autoLinkTarget()` and the T3/T4 verdict union in
 * the facility ladder, and as `useOptimistic` in `inspection-optimistic.ts`:
 * make the wrong state unrepresentable rather than guarded.
 *
 * ---------------------------------------------------------------------------
 * WHAT MUST NOT BE "SIMPLIFIED"
 * ---------------------------------------------------------------------------
 *
 * The tempting wrong fix is to delete the empty check instead of making it
 * conditional. `SignaturePad.toBlob()` returns `null` when `!hasInkRef.current`,
 * and that null IS the empty-canvas detector. quick-533 exists because a DVIR
 * signed with no signature is the artifact to prevent, so `hasBlob: false` must
 * keep rejecting. Equally, the blank-name check runs BEFORE the variant split
 * and applies to both variants: on the typed-name variant the name is the only
 * attestation there is.
 */

// ---------------------------------------------------------------------------
// The three sentences, in one place
// ---------------------------------------------------------------------------

/**
 * The driver left the printed-name box empty.
 *
 * This is the single source of the wording. `signInspection` in
 * `(driver-fullscreen)/inspection/actions.ts` imports it rather than repeating
 * the literal, so the client validator and the server action cannot drift into
 * telling the driver two different things about one condition.
 */
export const SIGNATURE_BLANK_NAME_ERROR = 'Type the name you are signing under.';

/**
 * A pad is on screen and the driver has not drawn on it.
 *
 * Reached only when `hasPad` is true, i.e. `<SignaturePad>` mounted and handed
 * back its handle, and `toBlob()` still resolved null — which it does exactly
 * when `hasInkRef.current` is false. "Sign again" is honest here: there is
 * something to sign on.
 */
export const SIGNATURE_EMPTY_CANVAS_ERROR = 'The signature came out empty. Sign again.';

/**
 * The playbook asks for a drawn signature and no pad is available to draw on.
 *
 * WORDING IS LOAD-BEARING. This is not the driver's failure and must not be
 * phrased as one — telling someone to "sign again" when there is no canvas is
 * precisely the dead end quick-550 fixes. It names the component, not the
 * person, and offers the remedy that actually applies to a component that never
 * mounted (reload), not the one that applies to a blank canvas (draw).
 *
 * After this fix the condition is unreachable through the normal variants:
 * `signatureNeeded` is `view.signature.required`, which is what decides whether
 * `<SignaturePad>` renders. It survives as the honest report for the residual
 * case — a required pad that failed to mount or never called `onHandle` — which
 * previously masqueraded as an empty signature.
 */
export const SIGNATURE_PAD_MISSING_ERROR =
  'The signature pad did not load. Reload this page and try again.';

// ---------------------------------------------------------------------------
// Stage 1 — should the canvas be consulted at all?
// ---------------------------------------------------------------------------

/**
 * `SUBMIT_ONLY` is the typed-name variant: no pad exists, none is wanted, and
 * the submission proceeds straight to `submitInspectionChecklist`.
 * `RASTERISE` is the only outcome that licenses touching the DOM.
 */
export type SignaturePlan =
  | { kind: 'REJECT'; error: string }
  | { kind: 'RASTERISE' }
  | { kind: 'SUBMIT_ONLY' };

export function planSignatureSubmission(input: {
  /** `view.signature.required` — does this playbook carry a SIGNATURE step? */
  signatureNeeded: boolean;
  /** The printed-name box, untrimmed; trimming happens here so both callers agree. */
  name: string;
}): SignaturePlan {
  // The name gate runs FIRST and for BOTH variants. On the typed-name variant
  // it is the whole attestation; on the drawn variant `signInspection` will
  // refuse a blank name anyway, and refusing here means the driver is told
  // before an upload happens rather than after.
  if (input.name.trim().length === 0) {
    return { kind: 'REJECT', error: SIGNATURE_BLANK_NAME_ERROR };
  }

  return input.signatureNeeded ? { kind: 'RASTERISE' } : { kind: 'SUBMIT_ONLY' };
}

// ---------------------------------------------------------------------------
// Stage 2 — the canvas was consulted; what came back?
// ---------------------------------------------------------------------------

export type RasterisedOutcome =
  | { kind: 'REJECT'; error: string }
  | { kind: 'UPLOAD_THEN_SUBMIT' };

/**
 * Two booleans, not one, because the bug was one boolean standing for two
 * facts. `hasPad` is `handleRef.current !== null` — did the component mount and
 * hand back a handle. `hasBlob` is whether `toBlob()` produced bytes.
 *
 * Order matters: a missing pad is checked first, because with no pad `hasBlob`
 * is false for a reason that has nothing to do with the driver.
 */
export function resolveRasterisedSignature(input: {
  hasPad: boolean;
  hasBlob: boolean;
}): RasterisedOutcome {
  if (!input.hasPad) {
    return { kind: 'REJECT', error: SIGNATURE_PAD_MISSING_ERROR };
  }
  if (!input.hasBlob) {
    return { kind: 'REJECT', error: SIGNATURE_EMPTY_CANVAS_ERROR };
  }
  return { kind: 'UPLOAD_THEN_SUBMIT' };
}
