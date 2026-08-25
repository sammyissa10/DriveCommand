# Phase 8 — Assignment, validation, and the atomic trip commit

Spec: `docs/specs/DocumentImport_TechnicalSpec_v1.md` Section 11 (+ Section 15).
Commit: `4da6c1f2`.

---

## STEP 0 — what was established before any code

**0a. End stop type.** `pg_constraint` read against production:

```
stops_stop_type_check
  CHECK (stop_type = ANY (ARRAY['pickup','delivery','fuel_stop','layover','relay_handoff']))
```

The end stop commits as **`stop_type = 'layover'`**, with `stops.is_end_stop`
(`boolean NOT NULL`) as the discriminator — not the type and not the position.
That is Phase 7's recorded decision, and `endStopStopDraft` already emitted it.
Two adjacent constraints checked at the same time because both are on the write
path: `dispatches_end_stop_policy_check` admits exactly the five Section 9
policies plus NULL, and `carrier_documents_parent_type_check` admits both
`'stop'` and `'dispatch'`.

**0b. Facility coordinates — reported, not built.** Confirmed: `latitude` /
`longitude` appear zero times in `facility-lookup.ts` and `facility-resolution.ts`.
Import-created facilities carry NULL coordinates (quick-523). Deferral approved.
What stays broken, most severe first:

1. **Phase 7 optimisation short-circuits all-or-nothing.**
   `optimisation-service.ts:135-141` returns `null` for the ENTIRE facility set
   if one row has a null coordinate, so a single new consignee silently disables
   the suggestion for the whole trip and every future trip containing it — and it
   fails to the same "no suggestion" path as "below the floor", so it is invisible.
2. `route_matrix_cache` never receives a row for such a set, because the provider
   is never called.
3. The stop's address snapshot writes `lat: null, lng: null` — no map pin, no nav
   hand-off for that stop.
4. Facility *resolution* is unaffected (T1 is code-based, T2/T3 address-string
   based). The damage is confined to geometry, which is why it has stayed
   invisible for three phases.

Recommended home when it is built: the **confirmation tap**
(`createStopFacility` / `confirmStopFacility`), not the commit — an outbound HTTP
call inside the atomic block is the same defect Section 11 forbids for the
notification.

**No DDL was written or applied.** Per DEC-9 that is a claim needing the same
evidence as "this DDL was applied", so it was checked: all 39 columns Section 11
writes were verified present in `information_schema` against production, before
the build and again at close. Full list in *Live schema diff* below.

---

## What was built

| File | What it is |
|---|---|
| `src/lib/document-import/commit.ts` | **Pure.** Section 11's severity table, appointment-window materialisation, committable-stop and stop-type rules. No DB, no clock — `now` is injected. |
| `src/lib/document-import/commit-service.ts` | **The transaction.** Section 11's order, the four `ensure*` boundaries, rollback to `NEEDS_REVIEW`, post-commit notification and template step. |
| `src/app/api/v1/carrier/document-imports/[id]/commit/route.ts` | Web route (session cookie), GET preview + POST commit. |
| `src/app/api/mobile/carrier/owner/document-imports/[id]/commit/route.ts` | Mobile mirror (Bearer + rate limit), same handlers. |
| `src/components/carrier/imports/AssignmentScreen.tsx` | The screen: driver / truck / trailer / start time / end stop, availability inline. |
| `src/app/(owner)/carrier/imports/[id]/assign/page.tsx` | Its URL. Server-rendered, read-only first paint. |
| `src/app/(owner)/carrier/imports/page.tsx` | The imports list — the module's front door, which did not exist. |
| `src/components/carrier/templates/SuggestedTemplates.tsx` | Renders `RouteTemplate.isSuggested`, which nothing rendered before. |
| `tests/carrier/document-import-commit-rollback.test.ts` | The real-database rollback test. 9 cases. |

Modified: `handlers.ts` (2 handlers), `end-stop-service.ts` (optional tx client),
`facility-resolution.ts` (`REFERENCE_TIER` exported), `StopReviewScreen.tsx`
(dead Continue button wired), `Sidebar/index.tsx`, `carrier/templates/page.tsx`.

---

## THE FOUR WIRING OBLIGATIONS — audited by name

| Obligation | Status | Where |
|---|---|---|
| **`ensureStopsCommitted`** | **IMPLEMENTED** | `commit-service.ts` → `ensureAllCommitted()`, second of three. Ordered after the client because quick-511: the ladder context scopes its reference lookup by the *effective* client, and a null `record.clientId` makes T1 unreachable. |
| **`ensureContractCommitted`** | **IMPLEMENTED** | Same function, first. Had **zero callers** since quick-510 wrote it; this is its first. It composes `ensureClientCommitted`, so one call settles client and contract in the right order. |
| **`runPostCommitTemplateStep`** | **IMPLEMENTED** | Called after the transaction via `afterResponse()`. Also **renders**: `TemplateOfferCard` was already mounted at `ImportProgress.tsx:321` gated on `status === 'COMMITTED'` and goes live automatically; the **Suggested templates section** is new (`SuggestedTemplates.tsx`, mounted on `/carrier/templates`) because `isSuggested` was written by Phase 6 and displayed by nothing. |
| **Appointment window materialisation via `trips.ts`** | **IMPLEMENTED** | `materialiseWindow()` in `commit.ts`, called per stop inside the transaction. Uses `departure + offsetMin * 60000` — the arithmetic `trips.ts` uses in its three template-inheritance paths. Precedence: printed window wins, else template offsets, else **no window** (not a zero-length one). A template-derived window is never marked firm — nobody agreed to it. |

Also wired, though not on the list of four: **`ensureEndStopCommitted`**,
**`endStopCommitPlan`** and **`markEndStopMaterialised`**, all of which CLAUDE.md
recorded as unable to fire until Phase 8 called them. `markEndStopMaterialised`
now takes an optional transaction client so it lands in the same atomic block as
the `stops` row it records — its doc comment always said "inside the same
transaction" and without that parameter it structurally could not be.

## Phase 6 items 5, 6, 7 — audited by name

| Item | Status | Note |
|---|---|---|
| **5. Post-commit template update offer** | **IMPLEMENTED** | `runPostCommitTemplateStep` records the offer when a template was applied and the trip drifted. Rendered by `TemplateOfferCard`. |
| **6. Auto-create guard, live check** | **IMPLEMENTED** | Same function: reads `Tenant."autoCreateRouteTemplatesFromImports"`, and skips creation when `bestExistingScore` lands in the AUTO band (≥ 0.75) — the near-duplicate guard. Created templates are now visible via `SuggestedTemplates`. |
| **7. One-tap Save as template** | **IMPLEMENTED** | Setting OFF → an offer with no `changedSummary` is recorded, which `TemplateOfferCard` renders as "Save as route template". |

All three were **built in Phase 6 and unreachable**; Phase 8 is the caller they
were waiting for. No new logic was added to them.

---

## Per-item audit — the six numbered build items

**1. Assignment screen — IMPLEMENTED.** Driver, truck, trailer, planned start,
end stop. Trailers *are* modelled (`dispatches.trailer_id` → `carrier_trucks`),
so the trailer picker is the same truck list filtered by `truck_type`. The driver
picker carries availability **inline** — already assigned that day, hours
remaining, compliance flags — composed server-side as whole sentences, so there
is no second screen. **Sidebar wired**: `Document Imports` → `/carrier/imports`,
as a **child of Trips** rather than a sixth OPERATIONS item, because that section
is capped at five with a comment saying "force discussion before adding more" —
and an import is not a peer of Trips, it is one of the ways a trip comes to exist.
Gated on the `dispatches` permission.

**2. Pre-commit validation — IMPLEMENTED.** Exact Section 11 severities.
Blocks: `DRIVER_OVERLAP`, `TRUCK_OVERLAP`, `LICENCE_EXPIRED`, `MEDICAL_EXPIRED`,
`TRUCK_OUT_OF_SERVICE`, `TRUCK_INSPECTION_OVERDUE`, plus the three
missing-input blocks and stop-review's own blocks carried through. Warns:
`INSUFFICIENT_HOURS`, `OVER_CAPACITY`, `UNREACHABLE_WINDOW`,
`UNUSUAL_GEOGRAPHY`, `NO_HOS_DATA`, `END_STOP_UNRESOLVED`. Blocks disable the
primary action and the **first block's sentence is printed under it** by name.
Warnings are **one dismissible summary**, never a modal.
**Enforced server-side**: `commitImport` re-runs `validateCommit` and returns
`BLOCKED` (HTTP 422) regardless of caller — the last test case proves this by
calling the service directly with an expired licence.

Two honest notes. Compliance dates are measured against the **planned start**,
not `now` — a licence valid today and expired next Tuesday must block a trip
scheduled for next Tuesday. And "overdue inspection" has **no dedicated column**
on `carrier_trucks`; it reads `registration_expiry` / `insurance_expiry`, which
are the dates that actually stop a truck at a roadside inspection. Stated rather
than silently mapped.

**3. The commit transaction — IMPLEMENTED, with one deliberate deviation.**
One `$transaction`, Section 11's order: external refs → trip → stops (end stop
pinned last) → loads → documents → import `COMMITTED`. Driver notification is
enqueued **after** the transaction, via `after()` from `next/server` with a
detached fallback for non-request contexts.

*The deviation, stated plainly:* Section 11's diagram draws **template
create/update as step 7 inside the transaction**. It is outside. Reasons:
`runPostCommitTemplateStep` was written in Phase 6 with the explicit doc comment
"Deliberately NOT inside the commit transaction… a template write that failed
must never roll back a trip a driver is waiting on"; the Phase 8 prompt names
that exact function as the thing to wire; and it is the same trade as the
notification. The trip's own `route_template_id` **is** written inside the
transaction, so nothing about the committed trip depends on the post-commit step.

Also worth recording: **the facility rows themselves are not created here.**
Phase 4's hard rule is that T3/T4 never create a facility without a human tap, so
by commit time every resolved stop points at an existing row. What step 1 writes
is the `(tenant, client, code)` external reference. `resolved_via` holds a
**tier only** (`T1|T2|T3|T4`, DEC-14) via the now-exported `REFERENCE_TIER`.

**4. Document attachment — IMPLEMENTED.** Source file at trip level
(`parent_type='dispatch'`); page slices at stop level (`parent_type='stop'`,
`stop_id` set) using each stop's `pageNumbers` against the per-page
`document_import_pages.storage_key`. `assertTenantKey(key, orgId)` is called on
**every** attachment, both levels — the keys come from our own row and are still
checked. The test reads the committed rows back and asserts stop 2's document
ends in `-p1.png`, not the source scan.

**5. Rollback — IMPLEMENTED.** Any failure rolls the whole transaction back,
then (outside it, so the write survives) transitions `COMMITTING → NEEDS_REVIEW`
— the edge `lifecycle.ts` already documented as the rollback path — with
`failure_code = COMMIT_<STEP>` and a **plain-language** `failure_message` per
step. No catch swallows an error into a string: the original is logged through
`logger.error(msg, error, context)` **with the error in the error slot** plus a
`serializeError` copy in the context.

**6. Integration test — IMPLEMENTED.** See below.

---

## The rollback test — assertions quoted

`tests/carrier/document-import-commit-rollback.test.ts`, 9 cases, all green.
Nothing is mocked: not Prisma, not the transaction, not the service. The only
injected thing is *where* the failure happens (`failAtStep`), so every write
before that point is real, inside the real transaction.

**How it would fail if the rollback were broken.** With `failAtStep: 'STOPS'`,
step 2 has already issued `INSERT INTO dispatches` by the time the tripwire
fires. If the trip creation were moved outside `$transaction`, or a step wrapped
in a try/catch that continued, or the transaction replaced by a plain sequence of
awaits, that INSERT would survive the throw and the count would return 1 —
`expected 1 to be 0`. Each step strands a distinct set of rows, and each is
counted.

The assertions, per forced step:

```ts
const after = await countRows();
expect(after.trips).toBe(0);
expect(after.stops).toBe(0);
expect(after.loads).toBe(0);
expect(after.documents).toBe(0);
expect(after.externalRefs).toBe(0);

expect(after.importRow.status).toBe('NEEDS_REVIEW');
expect(after.importRow.createdTripId).toBeNull();
expect(after.importRow.committedAt).toBeNull();
expect(after.importRow.failureCode).toBe(`COMMIT_${step}`);
```

`countRows()` is real SQL, no mocks:

```ts
const trips  = await tx.trip.count({ where: { orgId: tenantId } });
const stops  = await tx.carrierStop.count({ where: { dispatch: { orgId: tenantId } } });
const loads  = await tx.carrierLoad.count({ where: { orgId: tenantId } });
const documents = await tx.carrierDocument.count({ where: { dispatch: { orgId: tenantId } } });
const externalRefs = await tx.facilityExternalReference.count({ where: { orgId: tenantId } });
```

**The anti-vacuity control.** Without it, deleting the body of `commitImport`
would make the file green:

```ts
expect(after.trips).toBe(1);
expect(after.stops).toBe(2);        // two consignments, end stop policy NONE
expect(after.loads).toBe(1);
expect(after.documents).toBe(3);    // 1 trip-level source + 1 page slice per stop
expect(after.externalRefs).toBe(2);
expect(detail.stops[0].pieces).toBe(10);              // 6 + 4
expect(Number(detail.stops[0].weightLbs)).toBe(800);  // 480 + 320
expect(detail.load.commodityPieces).toBe(22);
expect(Number(detail.load.commodityWeightLbs)).toBe(1700);
expect(detail.stops[1].pageNumbers).toEqual([1]);
```

**Every fixture quantity is > 1** (6, 4, 12) — a quantity of 1 hides a missing
multiplier.

**A real finding the test produced.** The first version asserted zero external
references after a rollback and failed with 2. The rows were not orphans:
`ensureStopsCommitted` writes them *before* the transaction, deliberately.
Rather than weaken the assertion, the suite was made to prove something stronger
— a warm-up call settles the stop provenance so `ensureStopsCommitted`
early-returns thereafter, `resetImport()` deletes the reference rows, and the
assertion of zero now proves that **step 1's in-transaction upsert rolled back**.

**Production-tenant guards** (all four conditions):
- Tenant name is `ZZ-THROWAWAY-PHASE8-ROLLBACK-<timestamp>` — unmistakable in the
  tenants table — plus a fresh UUID.
- `afterAll` deletes, then **re-counts ten tables** and `throw`s a named error
  listing survivors if anything remains. Cleanup is verified, never assumed.
- `describe.skip` when `DATABASE_URL` is unset.
- **Tenant `7e9eca25-…436d5` is protected two ways**: `PROTECTED_TENANT_ID` is
  compared by name in `assertDisposable()`, which *also* refuses any id that is
  not this suite's own freshly-created tenant; and `beforeAll` throws outright if
  the created tenant id collides with it. Every delete is keyed to `tenantId`.
  The shared `cleanupTestData()` was deliberately **not** used — it deletes by
  broad name prefix across the whole database, unscoped by tenant.

---

## Verification

**tsc, probed rather than inferred.** A deliberate `const x: number = 'y'` was
injected into `commit-service.ts`; tsc reported *that* error and only that one,
confirming the gate was live. Probe removed. The mobile gate was probed the same
way. Both then clean:

```
apps/web    npx tsc --noEmit  → 0 errors
apps/mobile npx tsc --noEmit  → 0 errors
```

**Full suite vs the pre-task commit.** Baseline captured in a detached worktree
at `42b7c3b4`:

```
HEAD      18 failed | 102 passed | 8 skipped (128 files) · 66 failed | 1230 passed
BASELINE  18 failed | 101 passed | 8 skipped (127 files) · 66 failed | 1221 passed
```

Failing **file sets are identical** — `comm` reports zero entries in either
direction. **Zero regressions.** The 18 pre-existing failures are workflow /
tRPC / auth suites failing on `headers` called outside a request scope, plus
payroll exporter goldens; none is touched by this phase. The +1 file / +9 tests
are this phase's own.

**`prisma generate` was NOT run** at any point in this task, so no dev-server
restart is required for browser verification on that account.

**Live schema diff against Section 11.** All 39 columns the commit writes
verified present against production at close, types as expected — `stops`
(`is_end_stop`, `page_numbers`, `stop_references`, `line_items`,
`rollup_overridden`, `appointment_is_firm`, `"bolRequired"`, `"podRequired"`,
`appointment_start/end`, `sequence_order`, `stop_type`, `facility_id`, `load_id`,
`client_id`, `pieces`, `weight_lbs`), `dispatches` (`end_stop_policy`,
`source_import_id`, `route_template_id`, `trailer_id`, `scheduled_departure`,
`dispatcher_id`), `document_imports` (`created_trip_id`, `created_entity_ids`,
`committed_at`, `failure_code`, `failure_message`, `resolution_provenance`),
`carrier_documents` (`parent_type`, `parent_id`, `stop_id`, `dispatch_id`,
`file_url`, `uploaded_by`), `facility_external_references` (`resolved_via`,
`source_import_id`, `source_name`, `confirmed_by_id`). **No drift, no DDL.**

**Binding patterns.** No new model → `EXEMPT_MODELS` untouched, correctly.
All DB access via `getTenantPrismaForOrg` (DEC-11: the header variant is blind on
`/api/mobile/*`) with explicit `orgId` filters everywhere. `pg_constraint` read
before writing every enum-ish column. Money and weight as `Prisma.Decimal`.
Nothing installed. No catch swallows an error into a string.

---

## Known gaps and things a reader should not mistake

1. **Medical enforcement is effectively off for a tenant with no workflow-engine
   playbooks seeded.** Per the approved ruling, the Phase 45 gate
   (`User.isDispatchReady` + the OWNER/MANAGER `overrideReason` escape) is reused
   rather than a second flag being introduced. `isDispatchReady` defaults to
   `false` and is driven by playbook completion, so a tenant that never seeded
   playbooks has every driver un-ready — which makes the *medical* block fire
   broadly rather than never. The gap is the inverse: a tenant whose drivers are
   all marked ready by other means will not have medical enforced.
   **This is a Workflow Engine gap, not a Phase 8 one**, and is recorded here
   rather than worked around.
2. **`getCommitPreview` issues one HOS query per driver** on the roster. Fine at
   a small carrier's scale; a tenant with 200 drivers would feel it. Not
   optimised because the shape of the fix (one grouped query) is obvious and
   premature without a real slow case.
3. **Geocoding remains unbuilt** — see 0b. It is the largest open item behind
   this phase, and it degrades Phase 7 silently.
4. **A single load per commit.** One `CarrierLoad` per committed import, with
   every non-end stop pointed at it. A manifest split across two clients is not
   modelled; `document_imports` carries one `client_id`, so that is not
   reachable today.

---

## Incident during close-out — recorded because it cost real data

While removing the baseline git worktree, a PowerShell `Remove-Item -Recurse
-Force` followed a directory junction into the main repository and deleted
**2,235 tracked files** plus `node_modules/.bin`. Everything tracked was restored
with `git checkout -- .` and `npm install`, and the Phase 8 work was rewritten
from this session's record and re-verified (tsc clean, all 9 rollback tests green,
suite identical to baseline).

**Two files were NOT recoverable because they are gitignored:**

- `apps/web/.env`
- `apps/web/.env.local`

The monorepo-root `.env` and `.env.local` survived and carry `DATABASE_URL`,
`DIRECT_URL`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `GMAIL_USER`,
`GMAIL_APP_PASSWORD`, `VERCEL_DEPLOY_HOOK`. **`apps/web/.env.local` almost
certainly held more than that** — Supabase keys, R2 credentials, Resend, Sentry
DSN, Upstash — and must be restored from Vercel's environment variables or the
owner's own records before `next dev` will work fully. `.env.example` (127 lines,
tracked, intact) lists the expected keys.

The rollback test's env loader now searches `apps/web` **and** the repo root, so
it runs from either.

**Lesson, for whoever hits this next:** never delete a directory tree that
contains, or recently contained, a junction to a live path. Remove the junction
first and verify it is gone, or place the worktree somewhere with no links at
all. `git worktree remove` failing with "Invalid argument" was the warning sign
that got worked around instead of understood.
