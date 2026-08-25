# quick-543 — Make inspection playbooks work, then let the gate see them

**Predecessor:** quick-542 (`.planning/document-import/diagnostics/inspection-playbook-lookup.md`).
**Pre-task commit:** `ab45f571`. Date: 2026-08-25.

Six items, in the order given. The order mattered: item 5 is what makes the demo tenant's inspection visible to the gate, and items 1–3 are what make it *work* once it is visible.

---

## A correction to quick-542 first

quick-542 §6.3 claimed the DISPATCHER `FORM_FILL` made the checklist impossible to complete — *"the driver would be permanently unable to start the trip"*. **That was wrong.** `buildSnapshot` has always filtered the gate's outcomes to `stepType === 'INSPECTION_ITEM'`, so the `FORM_FILL` never reached `isInspectionComplete`.

The real defect was narrower: the step **rendered** with Pass / Fail / N-A buttons the server refused, and it sat in the screen's progress denominator so the bar never filled. A dead control and a stuck bar, not a blocked trip. The diagnostic has been corrected in place with the original text left visible.

This also means the task brief's premise for item 2 — *"so the checklist can never complete"* — was inherited from my error. Item 2 was still worth doing, for the reasons above.

---

## Item 1 — Photo key · IMPLEMENTED

**Chosen: extend the reader, do not normalise the data.**

Three spellings, all live, now read in one documented precedence order by `requiresPhotoOnFail()` in [inspection-snapshot.ts](../../../apps/web/src/lib/carrier/inspection-snapshot.ts):

| # | Key | Written by | Live rows |
|---|---|---|---|
| 1 | `requiresPhotoOnFail` | `seedStarterPlaybooks` | 176 templates, 16 tenants |
| 2 | `require_photo_on_fail` | the un-checked-in 2026-04-24 script | 35 templates, 7 tenants |
| 3 | `requiresPhoto` | nothing in this repo | 0 |

**Why read, not migrate.** A migration fixes 35 rows once and does nothing about the next writer — and the reader would still have to keep the aliases for hand-authored configs, so it buys a production write and removes no code. The reader change is one loop and costs nothing.

**Precedence, not OR.** The first key *present* wins, **even when its value is `false`**. An explicit `requiresPhotoOnFail: false` next to a legacy `requiresPhoto: true` means somebody turned the rule off in the modern key, and OR would silently override them. Verified before choosing: **zero** step templates carry more than one of the three (`multi_key = 0`), so no existing behaviour changed — this only fixes the meaning of a collision that has not happened yet.

### The rule, so there is no fourth

> **A config key that a reader must interpret gets exactly one exported constant for writers and exactly one exported reader function for readers, both in the module that owns the concept. Writers import the constant; readers call the function; neither ever spells the key inline. An alias joins the reader's list ONLY with a comment naming the writer that produced it and the live row count proving it exists.**

The constant is the half that actually prevents a fourth — a tolerant reader makes drift survivable, but only a shared constant stops it being created. Applied, not just written down: `PHOTO_ON_FAIL_KEY` is now exported and `seedStarterPlaybooks` writes `{ [PHOTO_ON_FAIL_KEY]: true }` instead of the literal. `defaultConfig` is `Json` and cannot be typed at the database, so this discipline is the only schema it will ever have.

## Item 2 — Non-driver steps · IMPLEMENTED

**What a driver now sees for the DISPATCHER `FORM_FILL`:** the card is still there, with its name, rendered **read-only** with a lock icon and the sentence **"Not part of your walkaround — dispatch completes this one."** No Pass, no Fail, no N/A. It is **excluded from the progress count** and from "items still need an answer".

Three decisions inside that:

- **Shown, not hidden.** The owner put it in the checklist deliberately; silently dropping it would make the driver's walkaround differ from the playbook with nobody told.
- **Excluded from progress.** This is the half that matters. A `NOT_STARTED` step the driver cannot answer would otherwise sit in the denominator forever — bar one short of full, "1 item still needs an answer" that never clears. The gate already ignored these, so the screen was disagreeing with the verdict it was about to receive.
- **Read from the assignment COLUMNS, not `stepSnapshot.assigneeRole`.** Both exist and are not guaranteed to agree. `findOwnStep` — what actually accepts or refuses the tap — filters on the columns, so deciding from the snapshot could offer a button the server then rejects. `STEP_SELECT` now carries `assigneeRole` and `assignedUserId`.

`isDriverAnswerableStep` mirrors `findOwnStep` exactly (INSPECTION_ITEM, plus assigned-to-me or DRIVER-role-and-unassigned). Drift between them would re-create the bug in the opposite direction: a step the driver could have answered, hidden.

**The gate's decision logic is untouched.** `evaluateTripStartGate` is not modified and neither is `buildSnapshot`'s filter. This is a rendering rule.

## Item 3 — Critical items · FINDING: there is no control, and no API path either

**An owner cannot mark a step dispatch-blocking. Not in the builder, not anywhere.**

- **No UI.** `StepDetailEditor.tsx` exposes exactly three things: the step-type config editor, *Due within (hours)*, and *Overdue alert recipient*. There is no toggle. `BuilderClient.tsx:63` reads `isDispatchBlocker` into state and `:381` passes it to `PreviewPanel` — round-tripped, never editable.
- **No API.** `addStepSchema` has no `isDispatchBlocker` field, so a new step takes the Prisma default. `updatePlaybookStepSchema` has no such field either, so it cannot be changed afterwards. The value is unreachable from the client at creation *and* at edit.
- **The default is `false`** (`schema.prisma`: `isDispatchBlocker Boolean @default(false)`).

So every step of every UI-built playbook is permanently non-critical. That is exactly what the demo tenant's data shows — `isDispatchBlocker = false` on all 10 steps across both playbooks — and it is not a quirk of the 2026-04-24 script: **it is the only outcome the product allows.**

**Consequences, stated plainly:**

1. `blockTripStartOnFailedInspection` is **inert for every tenant that built its own checklist**. This tenant has it `true`. A failed brake check logs a defect and the trip starts.
2. Only `seedStarterPlaybooks` ever sets `isDispatchBlocker: true`, and it sets it on **every** seeded step — so on a seeded tenant *everything* is critical, and Phase 9 item 3's **non-critical branch has never been exercisable by data either way.** Seeded tenants: all critical. Built tenants: none critical. Neither can express the mixture the feature was designed around.

**Not fixed here** — it needs a schema field on two zod schemas, a tRPC pass-through, and a control in the step editor. That is its own task, and it is the one I would do next: items 1, 2, 4 and 5 make the inspection *run*, and this is what makes it *stop a truck*.

## Item 4 — Builder category · IMPLEMENTED

`VEHICLE_INSPECTION` added to `CATEGORY_OPTIONS` in `CreatePlaybookDialog.tsx`, labelled **"Vehicle Inspection (DVIR)"** and placed second, directly under Onboarding, because it is the one category with behaviour attached. `PlaybookCard.tsx` gained matching icon, colour and label entries so the card does not fall through to the `CUSTOM` styling.

Nothing else needed changing: `playbookCategorySchema`, the Prisma enum and the Postgres type have accepted the value since it was added. The dropdown was the only gate — which is why the gate's own error message *"Create one in Checklists & Workflows"* pointed at a screen where the required category could not be chosen.

## Item 5 — Data migration · IMPLEMENTED

**Rows reported before the write, then updated. Exactly 8, all `entityType = 'VEHICLE'`.**

| Playbook id | Name | Tenant | Steps | Instances |
|---|---|---|---|---|
| `19f88812-9b7e-463d-a88f-9d21f424ef79` | Pre-Trip Inspection | DriveCommand Demo | 5 | 1 |
| `73538d98-2ddd-4e1d-9369-6d4774701181` | Pre-Trip Inspection v2 | DriveCommand Demo | 5 | 20 |
| `2d2c9449-3cf4-4d54-b1ba-20e10e1c8498` | Pre-Trip Inspection | DriveCommand Demo Member | 5 | 0 |
| `0a6db612-bf08-4ebe-ae38-9c16d04f1de5` | Pre-Trip Inspection | Nadeem User | 5 | 0 |
| `286bfc79-c640-4f89-b3f2-6493b9af3332` | Pre-Trip Inspection | Nadeem's Testing | 5 | 0 |
| `60498f59-9914-4d3d-88cc-c2a6d60b178d` | Pre-Trip Inspection | QA Test Org | 5 | 0 |
| `95681e27-30a9-40cd-b834-441b4bb6b79d` | Pre-Trip Inspection | QA Test Org B | 5 | 0 |
| `6e279859-91f2-45ba-bd6e-590293bef7b5` | Pre-Trip Inspection | SAMMY ISSA | 5 | 0 |

```sql
UPDATE "Playbook" SET category = 'VEHICLE_INSPECTION', "updatedAt" = now()
WHERE "deletedAt" IS NULL AND category = 'SAFETY' AND "entityType" = 'VEHICLE'
RETURNING id, name, "tenantId", category, "entityType";
```

`RETURNING` came back with those exact 8 ids and no others. **"Vehicle Check"** (`SAFETY` / **`DRIVER`**, 0 steps, tenant `8df99155`) was excluded by the `entityType` clause as required — had it been swept in it would have become the oldest `VEHICLE_INSPECTION` playbook in its tenant and `ensureTripInspection`'s `orderBy createdAt asc` would have handed that tenant's drivers an empty walkaround.

All seven tenants are internal or test. No DDL. This was the only data write in the task.

## Item 6 — End-to-end · PARTIALLY VERIFIED

**Verified against live data:**

- `ensureTripInspection`'s exact `where` now returns a row for the demo tenant: **"Pre-Trip Inspection"** (`19f88812…`, `entityType=VEHICLE`, oldest by `createdAt`). The `NO_INSPECTION_CHECKLIST` error can no longer fire there.
- **Denominator matches the gate.** Per instance: v1 → 5 total, 5 gate-counted, 5 driver-answerable. v2 → 5 total, **4** gate-counted, **4** driver-answerable. The `FORM_FILL` is the one difference and it is now excluded from both, so answering every answerable step reaches `isInspectionComplete`.
- **Which playbook a driver gets depends on the trigger.** `findTripInspection` runs first, so a trip whose `ON_DISPATCH_CREATE` fired gets **v2** (the trigger is bound to it and active); no current `planned` trip has a DISPATCH-scoped inspection instance, so those fall through to `ensureTripInspection` and get **v1**, which has no `FORM_FILL` at all.

**A defect found while verifying, and fixed:** neither playbook has a `SIGNATURE` step, so `signature.required` is false and `submit()` correctly skips the upload — but the signature screen still demanded a drawn mark before enabling **Sign and submit**. The driver had to sign something that was then discarded. Ink is now required only when a signature step exists; otherwise the pad is replaced by a sentence saying the name and time are what gets recorded.

**Not verified:** the walkaround has not been walked in a browser. That needs driver credentials for the demo tenant against production. Everything above is the data and the code read together, not a click-through.

---

## Gates

**TypeScript — probed, then clean.** A deliberate `const __probeGate543: number = 'y'` in `inspection-snapshot.ts`, a file this task edited, was reported as the **sole** error — gate live, not blind. Removed:

```
apps/web    npx tsc --noEmit  →  0 errors
apps/mobile npx tsc --noEmit  →  0 errors
```

`packages/validation` and `packages/api-client` dists rebuilt before the mobile run, since `InspectionStepView` gained two fields.

**Suite — zero regressions.** Baseline from `ab45f571` in an in-repo worktree, removed afterwards with `git worktree remove --force` (never `Remove-Item`, no symlink into the real tree).

| | Test files | Tests |
|---|---|---|
| Baseline `ab45f571` | 18 failed, 108 passed, 12 skipped | 66 failed, 1305 passed |
| After | 18 failed, 112 passed, 8 skipped | 66 failed, 1325 passed |

Failing test **names diff byte-identically** — same 18 files, same 66 tests, all pre-existing `headers`-outside-request-scope and mocked-Prisma failures.

---

## Files

**Modified (7)**
```
apps/web/src/lib/carrier/inspection-snapshot.ts     3-key reader + precedence + the rule; isDriverAnswerableStep
apps/web/src/lib/carrier/inspection-lookup.ts       STEP_SELECT gains assigneeRole + assignedUserId
apps/web/src/lib/carrier/inspection-handlers.ts     InspectionStepView gains assigneeRole + answerableByDriver
apps/web/src/server/services/workflows/seedStarterPlaybooks.ts   writes via PHOTO_ON_FAIL_KEY
apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx
apps/web/src/app/(owner)/checklists/_components/CreatePlaybookDialog.tsx
apps/web/src/app/(owner)/checklists/_components/PlaybookCard.tsx
packages/api-client/src/carrier-driver.ts           wire-type parity
```

**Data:** 8 `Playbook` rows re-categorised. No DDL. No new tables, no `EXEMPT_MODELS` entry.

---

## Per-item audit

| # | Item | Status |
|---|---|---|
| 1 | Photo key — one reader, three spellings, documented precedence; state the rule preventing a fourth | **IMPLEMENTED** — reader chosen over migration with reasoning; precedence is first-key-present, verified safe against live data (`multi_key = 0`); rule stated **and applied** to the seed writer |
| 2 | Driver checklist must skip or refuse non-DRIVER steps; report what the driver sees | **IMPLEMENTED** — read-only card, named owner, no buttons, excluded from progress; decided from the assignment columns because that is what `findOwnStep` reads |
| 3 | Report how an owner marks a step dispatch-blocking today | **REPORTED — there is no control and no API path.** Absent from `addStepSchema` *and* `updatePlaybookStepSchema`; default `false`. `blockTripStartOnFailedInspection` is inert for every self-built checklist, and Phase 9 item 3's non-critical branch has never been exercisable either way |
| 4 | Add `VEHICLE_INSPECTION` to the builder's category options | **IMPLEMENTED** — plus the three `PlaybookCard` maps so it does not render as `CUSTOM` |
| 5 | Migrate the 8 SAFETY/VEHICLE playbooks; report rows first; scope strictly | **IMPLEMENTED** — 8 rows listed before the write, `RETURNING` confirmed the same 8, "Vehicle Check" correctly excluded |
| 6 | Confirm the gate finds the playbook and the checklist completes | **PARTIALLY** — lookup and step arithmetic verified against live data; a signature-screen defect found and fixed. **Not walked in a browser** — needs driver credentials against production |

---

## Follow-ups

1. **`isDispatchBlocker` has no control** (item 3). The highest-value next task: without it, the safety gate cannot stop anything on a self-built checklist.
2. **`RecipeCard.tsx`'s `suggestedCategory` filter** — left alone as instructed. It admits `VEHICLE_INSPECTION` and `CUSTOM`, so after item 5 the migrated playbooks now *pass* that filter where they previously did not. Worth re-checking rather than assuming it is still wrong.
3. **`apps/mobile`'s `TripInspectionScreen` still renders non-driver steps as answerable.** The wire fields are now there; the fix is a rendering change.
4. **The 2026-04-24 script is not in the repo.** It writes `require_photo_on_fail` and `isDispatchBlocker: false`. If it is ever run again it will re-create both defects.

   **Why it used `SAFETY` is now answered, and it was not a mistake.** Checked against `_prisma_migrations` after this task's commit: the foundation migration created `PlaybookCategory` with six values at **02:21:59**, the playbooks were written **85 seconds later at 02:23:24**, and `VEHICLE_INSPECTION` was not added to the enum until **18:06:45** the same day — 15.7 hours after. The script could not have used it; Postgres would have rejected the insert.

   So the real omission belongs to `20260424100001_workflow_engine_inspection_mode`, which added the seventh enum value and neither backfilled the rows written before it nor added it to the builder's dropdown. Items 4 and 5 of this task are, between them, that migration's missing half — finished sixteen months late. Worth remembering the next time an enum gains a value: **adding one is three changes — the type, the existing rows, and every place a user picks from it.**
5. **v2's steps carry `playbookPhase` PRE_START / DAY_1**, so the walkaround renders sections titled "Pre start" and "Day 1". Cosmetic, but meaningless to a driver.
