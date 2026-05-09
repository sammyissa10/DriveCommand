# Phase 50: Rebuild Activation Tracking and Sample Data on snake_case Tables — Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix Phase 49's broken activation tracker and sample data system. Phase 49 wired everything to PascalCase tables (Truck, Customer, Load) and orphaned pages (/trucks, /crm, /loads) that are not in the sidebar — so the checklist never advances and sample data is never visible. Phase 50 re-homes everything to the snake_case tables that the sidebar actually reads: carrier_trucks, clients, loads (CarrierLoad), carrier_drivers.

Six atomic plans, each producing exactly one git commit in this order:
1. Migrations (additive DDL only)
2. Seeder rewrite + kill switch
3. Trucks tracker hook
4. Clients tracker hook
5. Dispatch tracker hook
6. SamplePill + SampleDataBanner into carrier list pages

Do not collapse plans. Do not reorder plans. Do not delete Phase 49 PascalCase code (Option Z: shadow retention).

</domain>

<decisions>
## Implementation Decisions

### Plan 50-01 — Migrations

- Add column `is_sample BOOLEAN NOT NULL DEFAULT false` to: `carrier_trucks`, `clients`, `loads`, `carrier_drivers`
- 4 raw SQL migration files at `apps/web/migrations/<timestamp>__phase50_NN_<entity>_is_sample.sql`, applied via `scripts/migrate.mjs`
- Update `prisma/schema.prisma` by hand: add `isSample Boolean @default(false) @map("is_sample")` to `CarrierTruck`, `CarrierClient`, `CarrierLoad`, `CarrierDriver` models
- No data backfill (DEFAULT false applies to all existing rows — all real records)
- DO NOT run `prisma migrate dev` — use raw SQL only
- Run `npx prisma generate` after schema update
- Commit message: `feat(50-01): add is_sample to snake_case tables`

### Plan 50-02 — Seeder Rewrite + Kill Switch

- Rewrite `src/lib/onboarding/seed-sample-data.ts` to insert into snake_case tables: `carrier_trucks`, `clients`, `loads` (CarrierLoad), `carrier_drivers`
- Use Prisma models with their `@@map` names — confirm exact model names from schema.prisma before writing
- Fleet-size forks per spec section 6.3 stay the same: OWNER_OPERATOR=1 truck/1 driver/1 client/2 loads; SMALL/MEDIUM/LARGE=3/3/2/3
- Sample drivers: STILL create User rows with `role='DRIVER'` AND `isSample=true` (for dashboard banner detection). ALSO insert into `carrier_drivers` with `user_id` linkage and `is_sample=true` so drivers appear in the fleet drivers list
- Add env-var kill switch: read `process.env.ONBOARDING_SEED_SAMPLES`. If `'false'`, skip seeding and log `[seedSampleData] skipped via ONBOARDING_SEED_SAMPLES=false`. Default (unset or `'true'`) = seed
- Add `ONBOARDING_SEED_SAMPLES=true` to `.env.local`
- Add `ONBOARDING_SEED_SAMPLES=false` to `.env.test` (create if not present)
- Document in `.env.example` if it exists
- Option Z: Do NOT delete old PascalCase seed code — comment it out with `// PHASE 50: legacy seed retained for rollback safety. Will be deleted in a future cleanup phase.`
- Commit message: `feat(50-02): rewrite seeder for snake_case tables, add ONBOARDING_SEED_SAMPLES kill switch`

### Plan 50-03 — Trucks Tracker Hook

- Target file: `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts` POST handler
- This file already has the `after()` + `fireEvent()` pattern from Phase 45-04 — add a second `after()` block alongside it
- After successful create, call `recordActivationEvent(tenantId, 'first_real_truck')` BUT ONLY if `is_sample === false`
- Use `after()` (non-blocking, fire-and-forget, after response is sent)
- Wrap in try/catch — tracker failure never propagates to the HTTP response
- `recordActivationEvent` for `first_real_truck` must: check if `ActivationProgress.firstRealTruckAt` is currently null; only write if null (idempotent); recompute `completionPct` deterministically from which timestamps are set (20% baseline + 20% per event: truck, driver, client, load-in-transit)
- Do NOT remove the existing Phase 49 PascalCase Truck.create activation tracker hook — leave as no-op shadow (Option Z)
- Run `npx tsc --noEmit` before commit
- Live verification: query `SELECT * FROM "ActivationProgress" WHERE "tenantId"='e1999e87-0f5b-4b27-8d53-7aa89055384c'` — confirm `firstRealTruckAt` is null. Add a real truck (`is_sample=false`) via `/carrier/fleet/trucks/new`. Re-query: `firstRealTruckAt` must have a timestamp; `completionPct` must be 40.
- Commit message: `feat(50-03): wire activation tracker into carrier_trucks create`

### Plan 50-04 — Clients Tracker Hook

- Target file: `apps/web/src/app/api/v1/carrier/clients/route.ts` POST handler
- This file has a `fix(tc-07)` commit from QA — read it carefully before editing, but proceed
- Same pattern as 50-03: `after()` block, `is_sample === false` guard, idempotent, try/catch
- `recordActivationEvent(tenantId, 'first_real_client')` — sets `firstRealClientAt` if null, recomputes `completionPct`
- Live verification: add a real client. `ActivationProgress.firstRealClientAt` must populate; `completionPct` must climb.
- Commit message: `feat(50-04): wire activation tracker into clients create`

### Plan 50-05 — Dispatch Tracker Hook (HOTTEST FILE)

- Target: `apps/web/src/lib/carrier/dispatches.ts` — `transitionDispatchStatus()` function, `planned → in_progress` transition (line ~558)
- READ THE FULL FILE before editing — 11 commits in 30 days, most recent April 24
- Event name stays `first_load_in_transit` even though Carrier Ops status is `in_progress`
- Add `recordActivationEvent(orgId, 'first_load_in_transit')` inside the `in_progress` branch, inside an `after()` block, only if the dispatched loads have `is_sample=false` (check: does the dispatch contain only sample loads? if yes, skip)
- Driver hook: The existing `first_real_driver` fires from `accept-invitation/route.ts` — researcher must verify whether this catches the normal carrier fleet driver flow (CarrierDriver invite → email → accept-invitation). If it does, do NOT add a dispatch-side driver trigger. If it doesn't, add one. Researcher determines which path; do not add redundant trigger if invitation acceptance is sufficient.
- Live verification: create a real load, transition to IN_TRANSIT. `firstLoadInTransitAt` must populate. `isActivated` must flip to true. AppEvent `eventType='tenant.activated'` must be written with `bypass_rls=on`.
- Commit message: `feat(50-05): wire activation tracker into dispatch IN_TRANSIT and driver assignment`

### Plan 50-06 — SamplePill + SampleDataBanner Integration

- SamplePill: add to `CarrierTruckList.tsx`, `CarrierDriverList.tsx`, `LoadList.tsx`, `ClientList.tsx` — renders next to each row where `is_sample=true`
- SampleDataBanner: add to `/carrier/dashboard`. Banner query: any rows in `carrier_trucks`/`clients`/`loads`/`carrier_drivers` where `is_sample=true` AND `org_id=current`. If yes, render banner.
- sessionStorage dismissal key: `sample-banner-dismissed-<tenantId>` (same pattern as Phase 49)
- Update KPI count queries on `/carrier/dashboard` to add `WHERE is_sample=false`
- Do NOT touch the orphaned Phase 49 SamplePill/Banner placements on PascalCase list pages — leave as dead code (Option Z)
- Live verification: log in as test tenant. Visit `/carrier/fleet/trucks` — sample truck must show SAMPLE pill. Visit `/carrier/dashboard` — banner must appear. KPIs must exclude sample loads.
- Commit message: `feat(50-06): integrate SamplePill and SampleDataBanner into carrier list pages`

### Architectural Constraints (all plans)

- All tracker hooks watch snake_case tables. User table still watched for driver invitations (Phase 49's accept-invitation hook is correct and unchanged).
- Use existing `after()` + `fireEvent()` pattern from Phase 45-04. Do not introduce new async patterns.
- Tracker calls wrapped in try/catch, never block the create action. On error: `console.error` with full stack + write AppEvent `eventType='activation.tracker.error'` with `bypass_rls=on`.
- Each commit is atomic and revertible. If 50-05 breaks dispatch QA, `git revert` removes only that commit.
- Phase 49 PascalCase tracker code stays in place as no-op shadow. Do not delete.
- After seeder rewrite ships (50-02), brief QA: new tenants will show sample records in carrier fleet/clients/loads lists. `ONBOARDING_SEED_SAMPLES=false` in `.env.test` prevents this in test environments.

### Idempotency Rules

- `recordActivationEvent` for each event type: check if the corresponding `ActivationProgress` timestamp is null. Only write if null. `completionPct` is recomputed deterministically from which timestamps are set, never incremented.
- `isActivated` flips to true when all 5 events are recorded. `tenant.activated` AppEvent written exactly once.
- Idempotency verified in end-to-end test: add a second real truck after 100% — `firstRealTruckAt` must NOT change, `completionPct` stays 100, no second `tenant.activated` AppEvent.

### End-to-End Verification (after all six plans)

Test tenant: id `e1999e87-0f5b-4b27-8d53-7aa89055384c`, slug `postscript-test-co`

Reset SQL:
```sql
DELETE FROM "AppEvent" WHERE "tenantId"='e1999e87-0f5b-4b27-8d53-7aa89055384c' AND "eventType" IN ('tenant.activated','activation.tracker.error');
UPDATE "ActivationProgress" SET "firstRealTruckAt"=NULL,"firstRealDriverAt"=NULL,"firstRealClientAt"=NULL,"firstRealLoadCreatedAt"=NULL,"firstLoadInTransitAt"=NULL,"firstLoadDeliveredAt"=NULL,"isActivated"=false,"completionPct"=20 WHERE "tenantId"='e1999e87-0f5b-4b27-8d53-7aa89055384c';
```

Verification steps (must all be physically clicked or queried — no code-level substitutes):
1. Sign in as test tenant → `/onboarding/welcome` shows 20%, item 1 only checked
2. Add real truck via `/carrier/fleet/trucks/new` → item 2 green, 40%
3. Add real client via `/carrier/clients` → item 4 green (confirm checklist order in tracker), 60%
4. Accept real driver invitation via existing Phase 49 flow → item 3 green, 80%
5. Create real load, transition to IN_TRANSIT via `/carrier/dispatches` → item 5 green, 100%, celebration state. `tenant.activated` AppEvent must exist.
6. Visit `/carrier/dashboard` → banner visible. SAMPLE pills on sample records. KPI counts exclude samples.
7. Idempotency check: add another real truck → `firstRealTruckAt` unchanged, `completionPct` stays 100, no second `tenant.activated` AppEvent.
8. `npx tsc --noEmit` must pass.

### Claude's Discretion

- Exact SQL timestamp format for migration filenames
- Which `carrier_drivers` fields to populate for sample driver rows (use same required fields as createCarrierDriver; `is_sample=true`)
- Banner query implementation detail (single Promise.all vs separate queries)
- Whether `first_real_driver` needs dispatch-side trigger — researcher to verify by tracing the invitation acceptance flow for Carrier Ops drivers

</decisions>

<specifics>
## Specific Ideas

- The trucks route at `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts` already has `after()` + `fireEvent()` from Phase 45-04 (commit `4135440`). The new tracker block is a second `after()` alongside it — minimal diff.
- `dispatches.ts` was last touched 2026-04-24 (Phase 45-05 dispatch enforcement). Read the full function before editing. It already uses `after()` for `fireEvent` — same pattern.
- `clients/route.ts` had `fix(tc-07)` commit — read carefully, don't touch existing client creation logic, only add the `after()` tracker block at the end of the POST success path.
- Option Z is explicit: leave all Phase 49 PascalCase hooks as dead code. A future cleanup phase removes them. Phase 50 does not clean up.

</specifics>

<deferred>
## Deferred Ideas

- Cleanup of Phase 49 PascalCase dead code (isSample columns on Truck/Customer/Load, SamplePill on orphaned pages, PascalCase tracker hooks) — future cleanup phase, explicitly out of scope for Phase 50
- `first_real_load_created` activation event (separate from `first_load_in_transit`) — if spec requires it, researcher flags it; Phase 50 spec only mentions `first_load_in_transit`

</deferred>

---

*Phase: 50-rebuild-activation-tracking-and-sample-data-on-snake-case-tables*
*Context gathered: 2026-05-01*
