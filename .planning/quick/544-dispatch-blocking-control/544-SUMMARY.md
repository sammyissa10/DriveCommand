# quick-544 — Give owners a way to mark an inspection step dispatch-blocking

**Predecessor:** quick-543 item 3, which established the gap. **Pre-task commit:** `bde19ea3`. Date: 2026-08-25.

---

## Step 1 — The full path, and where it was broken

`isDispatchBlocker` had to travel seven links. **Six existed. One did not.**

| # | Link | File | Status |
|---|---|---|---|
| 1 | Builder UI — the control | `app/(owner)/checklists/playbooks/[id]/edit/_components/StepDetailEditor.tsx` | ❌ **MISSING** — the panel offered only the step-type config editor, *Due within (hours)* and *Overdue alert recipient* |
| 2 | Builder UI — client state | `.../_components/BuilderClient.tsx:39,63` | ✅ present — `PlaybookStepItem.isDispatchBlocker`, normalised out of the tRPC payload |
| 3 | Schema — create | `packages/validation/src/workflows/playbook.ts` → `addStepSchema` | ❌ **MISSING** — field absent, so a new step took the column default |
| 4 | Schema — update | same file → `updatePlaybookStepSchema` | ❌ **MISSING** — field absent, so it could not be changed after creation |
| 5 | API | `server/api/routers/workflows/playbook.ts` → `addStep`, `updateStep` | ❌ **MISSING** — neither wrote the column |
| 6 | Column | `PlaybookStep.isDispatchBlocker Boolean @default(false)` | ✅ present since the workflow engine shipped |
| 7 | Snapshot | `server/services/workflows/generatePlaybookInstance.ts:188` → `buildStepSnapshot` | ✅ present — copies it into `stepSnapshot` verbatim |
| 8 | Read — readiness | `server/services/workflows/computeDispatchReadiness.ts:47-55` | ✅ present — an open blocker (`NOT_STARTED`/`IN_PROGRESS`/`FAILED`) makes `isDispatchReady` false |
| 9 | Read — the gate | `lib/carrier/inspection-lookup.ts` → `toOutcome` → `isCritical`, consumed by `evaluateTripStartGate` | ✅ present — a FAILED critical item is `BLOCKED` when the tenant setting is on |

**So this was a gap in the middle, exactly as the brief said.** The value was read at the far end by two independent consumers and written at the near end by nothing but `seedStarterPlaybooks`. `duplicate` (`playbook.ts:143`) also copies it, which is why a duplicated seeded playbook kept its blockers while a hand-built one could never acquire any.

The failure was invisible from either end. The builder *displayed* the field (it is in `PlaybookStepItem`, and `PreviewPanel` receives it) so the plumbing looked complete from the client side; the read path worked perfectly so it looked complete from the server side. Only the two schemas and the two mutations in between were silent.

## Step 2 — Schemas and API · IMPLEMENTED

**`addStepSchema`** — `z.boolean().optional().default(false)`, matching the column default. The builder does not send it; a step is added and then marked blocking in the editor, exactly as `dueWithinHours` behaves. Accepted so an API caller can create a blocking step in one call.

**`updatePlaybookStepSchema`** — `z.boolean().optional()`, **deliberately with no default.** This is a partial update and the router writes only fields that are `!== undefined`. A default of `false` here would silently clear the flag for every caller that omits the field — the difference between *"the user did not tick the box"* and *"the user is not editing this field"*. Getting that backwards would un-block every step saved by an older client.

Both mutations updated: `addStep` passes it into `create`, `updateStep` writes it behind the same `!== undefined` guard its neighbours use.

## Step 3 — The control · copy reported, then IMPLEMENTED

**"Dispatch blocker" — the column's name — appears nowhere an owner can see.** It is our word, not theirs.

The label is **conditional on step type**, because the flag genuinely means two different things and one label covering both would have to be vague enough to be useless:

| | INSPECTION_ITEM | Every other step type |
|---|---|---|
| **Label** | **Failing this stops the trip** | **Must be finished before dispatch** |
| **Helper** | "If the driver reports this item as failed, the trip is blocked and dispatch is notified. Turn it on for anything that makes the vehicle unsafe to drive — brakes, tires, lights. Leave it off for faults worth recording but not worth stopping a truck for." | "The driver or vehicle this checklist belongs to will not count as ready to dispatch until this step is complete." |

Two further lines, both stating things an owner cannot see from this panel and would otherwise learn the hard way:

- *(inspection only)* **"Trips are only stopped while _Block trip start on failed inspection_ is on in Operations settings."** Without this, an owner ticks the box and believes they have protection that the tenant setting may have switched off.
- *(always)* **"Applies to checklists started from now on. Ones already running keep the rules they started with."** This is `buildStepSnapshot`'s immutability, which is correct behaviour and completely invisible — an owner who ticks the box mid-shift and watches a running inspection ignore it would otherwise conclude the feature is broken.

**Placement:** first in the panel, above the SLA fields. It is the only setting there that can stop a truck.

**Also added:** an amber **"Blocks dispatch"** badge on the step row (`BuilderStepRow.tsx`). A control an owner must open eight step editors to audit is a control they will not audit. Amber, not red — this is a deliberate setting doing its job, and Section 15 reserves red for errors and destructive actions.

## Step 4 — Offered on every step type, not just INSPECTION_ITEM

**Reasoning, not assumption:**

1. **The field is not inspection-specific and never was.** `computeDispatchReadiness` reads it for every step of every playbook. Of the 384 currently-blocking steps in production, **192 are in VEHICLE_INSPECTION playbooks and 192 are not** — 112 in ONBOARDING, 80 in PARTNER. Restricting the control to inspection items would leave exactly half the field's real usage uneditable.
2. **The seed already expresses a mixture outside inspections.** `seedStarterPlaybooks` sets it `false` on two CDL-onboarding steps and one partner step while setting it `true` on the rest. Those are considered editorial choices, and an owner cannot currently revise any of them.
3. **Driver readiness depends on it.** `isDispatchReady` on `User` is computed from open blockers in ONBOARDING playbooks. An owner who cannot mark an onboarding step blocking cannot make driver readiness mean anything.
4. **Hiding it would misrepresent the field.** A control that appears only on inspection steps teaches the owner that the concept only applies to inspections — which is false, and would make the ONBOARDING blockers that already exist look like a bug.

What is *not* uniform is the **meaning**, which is why the copy varies. On an inspection item the operative case is a FAILED answer; elsewhere it is an unfinished step.

## Step 5 — Where the "all steps non-blocking" gap could be surfaced · REPORTED, NOT BUILT

A playbook whose steps are all non-blocking, in a tenant with `blockTripStartOnFailedInspection = true`, is protection that does not exist. Four candidate surfaces, best first:

1. **The playbook builder header** — an inline warning on the edit page itself: *"No step in this checklist can stop a trip."* Closest to the fix; the owner is already holding the tool that resolves it. Cheapest to build: the step list is already loaded client-side, so it is a `steps.every(s => !s.isDispatchBlocker)` check with no new query.
2. **`/settings/operations`**, beside the `blockTripStartOnFailedInspection` toggle — the place where the promise is made. A toggle that says "block trips on failed inspection" next to a note saying "no inspection checklist currently has a blocking item" is the most honest possible presentation, and it is where a compliance-minded owner looks.
3. **The Checklists dashboard** (`checklists/page.tsx` → `PlaybookCard`) — a badge on the card. Good for scanning many playbooks; worse for explaining, since the card has no room for the *why*.
4. **The compliance dashboard** — right audience, wrong distance: it is far from the control that fixes it, and adding a warning there without a link into the builder would just be a nag.

**Recommendation: 1 and 2 together.** 1 catches it at authoring time, 2 catches it for a tenant whose checklist was built before the setting was turned on — which is exactly the demo tenant's history. Deliberately not built here: the brief scoped this task to the control, and a warning is only worth adding once owners can act on it, which is now true and was not this morning.

## Step 6 — Scale of currently non-blocking steps · REPORTED, NOT MIGRATED

Not migrated, as instructed — which items a carrier considers critical is their judgement.

**Across all live playbooks: 540 steps, 384 blocking, 156 non-blocking, spanning 23 tenants.**

| Playbook category | Steps | Blocking | Non-blocking | Tenants |
|---|---|---|---|---|
| VEHICLE_INSPECTION | 232 | 192 | **40** | 23 |
| ONBOARDING | 179 | 112 | 67 | 23 |
| PARTNER | 127 | 80 | 47 | 23 |
| OPERATIONS | 2 | 0 | 2 | 1 |

The number that matters is narrower. **Eight active VEHICLE_INSPECTION playbooks have _zero_ blocking steps** — the same eight quick-543 re-categorised, i.e. every playbook created by the 2026-04-24 script:

| Playbook | Tenant | `requirePreTripInspection` | `blockTripStartOnFailedInspection` | Steps |
|---|---|---|---|---|
| Pre-Trip Inspection | DriveCommand Demo | **true** | **true** | 5 |
| Pre-Trip Inspection v2 | DriveCommand Demo | **true** | **true** | 5 |
| Pre-Trip Inspection | DriveCommand Demo Member | false | true | 5 |
| Pre-Trip Inspection | Nadeem User | false | true | 5 |
| Pre-Trip Inspection | Nadeem's Testing | false | true | 5 |
| Pre-Trip Inspection | QA Test Org | false | true | 5 |
| Pre-Trip Inspection | QA Test Org B | false | true | 5 |
| Pre-Trip Inspection | SAMMY ISSA | false | true | 5 |

**Only DriveCommand Demo has a live gap today** — it is the one tenant with `requirePreTripInspection = true`, so it is the only one where the gate is armed and cannot fire. The other seven carry the same latent gap and will hit it the moment anyone turns the requirement on. The 16 seeded `Pre-Trip Inspection (DVIR)` playbooks are unaffected: every seeded inspection step is blocking.

---

## Diff summary

```
packages/validation/src/workflows/playbook.ts        +2 fields (create default false, update no default)
apps/web/src/server/api/routers/workflows/playbook.ts  addStep writes it; updateStep writes it behind !== undefined
apps/web/.../edit/_components/StepDetailEditor.tsx   the control: state, reset-on-step-change, save, conditional copy
apps/web/.../edit/_components/BuilderStepRow.tsx     amber "Blocks dispatch" badge
```

Four files. No DDL, no data write, no new dependency. `evaluateTripStartGate`, `computeDispatchReadiness` and `buildStepSnapshot` untouched, as instructed — the read path was already correct.

## Gates

**TypeScript — probed, then clean.** `const __probeGate544: number = 'y'` injected into `playbook.ts`, a file this task edited, and reported as the sole error — gate live. Removed:

```
apps/web    npx tsc --noEmit  →  0 errors
apps/mobile npx tsc --noEmit  →  0 errors
```

`packages/validation` dist rebuilt before both, since both schemas changed.

**Suite — zero regressions.** Baseline from `bde19ea3` in an in-repo worktree, removed with `git worktree remove --force`.

| | Test files | Tests |
|---|---|---|
| Baseline `bde19ea3` | 18 failed, 108 passed, 12 skipped | 66 failed, 1305 passed |
| After | 18 failed, 112 passed, 8 skipped | 66 failed, 1325 passed |

Failing test names diff byte-identically — same 18 files, same 66 pre-existing failures.

**Not done:** not exercised in a browser. The control is a `Switch` bound to existing mutation plumbing and both apps typecheck, but nobody has ticked it and watched a trip refuse to start. That needs owner credentials and a driver walkaround against the demo tenant.

---

## Per-item audit

| # | Step | Status |
|---|---|---|
| 1 | Report the full path; name every file; which links exist and which are missing | **IMPLEMENTED** — 9 links tabled, 6 present, 3 missing (both schemas + both mutations), with why the gap was invisible from both ends |
| 2 | Add `isDispatchBlocker` to both schemas, default false | **IMPLEMENTED** — `default(false)` on create; **no default** on update, deliberately, so a partial update cannot clear the flag |
| 3 | Add the control; report label and helper copy first | **IMPLEMENTED** — copy reported above and used verbatim; conditional label, two caveat lines (tenant setting, snapshot immutability), plus a row badge so it is auditable at a glance |
| 4 | Restricted to INSPECTION_ITEM or every step type? State reasoning | **IMPLEMENTED — every step type.** Four reasons; the decisive one is that 192 of 384 existing blocking steps are outside inspections, so restricting it would leave half the field's usage uneditable |
| 5 | Report where an all-non-blocking playbook could be surfaced; do not build | **REPORTED, NOT BUILT** — four surfaces ranked; recommends builder header + Operations settings together |
| 6 | Report scale; do not migrate | **REPORTED, NOT MIGRATED** — 156 non-blocking of 540 across 23 tenants; the actionable subset is 8 inspection playbooks with zero blockers, of which **1 tenant is live-armed today** |

## Follow-ups

1. **Build step 5's warning** — now worth doing, because an owner who sees it can act on it.
2. **The demo tenant still has no blocking inspection step.** The control exists; someone has to use it. That is deliberately their call, not a migration.
3. **Not browser-tested** (above).
4. **`addStep` accepts the field but no UI sends it.** Harmless and asked for, but if the step library ever grows a "add as blocking" affordance, the plumbing is already there.
