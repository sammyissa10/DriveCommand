# Phase 49 Reconciliation — Carrier Ops IS the Owner Portal

**Status:** Diagnostic only. No code changes have been made.
**Date:** 2026-05-01
**Triggered by:** User confirmed that Carrier Operations IS the owner-facing product surface.

---

## Executive Summary

Phase 49's activation tracker, SamplePill components, and isSample filters were built on the assumption that PascalCase tables (`Truck`, `Customer`, `Load`) are the owner portal's data layer. That assumption is incorrect. Real owner data lives in snake_case tables (`carrier_trucks`, `clients`, `loads`, `carrier_drivers`). As a result:

- **The activation tracker cannot reach 100%** for any new tenant using normal navigation. Three of four activation events target actions that are not reachable from the sidebar.
- **Sample data is invisible in all list views.** The seeder writes to PascalCase tables; list pages the user sees read from snake_case tables.
- **SamplePills are wired to unreachable pages.** The four list components that got SamplePill are used exclusively by PascalCase pages not linked from the sidebar.
- **One exception works correctly:** `first_real_driver` fires via the driver invitation acceptance flow, which is user-reachable.

---

## Finding 1 — Claim Verification: PascalCase Pages Are Dead Routes

**Verdict: The user's claim is confirmed.**

The application sidebar (`src/components/navigation/sidebar.tsx`) contains zero links to the following routes:
- `/trucks` and `/trucks/new`
- `/loads` and `/loads/new`
- `/crm` and `/crm/new`
- `/drivers` and `/drivers/invite`
- `/routes`, `/invoices`, `/payroll`

The sidebar exclusively links to `/carrier/*` routes:

| Sidebar item | URL | Data source |
|---|---|---|
| Carrier Dashboard | `/carrier/dashboard` | snake_case via `/api/v1/carrier/dashboard/*` |
| Clients | `/carrier/clients` | `prisma.carrierClient` → `clients` table |
| Contracts | `/carrier/contracts` | snake_case |
| Templates | `/carrier/templates` | snake_case |
| Dispatches | `/carrier/dispatches` | snake_case |
| Carrier Loads | `/carrier/loads` | `prisma.carrierLoad` → `loads` table |
| Messages | `/carrier/messages` | snake_case |
| Fleet → Carrier Drivers | `/carrier/fleet/drivers` | `prisma.carrierDriver` → `carrier_drivers` table |
| Fleet → Carrier Trucks | `/carrier/fleet/trucks` | `prisma.carrierTruck` → `carrier_trucks` table |
| Fleet → Facilities | `/carrier/facilities` | snake_case |
| Reports | `/carrier/reports/*` | snake_case |

The PascalCase pages exist on disk and compile correctly. They are not linked from any navigation component. A user who knows the URL can reach them by typing directly, but there is no in-product path to them.

**The old `/dashboard` route** is a one-line file that immediately redirects to `/carrier/dashboard`. It does not render owner portal PascalCase content.

**Conclusion:** The Carrier Operations module under `/carrier/*` is the complete owner-facing product. The PascalCase routes (`/trucks`, `/loads`, `/crm`, `/drivers`) are orphaned pages.

---

## Finding 2 — isSample Columns: Which Are Live vs. Dead Weight

### `Truck.isSample` — Dead weight
- **How it was created:** Phase 47 DDL migration added `isSample` to the `Truck` Prisma model.
- **Who writes to it:** `seed-sample-data.ts` sets `isSample: true` on seeded trucks. The user-facing truck create action (`actions/trucks.ts`) passes `isSample: false`.
- **Who reads from it:** `actions/trucks.ts` includes `isSample` in queries; `truck-list.tsx` renders `SamplePill` when `isSample: true`; `/trucks/page.tsx` shows `SampleDataBanner`.
- **Is any of this user-visible?** No. `/trucks` and all its sub-pages are not in the sidebar.
- **Verdict:** Dead weight. The column exists, has data (from seeder), but is never shown to any user.

### `Customer.isSample` — Dead weight
- Same analysis as `Truck.isSample`. Written by seeder; read by `/crm` pages; `/crm` is not in sidebar.
- **Verdict:** Dead weight.

### `Load.isSample` — Dead weight
- Same analysis. Written by seeder; read by `/loads` pages; `/loads` is not in sidebar.
- **Verdict:** Dead weight.

### `User.isSample` — Partially useful
- **Who writes to it:** `seed-sample-data.ts` seeds sample `User` rows with `role: 'DRIVER', isSample: true`.
- **Who reads from it:** The carrier dashboard page (`/carrier/dashboard/page.tsx`) calls `tx.user.count({ where: { tenantId, role: 'DRIVER', isSample: true } })` as part of `hasSampleRecords` detection. This count is used to decide whether to show the `SampleDataBanner`.
- **Is this user-visible?** Yes — the banner check works. If sample User(DRIVER) rows exist, the dashboard correctly detects them and shows the banner.
- **Gap:** Sample driver User rows do not appear in any list. `/carrier/fleet/drivers` lists `CarrierDriver` records from `carrier_drivers`, not `User` records. The `/drivers` page that shows `User(DRIVER)` records is not in the sidebar.
- **Verdict:** Partially useful for the banner detection side effect. Not useful for "show a sample driver row in a list."

---

## Finding 3 — Sample Data Visibility

### What the seeder writes (`seed-sample-data.ts`)

| Table written | Content | Bucket: OWNER_OPERATOR | Bucket: SMALL | Bucket: MEDIUM/LARGE |
|---|---|---|---|---|
| `Truck` (PascalCase) | Sample trucks, isSample: true | 1 truck | 2 trucks | 3 trucks |
| `User` (PascalCase) | Sample drivers, role: DRIVER, isSample: true | 1 driver | 2 drivers | 3 drivers |
| `Customer` (PascalCase) | Sample customers, isSample: true | 1 customer | 2 customers | 2 customers |
| `Load` (PascalCase) | Sample loads, isSample: true | 2 loads | 2-3 loads | 3 loads |

No writes to `carrier_trucks`, `clients`, `loads` (CarrierLoad), or `carrier_drivers`.

### What the user actually sees

The carrier dashboard renders:
- `KPIStrip` component → fetches from `/api/v1/carrier/dashboard/kpi` → queries `carrier_trucks`, `carrier_drivers`, `carrier_loads` → **0 records for a new tenant**
- `DriverStatusStrip` → fetches from `/api/v1/carrier/dashboard/drivers-status` → queries `carrier_drivers` → **0 records**
- `TodayDispatches` → queries `dispatches` (snake_case) → **0 records**
- `RecentActivity` → queries snake_case activity tables → **empty**

The carrier list pages render:
- `/carrier/fleet/trucks` → `listCarrierTrucks(orgId)` → queries `carrier_trucks` → **0 records**
- `/carrier/fleet/drivers` → `prisma.carrierDriver.findMany()` → queries `carrier_drivers` → **0 records**
- `/carrier/loads` → queries `loads` (CarrierLoad) → **0 records**
- `/carrier/clients` → queries `clients` → **0 records**

### What actually works: the banner

The carrier dashboard page runs this check before rendering:
```typescript
const [truckCount, driverCount, loadCount, customerCount] = await Promise.all([
  tx.truck.count({ where: { tenantId: orgId, isSample: true } }),        // PascalCase ✓
  tx.user.count({ where: { tenantId: orgId, role: 'DRIVER', isSample: true } }), // PascalCase ✓
  tx.load.count({ where: { tenantId: orgId, isSample: true } }),         // PascalCase ✓
  tx.customer.count({ where: { tenantId: orgId, isSample: true } }),     // PascalCase ✓
]);
return truckCount + driverCount + loadCount + customerCount > 0;
```

Since the seeder writes to PascalCase tables, this check returns `true`. The `SampleDataBanner` renders on the carrier dashboard. **The banner detection is correct.**

**But the banner message is incoherent.** It says "These are sample records to help you explore." The user looks at the dashboard KPIs and sees 0 trucks, 0 dispatches, 0 drivers. They look at the fleet pages and see empty lists. There are no sample records visible anywhere in the UI. The banner references data that exists only in tables no page reads from.

### SamplePill placements (Phase 49)

| Component | Used by page | Page in sidebar? | SamplePill visible? |
|---|---|---|---|
| `truck-list.tsx` | `/trucks` | No | No |
| `driver-list.tsx` | `/drivers` | No | No |
| `load-list.tsx` | `/loads` | No | No |
| `customer-list.tsx` | `/crm` | No | No |

**All four SamplePill placements are in orphaned pages. No user ever sees them.**

---

## Finding 4 — Activation Tracker: Which Events Fire vs. Which Are Dead

### Tracker call sites

| Event | Call site | Called by | Page that calls it | In sidebar? |
|---|---|---|---|---|
| `first_real_truck` | `actions/trucks.ts:130` | `createTruck()` server action | `/trucks/new` (form submit) | **No** |
| `first_real_client` | `actions/customers.ts:75` | `createCustomer()` server action | `/crm/new` (form submit) | **No** |
| `first_real_driver` | `accept-invitation/route.ts:255` | `POST /api/auth/accept-invitation` | Driver clicks email link | **Yes** |
| `first_load_in_transit` | `actions/loads.ts:538` | `updateLoadStatus()` on IN_TRANSIT | `/loads/[id]` status change | **No** |

### What this means for the activation checklist

A new tenant who only uses the sidebar (normal usage) can achieve:

| Checklist item | Completable via normal nav? | Notes |
|---|---|---|
| 1. Account created | Yes (20%) | Set on signup |
| 2. Add your first truck | **No** | Fires from `/trucks/new`, not in sidebar |
| 3. Add your first driver | Yes (20%) | Fires when driver accepts email invitation from `/carrier/fleet/drivers/new` |
| 4. Add your first client | **No** | Fires from `/crm/new`, not in sidebar |
| 5. Dispatch your first load | **No** | Fires from PascalCase `/loads/[id]` status change, not in sidebar |

**Maximum achievable completion for a normal user: 40%** (items 1 and 3 only, and only if the owner invites a driver AND the driver accepts).

**The activation tracker cannot reach 100%** for any tenant using normal navigation. The `tenant.activated` AppEvent, which the v8.0 spec requires for automation triggers and SysAdmin engagement metrics, can never be emitted.

### Why `first_real_driver` works

The carrier driver invite flow (`/carrier/fleet/drivers/new`) calls `POST /api/v1/carrier/fleet/drivers`, which creates a `CarrierDriver` record and sends an invitation email. The driver clicks the email link, which POSTs to `/api/auth/accept-invitation`. That route creates a `User` record with `role: 'DRIVER'` and calls `recordActivationEvent(invitation.tenantId, 'first_real_driver')`. This chain works because `accept-invitation` is a public API route triggered by the driver's email action, not a sidebar page.

---

## Finding 5 — Recommendation

Three paths were defined in the investigation request. Here is the analysis of each.

---

### Option (b) — BUILD OWNER PORTAL UI

**Rejected.** Adding PascalCase pages to the sidebar means owners manage data in two parallel systems (PascalCase trucks AND snake_case carrier_trucks). This doubles the data entry burden, creates divergent data states (a truck created in one system doesn't appear in the other), and is architecturally incoherent. Do not pursue.

---

### Option (a) — PIVOT TO SNAKE_CASE

Re-home sample data and activation tracking to the tables users actually write to.

**What changes:**

**Schema (4 migrations — all additive, safe for existing data):**
- `ALTER TABLE carrier_trucks ADD COLUMN "isSample" boolean NOT NULL DEFAULT false`
- `ALTER TABLE clients ADD COLUMN "isSample" boolean NOT NULL DEFAULT false`
- `ALTER TABLE loads ADD COLUMN "isSample" boolean NOT NULL DEFAULT false` (CarrierLoad)
- `ALTER TABLE carrier_drivers ADD COLUMN "isSample" boolean NOT NULL DEFAULT false`
- Prisma schema: add `isSample Boolean @default(false)` to `CarrierTruck`, `CarrierClient`, `CarrierLoad`, `CarrierDriver` models

**Seeder rewrite (`seed-sample-data.ts`):**
- Stop writing to: `Truck`, `Customer`, `Load` (PascalCase)
- Start writing to: `carrier_trucks`, `clients`, `loads` (CarrierLoad), `carrier_drivers` (snake_case)
- Sample `User(DRIVER)` rows: keep (still needed for dashboard banner check AND driver portal auth)
- The banner detection logic must also update to check snake_case sample counts

**Activation tracker (`activation-tracker.ts`):**
- Keep `first_real_driver` as-is (works)
- Re-wire `first_real_truck` to fire from `/api/v1/carrier/fleet/trucks` POST handler (when carrier truck is created with `isSample: false`)
- Re-wire `first_real_client` to fire from `/api/v1/carrier/clients` POST handler (when carrier client is created with `isSample: false`)
- Re-wire `first_load_in_transit` to fire from dispatch status transition (when a dispatch/load reaches IN_TRANSIT/DELIVERED status via Carrier Ops flow)

**SamplePill:**
- Remove from `truck-list.tsx`, `driver-list.tsx`, `load-list.tsx`, `customer-list.tsx` (PascalCase components — no one sees them)
- Add to: `CarrierTruckList.tsx`, carrier client list component, CarrierLoad list, carrier driver list

**SampleDataBanner:**
- Remove from `/trucks`, `/drivers`, `/loads`, `/crm` pages (orphaned — no one sees them)
- Keep on `/carrier/dashboard` (already there)
- Add to: `/carrier/fleet/trucks`, `/carrier/fleet/drivers`, `/carrier/loads`, `/carrier/clients`
- Update banner's `hasSampleRecords` check to query snake_case tables instead of (or in addition to) PascalCase

**PascalCase isSample columns:**
- `Truck.isSample`, `Customer.isSample`, `Load.isSample`: Leave in place (removing requires a migration and the columns are harmless). Mark as deprecated in a code comment.
- `User.isSample`: Keep and continue using for sample driver detection.

**Files to touch:**
- `apps/web/src/lib/onboarding/seed-sample-data.ts` — full rewrite of seeder targets
- `apps/web/src/lib/onboarding/activation-tracker.ts` — re-map event fields (field names stay the same, query targets change)
- `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts` — add `recordActivationEvent` call on POST
- `apps/web/src/app/api/v1/carrier/clients/route.ts` — add `recordActivationEvent` call on POST
- One carrier dispatch/load status route (identify which endpoint transitions a load to IN_TRANSIT/delivered) — add tracker call
- `apps/web/src/app/(owner)/carrier/dashboard/page.tsx` — update `hasSampleRecords` query to include snake_case tables
- `apps/web/src/app/(owner)/carrier/fleet/trucks/page.tsx` — add SampleDataBanner + query for isSample
- `apps/web/src/app/(owner)/carrier/fleet/drivers/page.tsx` — add SampleDataBanner
- `apps/web/src/app/(owner)/carrier/loads/page.tsx` — add SampleDataBanner
- `apps/web/src/app/(owner)/carrier/clients/page.tsx` — add SampleDataBanner
- `CarrierTruckList.tsx` and equivalent list components — add SamplePill rendering on isSample rows
- Prisma schema — 4 field additions
- 1 new migration file — 4 `ALTER TABLE` statements
- Remove SampleBanner/Pill from the 4 orphaned PascalCase pages (cleanup, not critical)

**Estimated complexity:** Medium. All changes are additive. No existing Carrier Operations logic changes. No breaking changes to existing user data. The seeder rewrite is the most significant edit.

**QA risk:** Low.
- The 4 migrations add columns with `DEFAULT false` — existing rows unaffected.
- The seeder changes only affect newly provisioned tenants.
- The activation tracker change has the same error-swallowing behavior — tracker failure never propagates.
- Risk area: If the IN_TRANSIT trigger fires from a carrier dispatch status endpoint, need to verify `isSample: false` guard is in place so dispatches of carrier_loads with `isSample: true` don't fire the activation event.

---

### Option (c) — HYBRID

Keep PascalCase for what works, re-point only the broken pieces.

In practice this converges with Option (a). The minimum changes to make Phase 49's intent work are:
- Seed snake_case tables (so sample data appears in carrier lists)
- Re-wire tracker to snake_case API routes (so checklist can advance)
- Move SamplePill to carrier list components
- Move SampleDataBanner to carrier list pages

The only piece that differs from Option (a) is that `Truck.isSample`, `Customer.isSample`, `Load.isSample` columns are left as-is without even a deprecation note. The blast radius is identical. There is no meaningful difference between Option (a) and Option (c) in terms of files touched.

---

## Finding 6 — Recommended Option Analysis

**Recommendation: Option (a) — PIVOT TO SNAKE_CASE.**

Rationale: The only correct fix is to make sample data and activation tracking target the tables users actually write to. There is no shortcut. The changes are additive, safe, and scoped. The PascalCase pages can be left as-is or cleaned up in a separate pass — they do not need to be deleted to unblock the fix.

### Files that need to change (final list)

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `isSample Boolean @default(false)` to `CarrierTruck`, `CarrierClient`, `CarrierLoad`, `CarrierDriver` |
| `prisma/migrations/*/migration.sql` | 4 `ALTER TABLE` statements |
| `src/lib/onboarding/seed-sample-data.ts` | Rewrite to write to snake_case tables |
| `src/lib/onboarding/activation-tracker.ts` | Update field queries; re-verify no PascalCase assumptions |
| `src/app/api/v1/carrier/fleet/trucks/route.ts` | Add `recordActivationEvent` call on POST success |
| `src/app/api/v1/carrier/clients/route.ts` | Add `recordActivationEvent` call on POST success |
| Carrier dispatch/load IN_TRANSIT status endpoint | Add `recordActivationEvent('first_load_in_transit')` call |
| `src/app/(owner)/carrier/dashboard/page.tsx` | Update `hasSampleRecords` to query snake_case isSample counts |
| `src/app/(owner)/carrier/fleet/trucks/page.tsx` | Add `SampleDataBanner`; query for isSample count |
| `src/app/(owner)/carrier/fleet/drivers/page.tsx` | Add `SampleDataBanner` |
| `src/app/(owner)/carrier/loads/page.tsx` | Add `SampleDataBanner` |
| `src/app/(owner)/carrier/clients/page.tsx` | Add `SampleDataBanner` |
| `src/components/carrier/fleet/CarrierTruckList.tsx` | Add `SamplePill` on isSample rows |
| Carrier driver list component | Add `SamplePill` on isSample rows |
| Carrier load list component | Add `SamplePill` on isSample rows |
| Carrier client list component | Add `SamplePill` on isSample rows |

### Migrations required

1. `ALTER TABLE carrier_trucks ADD COLUMN "isSample" boolean NOT NULL DEFAULT false`
2. `ALTER TABLE clients ADD COLUMN "isSample" boolean NOT NULL DEFAULT false`
3. `ALTER TABLE loads ADD COLUMN "isSample" boolean NOT NULL DEFAULT false` (CarrierLoad table)
4. `ALTER TABLE carrier_drivers ADD COLUMN "isSample" boolean NOT NULL DEFAULT false`

No data backfills needed. All existing rows default to `false`, which is correct — they are real records.

### Estimated complexity

- Schema + migration: 1 hour
- Seeder rewrite: 2-3 hours (understand carrier_trucks/clients/loads schema, write equivalent sample records, handle fleet-size buckets)
- Tracker re-wiring: 1 hour
- Banner + Pill in carrier pages: 2-3 hours (4 pages + 4 list components)

**Total: 6-8 hours of implementation work.** Does not require architectural decisions — all mechanical changes.

### QA risk

Low. Every change is additive. The `isSample: false` guard in the tracker prevents real user records from being mistaken for sample data. The only new runtime path that needs verification is the IN_TRANSIT event trigger — confirm it fires correctly when a carrier dispatch advances to the relevant status and that the `isSample: false` guard prevents sample dispatches from triggering activation.

### Does this affect the Carrier Operations 46-bug list?

No. The changes described here are:
1. Adding `isSample` columns to four tables (additive DDL, no existing queries break)
2. Adding `recordActivationEvent` calls to three carrier API routes (new code, existing paths unmodified)
3. Adding SampleDataBanner and SamplePill to carrier pages (pure additions)

None of these touch Carrier Operations business logic (dispatch creation, load status transitions, driver pay, reports, IFTA, etc.). Any bugs in those flows are unrelated to and unaffected by this fix.

---

## What Phase 49 Got Right

Not everything is broken. The following work from Phase 49 is correct and should be preserved:

- `src/lib/onboarding/activation-tracker.ts` — the tracker library itself is well-designed (bypass_rls, idempotency, error swallowing, deterministic formula). Only the call sites need to move.
- `src/app/onboarding/welcome/page.tsx` + `checklist.tsx` — the welcome page and checklist UI are correct. They read `ActivationProgress` accurately. Once the tracker fires correctly, the checklist will advance correctly.
- `src/components/onboarding/sample-data-banner.tsx` + `sample-pill.tsx` — the components themselves are correct. Only their placement (PascalCase pages) needs to move.
- `first_real_driver` activation event via `accept-invitation` — works correctly. Do not change.
- `SampleDataBanner` on `/carrier/dashboard` — works correctly for banner detection. The `hasSampleRecords` query will need to be updated to also check snake_case tables once seeding moves there.

---

*End of diagnostic report. No code changes were made.*
*Verified against git log, sidebar.tsx, carrier/dashboard/page.tsx, and all Phase 49 execution artifacts.*
*Date: 2026-05-01*

---

## Appendix A — QA Risk Diagnostic: Git Hot-Zone Analysis and Sequencing Recommendation

**Purpose:** Verify whether the files targeted by Option (a) are under active QA, assess false-positive bug-report risk, and recommend the safest build order.
**Date:** 2026-05-01
**Scope:** Diagnostic only. No code changes were made.

---

### A.1 — Exact Files Targeted and Their Git Activity (Last 30 Days)

#### Group 1: API route files that will receive `recordActivationEvent` calls

**`apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts`**

Commits in last 30 days:
- `4135440` feat(45-04): wire carrier-world lifecycle hooks — 2026-04-24
- `b1db907` feat(quick-248): add vehicle_id and display_name to CarrierTruck schema + backend — 2026-04-17
- `7f8ae2a` fix(carrier/trucks): accept null optional strings and improve validation errors — 2026-04-14
- `1f3c9e0` feat(quick-178): lib modules + API routes for carrier drivers and trucks — 2026-04-05

**Verdict: HOT ZONE.** Four commits in 30 days; most recent was 7 days ago. Notably, commit `4135440` (Phase 45-04) already added the `after()` + `fireEvent()` pattern to this exact POST handler. That pattern is what `recordActivationEvent` would mirror. The precedent is already in the file; the diff would be a second `after()` block alongside the existing one. Low structural risk, but the file is actively in play.

**`apps/web/src/app/api/v1/carrier/clients/route.ts`**

Commits in last 30 days:
- `8d37f5b` fix(carrier): carrier portal bug fixes — 2026-04-12
- `f343630` **fix(tc-07)**: expose actual API error in dev, add portal email validation, fix credit limit input — 2026-04-05
- `7f3ce44` fix(quick-186): fix facility types, contact display, payment fields, portal toggle — 2026-04-05
- `2adb1e1` feat(quick-158): add REST API routes for carrier clients and contracts — 2026-04-04

**Verdict: HOT ZONE WITH QA SIGNAL.** Commit `f343630` uses the `fix(tc-07)` prefix — this is an explicit test-case fix from the QA numbered test suite. TC-07 targeted the clients API directly. Three fix commits in a month against this route indicates ongoing QA pressure. Adding `recordActivationEvent` here during active QA of clients is the highest risk of the three routes.

**`apps/web/src/lib/carrier/dispatches.ts`** (where `first_load_in_transit` hook must land)

The `dispatches/[id]/status/route.ts` is a thin wrapper — it calls `transitionDispatchStatus()` from `dispatches.ts`. The tracker call must be added inside `transitionDispatchStatus` at the `planned → in_progress` transition (line ~558). The lib file `dispatches.ts` is the actual target.

Commits in last 30 days (against `dispatches.ts`):
- `2340c89` feat(45-05): Dispatch enforcement — block non-ready drivers + admin override + audit — 2026-04-24
- `4135440` feat(45-04): wire carrier-world lifecycle hooks (fleet routes + dispatch lifecycle) — 2026-04-24
- `4cfaa50` feat(quick-261): template selector, recurring badge, auto-next dispatch on completion — 2026-04-19
- `b1fc06d` feat(quick-261): add active templates endpoint + stop inheritance — 2026-04-19
- `69b0a7f` feat(quick-240): add in-app notification on dispatch start — 2026-04-17
- `f7140f3` feat(quick-229): wire push notifications to dispatch-assigned and in_progress events — 2026-04-16
- `9eb0404` fix(carrier): use after() for dispatch notification to survive serverless cutoff — 2026-04-16
- `ff1c122` feat(quick-224): wire notification triggers into carrier lib functions — 2026-04-16
- `6fe2a58` fix(quick-217): replace COUNT with MAX-based dispatch and load number generators — 2026-04-14
- `03b167c` fix(quick-214): add driver and truck ownership checks to createDispatch — 2026-04-14
- `14a8241` feat(quick-197): fix dispatch preview to show human-readable values — 2026-04-07

**Verdict: HOTTEST FILE IN THE CODEBASE.** Eleven commits in 30 days; most recent April 24 — one week ago. `transitionDispatchStatus` itself was modified in both April 24 commits. The function already contains `fireEvent` calls with `after()`. Adding `recordActivationEvent` follows the established pattern, but the function is long and complex with multiple branches. Any regression here affects dispatch start/complete workflows, driver pay generation, recurring dispatch auto-creation, and push notifications.

#### Group 2: List components that will receive SamplePill

| Component | Last commit (30 days) | Risk |
|---|---|---|
| `CarrierTruckList.tsx` | `c9a9776` feat(quick-248) — 2026-04-18 | Medium |
| `CarrierDriverList.tsx` | `8c2a1a0` feat(quick-178) — 2026-04-05 | Low |
| `LoadList.tsx` | `fff51e4` fix(quick-255) — 2026-04-18 | Medium |
| `ClientList.tsx` | `842747b` fix(quick-186) — 2026-04-05 | Low |

SamplePill additions to list components are purely additive (render an existing component on rows where `isSample: true`). Since no existing rows have `isSample: true` until the seeder is rewritten, these changes are inert in QA environments that do not re-provision a test tenant.

#### Group 3: Page files that will receive SampleDataBanner

All four carrier pages (`fleet/trucks`, `fleet/drivers`, `loads`, `clients`) received their last structural changes in early April. No recent hot-zone activity. SampleDataBanner additions are pure UI additions — they do not alter any query or action.

---

### A.2 — Active Fix-Up Signals in Target Files

No `TODO`, `FIXME`, `HACK`, `XXX`, or `KLUDGE` markers were found in any of the API route files under `apps/web/src/app/api/v1/carrier/`. The codebase is clean of in-code fixup markers.

The 46-bug list manifests as `fix(tc-NN)` and `fix(quick-NNN)` commits rather than in-code comments. Three signals were found:

1. **`fix(tc-07)` on `clients/route.ts`** (2026-04-05) — QA TC-07 produced a bug fix against the exact file that will receive the `first_real_client` tracker call. This is the highest-risk target: QA has already run a numbered test case against it and found a bug. Subsequent modifications to this file during the same QA cycle increase the chance of introducing regressions that get attributed to the activation tracker change.

2. **`fix(quick-214)` "add driver and truck ownership checks to createDispatch"** (2026-04-14) — a security/validation fix to dispatch creation. Indicates the dispatch flow is being scrutinized. The `transitionDispatchStatus` function (target for `first_load_in_transit`) lives in the same file.

3. **`refactor: carrier ops inspection workflow (ticket #287)`** (2026-05-01, today) — a refactor commit landed today. This is not in the activation tracker target files directly, but it confirms that Carrier Operations is in active development, not a stable frozen area.

---

### A.3 — Sequencing Pattern Evaluation

#### Pattern (a) — Big Bang

All migrations + seeder rewrite + three tracker hooks + four SampleBanners + four SamplePills delivered in a single phase.

**Analysis:** Fastest path to a working activation checklist. But touching `dispatches.ts` in the same PR as schema migrations and seeder changes means any regression has three possible causes. QA cannot isolate which change introduced a problem. If `transitionDispatchStatus` is being tested this week (which the April 24 dispatch enforcement commit suggests it likely is), a simultaneous tracker addition increases the chance of a merge conflict or a behavioral regression that slows QA.

**Verdict: Do not use.** The blast radius on `dispatches.ts` alone is sufficient to reject this approach.

#### Pattern (b) — Phased Per Entity

Step 1: Schema migrations only (additive DDL, zero risk to any existing query).
Step 2: Trucks tracker hook + seeder rewrite for `carrier_trucks` only. Validate: new tenant gets sample truck in fleet trucks list; activation checklist advances to 40% on first truck created.
Step 3: Clients tracker hook + seeder rewrite for `clients`. Validate: first client created advances checklist.
Step 4: Dispatch `in_progress` tracker hook. Validate: dispatch start advances checklist.
Step 5: SamplePill + SampleDataBanner across all four pages.

**Analysis:** Each step is independently verifiable. If a QA regression appears in step 3, the clients route is the only variable. Step 4 (dispatch) is deferred until the other three are confirmed stable — this is the critical risk gate.

**Verdict: Preferred.** See final recommendation below.

#### Pattern (c) — Side-by-Side Shadow Tracker

Leave Phase 49's PascalCase tracker calls in place as silent no-ops. Add parallel snake_case tracker calls. Once verified, remove PascalCase calls.

**Analysis:** The safety advantage is real but the cost is high. Running two tracker paths simultaneously means `activation_events` could receive duplicate fires if both paths ever resolve (they currently cannot, but the code is more complex). The PascalCase calls were wired by Phase 49 into `actions/trucks.ts`, `actions/customers.ts`, `actions/loads.ts` — not into the carrier API routes. The snake_case calls go into entirely different files. There is no shared code path; "shadow tracker" is a misnomer. The PascalCase calls can simply be left in place (they already are, and they are harmless no-ops since PascalCase pages are not reachable). There is no need for a formal shadow/deletion protocol.

**Verdict: Unnecessary complexity.** The PascalCase tracker calls are already in orphaned paths. Option (a) already noted: leave them in place without even a deletion pass. There is no shadow to manage.

---

### A.4 — Final Recommendation

**Use Pattern (b) — Phased, with entity order: migrations → trucks → clients → dispatch.**

**Rebuttal to the specific concern:** *"Modifying carrier_trucks creation in the same week that QA is testing dispatch flows will introduce false-positive bug reports as test data shape changes."*

**Partially accepted, but the mechanism is different from the concern.**

The `recordActivationEvent` call itself cannot generate false-positive QA bug reports. The call is placed inside `after()` — it runs after the HTTP response is sent. The API call completes before the tracker fires. The tracker swallows all errors. A tracker failure is invisible at the HTTP layer. QA testing truck creation will see exactly the same HTTP 201 response whether the tracker fires or not.

**The real false-positive vector is the seeder rewrite, not the tracker hook.**

If QA creates a fresh test tenant after the seeder rewrite ships, that tenant will have sample `CarrierTruck` and `CarrierDriver` records visible in the fleet list views. A QA tester running a "clean-slate" scenario against a fresh tenant will see rows they did not create. Without a briefing, this looks like test data contamination or a "records appear unexpectedly" bug. This is not a tracker bug — it is the correct behavior of the sample data system — but it will be reported as a bug until the tester is briefed.

**Mitigation:** Ship the seeder rewrite at a point where QA is briefed in advance that new tenants will show sample records. The seeder rewrite is a single file (`seed-sample-data.ts`) and does not touch any carrier route or action. It can be deployed in a standalone commit with a clear commit message, giving QA a known boundary: "tenants provisioned after commit X will show sample data in fleet views."

**Ordering within Pattern (b):**

1. Schema migrations (4 ALTER TABLEs) — ship alone, no behavioral change
2. Seeder rewrite — ship alone, brief QA: new tenants show sample records in carrier fleet/clients/loads lists
3. Trucks tracker hook — lowest-risk route; existing `after()` pattern already in the file
4. Clients tracker hook — wait for TC-07-adjacent QA to stabilize; clients route has most recent QA fix history
5. Dispatch `in_progress` hook — last; `dispatches.ts` is the hottest file; defer until other three are confirmed stable
6. SamplePill + SampleDataBanner across carrier pages — purely additive, can ship anytime after step 2

Steps 1 and 2 can ship in the same day. Steps 3–5 should be gated: do not proceed to the next entity until the previous tracker call has been verified to fire correctly via the activation checklist in a test tenant.

---

*Appendix A appended 2026-05-01. No code changes were made.*
*Verified against: git log (30 days), fleet/trucks/route.ts, clients/route.ts, dispatches.ts, dispatches/[id]/status/route.ts.*
