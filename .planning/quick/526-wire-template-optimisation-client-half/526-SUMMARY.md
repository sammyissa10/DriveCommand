# quick-526 — Wire the Phase 7 template optimisation client half

**Date:** 2026-08-24
**Closes:** Phase 7 Part B item 7 (spec lines 693 and 1590), the gap quick-525 diagnosed.

## What shipped

`GET`/`POST /api/v1/carrier/templates/[id]/optimisation` now has a client. Saving an existing
route template keeps you on the edit page and evaluates the order; when the server offers a
suggestion, a card appears above **Route Stops** with the miles/minutes line and the two Section 9
controls. `applyTemplateOptimisation` — unreachable from any UI since Phase 7 — is now reachable,
which also makes the second `persist: true` path live and lets `route_matrix_cache` receive rows.

| File | Change |
|---|---|
| `apps/web/src/components/carrier/templates/TemplateOptimisationSuggestion.tsx` | **NEW** — the card. |
| `apps/web/src/components/carrier/templates/RouteTemplateForm.tsx` | Import, `optimisationToken` state, rewritten save success path, card mounted in the right panel. |
| `.planning/document-import/07-SUMMARY.md` | Correction block on the inaccurate "When it runs / Template" claim. |

## Step 2 — endpoint contract (reported before the component was built)

**`GET /api/v1/carrier/templates/[id]/optimisation`**
Auth: session cookie (`getSession()`), `tenantId` required → 401 / 403.
Success: `200 { data: OptimisationView }`. `404 { error: 'Template not found.' }` when missing;
`500 { error: 'Internal server error' }` on an unhandled throw.

```ts
interface OptimisationView {
  offered: boolean;                   // false ⇒ draw nothing
  sentence: string | null;            // the assembled Section 9 line; null when not offered
  declineNote: string | null;         // PRESENT in the payload — see below
  suggestion: OptimisationSuggestion;
  stopsChangedFromTemplate: boolean;
}

interface OptimisationSuggestion {
  offered: boolean;
  declineReason: OptimisationDeclineReason | null;
  movedOrder: number[];               // movedOrder[newSlot] = old position
  currentMiles: number;  currentMinutes: number;
  suggestedMiles: number; suggestedMinutes: number;
  savedMiles: number;    savedMinutes: number;   // the REAL difference, never net of the penalty
  floors: { miles: number; minutes: number };
}
```

**Decline reason codes** (`OptimisationDeclineReason`, `optimisation.ts:107-117`) — five, with the
copy from `DECLINE_SENTENCES`:

| Code | Sentence |
|---|---|
| `NOT_ENOUGH_STOPS` | There are too few stops for the order to matter. |
| `UNRESOLVED_STOPS` | Some stops have no facility yet, so the driving distance cannot be worked out. |
| `NO_MATRIX` | Driving distances are not available right now. Try again shortly. |
| `ALREADY_BEST` | This is already the shortest order that respects the appointments. |
| `BELOW_FLOOR` | No other order saves enough to be worth changing. |

**Is `declineNote` present in the payload? Yes.** `notOffered()`
(`optimisation-service.ts:86-93`) sets it to `declineSentence(suggestion.declineReason)` on every
not-offered view, so a decline arrives as a rendered English sentence, not just a code. Its doc
comment says it exists *"for the template screen's button"* — this was the screen it was written
for, and quick-525 found it had no consumer in any `.tsx` file. **This task deliberately still does
not render it**, because the task's stated requirement is *"render nothing at all when the endpoint
declines — no empty card, no placeholder"*, and the two conflict. The field remains available and
unrendered; noted rather than silently resolved.

**`POST` same path**, body `{ action: 'apply' }` (any other value → `400 "action must be 'apply'."`).
Success: `200 { data: { applied: boolean; savedMiles: number; savedMinutes: number } }`.
Errors go through `stopReviewCall` → `ResolutionError` maps via `RESOLUTION_STATUS` with
`{ error, reason: code }`; notably `NOT_FOUND` when the template vanished and `INVALID_STOP` when
the view is no longer offered (`"There is no better order to apply."`) or when `movedOrder` no
longer matches the template.

**The apply response does NOT carry the new order** — hence the re-read described below.

## Design decisions worth keeping

**Non-blocking is structural, not a `.catch()`.** The save handler bumps a counter and returns.
The child owns fetching in its own effect keyed on that counter, so the save path never awaits,
catches or branches on the optimisation request. A slow or dead routing provider cannot delay a
save, fail one, or change what it reported.

**Dismissal clears by REMOVAL — there is no `dismissed` flag.** Per the constraint (quick-516: a
view short-circuits on a key's *presence*, so undoing means deleting the key). The client-side
shape of that trap is a boolean beside the view that nothing resets on the next save — one "Keep
current order" would then suppress the card for the rest of the page's life, presenting as exactly
the bug quick-525 just diagnosed. Here **visibility is presence of `view`**; "Keep current order"
does `setView(null)`, and the next save installs a fresh view no stale flag can suppress.
The import-side component's `dismissed` boolean is correct *there* (it evaluates once on mount,
never again) and was left untouched rather than generalised.

**A counter, not a boolean, for the token.** Two saves in a row must produce two evaluations; a
flag already `true` would make the second save reuse the first answer.

**Apply re-reads the stops instead of replaying `movedOrder` locally.** The server recomputes the
suggestion at apply time, so the permutation it commits can differ from the one the card was drawn
from. Replaying the stale one would leave the screen disagreeing with the database. The component
re-reads `GET /api/v1/carrier/route-templates/[id]` and maps to `StopBuilderStop[]`.

**Buttons are `type="button"`.** The card mounts inside the `<form>`; without it, both controls
would submit the form. The import-side component needs no such guard — it is not inside a form.

**Navigation is unconditional.** Existing-template saves stay on the page every time, whether or
not a suggestion exists. Create redirects to `/carrier/templates/${result.templateId}`, falling
back to the list if the id is ever missing so a successful save never looks like a failure.

## Deviations from the stated scope, and why

**1. `packages/api-client` — the template calls were NOT added.** They are absent, and they should
stay absent. Every `BASE` in that package points at `/api/mobile/*` and it is the mobile **Bearer**
client; the template optimisation route is `/api/v1/...` behind `getSession()` (cookies), has **no
mobile twin**, and there is no mobile route-template form to consume one — the RN app has no
template form at all. Adding calls there would create an export that 401s if anyone used it, and
building the mobile route to make it work would mean touching the route handlers, which the task
forbids. The web surface uses plain `fetch`, exactly as the import-side card does. **Flagged rather
than done; say the word and it can be a follow-up that adds the mobile route + screen together.**

**2. `apps/web/src/app/(owner)/carrier/templates/[id]/page.tsx` — not modified.** It was listed as
a modify target, but no change proved necessary: it already passes `templateId` to the form, and
both the create redirect and the card mount live inside the form. Editing it would have been
change without effect.

## Verification

- **tsc gate PROBED before being trusted.** Injected `const __probe526: number = "not a number";`
  into `RouteTemplateForm.tsx` — a file actually edited — and confirmed tsc reported
  `RouteTemplateForm.tsx(985,7): error TS2322` and **that error only**, proving semantic checking
  was live program-wide rather than suppressed by a parse error. Probe removed
  (`grep -c __probe526` → 0), then re-run clean.
- **tsc `--noEmit`: 0 errors in `apps/web` and 0 in `apps/mobile`.**
- **`packages/api-client` dist rebuilt** as instructed — a confirmed no-op, since nothing in that
  package changed.
- **Vitest `src/lib/document-import`: 509/509 across 31 files**, byte-identical to the quick-520
  baseline.
- **Do-not-touch list verified by `git diff` per file:** `optimisation-service.ts`,
  `optimisation-matrix.ts`, `route-template-save.ts`, `OptimisationSuggestion.tsx`,
  `ImportOptimisation.tsx`, `schema.prisma` — all UNTOUCHED. Zero diff under
  `apps/web/src/app/api/**/optimisation/**`. No DDL, no migration, no Supabase write.

## NOT browser-verified

No dev server was started, so the card's appearance, the stay-on-page behaviour and the post-apply
stop reorder all rest on the diff. **Worth clicking on MKE-NORTH-2**
(`878ba6b5-ce7c-4c00-af46-2e094ba1f672`), whose four facilities now have coordinates: open the edit
page, press Save without changing anything, and a card should appear above Route Stops — the stop
order there is chronologically infeasible against the appointment offsets, so a suggestion is
likely. Then check that "Use suggested order" reorders the visible list and that "Keep current
order" hides the card but a second Save brings it back. A card that never appears on any template
means the request is firing but declining; `NO_MATRIX` would point at a facility that still has no
coordinates (quick-525 open item 2 — `RUSS DARROW NISSAN` was unresolved as of quick-523 and was
not re-queried by either task).

## Not done, by design

Rendering `declineNote` (see the contract section) — the task's "render nothing when declined"
requirement takes precedence, and the field stays available for a future decision.
