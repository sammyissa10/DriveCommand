# Phase 9 — Driver start and inspection gate

Spec: `docs/specs/DocumentImport_TechnicalSpec_v1.md` Section 12, design rules Section 15.
Commits: `ccfb16fd`, `41f3ab40`, `7cf76f2b`.

---

## What this phase actually was

The audit called it right: **the real work is the gate at `/start`, not the checklist.**
`transitionTripStatus` is not unguarded — it enforces a status state machine
(`planned → in_progress | cancelled | tonu`) and returns `Invalid status transition`
otherwise. What it has never had is any notion of inspection or compliance. A truck
whose brake check failed five minutes ago could start a trip, and nothing anywhere
would object.

Everything about the *checklist* already existed: `StepType.INSPECTION_ITEM`,
`PlaybookCategory.VEHICLE_INSPECTION`, `PlaybookStep.isDispatchBlocker` as the
critical marker, `failInspectionItem` with its mechanic sign-off, the
`'inspections'` storage category, and a photo upload that already fired at capture.
None of it was rebuilt. The four endpoints the driver's answers travel through —
`/tasks/[id]/complete`, `/fail`, `/skip`, `/tasks/upload-photo` — are untouched.

---

## Three facts checked against production, not assumed

These shaped the build and could not have been discovered mid-phase without wasting it.

**1. The starter DVIR playbook is `entityType: 'DISPATCH'`.** So `entityId` is the
**Trip id**, not the truck id — `seedStarterPlaybooks.createPreTripInspection`.
Truck and driver are reachable only by joining `dispatches`. A tenant may also build
a VEHICLE-scoped inspection, so `findValidPriorInspection` searches both shapes.

**2. `PlaybookInstance.completedAt` and `startedAt` are never written.** No service in
the repo sets them; `computeDispatchReadiness` updates `completionPercent`,
`isDispatchReady` and `status` only. Confirmed live: **27 instances, 0 with
`completedAt`, 0 with `startedAt`, 12 DISPATCH-scoped.** Reading `completedAt` for the
validity window would have made every inspection look infinitely stale and re-opened
the checklist on every single start — a bug that would have looked like the feature
working. The timestamp is `MAX(StepInstance.completedAt)`.

**3. `DispatchOverrideAudit.entityType` has no CHECK constraint.** Read via
`pg_get_constraintdef` before writing to it, per DEC-14. The only CHECKs on the
relevant tables are `dispatches_status_check`, `dispatches_hos_cycle_check`,
`dispatches_end_stop_policy_check`, `Tenant_defaultEndStopPolicy_check` and two on
`stops`. So `entityType = 'INSPECTION'` is additive with zero DDL, and audit B10's
recommendation to reuse that table stands.

---

## What was built

### Server — one decision, three files, one handler

| File | Role |
|---|---|
| `lib/carrier/inspection-gate.ts` | **Pure.** Section 12's flowchart, no I/O. 25 tests, and no database to fake — DEC-14's warning is what pushed the decision into a file with no SQL in it. |
| `lib/carrier/inspection-lookup.ts` | Read-only. Turns the workflow engine's shape into the gate's. |
| `lib/carrier/inspection-service.ts` | Every write. |
| `lib/carrier/inspection-handlers.ts` | Transport-neutral, mirroring Phase 2's `handlers.ts`. |
| `lib/carrier/inspection-constants.ts` | `INSPECTION_VALIDITY_HOURS`, both minimum lengths, the override entityType. Grep-verified single occurrence; the tests import them. |
| `lib/carrier/inspection-url.ts` | The mobile id-from-URL parse, written once. |

Four web routes and four mobile routes, all thin adapters over the same handlers.

**The gate's order is not cosmetic.** NOT_REQUIRED wins over everything — a tenant who
turns inspections off must not still be blocked by yesterday's failure. OWNER_OVERRIDE
outranks the outcome, because item 5 permits an override *before* a failure, which
means the driver never sees the checklist. PRIOR_INSPECTION sits above the checklist,
matching the drawing. Only then is this trip's own inspection read.

**A prior inspection cannot launder a critical failure.** Inside the window it clears
the gate only if it passed its critical items — otherwise "already inspected today"
becomes a route onto the road for a truck that failed its brake check this morning.

### The validity window is rolling 24 hours, not a calendar day

Section 12 says *"valid one already today, this truck?"*. Read literally that expires
a 23:50 walkaround at 00:00, ten minutes later, and it hits the night driver who has
just done everything right. `INSPECTION_VALIDITY_HOURS = 24`, rolling. If a tenant
ever needs it configurable the constant becomes a column's default; inventing that
column before anyone asked would be a fourth settings rung nobody reads.

### The one new table

`CarrierTruck` has **no** defect or maintenance relation. `MaintenanceEvent` and
`ScheduledService` hang off the *legacy* `Truck` model. The only truck-level signal was
`carrier_trucks.status`, and flipping that to `'maintenance'` over a cracked mudflap
takes a truck out of service — the wrong instrument.

`carrier_truck_defects`, applied to production via Supabase MCP, mirrored as
`20260825120000_add_carrier_truck_defects` and marked applied with
`prisma migrate resolve --applied`. **Verified resolved-not-run: `applied_steps_count = 0`,
non-null `finished_at`, null `rolled_back_at`** — DEC-3 rules 1 and 4.

It ships with RLS enabled **and forced**, both sibling policies, and the `app_user`
grant, all in the migration. DEC-13 (`carrier_documents`: RLS forced with zero
policies) and quick-520 (`route_matrix_cache`: no grant at all) are the two ways this
has gone wrong before, and each was one line.

A partial unique index on `step_instance_id` means re-submitting a corrected note
**updates** the defect rather than doubling the truck's open count.

`CarrierTruckDefect` is in `EXEMPT_MODELS` **in the same commit** that adds it to
`schema.prisma`. Third model of that class; the first not found later by an
investigation.

### Mobile — full screen means full screen

`href: null` was never enough, and this is worth stating plainly: it hides a tab's
**button** while the screen stays inside the Tabs navigator, so the tab **bar** remains
on screen. The pre-existing inspection at `tasks/[id]` is registered exactly that way,
which means **it has never actually been full screen**, despite the audit describing
it as one. The new `(driver)/inspection/` group carries
`tabBarStyle: { display: 'none' }`.

`SupportTicketFAB` is deliberately left in place. A driver blocked by a failed brake
check at 05:00 who wants help is the situation it exists for.

**Sections.** The workflow engine has no section concept for inspection items —
`PhaseType` exists but is `NONE` on all twelve seeded steps, so grouping by it would
produce one section called "None" and quietly deliver nothing. `sectionOf` reads an
explicit `section` key off `stepSnapshot.defaultConfig` / `overrideConfig` (both Json,
so a checklist author needs no schema change), falls back to a real `playbookPhase`,
then to a single "Walkaround". Chunking a flat list into arbitrary groups of N was
rejected: a boundary that means nothing is worse than no boundary, because the driver
reads it as meaning something.

**N/A is the existing `SKIPPED` verb**, with `skipReason`, through the existing
`/tasks/[id]/skip` route. `computeDispatchReadiness` already counted `SKIPPED` as
satisfied. Not a new state.

**Back navigation needs no state restoration.** Every answer is already on the server
when it is given, so going back re-renders stored state. That is also why answers
survive an app kill and not merely a screen pop.

### One signature, and a defect closed

`SignaturePad` is lifted out of `SignatureScreen` and shared with the inspection's
final screen. It closes the defect `02-SUMMARY` logged and deferred here:

```ts
// NOTE: this path has always ignored the PUT result and set s3Key
// regardless, so a failed upload completes the step with a key whose
// object was never written. Behaviour preserved deliberately — fixing
// it changes driver signature submission, which is Phase 9's flow.
try { await putToPresignedUrl(uploadUrl, blob, 'application/json') }
catch { /* swallowed, as before */ }
s3Key = key
```

A signed DVIR whose signature object was never written is precisely the artifact a
roadside inspection asks for, and the driver was shown a green "Signature submitted"
either way. `uploadSignature` now returns a key **only** when bytes landed, and both
failure paths carry their name and message. Driver name and timestamp print beneath
the pad.

---

## The photo drift risk, and the offline limit stated rather than hidden

**Photos upload at capture.** The presigned PUT is awaited *before* the thumbnail
appears; only the returned `s3Key` is held. Kill the app straight after taking one and
the object is already in the bucket. This behaviour is inherited from the existing
`uploadInspectionPhoto` and preserved on purpose — the repo had already got the
phase's named drift risk right.

**The offline queue cannot carry a photo, and does not pretend to.**
`PendingMutation.body` is `string // JSON serialized`, persisted through MMKV and
flushed with a hardcoded `Content-Type: application/json`; the `type` union is four
JSON mutations and there is exactly one consumer in the app. A capture made with no
signal surfaces a named reason, the **note is still required**, and the failure is
still recorded through the same JSON path as every other answer. Evidence degrades;
the safety decision does not. No binary queue was invented — that is a subsystem with
its own retry, GC and quota design, and it is not this phase's.

---

## Silent failure

Six instances were found in this module before this phase. Two more are closed here,
and one whole class was:

- `SignatureScreen`'s swallowed S3 failure (above).
- `logger.error(message, error, context)` takes **the error second**. Passing a context
  object there — which `createNotification` and others do today — collapses it to
  `new Error('[object Object]')` and tells Sentry nothing. Every log site added in this
  phase uses the real arity, with `serializeError` in the context for name and message.

No catch added here swallows into a generic string. The `NO_INSPECTION_CHECKLIST`
case is named rather than 500ing, because "you turned inspections on but have no
checklist" is a thing an owner can fix in about a minute.

---

## Verification

**tsc — probed, not assumed.** A deliberate `const x: number = 'y'` was injected into
`inspection-gate.ts`; tsc reported **only** that error, proving the gate was live and
not blinded by a parse error elsewhere. Probe removed, then:

- `apps/web`: `npx tsc --noEmit` → **0 errors**
- `apps/mobile`: `npx tsc --noEmit` → **0 errors**

**Full suite, against the pre-task commit in a detached worktree.**

| | Test files | Failed files | Failed tests | Passed |
|---|---|---|---|---|
| Baseline `8a40fa2f` | 133 | 18 | 66 | 1252 |
| This phase | 135 | 18 | 66 | **1299** |

The failing **file sets are byte-identical** — compared by name, not by count. All 66
are pre-existing (workflows routers, driver-pay golden exporters, auth unit tests,
validation schemas). **+47 passing tests, zero regressions.**

The worktree was created in-repo and removed with `git worktree remove --force`,
never `Remove-Item` — that followed a junction and destroyed 2,235 files last session.

**Live schema diff against Section 12** — every requirement present:
tenant settings ✓ · all four `dispatches.inspection_*` columns ✓ ·
`DispatchOverrideAudit` with no CHECK on `entityType` ✓ · `carrier_truck_defects`
17 columns / 2 policies / 4 `app_user` grants / 4 indexes ✓. All 17 live column names
match the Prisma model's `@map`s exactly.

**`prisma generate` DID run** (the new model). **A dev server restart is required
before any browser verification** — regenerating on disk does not refresh the client
pinned on `globalThis` in a running `next dev`, which surfaces as a 500 with no
Postgres-side error. Verify the restart by process start time, never by assumption.

**`packages/api-client` dist was rebuilt.** `main` points at a gitignored `dist/`, and
type-only imports resolve without it, which is exactly how this hid in phases 1, 2
and 3. `TripStartBlockedError` is exported as a **value**, not a type — in the type
list, `instanceof` would be a compile error at every call site.

---

## Per-item audit

Written against the prompt text item by item, per DEC-9 — not from memory of the work.

### Build items

**1. Trip start checks in Section 12's order — IMPLEMENTED.**
`evaluateTripStartGate` (`inspection-gate.ts`): required? (`Trip.inspectionRequired ??
Tenant.requirePreTripInspection`) → override? → valid one today for this truck by this
driver inside the window? → otherwise open the checklist. Wired into
`POST /api/v1/carrier/dispatches/[id]/start` and its mobile mirror.

**2. The full-screen checklist — IMPLEMENTED.**
One section per screen with a progress bar across the top; pass / fail / N-A with
44pt minimum targets; a failed item requires a note (`FAIL_NOTE_MIN_LENGTH`) and
offers photo capture; **photos upload at capture** — the PUT is awaited before the
thumbnail renders; back navigation preserved through a review screen before signing;
signature on the final screen with driver name and timestamp printed beneath. Mounted
at `(driver)/inspection/[dispatchId]` with the tab bar hidden.
*One thing short of the ideal, stated:* offline photo capture cannot be queued —
see the offline section above. Item 2's own text asked for this to be reported before
building rather than silently deferred, and it was, in Step 0a.

**3. Outcomes — IMPLEMENTED.**
All pass → `PASSED`, trip starts. Non-critical failures → `PASSED_WITH_DEFECTS`, trip
starts, defects written to `carrier_truck_defects` against the truck. Any critical
failure with `blockTripStartOnFailedInspection` on → `BLOCKED`; with it off, defects
are still logged and the trip starts.
*Worth knowing:* `seedStarterPlaybooks` sets `isDispatchBlocker: true` on all twelve
seeded steps, so on a seeded tenant every item is critical and the non-critical branch
is unreachable **by data** until an owner edits the checklist. The code path exists,
is tested, and is not conditional on the seed.

**4. The blocked-driver screen — IMPLEMENTED.**
What failed, by name, with the driver's own note and photo count; "your dispatcher has
been notified", which is a fact because `notifyDispatchOfBlock` awaits the in-app
notification before the gate returns BLOCKED; Contact dispatch, Call, and a re-check
that releases the driver the moment an override lands, without needing a push.

**5. Owner override — IMPLEMENTED.**
`POST .../inspection/override`, OWNER/MANAGER only (deliberately not the `dispatches`
permission — a dispatcher may manage a trip without being entitled to send a truck out
on a failed brake check). Typed reason, minimum 10 characters. Written **both** to
`DispatchOverrideAudit` (user, reason, timestamp, `entityType='INSPECTION'`) and to
`Trip.inspectionOverridden{ById,Reason,At}`, so it is permanently on the trip record
without every reader reimplementing "most recent override". Rendered on trip detail in
both the desktop and mobile-web layouts, and available before or after a failure.
Defects survive the override — overriding the gate does not un-break the brake line.

**6. New tenant settings — IMPLEMENTED, no DDL, and that is a claim with evidence.**
Both columns already existed in production from Phase 1 —
`requirePreTripInspection` (bool, NOT NULL, default false) and
`blockTripStartOnFailedInspection` (bool, NOT NULL, default true) — re-verified against
`information_schema` this session. What did not exist was any way to change them.
`/settings/operations` plus its **sidebar entry**, added in the same commit.

### Binding patterns

| Pattern | Status |
|---|---|
| New model without `tenantId` → `EXEMPT_MODELS` same commit | **DONE** — `CarrierTruckDefect`, commit `ccfb16fd` |
| All DB access through a tenant client | **DONE** — `getTenantPrismaForOrg(orgId)` throughout; never the header-reading `getTenantPrisma()`, which is the E251 path on `/api/mobile/*` and inside `after()` |
| No `after()`/background call resolves its client inside the closure | **DONE** — the client is always resolved first; only `sendPushToUser` (which takes no tenant client) is deferred |
| DDL via Supabase MCP, mirrored resolved-not-run per DEC-3 | **DONE** — `applied_steps_count = 0`, non-null `finished_at`, both verified |
| No catch swallows into a generic string | **DONE** — every catch logs name + message via `serializeError`, and `logger.error`'s real arity is used |
| Sidebar / navigation wire-up | **DONE** — `/settings/operations` in the sidebar; `(driver)/inspection` registered on the Tabs navigator |
| Reuse checklist definitions, signature component, offline queue | **DONE** — existing Playbook/StepInstance engine and its four endpoints; `SignaturePad` extracted from the existing screen rather than duplicated; offline behaviour unchanged and not weakened |
| Install nothing | **DONE** — no dependency added |
| iOS dark aesthetic; red only for a failed item | **DONE** — progress and navigation use `c.brand`; red appears on a failed item, the Fail control, and the blocked screen's icon |
| Rebuild `packages/validation` / `api-client` dist | **DONE** — `api-client` rebuilt; `validation` unchanged this phase (no new exports) |
| PowerShell: no `&&` / `\|\|` | **DONE** — all shell work through the Bash tool |

### Close steps

| Step | Status |
|---|---|
| Probe the tsc gate, confirm only that error, remove it | **DONE** — both apps |
| Real typecheck in both apps | **DONE** — 0 errors each |
| Full suite vs pre-task commit in a detached worktree | **DONE** — identical failing file sets, +47 passing |
| `git worktree remove`, never `Remove-Item` | **DONE** |
| Say if `prisma generate` ran + restart required | **DONE** — it ran; restart required, verify by process start time |
| Live schema diff against Section 12 | **DONE** — every requirement present |
| Write `09-SUMMARY.md` | **DONE** — this file |

---

## Not done, and why

- **`InspectionModeScreen` (the task-list entry) keeps its one-item-per-card flow.**
  It gains nothing from this phase except the shared signature fix, which it does get
  via `SignatureScreen`. Reworking it into sections would change a screen reached from
  My Tasks for a different purpose — checklist steps assigned individually — and was
  not asked for.
- **The `requiresPhotoOnFail` / `requiresPhoto` spelling split is read, not fixed.**
  `seedStarterPlaybooks` writes the first; `failInspectionItem` enforces the second, so
  the seeded enforcement has always been inert. `requiresPhotoOnFail()` reads **both**
  so the driver's screen offers the camera where the seed intended. Widening the
  *server's* rule would start rejecting submissions that succeed today — a behaviour
  change to an existing endpoint, outside this phase.
- **Push on the `PUSH` NotificationChannel is still not emitted.** DEC-2 is explicit
  that nothing may send on it before Phase 10. Block notifications go through the
  existing `createNotification` + `sendPushToUser` mechanism, as
  `transitionTripStatus` already does.
- **No notification *trigger* was registered.** Section 13's ten triggers, including
  "Inspection failed", are Phase 10's. This phase notifies dispatch directly so item 4's
  promise is true today.
