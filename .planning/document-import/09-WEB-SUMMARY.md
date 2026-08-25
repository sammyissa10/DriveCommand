# Phase 9-web — Driver inspection and trip start gate on the WEB portal

**Spec:** `docs/specs/DocumentImport_TechnicalSpec_v1.md` Section 12 (driver flow), Section 15 (security and design rules).
**Predecessor:** Phase 9 (`ec31b515`) delivered this on `apps/mobile` only. quick-540 put the gate on every web start path. quick-539's `diagnostics/driver-client-surface.md` established that drivers use the **web** portal at `/home`.
**Date:** 2026-08-25.

Drivers use the web portal. This delivers Section 12's driver experience there. It is **not a port** — `react-native-svg`, `react-native-view-shot` and the MMKV queue have no DOM equivalent and none was invented.

---

## The decision that shaped everything

**The full-screen checklist could not live under `src/app/(driver)/`.**

`(driver)/layout.tsx:38-66` renders the branded header, `DriverNav`, `DriverBottomNav` and a padded `<main>` around every child, unconditionally. On web a page cannot opt out of its own layout — there is no `tabBarStyle: { display: 'none' }` to reach for. The only way to take over the viewport is to be a **sibling** of that group, which is what `/track/[token]` and `/onboarding` already are.

But `(driver)/layout.tsx:28-36` is also where the driver portal's session and role checks live. **Escaping the chrome escapes the authentication.** A new route group starts with no guard at all.

That single fact produced three deliberate pieces of work:

1. `(driver-fullscreen)/layout.tsx` re-establishes session + `role === DRIVER`. Middleware already redirects an anonymous request (verified live below), but middleware has **no reverse guard** — `src/middleware.ts:162-163` keeps DRIVERs out of owner paths and nothing keeps an OWNER out of a driver path. These eight lines are the only thing that does.
2. `resolveInspectionAccess` (`lib/carrier/inspection-access.ts`) asks the second question a layout cannot: *is this THEIR trip?* Without it any driver in the tenant could open any other driver's walkaround by editing the URL, sign it, and put an unseen truck on the road under someone else's name.
3. Both pages **and all seven server actions** call it. A server action reached from a tab left open since yesterday never re-runs a layout.

---

## What was built

### 1. The full-screen checklist — IMPLEMENTED

| Requirement | Where |
|---|---|
| Full screen, no chrome | `(driver-fullscreen)/layout.tsx` — sibling group, `min-h-dvh` (not `vh`: mobile browsers measure `100vh` with the URL bar hidden, so a sticky footer sits below the fold) |
| One section per screen | `InspectionRunner.tsx` pages `view.sections[]`, which `buildChecklistView` has always returned and nothing on web consumed |
| Progress across the top | Sticky header: `Section 2 of 6`, the section title, a bar over answered/total items, and the count in words |
| Pass / fail / **N-A** | `AnswerButton`, **56px** tall — 44 is the guideline floor, this is tapped with a glove on |
| Note required on fail | Enforced client-side with a live counter *and* server-side in `failDriverInspection` against `FAIL_NOTE_MIN_LENGTH` |
| Photo uploads AT CAPTURE | `onPhotoChosen` presigns and PUTs on pick, before the note is typed. `s3Key` is set only on a 2xx |
| Back navigation preserved | Live on every section including the first, never gated on the current screen being complete |
| Signature, name + timestamp beneath | `SignaturePad.tsx` + the signature screen |
| Phone-first | 56px targets, thumb-reachable sticky footer, `capture="environment"`, safe-area insets |

**Answers live on the server.** The runner holds no answer state — every tick comes from `step.status`, re-rendered after each action's `revalidatePath`. Local state is transient input only. Same discipline as Phase 5's stop review, same reason: two copies of an answer eventually disagree and the visible one is the wrong one.

**Re-answering is one-directional, deliberately.** A passed or N/A item can still be failed — a mis-tapped Pass on Brakes must be correctable, and that is the safe direction. A FAILED item cannot be cleared here: doing so would delete a reported defect, its mechanic sign-off step and its dispatcher notification. That asymmetry is what the shared services already enforce (`failInspectionItem` refuses only `FAILED`; `completeStep` refuses `COMPLETE`), so it is surfaced rather than implemented.

### 2. Reuse of the existing data layer — IMPLEMENTED, and two pre-existing defects fixed

Nothing new was built server-side. `handleGetGate`, `handleOpenChecklist`, `handleGetChecklist`, `handleSubmitInspection` and `evaluateTripStartGate` are untouched and already client-neutral.

**Defect 1 — the web fail path wrote keys the gate cannot read.** `failDriverInspection` wrote `result: { passOrFail, notes, photoPath }` via a bare `stepInstance.update`. Every Phase 9 reader (`inspection-lookup.ts:41-53`, `buildChecklistView`) reads `note` and `photoUrls`. A failure recorded on web therefore reached the blocked screen and the owner's trip detail with `note: null` and `photoCount: 0` — the driver's words and photo on the row, invisible to every screen whose purpose is showing them.

**Defect 2 — it bypassed `failInspectionItem` entirely.** No mechanic APPROVAL step, no `BLOCKED` on the instance, no `sendStepFailed`, no `computeDispatchReadiness`. **Section 12's "dispatcher notified" did not happen on web at all.**

Both fixed by delegating to the service the mobile route already calls. One failure path, one result shape.

**The N/A verb** is `markDriverTaskNotApplicable` — a distinct driver-scoped action that verifies the step is an `INSPECTION_ITEM` assigned to this driver, requires a reason at the note bar, and only then delegates. `skipStep` is **not** widened: it is shared with the dispatcher's admin path and applies to every step type. Its header, which claimed *"Only dispatchers/admins may skip (enforced at the tRPC layer via adminProcedure)"* — a guard the function has never performed, and which `POST /api/mobile/driver/tasks/[id]/skip` has bypassed with `allowedRoles: ['DRIVER']` since it shipped — is corrected in place to describe what is actually true.

### 3. The blocked screen — IMPLEMENTED

`/inspection/[dispatchId]/blocked`. Three things in the order a driver needs them: **what failed** (named items, the driver's own note, critical marked, photo noted), **that dispatch has been told** (a statement of fact — `notifyDispatchOfBlock` has already run inside `handleSubmitInspection`), and **something to do**. Never a dead end: Contact dispatch → `/messages` (in-app, logged against the tenant, no saved number needed — the same call mobile's blocked screen makes), a **Check again** that re-reads the gate and redirects out if an override or sign-off has cleared it, and the way home. Every terminal state in this group carries a way home, because a chrome-free `notFound()` would strand the driver with only the browser back button.

### 4. The `alert()` refusals — IMPLEMENTED

`driver-dispatch-card.tsx:136` and `route-detail-readonly.tsx:204` both now raise `TripStartRefusalDialog`, sharing one component. `alert()` was wrong three ways and only the first is cosmetic: it is unstyled OS chrome; it **blocks the main thread and is suppressed by some mobile browsers outside a direct user gesture** — a server action resolves asynchronously, so the refusal could simply never appear and the button would look broken; and it has one button, so a refusal that has a next step could not offer it. The dialog carries the gate's own sentence whole and routes on `code`: `INSPECTION_REQUIRED` → the checklist, `BLOCKED` → the blocked screen.

---

## The three additions

### 6. `FAIL_NOTE_MIN_LENGTH` — was 3, now **8**

**Three was not deliberate.** Its comment argued only that the driver should be held to a *lower* bar than an owner typing an override reason, and cited "left rear tire flat" — twenty characters — as its example of a complete answer. Nothing in that reasoning produces 3, and 3 accepts `abc`, `n/a`, `ok` and `...`.

Eight rejects all of those and accepts the terse real answers this domain produces: "air leak" (8), "flat tire" (9), "brake leak" (10), "lights out" (10). **It is not free** — "no horn" (7) is a genuine answer it rejects, which is why the field renders a live character counter rather than failing the driver at submit. Still below `OVERRIDE_REASON_MIN_LENGTH`, keeping the asymmetry the original comment reached for.

Also: it was **enforced nowhere on the server** — a client-side check in one React Native component and nothing else. It is now enforced in `failDriverInspection` and `markDriverTaskNotApplicable`. It travels to mobile automatically through `failNoteMinLength` on the wire type.

### 7. The guard test

`src/__tests__/security/inspection-route-guard.test.ts`. Real Postgres, real rows, no mocks — two tenants, five users, three carrier drivers, two trucks, two trips, created in `beforeAll` and deleted in `afterAll`. Six cases: the assigned driver is allowed; a real active driver in the same tenant who is not on the trip is refused; an OWNER is refused; a DRIVER-role login with no `CarrierDriver` row is refused; a driver naming a trip in another tenant is refused; a null role is refused.

**How it fails if the guard is removed:**

| Removal | Failing case |
|---|---|
| The role check | *refuses an OWNER* — the owner gets `allowed: true` |
| The ownership query | *refuses a driver who is not on this trip* **and** *refuses across the tenant boundary* |
| `orgId` on the trip lookup | *refuses across the tenant boundary* alone — the case a single-tenant dev database never surfaces |
| The **call** from a page or action | The last `describe`, which reads the four entry files off disk |

That last block exists because a guard nobody invokes passes every unit test written for it. It counts `export async function` against `await guard(dispatchId)` in `actions.ts`, so a new unguarded action moves the two numbers apart. It is weaker than an HTTP request and is here because an HTTP-level test needs a running Next server with a real Supabase session cookie, for which this suite has no harness.

> **⚠️ The six DB cases have NOT been executed.** They skip without `DATABASE_URL`, and the only `DATABASE_URL` configured in `apps/web/.env.local` points at **production Supabase**. Running them there would create and delete real tenants, users, drivers, trucks and trips in a live multi-tenant database, and a partial `afterAll` would leave orphans. That is not a call to make unasked. **The five static-guard assertions passed; the six database assertions are written and unrun.** Run them against a scratch database, or authorise a production run.

### 8. `requiresPhoto` vs `requiresPhotoOnFail`

**`requiresPhotoOnFail` is canonical.** It is what `seedStarterPlaybooks:267` writes — on all twelve inspection templates — and what the driver's screen has always read. `requiresPhoto` is the older spelling that only `failInspectionItem` enforced, and since no seed writes it, **that enforcement has been inert on every seeded tenant since it shipped** while mobile told drivers a photo *was* required and blocked them client-side. Screen and server disagreed; the server was wrong.

Aligned by pointing `failInspectionItem` at the shared `requiresPhotoOnFail()` reader, which accepts **both** spellings — narrowing to one key would silently switch off enforcement for any tenant who hand-authored the older one. To make that shareable without a workflow service importing Prisma and the notification stack, the two pure snapshot readers moved to `lib/carrier/inspection-snapshot.ts` and are re-exported from `inspection-handlers.ts`; every existing caller and the existing test are unchanged.

> **Production behaviour change, stated rather than buried:** on a seeded tenant a failed item now genuinely requires a photo where the server previously accepted one without. That is what the seed author asked for and what mobile has promised drivers since Phase 9. The driver is not trapped: the note is required and recorded either way, and the web checklist offers the camera on exactly the items this function returns true for, from the same helper.

---

## Photos: R2 under `inspections`

Matching mobile exactly. `requestInspectionPhotoUpload` and `requestSignatureUpload` presign R2; the browser PUTs directly. Browser→R2 direct PUT is **not new** — `components/documents/document-upload.tsx:72` and `TruckPhotoUploadModal.tsx:152` have done it against the same bucket for a long time, so the CORS configuration is proven in production rather than assumed. `uploadTaskFile` (Supabase Storage) is left alone for the Tasks tab's other step types. Every client-supplied key is re-validated with `assertTenantKey` before it is written to a row.

## Online-only, honestly

No offline queue, no IndexedDB, no sync layer — Section 12's "works offline and queues" is deferred for web by decision. Every answer is a server round trip; a failed one names what failed and offers a retry; **nothing renders as recorded that is not recorded**. There is no `queued` arm in `InspectionActionResult` and there should not be one: a client that can render "queued" will eventually render it for something that never sent.

---

## Navigation wire-up

**Nav file edited: `apps/web/src/components/driver/driver-dispatch-card.tsx`** — a standing **Pre-trip inspection** link on every `planned` trip, beneath Start Trip. `trip-start-refusal.tsx` also routes there, but only once the gate has said no, which would make the checklist reachable only by being turned away and only on a tenant that requires one. Drivers walk the truck *before* they tap start. The link is unconditional rather than gate-driven because the card does not read the gate and adding a query per dashboard load to decide whether to render a link is the wrong trade; when no inspection is needed the page says so in a sentence and offers the way back.

### Click paths (from a cold start, no typed URLs)

| Route | Path |
|---|---|
| `/inspection/[dispatchId]` | Sign in as driver → lands on `/home` → active trip card → **Pre-trip inspection** |
| `/inspection/[dispatchId]` (refusal route) | `/home` → **Start Trip & Navigate** → refusal dialog → **Start inspection** |
| `/inspection/[dispatchId]` (from `/my-route`) | Bottom nav **Route** → **Start Trip** → refusal dialog → **Start inspection** |
| `/inspection/[dispatchId]/blocked` | Complete the walkaround with a critical failure → **Sign and submit** → redirected automatically |
| `/inspection/[dispatchId]/blocked` (returning) | `/home` → **Start Trip & Navigate** → refusal dialog → **See what failed** |

**Verified live** against the running dev server, unauthenticated:

```
/inspection/00000000-…-000000000000          -> HTTP 307  -> /sign-in?redirect_url=…
/inspection/00000000-…-000000000000/blocked  -> HTTP 307  -> /sign-in?redirect_url=…
/home                                        -> HTTP 307  -> /sign-in?redirect_url=…
```

Both new routes resolve and refuse an anonymous request identically to an established driver route. That redirect comes from middleware (the `redirect_url` query gives it away); the **role** half is the layout's, since middleware has no reverse guard.

> **Not verified:** the signed-in click paths above are traced from the rendered links and hrefs, not walked in a browser. Doing so needs driver credentials against production data.

---

## Files

**New (10)**
```
apps/web/src/lib/carrier/inspection-access.ts            the guard
apps/web/src/lib/carrier/inspection-snapshot.ts          pure snapshot readers, shared
apps/web/src/app/(driver-fullscreen)/layout.tsx          chrome-free + its own DRIVER guard
apps/web/src/app/(driver-fullscreen)/inspection/actions.ts
apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/page.tsx
apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionClient.tsx
apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/InspectionRunner.tsx
apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/SignaturePad.tsx
apps/web/src/app/(driver-fullscreen)/inspection/[dispatchId]/blocked/page.tsx
apps/web/src/components/driver/trip-start-refusal.tsx
apps/web/src/__tests__/security/inspection-route-guard.test.ts
```

**Modified (8)**
```
apps/web/src/app/(driver)/actions/driver-tasks.ts        fail path rewritten, N/A added
apps/web/src/server/services/workflows/failInspectionItem.ts   canonical photo key
apps/web/src/server/services/workflows/skipStep.ts       stale header corrected
apps/web/src/lib/carrier/inspection-constants.ts         FAIL_NOTE_MIN_LENGTH 3 → 8
apps/web/src/lib/carrier/inspection-handlers.ts          readers moved out, re-exported
apps/web/src/components/driver/driver-dispatch-card.tsx  refusal dialog + nav link
apps/web/src/components/driver/route-detail-readonly.tsx refusal dialog
packages/validation/src/workflows/stepInstance.ts        signedByName / signedAt typed
```

**No DDL.** No new table, no new column, no `EXEMPT_MODELS` entry — nothing new reaches `schema.prisma`. `signedByName`/`signedAt` are keys inside the existing `StepInstance.result` jsonb that mobile has posted untyped since Phase 9.

---

## Gates

**TypeScript — probed, then clean.** Stale `.next/dev/types/validator.ts` and `tsconfig.tsbuildinfo` deleted first. A deliberate `const __probeGate: number = 'y'` was injected into `inspection-access.ts`, a file this task actually edited:

```
src/__tests__/security/inspection-route-guard.test.ts(80,43): error TS2307: Cannot find module '../../../generated/prisma/client'
src/lib/carrier/inspection-access.ts(112,7): error TS2322: Type 'string' is not assignable to type 'number'
```

The probe was reported — **the gate was live, not blind** — and it caught a real error alongside it (a wrong relative depth on the test's dynamic import, since fixed). Probe removed:

```
apps/web    npx tsc --noEmit  →  0 errors
apps/mobile npx tsc --noEmit  →  0 errors
```

`packages/validation` and `packages/api-client` dists were rebuilt before both runs.

**Test suite — zero regressions.** Baseline taken from `fdc005d8` in an in-repo `git worktree` (never a stash: a dev server was running on :3000, and stashing poisons Turbopack's on-disk cache in a way a restart does not fix). `src/generated` was copied in rather than symlinked.

| | Test files | Tests |
|---|---|---|
| Baseline `fdc005d8` | 18 failed, 107 passed, 12 skipped | 66 failed, 1300 passed |
| After | 18 failed, 112 passed, 8 skipped | 66 failed, 1325 passed |

The failing **test names diff byte-identically** — same 18 files, same 66 tests. All are pre-existing `headers` was called outside a request scope and mocked-Prisma shape failures in the workflows/driver-pay/auth suites. **No genuine regressions.** The new guard test contributes 11 tests: 5 passed, 6 skipped for the reason above.

**Lint is non-functional repo-wide and this is pre-existing.** `next lint` is removed in this Next version (it reads `lint` as a directory) and raw ESLint 9 cannot load the repo's `.eslintrc.json` (`Converting circular structure to JSON`). Nothing in this task touched either. `tsc` is the gate CLAUDE.md names.

---

## Per-item audit

| # | Item | Status |
|---|---|---|
| 1 | Full-screen checklist: takeover route, section per screen, progress, pass/fail/N-A at 44px+, note required on fail, photo at capture, back nav, signature with name + timestamp, phone-first | **IMPLEMENTED** |
| 2 | Reuse the StepInstance data layer and server actions; N/A onto SKIPPED; confirm the web skip path permits a driver | **IMPLEMENTED** — and the transport gap was real: `skipStep`'s header claimed an admin guard it never performed. Not widened; a narrow driver-scoped action added and the header corrected |
| 3 | Blocked screen: what failed, dispatch told, Contact dispatch, never a dead end | **IMPLEMENTED** |
| 4 | Replace both `alert()` refusals with an in-app presentation carrying the gate's sentence | **IMPLEMENTED** |
| — | **The DRIVER guard on the chrome-free group** (named item per ruling 4) | **IMPLEMENTED** — `(driver-fullscreen)/layout.tsx` for role, `resolveInspectionAccess` for ownership, called by both pages and all seven actions, counted by test |
| 1r | Fix both pre-existing defects (result keys, dispatcher notification) | **IMPLEMENTED** |
| 2r | `markDriverTaskNotApplicable`; do not widen `skipStep`; correct its header | **IMPLEMENTED** |
| 3r | Photos to R2 under `inspections` | **IMPLEMENTED** |
| 4r | Chrome-free group with its own DRIVER guard | **IMPLEMENTED** |
| 5r | In-house canvas signature: pointer events, `toBlob`, presigned R2 PUT, name + ISO timestamp | **IMPLEMENTED** |
| 6 | Report whether `FAIL_NOTE_MIN_LENGTH = 3` is deliberate; raise if placeholder | **IMPLEMENTED** — not deliberate; raised to 8 with the false-reject named |
| 7 | Integration test: non-driver and unassigned driver cannot reach the route, real rows | **PARTIALLY** — written against real rows with no mocks, and the static-call half passes. **The six DB cases did not execute**: they skip without `DATABASE_URL`, and the only one configured points at production |
| 8 | Report the canonical photo key and align | **IMPLEMENTED** — `requiresPhotoOnFail`; enforcement realigned, both spellings still read, behaviour change stated |
| — | Navigation wire-up, nav file named, click path reported | **IMPLEMENTED** — `driver-dispatch-card.tsx`; anonymous paths verified over HTTP, signed-in paths traced from links not walked |
| — | tsc probed in both apps | **IMPLEMENTED** |
| — | Suite diffed against `fdc005d8` | **IMPLEMENTED** — identical failures, zero regressions |

---

## Carried forward

- **The six DB guard cases are unrun.** Highest-value follow-up: point `DATABASE_URL` at a scratch database and execute them.
- **Signed-in click paths are traced, not walked.** Needs driver credentials.
- **`uploadTaskFile` still writes to Supabase Storage** for the Tasks tab's non-inspection step types. Inspection photos on both clients now agree on R2; the remaining divergence is narrower but real.
- **Offline is deferred for web, not solved.** Stated in code, not hidden.
- **Lint is broken repo-wide** (ESLint 9 vs `.eslintrc.json`, `next lint` removed). Pre-existing, worth its own ticket.
