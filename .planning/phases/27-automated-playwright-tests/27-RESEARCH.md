# Phase 27: Automated Playwright E2E Tests - Research

**Researched:** 2026-04-12
**Domain:** Playwright E2E testing, multi-role auth fixtures, Next.js App Router, carrier portal coverage
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Playwright with TypeScript
- Auth fixtures for all 3 roles (sysadmin, owner/manager, driver) — avoids logging in on every test
- Test environment: separate test database or seeded data that can be reset between runs
- Single command to run full suite: `npx playwright test`
- HTML report output for sharing results
- Coverage mirrors Phase 26 QA scripts: SysAdmin (login, tenant list, tenant detail, support tickets, invoicing), Owner Portal (dashboard, trucks CRUD, drivers CRUD, loads/dispatch full lifecycle, route finance, document uploads, maintenance), Driver Portal (login, load status view, document access)
- Structure: 6 plans (expanded from original 3) — carrier portal is large enough to require multiple plan splits
- Output location: `e2e/` directory with `e2e/sysadmin/`, `e2e/carrier/`, `e2e/driver/`, shared fixtures in `e2e/fixtures/`

### Claude's Discretion
- Smoke test subset should run in under 2 minutes for fast CI feedback
- Full suite can be slower — correctness over speed
- Tests should use data-testid attributes where needed — add them during this phase
- Phase is complete when: full suite passes, HTML report generated, README documents how to run

### Deferred Ideas (OUT OF SCOPE)
- Unit tests (Jest/Vitest) for individual functions
- Integration tests for individual API routes
- Mobile app E2E (React Native / Expo)
</user_constraints>

---

## Summary

Phase 27 is partially complete. Plans 01–03 were executed against the original "owner portal" (`/owner/*`, `/trucks`, `/drivers`, `/loads`, `/routes`) before the carrier portal (`/carrier/*`) existed. All three plans have summaries indicating completion. A substantial new portal — the carrier portal at `/carrier/*` — was built after those plans ran, and has zero test coverage today.

The existing `e2e/` infrastructure is well-built and reusable: multi-role auth fixtures, per-spec `test.use({ storageState })`, proper setup project in `playwright.config.ts`, and a GitHub Actions CI workflow. The carrier portal needs 3 new spec files added under `e2e/carrier/` mirroring the existing pattern.

**Primary recommendation:** Add an `e2e/carrier/` directory with specs covering all `/carrier/*` routes using the `owner.json` auth fixture. The auth infrastructure, playwright.config.ts, and CI workflow require no changes.

---

## Current E2E Infrastructure State

### What Exists (confirmed by filesystem inspection)

**Auth setup — HIGH confidence, fully working:**
- `e2e/auth.setup.ts` — logs in all 3 roles via `POST /api/auth/login`, saves cookies to `.playwright/auth/{role}.json`
- `e2e/fixtures/auth-helpers.ts` — exports `OWNER_AUTH`, `SYSADMIN_AUTH`, `DRIVER_AUTH` path constants
- Auth uses Supabase session cookies (not Clerk — the codebase migrated to Supabase)
- Login API at `/api/auth/login` — rate-limited at 5/15min by IP; the test suite's sequential setup calls stay well within this

**playwright.config.ts — HIGH confidence:**
```ts
testDir: './e2e',
fullyParallel: true,
forbidOnly: !!process.env.CI,
retries: process.env.CI ? 2 : 0,
workers: process.env.CI ? 1 : 3,  // 3 workers locally prevents DB pool exhaustion
reporter: [['html', { open: 'never' }]],
baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
projects: [setup, chromium (depends: setup), mobile (depends: setup)]
```
No `webServer` config — user must run dev server separately.

**CI workflow — HIGH confidence:**
- `.github/workflows/playwright.yml` runs on push/PR to master and `workflow_dispatch`
- Installs Chromium only, runs `--project=chromium`, uploads HTML report as artifact (30 days)
- Requires 6 GitHub secrets: `PLAYWRIGHT_BASE_URL`, `TEST_OWNER_EMAIL`, `TEST_OWNER_PASSWORD`, `TEST_SYSADMIN_EMAIL`, `TEST_SYSADMIN_PASSWORD`, `TEST_DRIVER_EMAIL`, `TEST_DRIVER_PASSWORD`

**Completed specs (Plans 01–03):**

| File | Portal | Status | Notes |
|------|--------|--------|-------|
| `e2e/sysadmin/auth.spec.ts` | SysAdmin | Complete | Access boundary tests, unauthenticated redirect |
| `e2e/sysadmin/dashboard.spec.ts` | SysAdmin | Complete | Metric cards, quick-nav links |
| `e2e/sysadmin/tenants.spec.ts` | SysAdmin | Complete | CRUD, suspend/reactivate |
| `e2e/sysadmin/support.spec.ts` | SysAdmin | Complete | Ticket reply, status change |
| `e2e/sysadmin/invoicing.spec.ts` | SysAdmin | Complete | DRAFT → SENT → PAID → VOID lifecycle |
| `e2e/owner/dashboard.spec.ts` | Owner (old) | Complete | Targets `/dashboard` — old portal |
| `e2e/owner/trucks.spec.ts` | Owner (old) | Complete | Targets `/trucks` — old portal |
| `e2e/owner/drivers.spec.ts` | Owner (old) | Complete | Targets `/drivers` — old portal |
| `e2e/owner/loads.spec.ts` | Owner (old) | Complete | Targets `/loads` — old portal |
| `e2e/owner/routes.spec.ts` | Owner (old) | Complete | Targets `/routes` — old portal |
| `e2e/owner/finance.spec.ts` | Owner (old) | Complete | Targets `/invoices`, `/crm`, `/compliance` — old portal |
| `e2e/driver/auth.spec.ts` | Driver | Complete | Login, root redirect, sidebar isolation |
| `e2e/driver/my-load.spec.ts` | Driver | Complete | My Load page render, status badge |
| `e2e/driver/my-route.spec.ts` | Driver | Complete | My Route page render, read-only enforcement |
| `e2e/driver/access-boundaries.spec.ts` | Driver | Complete | Cross-role access denial |

**Legacy top-level specs (from quick-53):**
- `e2e/tkt-fixes.spec.ts` — Regression tests for TKT-0003 through TKT-0011. References `/trucks/new`, `/drivers/invite`, `/routes/new` (old portal). Still runs. No overlap with carrier portal.
- `e2e/management-flows.spec.ts` — Old Clerk-era test; references `/safety` route that may not exist. Low value.
- `e2e/dashboard-filtering.spec.ts` — Old Clerk-era test; references `/safety` route. Low value.
- `e2e/gps-tracking.spec.ts`, `e2e/tags.spec.ts`, `e2e/responsive.spec.ts` — Legacy from pre-migration. Uncertain relevance.

**Missing coverage — the carrier portal:**
No specs exist for `/carrier/*` routes. This is the gap Plans 04–06 must fill.

---

## Carrier Portal — Complete Route Inventory

The carrier portal lives at `apps/web/src/app/(owner)/carrier/`. All routes require OWNER or MANAGER role. Access is guarded by `CarrierLayout` which redirects DRIVER → `/my-route` and other roles → `/unauthorized`.

### Route Map

| Route | Page Title | Key Interactions |
|-------|------------|-----------------|
| `/carrier/dashboard` | Dashboard | KPI strip (AlertBar + KPIStrip components), Today's Dispatches list, Quick Action links |
| `/carrier/dispatches` | Dispatches | DispatchList with create sheet (`?new=true`), filter by date/driver/truck |
| `/carrier/dispatches/[id]` | Dispatch detail | StopTimeline, DispatchLoadsPanel, DispatchExpensesPanel, DispatchPayRecordsPanel |
| `/carrier/loads` | Loads | LoadList with client filter |
| `/carrier/loads/new` | New Load | LoadForm (create mode) — client select, contract link, load type, financial fields, stop builder |
| `/carrier/loads/[id]` | Load detail | LoadForm (edit mode) |
| `/carrier/fleet/drivers` | Carrier Drivers | CarrierDriverList with status filter |
| `/carrier/fleet/drivers/new` | New Carrier Driver | CarrierDriverForm — name, CDL fields, pay model/rate, home terminal, status |
| `/carrier/fleet/drivers/[id]` | Driver detail | CarrierDriverForm (edit mode) |
| `/carrier/fleet/trucks` | Carrier Trucks | CarrierTruckList with type filter |
| `/carrier/fleet/trucks/new` | New Carrier Truck | CarrierTruckForm — unit number, VIN, year/make/model, truck type, capacity, compliance expiry dates |
| `/carrier/fleet/trucks/[id]` | Truck detail | CarrierTruckForm (edit mode) |
| `/carrier/clients` | Clients | ClientList with status badges |
| `/carrier/clients/new` | New Client | ClientForm |
| `/carrier/clients/[id]` | Client detail | ClientForm (edit mode) |
| `/carrier/contracts` | Contracts | ContractList with status filter |
| `/carrier/contracts/new` | New Contract | Contract form |
| `/carrier/contracts/[id]` | Contract detail | Contract form (edit mode) |
| `/carrier/facilities` | Facilities | FacilityList with type filter |
| `/carrier/facilities/new` | New Facility | FacilityForm |
| `/carrier/facilities/[id]` | Facility detail | FacilityForm (edit mode) |
| `/carrier/templates` | Route Templates | RouteTemplateList |
| `/carrier/templates/new` | New Template | Route template form |
| `/carrier/templates/[id]` | Template detail | Template form (edit mode) |
| `/carrier/reports/aging` | Aging Report | Client AR aging buckets (0-30, 31-60, 61-90, 90+), client-side data fetch |
| `/carrier/reports/driver-pay` | Driver Pay Report | Per-driver pay records with Mark as Paid action |
| `/carrier/reports/performance` | Performance Report | Per-dispatch on-time %, avg dwell, miles, expenses |
| `/carrier/reports/revenue` | Revenue Report | Monthly revenue by client with Recharts bar chart |

### Key Form Fields

**CarrierDriverForm:** firstName, lastName, email, phone, cdlNumber, cdlState (US state select), cdlClass (A/B/C), cdlExpiry (date), homeTerminalId (facility select), payModel (per_mile/percentage/flat_rate/per_stop), payRate (number), payPeriod (weekly/biweekly/monthly), status (active/inactive/terminated), notes

**CarrierTruckForm:** unitNumber, vin, year, make, model, truckType (semi/box_truck/flatbed/reefer/tanker/day_cab/straight_truck), grossWeightLbs, payloadCapacityLbs, currentOdometerMiles, licensePlate, licenseState (US state select), registrationExpiry, licenseExpiry, insuranceExpiry, status, notes

**LoadForm (carrier):** clientId (select), contractId (optional, auto-populates rate fields), loadType, referenceNumber, bolNumber, proNumber, poNumber, commodityDescription, commodityWeightLbs, commodityPieces, commodityPallets, hazmat toggle, rateType, rateAmount, otherCharges, brokerFlag, carrierCost, fuelSurchargeMethod, fuelSurchargeRate, plannedMiles, specialInstructions, notes — plus StopBuilder component

**ClientForm:** name, addressLine1, city, state, zip, status (active/inactive/blocked)

**FacilityForm:** name, facilityType (shipper/receiver/warehouse/crossdock/port/other), addressLine1, city, state, zip

---

## Auth Architecture (verified)

**Auth flow for E2E:**
1. `auth.setup.ts` runs once via the `setup` project
2. POSTs to `/api/auth/login` with `{ email, password }` JSON
3. Supabase `signInWithPassword` sets a server-side cookie via `@supabase/ssr`
4. `request.storageState({ path: '.playwright/auth/{role}.json' })` captures the cookies
5. Each spec file declares: `test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') })`
6. Carrier portal tests use `owner.json` — OWNER role gets past the carrier layout guard

**Carrier portal access rule:** OWNER and MANAGER roles can access `/carrier/*`. DRIVER is redirected to `/my-route`. All other roles go to `/unauthorized`.

**Seed accounts for carrier tests:**
- `owner@test.com` / `TestPass123!` (Tenant 1: "QA Test Org") — use for carrier portal tests
- The `owner@test.com` account IS the carrier portal user
- The existing `TEST_OWNER_EMAIL` / `TEST_OWNER_PASSWORD` defaults (`demo@drivecommand.com` / `demo1234`) can also work if the demo account has OWNER role in app_metadata

---

## Test Data Strategy

**QA seed script exists:** `apps/web/scripts/seed-qa-accounts.ts`

Run with (from `apps/web/`):
```bash
npx tsx --env-file=.env.local scripts/seed-qa-accounts.ts
```

**What it seeds (Tenant 1 — "QA Test Org", owner: `owner@test.com`):**
- 1 OWNER user (`owner@test.com`)
- 1 MANAGER user (`manager@test.com`)
- 1 DRIVER user (`driver@test.com`)
- 1 CarrierDriver record (linked to driver@test.com, status: active, payModel: per_mile)
- 1 CarrierTruck (`UNIT-QA-01`, Kenworth T680 2022, status: active)
- 2 CarrierFacility records (QA Shipper Facility in Chicago, QA Receiver Facility in Indianapolis)

**What it does NOT seed:** CarrierClient, CarrierContract, dispatches, loads. Tests that need these must create them as part of the test flow (happy path: create → verify → optional cleanup) or skip gracefully when data is absent.

**Idempotency:** Script is fully idempotent — safe to run multiple times. "SKIP" or "CREATED" log for each entity.

**Carrier portal tests should:**
1. Use `owner@test.com` credentials (set `TEST_OWNER_EMAIL=owner@test.com` and `TEST_OWNER_PASSWORD=TestPass123!`)
2. Create their own test data inline (e.g., create a client in the test, then create a load using that client)
3. Use `Date.now()` timestamps in names to avoid collisions between parallel test workers
4. Skip gracefully with `test.skip(true, 'reason')` when required pre-existing data is absent

---

## Architecture Patterns

### Established spec pattern (copy exactly):
```typescript
import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

test('@smoke page loads', async ({ page }) => {
  await page.goto('/carrier/dashboard');
  await page.waitForLoadState('domcontentloaded');
  // assertions...
});
```

### Smoke tagging:
Tag critical tests with `@smoke` so CI can run `npx playwright test --grep @smoke` for fast feedback. Every spec file should have at least one `@smoke` test. Smoke set should finish in under 2 minutes total.

### Serial describe for lifecycle flows:
```typescript
let entityUrl = '';

test.describe.serial('dispatch lifecycle', () => {
  test('@smoke create dispatch', async ({ page }) => {
    // create and store URL
    entityUrl = page.url();
  });
  test('add expense to dispatch', async ({ page }) => {
    if (!entityUrl) test.skip(true, 'no dispatch from previous test');
    await page.goto(entityUrl);
    // ...
  });
});
```

### Graceful skip pattern:
```typescript
const hasContent = await page.locator('table tbody tr').first().isVisible().catch(() => false);
if (!hasContent) {
  test.skip(true, 'No data in DB — skipping detail test');
}
```

### Carrier portal URL base:
All carrier routes start with `/carrier/`. Example: `await page.goto('/carrier/dispatches')`.

### shadcn/ui Select interaction:
shadcn selects render as `role="combobox"` trigger + `role="listbox"` with `role="option"` items. Use:
```typescript
await page.getByRole('combobox').click();
await page.getByRole('option', { name: 'Active' }).click();
```

---

## Recommended 6-Plan Structure

| Plan | Scope | Auth | Key Specs |
|------|-------|------|-----------|
| 01 | DONE — SysAdmin portal (auth, dashboard, tenants, support, invoicing) | sysadmin.json | e2e/sysadmin/*.spec.ts |
| 02 | DONE — Owner (old) portal: dashboard, trucks, drivers, loads, routes, finance | owner.json | e2e/owner/*.spec.ts |
| 03 | DONE — Driver portal (auth, my-load, my-route, access-boundaries) | driver.json | e2e/driver/*.spec.ts |
| 04 | **NEW** — Carrier portal: dashboard + fleet (drivers CRUD, trucks CRUD) | owner.json | e2e/carrier/dashboard.spec.ts, e2e/carrier/fleet.spec.ts |
| 05 | **NEW** — Carrier portal: dispatches lifecycle + loads + clients/contracts | owner.json | e2e/carrier/dispatches.spec.ts, e2e/carrier/loads.spec.ts, e2e/carrier/clients.spec.ts |
| 06 | **NEW** — Carrier portal: facilities + templates + reports + access boundaries | owner.json | e2e/carrier/facilities.spec.ts, e2e/carrier/reports.spec.ts, e2e/carrier/access.spec.ts |

### Plan 04 — Carrier Dashboard + Fleet
**`e2e/carrier/dashboard.spec.ts`:**
- `@smoke` dashboard loads at `/carrier/dashboard` (heading "Dashboard", KPI strip visible, Today's Dispatches section, Quick Actions)
- Quick Action links navigate to `/carrier/dispatches?new=true`, `/carrier/loads/new`, `/carrier/clients/new`

**`e2e/carrier/fleet.spec.ts`:**
- `@smoke` carrier driver list page loads (`/carrier/fleet/drivers`)
- `@smoke` create carrier driver happy path (firstName, lastName, CDL fields, payModel, submit → list)
- View driver detail page, edit driver
- `@smoke` carrier truck list page loads (`/carrier/fleet/trucks`)
- `@smoke` create carrier truck happy path (unitNumber, truckType, year, make, model, submit → list)
- View truck detail page, edit truck
- Form validation: required field enforcement on both forms

### Plan 05 — Dispatches + Loads + Clients + Contracts
**`e2e/carrier/dispatches.spec.ts`:**
- `@smoke` dispatch list loads at `/carrier/dispatches`
- Create dispatch via sheet (open with `?new=true` or button)
- Dispatch detail page loads with stop timeline, expenses panel, pay records panel
- Add expense to dispatch (DispatchExpensesPanel)

**`e2e/carrier/loads.spec.ts`:**
- `@smoke` loads list page loads at `/carrier/loads`
- `@smoke` create load happy path — select client, fill commodity fields, submit
- Load detail (edit) page loads correctly
- Load form validation — required fields

**`e2e/carrier/clients.spec.ts`:**
- `@smoke` clients list page loads
- `@smoke` create client happy path
- View/edit client detail
- Contracts list page loads, create contract happy path

### Plan 06 — Facilities + Templates + Reports + Access
**`e2e/carrier/facilities.spec.ts`:**
- `@smoke` facilities list page loads
- Create facility happy path (name, facilityType, address)
- View/edit facility detail

**`e2e/carrier/reports.spec.ts`:**
- `@smoke` aging report page loads (has table or empty state)
- `@smoke` driver pay report page loads
- Driver pay: Mark as Paid action works
- Performance report page loads
- Revenue report page loads (Recharts chart visible)
- Route templates list loads

**`e2e/carrier/access.spec.ts`:**
- Driver cannot access `/carrier/dashboard` (redirected to `/my-route`)
- Driver cannot access `/carrier/fleet/trucks`
- Unauthenticated user redirected from `/carrier/dashboard` to `/sign-in`
- Sysadmin accessing `/carrier/dashboard` is redirected (sysadmin only sees admin routes)

---

## Common Pitfalls

### Pitfall 1: shadcn/ui Select components require two-step interaction
**What goes wrong:** `page.selectOption()` does not work on shadcn Select — it's not a native `<select>`. Clicking the trigger opens a listbox, then you click an option.
**How to avoid:** Use `getByRole('combobox').click()` then `getByRole('option', { name })`.

### Pitfall 2: Carrier portal URL prefix confusion
**What goes wrong:** Old specs navigate to `/trucks`, `/drivers`, `/loads` (old owner portal). Carrier portal routes are `/carrier/fleet/trucks`, `/carrier/fleet/drivers`, `/carrier/loads`.
**How to avoid:** Always prefix with `/carrier/`. The carrier portal is entirely separate from the old portal.

### Pitfall 3: StopBuilder in LoadForm makes load creation complex
**What goes wrong:** The carrier `LoadForm` includes a `StopBuilder` component that requires at least one stop with a facility. Facilities must exist in the DB for the stop builder to work.
**How to avoid:** Either seed facilities first (seed script creates 2) or skip gracefully if no facilities are available. Test that the stop builder renders without testing a full multi-stop flow.

### Pitfall 4: DispatchList uses `?new=true` query param to open create sheet
**What goes wrong:** Navigating to `/carrier/dispatches` does not show the create form. The sheet opens via `DispatchList` component when `searchParams.new === 'true'`.
**How to avoid:** Navigate to `/carrier/dispatches?new=true` or click the Quick Action link on the dashboard.

### Pitfall 5: Reports pages fetch data client-side with useEffect
**What goes wrong:** Aging, Driver Pay, Performance, and Revenue report pages are `'use client'` components that fetch via `useEffect`. `waitForLoadState('domcontentloaded')` resolves before the fetch completes.
**How to avoid:** Use `waitForLoadState('networkidle')` or wait for a specific data-bearing element before asserting.

### Pitfall 6: Auth state stale after seed script changes passwords
**What goes wrong:** If seed script creates a user with one password and the test uses a different password env var, auth setup fails with 401.
**How to avoid:** Set `TEST_OWNER_EMAIL=owner@test.com` and `TEST_OWNER_PASSWORD=TestPass123!` in `.env.local` to match the seed script credentials.

### Pitfall 7: DB connection pool exhaustion under parallel load
**What goes wrong:** `fullyParallel: true` with more than 3 workers causes "Unable to start a transaction" errors due to Supabase connection pool limits.
**How to avoid:** `playwright.config.ts` already caps at 3 workers locally and 1 in CI. Do not increase workers.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth cookie persistence | Custom cookie management | `request.storageState()` in `auth.setup.ts` | Already implemented and working |
| Role-based test isolation | Multiple playwright projects per role | `test.use({ storageState })` per spec file | Lighter weight, already the pattern |
| Test data cleanup | afterEach DB cleanup hooks | Create unique names with `Date.now()`, skip gracefully | Cleanup is flaky; unique names prevent collisions |
| Parallel dispatch serial tests | Complex shared fixtures | `test.describe.serial()` | Already proven pattern in `loads.spec.ts` |

---

## Code Examples

### Carrier dashboard test pattern
```typescript
// Source: verified from e2e/owner/dashboard.spec.ts pattern
import { test, expect } from '@playwright/test';
import path from 'path';

test.use({ storageState: path.join(__dirname, '../../.playwright/auth/owner.json') });

test('@smoke carrier dashboard loads', async ({ page }) => {
  await page.goto('/carrier/dashboard');
  await page.waitForLoadState('domcontentloaded');

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 10000 });

  const hasKPI = await page.getByText(/active dispatches|revenue|loads/i).first().isVisible({ timeout: 10000 }).catch(() => false);
  const hasQuickActions = await page.getByText('Quick Actions').isVisible({ timeout: 10000 }).catch(() => false);

  expect(hasKPI || hasQuickActions).toBeTruthy();
});
```

### CarrierDriver create pattern
```typescript
// Source: verified from CarrierDriverForm.tsx field names
test('@smoke create carrier driver — happy path', async ({ page }) => {
  const ts = Date.now();
  await page.goto('/carrier/fleet/drivers/new');
  await page.waitForLoadState('domcontentloaded');

  await page.getByLabel('First Name').fill(`QA${ts}`);
  await page.getByLabel('Last Name').fill(`Driver${ts}`);

  // Pay model select (shadcn)
  const payModelTrigger = page.getByRole('combobox').first();
  await payModelTrigger.click();
  await page.getByRole('option', { name: 'Per Mile' }).click();

  await page.getByLabel(/rate per mile/i).fill('0.52');

  await page.getByRole('button', { name: /create driver/i }).click();
  await page.waitForLoadState('domcontentloaded');

  expect(page.url()).toContain('/carrier/fleet/drivers');
  await expect(page.getByText(`QA${ts}`)).toBeVisible({ timeout: 10000 });
});
```

### CarrierTruck create pattern
```typescript
// Source: verified from CarrierTruckForm.tsx field names
test('@smoke create carrier truck — happy path', async ({ page }) => {
  const ts = Date.now();
  await page.goto('/carrier/fleet/trucks/new');
  await page.waitForLoadState('domcontentloaded');

  await page.getByLabel('Unit Number').fill(`QA-${ts}`);
  await page.getByLabel('Make').fill('Kenworth');
  await page.getByLabel('Model').fill('T680');
  await page.getByLabel('Year').fill('2022');

  // Truck type select (shadcn)
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: 'Semi' }).click();

  await page.getByRole('button', { name: /create truck/i }).click();
  await page.waitForLoadState('domcontentloaded');

  expect(page.url()).toContain('/carrier/fleet/trucks');
  await expect(page.getByText(`QA-${ts}`)).toBeVisible({ timeout: 10000 });
});
```

### Reports page (client-side fetch) pattern
```typescript
// Source: verified from aging/driver-pay page implementations (useEffect pattern)
test('@smoke aging report loads', async ({ page }) => {
  await page.goto('/carrier/reports/aging');
  // Use networkidle for client-side fetch pages
  await page.waitForLoadState('networkidle');

  const hasTable = await page.locator('table').isVisible({ timeout: 10000 }).catch(() => false);
  const hasEmpty = await page.getByText(/no data|no clients/i).isVisible({ timeout: 5000 }).catch(() => false);

  expect(hasTable || hasEmpty).toBeTruthy();
});
```

### Access boundary pattern (carrier routes)
```typescript
// Source: verified from e2e/driver/access-boundaries.spec.ts pattern
test.describe('Driver cannot access carrier portal', () => {
  test.use({ storageState: path.join(__dirname, '../../.playwright/auth/driver.json') });

  test('@smoke driver cannot access /carrier/dashboard', async ({ page }) => {
    await page.goto('/carrier/dashboard');
    await page.waitForLoadState('domcontentloaded');

    // CarrierLayout redirects DRIVER to /my-route
    expect(page.url()).not.toContain('/carrier/dashboard');
    const redirectedCorrectly = page.url().includes('/my-route') || page.url().includes('/sign-in');
    expect(redirectedCorrectly).toBeTruthy();
  });
});
```

---

## Standard Stack

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `@playwright/test` | (installed) | Test runner, assertions, browser automation | Already in devDependencies |
| TypeScript | 5.x | All spec files | Already configured |
| Chromium | Latest | Primary browser for CI | Only Chromium installed in CI |

**No new packages needed.** The playwright stack is fully operational.

---

## Open Questions

1. **Legacy top-level specs (management-flows.spec.ts, dashboard-filtering.spec.ts, gps-tracking.spec.ts, tags.spec.ts)**
   - What we know: These reference `/safety` and old Clerk patterns. May fail or be stale.
   - What's unclear: Whether they currently pass or error.
   - Recommendation: Leave them as-is. They are not in scope for Plans 04–06. If they fail, they can be skipped or deleted in a separate quick task.

2. **Demo account vs. seed account for carrier portal tests**
   - What we know: `demo@drivecommand.com` is the default owner. `owner@test.com` is the seed account.
   - What's unclear: Which account has carrier portal data (clients, dispatches, loads) in the production DB.
   - Recommendation: Document both in README. Use `owner@test.com` + `TestPass123!` as primary. Run `seed-qa-accounts.ts` before first run. Tests that need existing data skip gracefully.

3. **DispatchList create sheet — button vs. URL param**
   - What we know: `DispatchList` component accepts `?new=true` URL param and dashboard quick action links to `?new=true`.
   - What's unclear: Whether there is also a visible "New Dispatch" button on the dispatches list page itself.
   - Recommendation: Use URL navigation `page.goto('/carrier/dispatches?new=true')` as the reliable create trigger.

---

## Sources

### Primary (HIGH confidence)
- Direct filesystem inspection of `apps/web/e2e/` — all spec files read and verified
- `apps/web/playwright.config.ts` — read in full
- `apps/web/src/app/(owner)/carrier/` — all route directories and page.tsx files inspected
- `apps/web/scripts/seed-qa-accounts.ts` — read in full
- `apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx` — field names verified
- `apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx` — field names verified
- `apps/web/src/components/carrier/loads/LoadForm.tsx` — field names verified
- `.github/workflows/playwright.yml` — read in full
- `apps/web/e2e/README.md` — read in full

### Secondary (MEDIUM confidence)
- `apps/web/src/lib/auth/supabase.ts` — session/auth model verified
- `apps/web/src/app/api/auth/login/route.ts` — login endpoint behavior verified

---

## Metadata

**Confidence breakdown:**
- Existing e2e infrastructure: HIGH — all files read directly
- Carrier portal route inventory: HIGH — all page.tsx files inspected
- Form field names: HIGH — component source read directly
- Auth flow: HIGH — auth.setup.ts and login route both verified
- Seed script: HIGH — seed-qa-accounts.ts read in full
- Legacy spec status: MEDIUM — not run, status inferred from naming/content

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable — Playwright API changes slowly)
