# quick-525 — Where does the Phase 7 route optimisation actually trigger?

**Date:** 2026-08-24
**Type:** READ-ONLY diagnostic — no code changed, no DDL, no DB writes, no DB reads, no dev server.
**Artifact:** [.planning/document-import/diagnostics/phase7-optimisation-trigger.md](../../document-import/diagnostics/phase7-optimisation-trigger.md)

## Headline

**The template optimisation endpoint has zero client callers.** `GET`/`POST
/api/v1/carrier/templates/[id]/optimisation` is fully implemented — route file, both handlers,
both service functions — and no component, page, hook, server action or `packages/api-client`
entry ever requests it. The desktop Edit Route Template save is not an optimisation trigger, and
neither is anything else. The absent suggestion has a simpler cause than any behaviour inside the
optimiser: nothing asked.

This is **not** quick-522/523's null-coordinate short-circuit firing again. That path is never
reached because the request is never made.

## Findings

1. **Call sites, exhaustive across four layers.** 5 service exports → 1 importer (`handlers.ts`,
   grep-verified sole consumer) → 4 handlers → 3 route files (`find`-exhaustive). Only **one**
   product surface reaches the service: the document-import stop review screen, web and mobile.
   Template optimisation is web-only (no mobile twin) and unreachable from any UI.
2. **Desktop template save traced in six steps** (`page.tsx:156` → `onSubmit` → `handleSubmit` →
   `saveRouteTemplate` → `saveRouteTemplateCore`), zero `optimisation` matches across all five
   participating files plus the post-save destination. Separated two distinct facts: omission
   from `saveRouteTemplateCore` is **deliberate and correct** (documented at
   `optimisation-service.ts:439-443` — a save must not reach a provider or reorder); omission
   from the **screen** is the real gap. Compounding structural issue: the form
   `router.push`es away to the list on success, so the literal "call the GET after save" has
   nowhere to render.
3. **The two `persist: true` mutations:** `applyImportOptimisation` (:335 in :324) — reachable,
   fires on "Use suggested order" on import stop review. `applyTemplateOptimisation` (:521 in
   :513) — **no UI caller, so no user action can trigger it.** This fully explains
   `route_matrix_cache` = 0 rows without appealing to any optimiser behaviour: one mutation is
   unreachable, the other belongs to a path that was not exercised.
4. **Phase 7's obligation, not Phase 8's.** Spec lines 693 and 1590 place "runs on a route
   template when created or edited" inside Phase 7 Part B, alongside items that *were*
   delivered. No deferral note exists — unlike `runPostCommitTemplateStep`,
   `endStopCommitPlan` and `markEndStopMaterialised`, which CLAUDE.md correctly records as
   built-but-dormant pending a named Phase 8 caller. **The Phase 7 summary (`07-SUMMARY.md:241-242`)
   asserts the endpoint is "called after a create or an edit" — describing a caller that no code
   performs**, while its own component table (`:47-50`) lists four components, all import-side.
5. **Suggestion UI exists, import-only.** `OptimisationSuggestion.tsx` (web, mounted at
   `StopReviewScreen.tsx:249`) and `ImportOptimisation.tsx` (mobile, mounted at
   `StopReview.tsx:270`). **No template-side component on either surface.** The web one is
   hardcoded to an `importId` prop and inline import URLs, so it cannot be retargeted without
   changing props and URLs. The copy layer (`optimisation-copy.ts`) *is* surface-agnostic and
   would be reusable.
6. **No window-order validation exists anywhere — definitive.** Verified negative at six layers:
   `RouteTemplateForm.validate()` (name/client/equipment/schedule/≥1 stop/facility only, no
   cross-stop check), `StopCard`, `MobileStopsEditor`, `route-template-save.ts` (pass-through
   only), both API zod schemas (files exist, 18/19 `z.` occurrences, zero `refine`/`superRefine`
   — a real negative, not a missing-file false negative), and the import path's `validateStops`
   (blocks on unresolved facility / missing name / adjacent duplicate; no window check, and it
   never governs a template). Plus a repo-wide semantic sweep.
   **The absence is a documented design stance** — `route_template_stops` has **no "is firm"
   column at all**, so template windows are soft by construction; `appointmentIsFirm: false` is
   set unconditionally at `optimisation-service.ts:447`, and an inversion is *priced* at 30
   minutes (`OPTIMISATION_SOFT_WINDOW_PENALTY_MINUTES`) rather than forbidden. **But the pricing
   lives only inside the optimiser's objective**, and the optimiser is unreachable here — so the
   BMW(+870) → Heiser(+480) → Boucher(+630) → Russ Darrow(+750) order is neither blocked, nor
   priced, nor mentioned. Fixing finding 1 would incidentally give this order its first feedback
   mechanism.

## Explicit non-conclusions (not inferred)

- **Whether the trigger was cut deliberately or lost is ambiguous.** Both the Phase 7 summary and
  the service comment describe it as delivered; no commit, plan or decision record implementing
  or deferring it was located. Discrepancy reported, intent not guessed.
- **MKE-NORTH-2 coordinates not re-verified.** The brief states all four are non-null;
  quick-523 recorded `RUSS DARROW NISSAN` as failed-and-skipped. Does not affect any finding
  (the request is never made either way), but **wiring the trigger alone may not be sufficient
  to see a card on this template** — `pointsFor` is all-or-nothing. Check before treating a
  still-absent card as a failed fix.
- **No `pg_constraint` read.** The DB-constraint line in finding 6 rests on migration history and
  prior audits. Given CLAUDE.md's standing carrier-CHECK-drift rule, read it directly before
  writing dependent code.

## Workflow deviation

No planner/executor subagent pair — read-only single-artifact diagnostic producing one report,
same shape and same deviation as quick-522. The optimisation path was read directly rather than
delegated.

## Numbering note

`gsd-tools init` computed `next_num: 524`, but no `524-*` directory exists and the user labelled
this task quick-525. The user's label was honoured; **524 is skipped and unused.**

## Files

- Created: `.planning/document-import/diagnostics/phase7-optimisation-trigger.md`
- Created: `.planning/quick/525-read-only-diagnostic-phase7-optimisati/525-SUMMARY.md`
- Modified: `.planning/STATE.md` (quick task row)
- **Source files modified: none.**
