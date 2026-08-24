# quick-526 — Wire the Phase 7 template optimisation client half

**Goal:** Make `GET`/`POST /api/v1/carrier/templates/[id]/optimisation` reachable from the
desktop Edit Route Template screen, closing the Phase 7 Part B item 7 gap quick-525 found.

## Approach

On a successful save of an **existing** template the form stays on the page and bumps a
monotonic `optimisationToken`. A new child component owns the whole optimisation lifecycle and
re-evaluates whenever that token changes, so the save path never awaits, catches or branches on
the optimisation request — non-blocking by construction rather than by a `.catch()` someone has
to remember. On a **create**, the form redirects to the new template's edit page
(`/carrier/templates/${result.templateId}`), where the same evaluation happens on the next save.

## Do-not-touch (from quick-525's findings)

| File | Why |
|---|---|
| `optimisation-service.ts`, `optimisation-matrix.ts` | Service and guards are correct; task forbids changes. |
| The three optimisation route handlers | Server half is complete. |
| `route-template-save.ts` | **Leaving optimisation out of `saveRouteTemplateCore` is correct** — a save that reached a routing provider would make writing a template depend on a network call, and a save that reordered would be the mutation Part B forbids. |
| `OptimisationSuggestion.tsx`, `ImportOptimisation.tsx` | Import-side. Not to be generalised in this task. |
| Prisma schema, migrations | No DDL in scope. |

## Tasks

### T1 — Create the template-side suggestion component
`apps/web/src/components/carrier/templates/TemplateOptimisationSuggestion.tsx`

- Props: `templateId`, `token` (bumped per save), `onApplied(stops)`.
- `token === 0` means "no save yet" → fetch nothing, render nothing.
- GET on token change; render only when `view.offered && view.sentence`.
- Apply → POST `{action:'apply'}` → re-read the template → map to `StopBuilderStop[]` →
  `onApplied(stops)`.
- **Dismissal is the ABSENCE of the view, not a boolean beside it.** No `dismissed` flag.
  See the constraint note below.

### T2 — Wire the form
`apps/web/src/components/carrier/templates/RouteTemplateForm.tsx`

- Add `optimisationToken` state; bump on existing-template save success.
- Existing template: stay on the page (remove `router.push` from that branch).
- New template: `router.push('/carrier/templates/' + result.templateId)`, falling back to the
  list when the id is missing.
- Mount the card in the right panel immediately above the `Route Stops` heading, `isEdit` only.
- `onApplied` sets the stop array from the server's post-apply read.

### T3 — Correct `07-SUMMARY.md:241-242`
Replace the claim that the endpoint is *"called after a create or an edit"* with what was
actually true until this task, plus a pointer to quick-525 and this task.

## Constraint: dismissal must clear by REMOVAL

quick-516's lesson is that a stored decision short-circuits a view on the **key's presence**, so
undoing it means deleting the key, never writing a falsy value beside it. The client-side analogue
of that trap is a `dismissed: boolean` sitting next to the view: nothing resets it on the next
save, so one "Keep current order" would suppress the card for the rest of the page's life.

This component therefore has **no `dismissed` flag at all**. Visibility is presence of the view
object; "Keep current order" does `setView(null)` — removal — and the next save installs a fresh
view that no stale flag can suppress. The import-side component's `dismissed` boolean is correct
*there* (it evaluates once on mount and never re-evaluates) and is deliberately not copied here.

## Verification

- `tsc --noEmit` in `apps/web`, **probed first** with a deliberate error in a file actually
  edited, per the standing blind-gate rule.
- `packages/api-client` dist rebuilt as instructed.
- Not browser-verified (no dev server per environment constraints) — stated in the summary.

## Reported, not built

`packages/api-client` is the **mobile Bearer client** and every `BASE` in it points at
`/api/mobile/*`. The template optimisation route is `/api/v1/...`, session-cookie authenticated,
with **no mobile twin** and no mobile route-template form to consume one. Adding calls there
would create an export that 401s if anyone used it. See the summary for the full reasoning.
