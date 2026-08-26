---
phase: quick-546
plan: 546
subsystem: carrier / driver inspection gate
tags: [inspection, playbook-instance, scope, error-surfacing, source-scan-test]
requires:
  - Phase 9 inspection gate (inspection-gate.ts, inspection-lookup.ts, inspection-service.ts)
  - generatePlaybookInstance duplicate guard
provides:
  - TRIP_INSPECTION_ENTITY_TYPE — one source of truth for trip inspection scope
  - INSPECTION_INSTANCE_CONFLICT — a distinct, honest failure code for a stuck instance
  - inspection-scope.test.ts — source-scan divergence guard
affects:
  - apps/web driver full-screen inspection
  - apps/mobile TripInspectionScreen (message only; unchanged)
tech-stack:
  added: []
  patterns:
    - "Scope constant imported by both the writer and the current-instance reader"
    - "TRPCError detected by object shape, never instanceof"
    - "Source-scan test sliced to individual function bodies"
key-files:
  created:
    - apps/web/src/lib/carrier/__tests__/inspection-scope.test.ts
  modified:
    - apps/web/src/lib/carrier/inspection-constants.ts
    - apps/web/src/lib/carrier/inspection-lookup.ts
    - apps/web/src/lib/carrier/inspection-service.ts
    - apps/web/src/app/(driver-fullscreen)/inspection/actions.ts
    - apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionClient.tsx
decisions:
  - "Trip inspections are DISPATCH-scoped by construction — one PlaybookInstance per trip"
  - "The playbook's authored entityType stays a SELECTION FILTER and never scopes the instance"
  - "The 15 existing VEHICLE-scoped instances are left in place — no data migration"
  - "findValidPriorInspection stays shape-tolerant; it reads history, not current state"
metrics:
  duration: ~15 min
  tasks: 3
  files: 6
  completed: 2026-08-25
---

# Quick 546: Trip Inspection Scope Summary

Made the trip inspection DISPATCH-scoped by construction so a second trip in the same truck opens
its own checklist instead of a dead button, and made the remaining failure legible at the point of
the tap.

## What Was Wrong

`ensureTripInspection` wrote a `PlaybookInstance` whose `entityType`/`entityId` came from the
playbook's **authored** `entityType` — so a VEHICLE-authored checklist produced an instance keyed on
`truckId`. `findTripInspection` read a fixed `entityType: 'DISPATCH'`, `entityId: dispatchId`. The
writer could produce a row the reader could never see.

Because nothing in this repo ever sets an inspection instance to `COMPLETED`,
`generatePlaybookInstance`'s duplicate guard — `(playbookId, entityId, tenantId, status != COMPLETED)`
— then refused forever: one instance per truck, and the second trip in that truck got a `TRPCError`
`CONFLICT`. That was swallowed into "Please try again" and rendered a screen-height away from the
button. The driver reported a dead button, correctly.

## What Was Built

### Task 1 — one source of truth (`8d324235`)

`TRIP_INSPECTION_ENTITY_TYPE = 'DISPATCH' as const` in `inspection-constants.ts`, with a comment
recording all three things the plan required: the asymmetry it replaces, why VEHICLE scope is
**impossible** here rather than merely undesirable (the never-COMPLETED conflict rule), and that the
playbook's own `entityType` remains a selection filter.

- `findTripInspection` imports the constant in place of its `'DISPATCH'` literal.
- `ensureTripInspection` passes `entityType: TRIP_INSPECTION_ENTITY_TYPE, entityId: dispatchId`
  unconditionally. `playbook.entityType` is now read nowhere in that function, so `entityType` was
  dropped from the `findFirst`'s `select` (checked, not assumed).
- The candidate query's `entityType: { in: ['DISPATCH', 'VEHICLE'] }` filter is **untouched**, with
  a comment saying why narrowing it would hand eight tenants `NO_INSPECTION_CHECKLIST` instead of a
  walkaround.
- `findValidPriorInspection`'s query is **byte-identical** — verified by reading the diff, which
  contains exactly two non-comment lines across the whole task. Its doc comment gained an
  explanation of why the HISTORY lookup is deliberately shape-tolerant while the CURRENT lookup is
  not.

### Task 2 — tell the driver why, where their thumb is (`a5ed212b`)

- `ensureTripInspection`'s catch now distinguishes the CONFLICT via a new `isConflictError(err)`
  guard that tests `err.code === 'CONFLICT'` **by object shape**, not `instanceof TRPCError` —
  `@trpc/server` can resolve more than once in a monorepo, and an `instanceof` that silently answers
  false would fall back to the exact lie being removed. The message text is deliberately not matched.
- The CONFLICT branch returns `INSPECTION_INSTANCE_CONFLICT` with: *"This truck has an inspection
  checklist that is stuck open from an earlier trip. It cannot be reopened here — contact dispatch
  and give them the code below."* Every other failure keeps `INSPECTION_CREATE_FAILED` and its
  "Please try again", which for a transient failure is honest. Both branches keep the existing
  `logger.error(msg, err, ctx)` call at its real arity.
- `handleOpenChecklist` already forwarded `code` on its failure member — verified, no change.
- `InspectionActionResult`'s failure arm widened to `{ success: false; error: string; code?: string }`
  and `openInspectionChecklist` now passes `code: result.code` through. Optional, so the other eight
  action signatures in that file and all their client call sites are additive — confirmed by tsc.
  The outer `catch` deliberately returns no code: an unexpected throw has no diagnosis to offer.
- `BeginScreen`'s error banner **moved from the top block to the bottom block**, immediately above
  "Start the walkaround". The layout is `flex min-h-dvh flex-col justify-between`, so it previously
  rendered roughly a screen-height from the button — the feedback existed and was off-screen, which
  is what "nothing happens" actually was. Verified by reading the JSX back structurally: the banner
  is inside `<div className="space-y-3">`, above `<button>`.
- The code renders in small muted monospace beneath the message, inside the same red banner (not a
  second one). Styling and dark-mode classes preserved; `min-w-0` on the new text wrapper so a long
  message cannot widen the flex row.

### Task 3 — the divergence test (`c3e30b43`)

`apps/web/src/lib/carrier/__tests__/inspection-scope.test.ts`. Pure, no DB, no mocks; reads both
modules from disk with `node:fs`. 8 assertions: the constant's value, and per function body —
found + non-trivially long, references the constant, carries no `entityType` literal (both quote
styles). Every assertion carries a comment naming the future edit it exists to catch.

## Deviations from Plan

**1. [Rule 1 — correctness of the guard] The slice end marker is the column-zero closing brace, not
"the next `\nexport `".**

- **Found during:** Task 3, at the "verify that by hand before relying on it" step the plan
  explicitly required.
- **Issue:** The `\nexport ` marker over-slices in *both* files. In `inspection-lookup.ts` it
  overruns `findTripInspection`'s body by 1,531 chars and swallows `findValidPriorInspection`'s doc
  comment — a comment that is one sentence away from containing the very literals the test forbids,
  which would make the guard spuriously red on an innocent edit. In `inspection-service.ts` it
  overruns `ensureTripInspection` by 1,497 chars and swallows the whole `isConflictError` helper
  (not exported) plus a section header.
- **Fix:** `source.indexOf('\n}\n', start)`. Everything inside these functions is indented, so a
  brace at column zero unambiguously closes them. Measured slices: `findTripInspection` 740 chars,
  `ensureTripInspection` 3,813 — both exactly the function body and nothing else. The reasoning is
  written into the test's own doc comment so the next reader does not re-derive it.
- **Commit:** `c3e30b43`

No other deviations. No existing test was weakened or deleted.

## Required Write-Ups

### 1. The orphan decision — 15 VEHICLE-scoped instances left in place

**Decision:** no data migration. The rows stay.

**Why that is safe:**

- The conflict key is now `(playbookId, dispatchId)`, so a truck-keyed row **no longer blocks
  creation** of anything. That was the entire harm it did.
- They were already unreachable from `findTripInspection` — that function has only ever read
  DISPATCH-scoped rows — so nothing regresses by leaving them.
- `findValidPriorInspection` can only honour one if a step was answered inside the rolling 24h
  window. Exactly one of the 15 has any answered step (`dfd8b2b6-766f-4d5b-87ac-d6cc27cf01c8`, 4/5
  answered), and it was last touched **2026-04-26** — four months outside any validity window. None
  can clear a gate.

**What it costs:** the rows remain as stale `NOT_STARTED` instances, visible in Checklists &
Workflows. That is clutter a dispatcher may notice and wonder about. It is not danger.

**Why no cleanup shipped:** the schema offers none that is honest. `PlaybookInstance` has **no
`deletedAt`**, and `InstanceStatus` is `NOT_STARTED | IN_PROGRESS | COMPLETED | BLOCKED` with **no
CANCELLED**. There is no value that means "this was superseded". That leaves only an irreversible
hard `DELETE` of production rows, or DDL to add a state — both explicitly out of scope for this
task, and the first is unrecoverable. Marking them `COMPLETED` was rejected outright: it would be a
lie in the audit trail, on records whose entire purpose is being a truthful DVIR history.

If it is ever worth cleaning up, the honest route is DDL first (a `CANCELLED` status or a
`supersededAt`), then a migration — not a delete script.

### 2. Mobile verdict — **verified unchanged**

`apps/mobile/components/driver/workflows/TripInspectionScreen.tsx` was read, not skipped. The chain
is: route returns `{ error, code }` → `apiRequest` throws `new Error(error.error || 'HTTP n')` →
`describe(err)` returns `err.message` → `setLoadError` → rendered at lines 416-421. The improved
server sentence therefore reaches the mobile screen with no change. No mobile file was edited (`git
status` confirms it).

One thing observed and deliberately not acted on: the shared `apiRequest` in
`packages/api-client/src/client.ts` extracts only `error.error` and drops `code`, so mobile shows the
message but not the code. Surfacing it there would change the throw shape for **every** mobile call
site in the app — well outside this task, and the message alone already tells the driver to contact
dispatch. Recorded here rather than silently fixed or silently ignored.

### 3. Carrier suite, before and after

| | Test files | Tests | Failures |
|---|---|---|---|
| **BEFORE** (pre-Task 1 baseline) | 9 passed | 97 passed | 0 |
| **AFTER** (post-Task 3) | 10 passed | 105 passed | 0 |
| **Diff** | +1 | +8 | 0 |

The delta is exactly `inspection-scope.test.ts` and its 8 assertions. No pre-existing failure on
either side, so nothing is disguised. No Failed Suites block on either run — the teardown-FK shape
that has bitten this repo did not appear.

### 4. This was the ninth silent failure in this module

The specific lie removed: a `CONFLICT` — a state that is by construction permanent, because nothing
retires an inspection instance — answered with **"Please try again"**. That is an instruction
guaranteed never to succeed; a driver following it taps forever. And it was rendered a screen-height
from the button they tapped, so most of the time they never even saw the instruction that could not
work. Two failures stacked: an untrue message, delivered where nobody would read it.

Both halves are fixed. The message now names the real situation and gives a real next action
(contact dispatch), and it appears immediately above the button, with a code to read out.

## Verification

- `npx tsc --noEmit` clean in **both** `apps/web` and `apps/mobile`.
- **Gate probed four times**, each with `const __probe: number = 'x';` injected into a file actually
  edited in that app, each confirming tsc reported *that* error by file and line before deletion:
  `inspection-service.ts` (Task 1), `InspectionClient.tsx` (Task 2, web), `TripInspectionScreen.tsx`
  (Task 2, mobile), `inspection-scope.test.ts` (Task 3). No blind-gate symptoms — no syntax-only
  error sets, no errors in untouched files — so no `.next` artefact deletion was needed.
- **Probe sweep clean:** `grep -rn "__probe"` across `apps/web/src`, `apps/mobile/{components,app,lib}`
  and `packages/*/src` returns nothing; `find -name "__probe*"` returns nothing.
- **Divergence test demonstrated to fail, twice:**
  - Constant flipped to `'VEHICLE'` → assertion 1 red (`expected 'VEHICLE' to be 'DISPATCH'`).
    Restored, diff confirmed empty.
  - `findTripInspection` renamed → integrity assertion red, naming the missing slice
    (`Could not find "export async function findTripInspection(" in
    src/lib/carrier/inspection-lookup.ts`). Restored, `git status` confirmed clean.
- **Grep verified:** no `entityType: 'DISPATCH'` / `'VEHICLE'` literal inside `findTripInspection`
  or `ensureTripInspection`. The three remaining hits in `inspection-lookup.ts` are the file header
  comment (line 8) and `findValidPriorInspection`'s two-shape `OR` (lines 268, 270) — both intended.
- `findValidPriorInspection`'s query byte-identical, confirmed from the diff.
- No DDL, no data migration, no existing test weakened.

## Commits

| Commit | Message |
|---|---|
| `8d324235` | fix(quick-546): scope trip inspections to the trip, not the truck |
| `a5ed212b` | fix(quick-546): surface the real reason a checklist will not open |
| `c3e30b43` | test(quick-546): pin trip inspection scope to one constant |

Nothing pushed — the orchestrator pushes once at the end.

## Known Gaps / Follow-ups

- **`findTripInspection` still queries one shape only, by design.** On the eight VEHICLE-authored
  tenants, any inspection instance created *before* this fix remains invisible to it. That is
  intentional (see the orphan decision) and is precisely why `findValidPriorInspection` keeps its
  `OR`.
- **quick-545's related finding is untouched:** `ensureTripInspection` no longer creates
  VEHICLE-scoped instances, which removes the *creation* half of that report. The 545 note about
  `findTripInspection` querying `entityType='DISPATCH'` only is now correct-by-construction rather
  than a mismatch.
- The mobile `apiRequest` code-dropping noted above.

## Self-Check: PASSED

All created/modified files verified present on disk; all three commit hashes verified present in
`git log`.

---

## Orchestrator verification pass — one real defect found and fixed

The three task commits above were re-verified independently rather than accepted as
reported. tsc was re-probed in **both** apps (injected `const __probe546: number = 'x'`
into `inspection-constants.ts` and `inspection-copy.ts` respectively; both gates reported
the injected error, both clean after removal, probe sweep clean). The carrier suite was
re-run: **10 files / 105 tests / 0 failures**, matching the reported AFTER count. The
divergence guard was independently proven red twice — constant flipped to `'VEHICLE'`,
and `entityType: 'VEHICLE'` reintroduced into the writer.

That last check is what exposed the defect.

### `inspection-scope.test.ts` was line-ending dependent — commit `07e18146`

Restoring `inspection-service.ts` with `git checkout --` after the regression check turned
the working-tree file **CRLF**. The slicer's end marker is the column-zero `'\n}\n'`, which
does not exist in a CRLF file, so `sliceFunctionBody` returned null and the guard went red
on unmodified, correct source.

This is not a local accident. The repo has **no `.gitattributes`** and `core.autocrlf=true`
(both verified), so `git ls-files --eol` reports the file as `i/lf w/crlf`: LF in the index,
CRLF in the working tree. **The guard would have failed on every Windows clone, every
`git checkout` of these two files, and every branch switch** — and a test everyone learns to
ignore protects nothing, which the test's own doc comment says about a different case.

Worse than a plain red: with the slice null, the `carries no hardcoded entityType literal`
assertion **passed vacuously** against an empty string. Only the integrity floor caught it.
That is the floor working exactly as designed, and also the reason not to leave it as the
sole defence.

Fixed by normalising in `readModule` (`.replace(/\r\n/g, '\n')`), with the reasoning recorded
in the file. Verified against a genuinely CRLF working tree: 8/8 green, and still red —
**non-vacuously**, the slice found — when the writer's literal is reintroduced.

Git printed `warning: LF will be replaced by CRLF the next time Git touches it` on the commit
of the fix, which is the same fact stated by the tooling.

### Final state

| Check | Result |
|---|---|
| `tsc --noEmit` apps/web | 0 errors, gate probed |
| `tsc --noEmit` apps/mobile | 0 errors, gate probed |
| Carrier suite BEFORE | 9 files / 97 tests / 0 failures |
| Carrier suite AFTER | 10 files / 105 tests / 0 failures |
| Delta | +1 file, +8 assertions — exactly the new guard |
| Leftover `__probe` | none (swept) |
| Working tree | clean |
