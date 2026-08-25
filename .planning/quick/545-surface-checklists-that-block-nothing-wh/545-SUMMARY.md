# quick-545 — Surface checklists that block nothing while blocking is on

**Pre-task commit:** `e5232725`. **Predecessor:** quick-544 step 5. Date: 2026-08-25.

---

## Step 1 — The exact condition · REPORTED, then implemented

Five clauses. All five are load-bearing; each was traced to the line that makes it so.

| # | Clause | Why it is required |
|---|---|---|
| 1 | `Tenant.requirePreTripInspection = true` | Rung 1 of `evaluateTripStartGate` returns `ALLOWED via NOT_REQUIRED` and never reads an inspection. The page's existing "Inspections are off…" line already owns this case. |
| 2 | `Tenant.blockTripStartOnFailedInspection = true` | With it off, `PASSED_WITH_DEFECTS` is the *intended* outcome. The owner chose it; there is no false promise to correct. |
| 3 | ≥1 `Playbook` with `category='VEHICLE_INSPECTION'` AND `isActive` AND `deletedAt IS NULL` AND `entityType IN ('DISPATCH','VEHICLE')` | All three lookups filter `category`; `ensureTripInspection` filters `isActive`/`deletedAt`. **NOT `entityType = VEHICLE`** — `ensureTripInspection` accepts either, and the seeded DVIR shape is `DISPATCH`. With no such playbook the code already returns the named `NO_INSPECTION_CHECKLIST` error — a different problem, and a second vaguer warning would compete with it. |
| 4 | ≥1 step of `StepTemplate.stepType='INSPECTION_ITEM'`, `deletedAt IS NULL` | `buildSnapshot` filters to that type and `isInspectionComplete` requires `items.length > 0`. With zero items the gate answers `INSPECTION_REQUIRED` **forever** — drivers dead-end. That is a *stricter* failure; "nothing can block a trip start" would be the exact opposite of the truth. |
| 5 | **Zero** of those `INSPECTION_ITEM` steps have `isDispatchBlocker = true` | `criticalFailures` is built only from `INSPECTION_ITEM` outcomes. A blocking `SIGNATURE` or `DOCUMENT_UPLOAD` step counts for `computeDispatchReadiness` but **cannot** stop a trip — `inspection-lookup.ts` deliberately excludes SIGNATURE so an unsigned checklist reads as "not signed", not "one item unanswered". |

**Clause 5 is evaluated across EVERY candidate playbook, not "the one that will run."**
There is no deterministic "the one": `ensureTripInspection` picks oldest-`createdAt`, but
that is only the fallback — `fireEvent('ON_DISPATCH_CREATE')` spawns whatever a
`PlaybookTrigger` names and `findTripInspection` accepts whichever instance is on the trip.
Requiring *all* candidates to be toothless can never fire while some protection exists. It
accepts a false negative on a mixed tenant, knowingly: a warning that cries wolf is one
owners learn to scroll past, and then it protects nothing either.

Two further precisions:

- `Trip.inspectionRequired` can override clause 1 per trip, but **nothing in the repo
  writes that column** — it appears only in `select` blocks. The tenant setting is the
  only live input today.
- The warning reads **authoring** state (`PlaybookStep.isDispatchBlocker`); the gate reads
  `stepSnapshot.isDispatchBlocker` on running instances. Correct for a settings page — it
  describes the *next* inspection, not one already in flight.

### Correction to the brief

Re-checked production. **`DriveCommand Demo` (7e9eca25) now has
`requirePreTripInspection = false`**, changed 2026-08-25 08:42 UTC — after the brief was
written, almost certainly through the settings page quick-544 shipped. **No tenant
currently satisfies clause 1.** The gap is therefore latent across all 8 playbooks /
7 tenants rather than live in one. Clauses 2–5 hold for all 7. The warning ships correct
and fires the moment inspections go back on.

Also confirmed: the 8 zero-blocker playbooks are all `entityType=VEHICLE`; the 16 seeded
DVIR playbooks are all `DISPATCH` with 11/11 items blocking. **No tenant holds both**, so
the conservative reading and the "which one runs" reading agree for all 24 tenants today.

### Adjacent bug — reported, not fixed

`findTripInspection` queries `entityType:'DISPATCH'` only, while `ensureTripInspection`
will *create* a VEHICLE-scoped instance keyed on `truckId`. On those 7 tenants the
instance it creates is invisible to the current-inspection lookup; the gate clears via the
`PRIOR_INSPECTION` rung instead. Out of scope here.

---

## Step 2 — `/settings/operations` · copy reported, approved, IMPLEMENTED

> No inspection item is set to stop the trip, so nothing can block a trip start. In
> **Checklists & Workflows**, open your vehicle inspection checklist, select an item, and
> turn on "Failing this stops the trip".

- Mirrors the existing line's shape exactly: *[state], so [consequence]. [imperative fix].*
- Names the toggle by its **literal label** from `StepDetailEditor.tsx:230`, so an owner
  can search the screen for that string.
- "Checklists & Workflows" is a `<Link>` to `/checklists` and is the real nav label.
- **Count-free by design** — no "1 checklist"/"2 checklists" branch, so no quick-517
  pluralisation seam. The one whitespace boundary that matters is an explicit `{' '}`.
- `text-muted-foreground`, no red — Section 15, same as its neighbour.
- **Mutually exclusive with the existing line by construction**: this requires
  `requireInspection`, that one requires `!requireInspection`.
- Both toggles read from **live** state, not `initial`, so an owner who switches
  inspections on learns immediately rather than saving first and finding out never.

## Step 3 — Playbook builder · copy reported, approved, IMPLEMENTED

> **No item in this checklist stops a trip.** A driver can fail every item and still
> start. Select an item and turn on "Failing this stops the trip".

- Fires on `category === 'VEHICLE_INSPECTION'` with ≥1 inspection item and no blocker.
  **No tenant settings are read** — an author building a toothless inspection checklist
  should hear it whether or not the tenant has inspections on today; the setting is not
  theirs to see from this screen, and the checklist outlives the toggle.
- A strip **beneath** the header bar, not inside it: that row already holds a `truncate`d
  title in a crowded flex line, and per quick-519 a nowrap sibling in a constrained track
  is how a layout ends up wider than its own container.
- Amber, matching the "Blocks dispatch" badge quick-544 put on the step rows — same colour
  for the same concept. Not red: Section 15 reserves red for errors and destructive
  actions, and this is a configuration state.
- **One string per sentence**, as module constants, not inline JSX. quick-517's rule is
  written about counts; the boundary problem is the same shape without one.
- Computed from local `steps`, so the strip disappears the moment a blocker is saved.

## Step 4 — Both messages name the fix · IMPLEMENTED

Each ends with the literal toggle label **"Failing this stops the trip"**, and the
settings line additionally names and links the place (`Checklists & Workflows` → the
builder) because that surface is one navigation away from the control. The builder line
says "Select an item" because the author is already holding the tool.

## Step 5 — Nothing auto-fixed · HONOURED

No DDL, no migration, no data write, no default changed. `isDispatchBlocker` still
defaults `false` and no step was flipped. The two additions are a read and two
conditional strings.

## Step 6 — Driver ONBOARDING and `User.isDispatchReady` · REPORTED, NOT BUILT

**Yes — the same class of gap exists, and its enforcement is *stronger*.**

- `computeDispatchReadiness` sets `isReady = openBlockers.length === 0`. Zero blockers →
  `true` on the first step action.
- `updateEntityReadiness` then writes `User.isDispatchReady = true` for `entityType='DRIVER'`.
- `lib/carrier/trips.ts:216` throws `DRIVER_NOT_DISPATCH_READY` on trip creation for an
  unready driver. **This enforcement has no tenant toggle — it is unconditional.**
  `LoadForm` and `DispatchLoadModal` both surface readiness to the dispatcher.

So an onboarding checklist with no blocking steps marks every driver dispatch-ready the
moment they touch any step, and the dispatcher sees a green light that means nothing.

**Production: 7 of 23 active DRIVER `ONBOARDING` playbooks have zero blocking steps** —
the same `CDL Driver Onboarding` from the 2026-04-24 script, in the same 7 tenants.
Currently 0 ready drivers in all 7, so like the inspection gap it is latent: no driver in
those tenants has completed a step yet. (Also zero-blocker but harmless: 8 of 24 `PARTNER`
playbooks and the single `OPERATIONS` one — neither entity type has a readiness column.)

Two differences that matter for a follow-up:

1. **There is no settings page to warn on.** No tenant setting promises driver-readiness
   enforcement, so the step-2 half has no home. The builder-header half is the natural and
   probably only surface.
2. **The failure is quieter.** The inspection gap lets a truck roll with bad brakes. This
   one lets an undocumented driver be dispatched — no CDL on file — and the dispatcher was
   told they were ready.

---

## Diff summary

```
apps/web/src/lib/carrier/inspection-coverage.ts              NEW — pure predicate, shared by both surfaces
apps/web/src/lib/carrier/__tests__/inspection-coverage.test.ts  NEW — 11 tests
apps/web/src/lib/carrier/inspection-lookup.ts               +getInspectionBlockerCoverage; local INSPECTION_ITEM now aliases the shared constant
apps/web/src/app/(owner)/settings/operations/page.tsx        coverage resolved alongside the tenant row (Promise.all)
apps/web/.../settings/operations/OperationsSettingsForm.tsx  new prop + the line
apps/web/.../playbooks/[id]/edit/_components/BuilderClient.tsx  two copy constants, one memo, the strip
```

Four files changed, two added. **No DDL, no data write, no migration, no new dependency.**
`evaluateTripStartGate`, `computeDispatchReadiness` and `buildStepSnapshot` untouched.

## Gates

**TypeScript — probed in both apps, then clean.**
- `apps/web`: `const __probe545: number = 'y'` injected into `inspection-coverage.ts`, a
  file this task added, and reported as the **sole** error — gate live, not blind.
  Removed; re-run clean.
- `apps/mobile`: first probe accidentally *created* `lib/utils.ts` (the file did not
  exist). That is a weaker probe and it left a stray file, so it was deleted and the probe
  redone in the tracked `lib/inspection-copy.ts`. Reported as the sole error, removed,
  re-run clean, file restored to HEAD byte-for-byte via `git checkout --`.

**Test suite — diffed against `e5232725`** using a worktree created **inside** the repo
(`.baseline-545`, per the no-symlink rule) and removed with `git worktree remove`.

| | Baseline `e5232725` | After |
|---|---|---|
| Test files failed | 18 | 18 |
| Tests failed | 66 | 66 |
| Tests passed | 1325 | 1336 |
| Total | 1455 | 1466 |

The failing **file set is byte-identical** (`diff` reports no change). All 18 are
pre-existing and unrelated — workflows router/instance mocks, driver-pay golden
exporters, notification dispatcher, auth unit tests, validation schemas. `+11` passing is
exactly the new `inspection-coverage.test.ts`.

## Per-item audit

| Step | Verdict |
|---|---|
| 1 — report the exact condition, narrower than "no blocking steps" | **IMPLEMENTED** — five clauses, each traced to the line that requires it; entityType is a two-value filter, not `VEHICLE`; verified against production, and one claim in the brief corrected |
| 2 — operations settings line, reported before implementing | **IMPLEMENTED** — approved copy, same placement and tone, mutually exclusive with the existing line |
| 3 — playbook builder header, reported before implementing | **IMPLEMENTED** — approved copy, strip beneath the header, amber |
| 4 — both messages name the fix, not just the state | **IMPLEMENTED** — both end with the literal toggle label; settings line also names and links the place |
| 5 — do NOT auto-fix, auto-migrate, or default anything to blocking | **HONOURED** — no DDL, no migration, no data write, no default changed |
| 6 — report whether ONBOARDING / `User.isDispatchReady` has the same gap | **REPORTED, NOT BUILT** — yes; enforcement is unconditional at `trips.ts:216`; 7 of 23 playbooks affected |
