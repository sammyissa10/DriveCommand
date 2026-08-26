---
phase: quick-546
plan: 546
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/inspection-constants.ts
  - apps/web/src/lib/carrier/inspection-lookup.ts
  - apps/web/src/lib/carrier/inspection-service.ts
  - apps/web/src/app/(driver-fullscreen)/inspection/actions.ts
  - apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionClient.tsx
  - apps/web/src/lib/carrier/__tests__/inspection-scope.test.ts
autonomous: true

must_haves:
  truths:
    - "A second inspection of the same truck on a second trip opens a checklist instead of a dead button"
    - "ensureTripInspection and findTripInspection write and read the same entityType/entityId pair"
    - "A driver whose checklist cannot open sees the reason on screen, next to the button they tapped, with a code they can read out to dispatch"
    - "A CONFLICT failure no longer tells the driver to 'try again' — an instruction that could never succeed"
    - "A future edit that re-introduces a hardcoded entityType literal in either function fails a test by name"
  artifacts:
    - path: "apps/web/src/lib/carrier/inspection-constants.ts"
      provides: "TRIP_INSPECTION_ENTITY_TYPE — the single source of truth for trip inspection scope"
      contains: "TRIP_INSPECTION_ENTITY_TYPE"
    - path: "apps/web/src/lib/carrier/__tests__/inspection-scope.test.ts"
      provides: "Source-scan divergence guard over the two function bodies"
      min_lines: 60
  key_links:
    - from: "apps/web/src/lib/carrier/inspection-service.ts"
      to: "apps/web/src/lib/carrier/inspection-constants.ts"
      via: "import TRIP_INSPECTION_ENTITY_TYPE"
      pattern: "TRIP_INSPECTION_ENTITY_TYPE"
    - from: "apps/web/src/lib/carrier/inspection-lookup.ts"
      to: "apps/web/src/lib/carrier/inspection-constants.ts"
      via: "import TRIP_INSPECTION_ENTITY_TYPE"
      pattern: "TRIP_INSPECTION_ENTITY_TYPE"
    - from: "apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionClient.tsx"
      to: "apps/web/src/app/(driver-fullscreen)/inspection/actions.ts"
      via: "openInspectionChecklist result carries code, rendered under the error message"
      pattern: "res\\.code|errorCode"
---

<objective>
`ensureTripInspection` writes a `PlaybookInstance` whose `entityType`/`entityId` come from the
playbook's authored `entityType` — so a VEHICLE-authored checklist produces an instance keyed on
`truckId`. `findTripInspection` reads a fixed `entityType: 'DISPATCH'`, `entityId: dispatchId`. The
writer can produce a row the reader can never see. Because inspection instances are never set to
`COMPLETED`, `generatePlaybookInstance`'s duplicate guard — `(playbookId, entityId, tenantId,
status != COMPLETED)` — then refuses forever: one VEHICLE-scoped instance per truck, and the second
trip in that truck gets a `TRPCError CONFLICT`, swallowed into "Please try again", rendered a
screen-height away from the button. The driver reports a dead button.

Purpose: make the trip inspection DISPATCH-scoped by construction (one instance per trip), make the
remaining failure legible to the driver at the point of the tap, and pin the alignment with a test
that fails on the next edit that drifts them apart.

Output: one shared constant, two call sites aligned to it, a distinct CONFLICT code plumbed to the
web screen, an error banner relocated to the thumb, and a source-scan divergence test.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/lib/carrier/inspection-constants.ts
@apps/web/src/lib/carrier/inspection-lookup.ts
@apps/web/src/lib/carrier/inspection-service.ts
@apps/web/src/lib/carrier/inspection-handlers.ts
@apps/web/src/app/(driver-fullscreen)/inspection/actions.ts
@apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionClient.tsx
@apps/web/src/lib/carrier/__tests__/trip-start-gate-coverage.test.ts
@apps/web/src/lib/carrier/__tests__/inspection-handlers.test.ts

**The investigation is DONE. Do not re-derive it and do not re-query production.**

Settled facts (verified live, do not re-check):

- 24 VEHICLE_INSPECTION playbooks / 23 tenants: 8 authored `entityType=VEHICLE` (the 2026-04-24
  script), 16 authored `DISPATCH` (seeded DVIR).
- 21 instances: 15 VEHICLE-scoped (14 NOT_STARTED, 1 IN_PROGRESS), 6 DISPATCH-scoped.
- Exactly one VEHICLE-scoped instance has an answered step — `dfd8b2b6-766f-4d5b-87ac-d6cc27cf01c8`,
  4/5 answered, last touched 2026-04-26 — far outside any 24h validity window.
- `PlaybookInstance` has NO `deletedAt`. `InstanceStatus` = NOT_STARTED | IN_PROGRESS | COMPLETED |
  BLOCKED. There is no CANCELLED.
- `verifyEntity` (generatePlaybookInstance.ts:249) has an explicit "DISPATCH and OTHER: no entity
  verification required" branch, and `resolveAssignee` returns null for a DRIVER-role step under
  BOTH VEHICLE and DISPATCH. Assignment behaviour is unchanged by this plan.

Settled DECISION (implement, do not revisit):

**Trip inspections are DISPATCH-scoped — one `PlaybookInstance` per trip.** `ensureTripInspection`
creates with `entityType: 'DISPATCH'`, `entityId: dispatchId`, REGARDLESS of the playbook's authored
`entityType`. The playbook's `entityType` stays a SELECTION FILTER only: the
`entityType: { in: ['DISPATCH', 'VEHICLE'] }` clause in the playbook `findFirst` stays exactly as it
is, so a VEHICLE-authored playbook remains eligible to run.

Settled ORPHAN decision: the 15 existing VEHICLE-scoped instances are LEFT IN PLACE. No data
migration in this task. They stop blocking creation (the conflict key becomes `(playbookId,
dispatchId)`), they were already unreachable from `findTripInspection` so nothing regresses, and
`findValidPriorInspection` can only honour one if a step was answered inside 24h — none were. They
remain as stale NOT_STARTED rows in Checklists & Workflows: clutter, not danger. The schema offers
no honest cleanup (no `deletedAt`, no CANCELLED), so the alternatives were an irreversible hard
delete or DDL, both out of scope. **This must be written up in the SUMMARY.**

Out of scope, do not touch:
- `evaluateTripStartGate` / `inspection-gate.ts` decision logic.
- `findValidPriorInspection`'s QUERY (comment only — see Task 1).
- Any DDL, any data migration.
- Weakening or deleting any existing test.
</context>

<tasks>

<task type="auto">
  <name>Task 1: One source of truth for trip inspection scope</name>
  <files>
apps/web/src/lib/carrier/inspection-constants.ts
apps/web/src/lib/carrier/inspection-lookup.ts
apps/web/src/lib/carrier/inspection-service.ts
  </files>
  <action>
**FIRST, before any edit — capture the vitest baseline.** From `apps/web`:

```
npx vitest run src/lib/carrier 2>&1 | Tee-Object -FilePath ../../.planning/quick/546-ensuretripinspection-and-findtripinspect/vitest-before.txt
```

Record the pass/fail/skipped counts and the failing file names verbatim. This is the BEFORE half of
the diff Task 3 requires. If the carrier suite already has failures, that is the baseline — note it,
do not fix it, do not let it disguise a regression later.

**1. Add the constant** to `apps/web/src/lib/carrier/inspection-constants.ts`:

```ts
export const TRIP_INSPECTION_ENTITY_TYPE = 'DISPATCH' as const;
```

Write its doc comment in that file's existing house style — look at `INSPECTION_VALIDITY_HOURS`
above it for the tone: state the rule, state why, state what the rejected alternative costs. It must
record all three of:

  a) **The asymmetry it replaces.** `ensureTripInspection` wrote `entityType: playbook.entityType`
     with `entityId` switching between `dispatchId` and `truckId`; `findTripInspection` read a fixed
     `'DISPATCH'` / `dispatchId`. The writer could produce a row the reader could never see.

  b) **Why VEHICLE scope is impossible here**, not merely undesirable. `generatePlaybookInstance`
     refuses a duplicate on `(playbookId, entityId, tenantId, status != COMPLETED)`, and nothing in
     this repo ever sets an inspection instance to COMPLETED. A truck-keyed instance is therefore
     created once and can never be superseded: the second trip in that truck gets a CONFLICT and a
     dead button. One instance per TRIP is the only scope under which a per-trip inspection can be
     answered twice.

  c) **The playbook's own `entityType` remains a SELECTION FILTER.** A VEHICLE-authored playbook is
     still eligible to run (the `{ in: ['DISPATCH','VEHICLE'] }` clause is untouched); it just does
     not get to choose the instance's scope. Safe because `verifyEntity` requires no entity
     verification for DISPATCH and `resolveAssignee` behaves identically under both.

**2. `findTripInspection`** (`inspection-lookup.ts`, ~line 173): import the constant and use it in
place of the `entityType: 'DISPATCH'` literal. Nothing else in that function changes.

**3. `ensureTripInspection`** (`inspection-service.ts`, ~line 199): import the constant, and in the
`generatePlaybookInstance` call replace

```ts
entityType: playbook.entityType,
entityId: playbook.entityType === 'DISPATCH' ? dispatchId : truckId,
```

with the constant and `entityId: dispatchId`. Leave the playbook `findFirst`'s
`entityType: { in: ['DISPATCH', 'VEHICLE'] }` filter EXACTLY as it is. If `playbook.entityType` is
now read nowhere else in the function, drop `entityType` from that query's
`select: { id: true, entityType: true }`; if it is still read, keep it. Check, do not assume.

Add a short inline comment at the `generatePlaybookInstance` call pointing at the constant, so the
next reader of this call site finds the reasoning without grepping.

**4. `findValidPriorInspection`** (`inspection-lookup.ts`, ~line 214): **comment only — do NOT change
the query.** Add to its existing doc comment an explanation of why it is deliberately shape-tolerant
while `findTripInspection` is not: this is a read of HISTORY bounded to a rolling 24h, not a second
creation path, so it must still honour the VEHICLE-scoped rows that exist in production from the
2026-04-24 script. Its `OR` over both shapes stays. `findTripInspection` is the CURRENT-instance
lookup and is paired with a writer, which is why it gets exactly one shape.
  </action>
  <verify>
```
cd apps/web
npx tsc --noEmit
```

**PROBE THE GATE — a clean run is not evidence until you do.** Per CLAUDE.md, a parse error anywhere
in the program (including untracked files belonging to other work) silently suppresses semantic
checking of everything. So:

1. Insert `const __probe: number = 'x';` at the top of `apps/web/src/lib/carrier/inspection-service.ts`
   (a file you actually edited).
2. Re-run `npx tsc --noEmit`. Confirm it reports THAT error, by file and line.
3. Delete the probe. Re-run. Only now does a clean result mean anything.

If the reported errors are all syntax errors, or all in files you did not touch, the gate is blind:
delete `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo`, then re-run.

Then grep-verify the single source of truth:

```
Select-String -Path apps/web/src/lib/carrier/inspection-lookup.ts,apps/web/src/lib/carrier/inspection-service.ts -Pattern "entityType: 'DISPATCH'|entityType: 'VEHICLE'"
```

The only hits may be inside `findValidPriorInspection`. Any hit inside `findTripInspection` or
`ensureTripInspection` is a failed task.

Commit (do NOT push):

```
git add apps/web/src/lib/carrier/inspection-constants.ts apps/web/src/lib/carrier/inspection-lookup.ts apps/web/src/lib/carrier/inspection-service.ts
git commit -m "fix(quick-546): scope trip inspections to the trip, not the truck"
```
  </verify>
  <done>
`TRIP_INSPECTION_ENTITY_TYPE` exists in `inspection-constants.ts` with a comment covering the
asymmetry, the never-COMPLETED conflict rule, and the selection-filter distinction. Both
`findTripInspection` and `ensureTripInspection` reference it and contain no `entityType` string
literal. `ensureTripInspection` passes `entityId: dispatchId` unconditionally. The playbook
`findFirst`'s `{ in: ['DISPATCH','VEHICLE'] }` filter is unchanged. `findValidPriorInspection`'s
query is byte-identical and its comment explains why. `tsc --noEmit` is clean in `apps/web` AND the
probe confirmed the gate was live. Committed, not pushed.
  </done>
</task>

<task type="auto">
  <name>Task 2: Tell the driver why, where their thumb already is</name>
  <files>
apps/web/src/lib/carrier/inspection-service.ts
apps/web/src/app/(driver-fullscreen)/inspection/actions.ts
apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionClient.tsx
  </files>
  <action>
This is instance NINE of a silent failure in this module. The server already returns a reason; it is
generic, it is actively misleading, and the web client throws the code away.

**1. `ensureTripInspection`'s catch** (`inspection-service.ts`) must distinguish a `TRPCError` with
`code === 'CONFLICT'` (message: `'Active checklist already exists for this entity'`) from everything
else, and return a distinct code + message.

Detect it **by object shape, not `instanceof`** — `TRPCError` is imported from `@trpc/server` and
`instanceof` across module/duplicate-package boundaries is not reliable. A narrow type guard on
`typeof err === 'object' && err !== null && 'code' in err && err.code === 'CONFLICT'` is the shape
to use. Do not widen it to a message substring match; the code is the stable signal.

Return code `INSPECTION_INSTANCE_CONFLICT` with a message that names the real situation and gives a
real next action. **The lie being removed is "Please try again"** — for a CONFLICT that instruction
is guaranteed never to succeed, and a driver following it taps forever. The message must tell them
to contact dispatch, and it must be a sentence a person under time pressure can act on. Something in
the shape of: *"This truck has an inspection checklist that is stuck open from an earlier trip. It
cannot be reopened here — contact dispatch and give them the code below."*

Everything else keeps `INSPECTION_CREATE_FAILED` and its existing "Please try again" text, which for
a transient failure is honest. Both branches keep the existing `logger.error(msg, err, ctx)` call —
note the real arity, error SECOND.

`handleOpenChecklist` (`inspection-handlers.ts:346`) already forwards `code` on the `HandlerResult`
failure member. Verify that; no change expected.

**2. `openInspectionChecklist`** (`actions.ts:103-129`) currently drops `result.code`. Widen
`InspectionActionResult`'s failure member:

```ts
| { success: false; error: string; code?: string }
```

and pass `code: result.code` through on the `!result.ok` return. Leave the outer `catch`'s generic
return without a code — an unexpected throw has no code to report.

**Then check every other consumer of `InspectionActionResult` still typechecks.** There are eight
other action signatures in that file plus their client call sites; widening a failure member with an
OPTIONAL field should be additive, but if any consumer destructures or exhaustively narrows, fix it
rather than reverting the widening.

**3. `BeginScreen`** (`InspectionClient.tsx`, ~line 83-143). Two changes:

  a) **MOVE the error banner out of the top block and into the bottom block, directly above the
     "Start the walkaround" button.** The layout is `flex min-h-dvh flex-col justify-between`, so
     today the banner renders roughly a screen-height away from the button the driver taps. That
     distance is why the driver reported "nothing happens" — the feedback existed and was off-screen.
     A tap must always produce visible feedback where the thumb already is.

  b) Hold the code in state alongside the message (`const [errorCode, setErrorCode] = useState<string
     | null>(null)`), set both from the failed result, clear both at the start of each attempt, and
     render the code in **small muted text beneath the message** so a driver can read it out to
     dispatch over the phone.

Keep the existing red-banner styling and its dark-mode classes (`rounded-2xl bg-red-50 p-4
dark:bg-red-950/50`, `AlertTriangle`, `text-red-700 dark:text-red-300`) — this is a relocation plus
one line, not a redesign. The code line should be visually subordinate (smaller, lower contrast)
within the red banner, not a second banner.

**4. Mobile — VERIFY ONLY.** `apps/mobile/components/driver/workflows/TripInspectionScreen.tsx`
already surfaces `body.error` through `loadError` at ~lines 416-421, and the mobile route already
forwards `code`. Confirm the improved server message reaches that screen. **Change mobile only if it
does not.** If you do change it, say so explicitly in the SUMMARY — otherwise record "mobile verified
unchanged" so the next reader knows it was looked at rather than skipped.
  </action>
  <verify>
```
cd apps/web
npx tsc --noEmit
cd ../mobile
npx tsc --noEmit
```

Probe BOTH gates the same way as Task 1: inject `const __probe: number = 'x';` into a file you
actually edited in that app, confirm tsc reports THAT error, delete the probe, re-run. For
`apps/mobile`, if nothing was edited there, probe `TripInspectionScreen.tsx` and delete the probe —
the point is to prove the gate is live, not that the file changed. Delete every probe before
committing; a previous quick task left a `__probe.ts` behind.

Read the changed `BeginScreen` JSX back and confirm by structure that the banner is inside the
bottom `<div className="space-y-3">` block, above the `<button>` — not merely that it renders.

Commit (do NOT push):

```
git add apps/web/src/lib/carrier/inspection-service.ts "apps/web/src/app/(driver-fullscreen)/inspection/actions.ts" "apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionClient.tsx"
git commit -m "fix(quick-546): surface the real reason a checklist will not open"
```
  </verify>
  <done>
A CONFLICT from `generatePlaybookInstance` returns `INSPECTION_INSTANCE_CONFLICT` with a
contact-dispatch message and no "try again"; every other failure keeps `INSPECTION_CREATE_FAILED`.
The code survives `handleOpenChecklist` → `openInspectionChecklist` → `BeginScreen`.
`InspectionActionResult`'s failure member carries an optional `code` and all other consumers
typecheck. The error banner renders in the bottom block immediately above "Start the walkaround",
keeps its red/dark-mode styling, and shows the code in small muted text underneath. Mobile is
verified (and the verdict recorded). `tsc --noEmit` clean and PROBED in both apps, all probes
deleted. Committed, not pushed.
  </done>
</task>

<task type="auto">
  <name>Task 3: The divergence test, and the before/after diff</name>
  <files>apps/web/src/lib/carrier/__tests__/inspection-scope.test.ts</files>
  <action>
New file. Vitest, pure — **no DB, no mocks** — in the style of the neighbouring
`inspection-handlers.test.ts`, using the source-scan discipline of
`trip-start-gate-coverage.test.ts` (read that file's header comment first; it explains why a source
scan is the only shape that catches "someone added a call site nobody noticed").

Open with a header comment stating the invariant in one sentence: *the function that CREATES the trip
inspection and the function that FINDS it must name the same scope, and that scope must come from one
constant.*

Assertions:

1. `TRIP_INSPECTION_ENTITY_TYPE === 'DISPATCH'` — imported from `../inspection-constants`.

2. Read `../inspection-lookup.ts` and `../inspection-service.ts` from disk with `node:fs`
   (`readFileSync`, resolved relative to the test file — copy the path style from
   `trip-start-gate-coverage.test.ts`).

3. **Slice out ONLY the two function bodies.** From `export async function <name>(` to the next
   `\nexport ` — reliable in these two files, and verify that by hand before relying on it. The
   slicing MUST be scoped this way because `findValidPriorInspection` legitimately contains BOTH
   `entityType: 'DISPATCH'` and `entityType: 'VEHICLE'` literals and lives in the same file as
   `findTripInspection`. A whole-file scan would be permanently red or permanently useless.

4. For EACH slice assert:
   a) it references `TRIP_INSPECTION_ENTITY_TYPE`;
   b) it contains NO `entityType: 'DISPATCH'` and NO `entityType: 'VEHICLE'` literal (check both
      quote styles).

5. **Integrity assertion** — same discipline as the 31-pair address fixture's contiguous-id + length
   floor: assert that both slices were actually FOUND (start marker present, end marker present) and
   that each is non-trivially long (a sensible character floor, e.g. several hundred chars, derived
   from the real bodies). Without this a rename of either function makes every other assertion pass
   vacuously against an empty string, and the test goes green on the exact edit it exists to catch.

6. **Every assertion carries a comment naming the future edit it is there to catch.** Concretely:
   (2/3) someone reverts to a hardcoded literal in either function; (4a) someone "simplifies" the
   constant away; (5) someone renames a function and the slice silently becomes empty; (1) someone
   flips the constant to `'VEHICLE'`, which the never-COMPLETED conflict rule makes unusable.

Do not assert anything about `findValidPriorInspection` beyond the fact that the slicing excludes it.
  </action>
  <verify>
From `apps/web`:

```
npx vitest run src/lib/carrier/__tests__/inspection-scope.test.ts
```

All assertions pass.

**Then prove the test is not vacuous** — temporarily change `TRIP_INSPECTION_ENTITY_TYPE` to
`'VEHICLE'` and re-run: assertion 1 must fail. Temporarily rename `findTripInspection` and re-run:
the integrity assertion must fail with a message that names the missing slice. Revert both. A guard
that has never been seen to fail is a guard nobody has tested.

**Then the full carrier suite, AFTER:**

```
npx vitest run src/lib/carrier 2>&1 | Tee-Object -FilePath ../../.planning/quick/546-ensuretripinspection-and-findtripinspect/vitest-after.txt
```

**DIFF it against `vitest-before.txt` from Task 1 and report BOTH pass/fail counts** — not "green".
The AFTER run must have the same failures as BEFORE (ideally none) plus the new file's passes. Any
newly failing file is a regression and blocks the commit.

**When a test FILE fails but all its tests pass, read the Failed Suites block, not the assertions** —
a teardown FK violation is the shape that has bitten this repo before.

Final `npx tsc --noEmit` in `apps/web`, probed as in Task 1. Confirm no `__probe` file or line
survives anywhere: `git status --porcelain` must show only the intended files, and
`Select-String -Path apps/web/src -Pattern "__probe" -Recurse` must return nothing.

Commit (do NOT push — the orchestrator pushes once at the end, and only if the user asks):

```
git add apps/web/src/lib/carrier/__tests__/inspection-scope.test.ts
git commit -m "test(quick-546): pin trip inspection scope to one constant"
```

Delete the two vitest transcript files if they were written inside the repo tree, or confirm they are
gitignored — they are working artefacts, not deliverables.
  </verify>
  <done>
`inspection-scope.test.ts` exists, passes, and was DEMONSTRATED to fail on both a flipped constant
and a renamed function. It reads both modules from disk, slices only the two function bodies,
asserts constant-reference + no-literal on each, and carries an integrity floor. The carrier suite's
BEFORE and AFTER pass/fail counts are recorded and diffed, with no new failures. `tsc --noEmit` clean
and probed. No probe artefacts remain. Committed, not pushed.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` clean in BOTH `apps/web` and `apps/mobile` — each result PROBED with an injected
  `const __probe: number = 'x';` in a file actually edited, and every probe deleted afterwards.
- Carrier vitest suite run before and after, counts diffed and reported, no new failures.
- `inspection-scope.test.ts` demonstrated to fail on a flipped constant and on a renamed function.
- Grep: no `entityType: 'DISPATCH'` / `entityType: 'VEHICLE'` literal inside `findTripInspection` or
  `ensureTripInspection`; `findValidPriorInspection`'s query byte-identical.
- Three atomic commits, nothing pushed.
</verification>

<success_criteria>
- A second trip in the same truck opens its own inspection checklist instead of hitting a CONFLICT.
- Create and find name the same scope, sourced from `TRIP_INSPECTION_ENTITY_TYPE`.
- A driver who still cannot open a checklist reads why — and a code — immediately above the button
  they tapped, and is told to contact dispatch rather than to retry something that cannot succeed.
- `findValidPriorInspection` still honours the historical VEHICLE-scoped rows, with a comment saying
  why it differs.
- No DDL, no data migration, no existing test weakened.
</success_criteria>

<output>
After completion, create
`.planning/quick/546-ensuretripinspection-and-findtripinspect/546-SUMMARY.md`.

It MUST record, in addition to the usual:

1. **The orphan decision and its reasoning.** The 15 existing VEHICLE-scoped instances are left in
   place. Why that is safe: the conflict key becomes `(playbookId, dispatchId)` so they no longer
   block creation; they were already unreachable from `findTripInspection` so nothing regresses; and
   `findValidPriorInspection` can only honour one if a step was answered inside the rolling 24h
   window — exactly one has any answered step and it was last touched 2026-04-26. What it costs:
   stale NOT_STARTED rows visible as clutter in Checklists & Workflows. Why no cleanup shipped: the
   schema offers none that is honest — `PlaybookInstance` has no `deletedAt` and `InstanceStatus`
   has no CANCELLED — leaving only an irreversible hard delete or DDL, both out of scope here.

2. **The mobile verdict** — "verified unchanged" or the change that was made and why.

3. **The before/after carrier suite counts**, both numbers.

4. **This was the ninth silent failure in this module**, and the specific lie removed: a CONFLICT
   answered with "Please try again", an instruction that could never succeed, rendered a
   screen-height from the button.
</output>
