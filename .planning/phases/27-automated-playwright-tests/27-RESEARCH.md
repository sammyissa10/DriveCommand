# Phase 27: Automated Playwright E2E Tests - Research

**Researched:** 2026-03-13
**Domain:** Playwright E2E testing, multi-role auth fixtures, Next.js App Router testing
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
- Structure: Plan 1 = Playwright setup + auth fixtures + sysadmin tests; Plan 2 = Owner portal tests; Plan 3 = Driver portal tests + CI configuration + production readiness sign-off
- Output location: `e2e/` directory with `e2e/sysadmin/`, `e2e/owner/`, `e2e/driver/`, shared fixtures in `e2e/fixtures/`

### Claude's Discretion
- Smoke test subset should run in under 2 minutes for fast CI feedback
- Full suite can be slower — correctness over speed
- Tests should use data-testid attributes where needed — add them during this phase
- Phase is complete when: full suite passes, HTML report generated, README documents how to run

### Deferred Ideas (OUT OF SCOPE)
- Unit tests (Jest/Vitest) for individual functions
- Integration tests for individual API routes
- Visual regression testing (Percy, Chromatic)
</user_constraints>

---

## Summary

Phase 27 automates the Phase 26 manual QA scripts using Playwright 1.58.x + TypeScript. The codebase already has a working Playwright setup (`playwright.config.ts`, `e2e/auth.setup.ts`, 7 existing spec files) that authenticates a single owner role via `storageState`. The phase must extend this to 3 roles.

The critical architectural challenge is multi-role authentication. DriveCommand uses custom cookie-based sessions — a single `/api/auth/login` POST endpoint issues an encrypted `session` cookie. All three user types (sysadmin with `isSystemAdmin: true`, owner with role `OWNER`, driver with role `DRIVER`) authenticate through the same endpoint. This means the auth setup pattern is straightforward: each role logs in via the API, saves `storageState` to a separate `.playwright/auth/{role}.json` file, then tests load that state.

The existing `e2e/auth.setup.ts` already handles owner auth via UI. Phase 27 must add sysadmin and driver setups using API-based login (faster than UI login) and restructure the project configuration to support 3 independent storage states. The existing spec files use the single `chromium` project that reads the owner `auth.json` — the new structure must preserve backward compatibility while adding role-specific test files.

**Primary recommendation:** Use Playwright project dependencies for setup, three separate `storageState` files, and API-based auth (POST `/api/auth/login`) for all roles. Apply `test.use({ storageState })` per-spec-file rather than globally.

---

## Existing Infrastructure Audit

### What Already Exists (HIGH confidence — read from codebase)

| File | Purpose | Status |
|------|---------|--------|
| `playwright.config.ts` | Config with chromium + mobile projects | Working, needs extension |
| `e2e/auth.setup.ts` | Owner auth via UI login | Works for owner only |
| `e2e/tkt-fixes.spec.ts` | TKT regression tests (8 tickets) | Working |
| `e2e/dashboard-filtering.spec.ts` | Tag filter tests | Working |
| `e2e/management-flows.spec.ts` | Driver/route management | Working |
| `e2e/gps-tracking.spec.ts` | Samsara integration, live map | Working |
| `e2e/tags.spec.ts` | Tag CRUD | Working |
| `e2e/responsive.spec.ts` | Mobile responsive checks | Working |
| `.playwright/auth.json` | Owner session state (gitignored) | Exists at runtime |

### Current Config Structure (from `playwright.config.ts`)
- `testDir: './e2e'`
- `workers: process.env.CI ? 1 : 3` (DB connection pool constraint documented in comment)
- `reporter: 'html'`
- `baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'`
- Projects: `setup` (runs `auth.setup.ts`) → `chromium` (depends on setup, uses `.playwright/auth.json`) → `mobile` (depends on setup, uses `.playwright/auth.json`)
- Auth state stored at `.playwright/auth.json` (gitignored)

### Problems with Current Auth Setup
1. `auth.setup.ts` authenticates via Clerk sign-in UI — but the app no longer uses Clerk. It uses custom email/password auth at `/api/auth/login`. The sign-in page is `/sign-in` (custom React form that POSTs to `/api/auth/login`).
2. Only one role (owner) is supported
3. Some old specs check `page.url().includes('sign-in')` and skip — they work but are fragile

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | `^1.58.2` (already installed) | Browser automation, assertions, fixtures | Already in project, industry standard |
| TypeScript | (project default) | Type safety | Already in use |

### No New Dependencies Required
All necessary packages are already installed. The work is purely configuration and test-writing.

**Installation (already done):**
```bash
# Already installed — no action needed
```

---

## Architecture Patterns

### Recommended Directory Structure
```
e2e/
├── fixtures/
│   ├── index.ts          # Exports extended test with all fixtures
│   └── auth-helpers.ts   # API-based login helpers
├── sysadmin/
│   ├── auth.spec.ts
│   ├── tenants.spec.ts
│   ├── support.spec.ts
│   └── invoicing.spec.ts
├── owner/
│   ├── dashboard.spec.ts
│   ├── trucks.spec.ts
│   ├── drivers.spec.ts
│   ├── loads.spec.ts
│   ├── routes.spec.ts
│   └── finance.spec.ts
├── driver/
│   ├── auth.spec.ts
│   ├── my-route.spec.ts
│   ├── my-load.spec.ts
│   └── documents.spec.ts
├── auth.setup.ts         # Multi-role auth setup (extend existing)
└── [existing spec files stay as-is]
```

### Auth State Files
```
.playwright/
├── auth/
│   ├── owner.json        # replaces current auth.json
│   ├── sysadmin.json     # new
│   └── driver.json       # new
└── auth.json             # keep for backward compat with existing specs
```

### Pattern 1: Multi-Role Setup in auth.setup.ts (RECOMMENDED)
**What:** Three separate `setup()` blocks in one file, each saving to a different auth state path.
**When to use:** All auth setup for all roles in one place.

```typescript
// Source: https://playwright.dev/docs/auth#multiple-signed-in-roles
import { test as setup } from '@playwright/test';
import path from 'path';

const AUTH_DIR = path.join(__dirname, '..', '.playwright', 'auth');

setup('authenticate as owner', async ({ request }) => {
  // API-based login — faster than UI, avoids React hydration delays
  await request.post('/api/auth/login', {
    data: { email: 'owner@demo.com', password: 'demo1234' },
  });
  await request.storageState({ path: path.join(AUTH_DIR, 'owner.json') });
  // Also write to legacy path for existing specs
  await request.storageState({ path: path.join(AUTH_DIR, '..', 'auth.json') });
});

setup('authenticate as sysadmin', async ({ request }) => {
  await request.post('/api/auth/login', {
    data: { email: 'admin@drivecommand.com', password: process.env.SYSADMIN_PASSWORD! },
  });
  await request.storageState({ path: path.join(AUTH_DIR, 'sysadmin.json') });
});

setup('authenticate as driver', async ({ request }) => {
  await request.post('/api/auth/login', {
    data: { email: 'driver@demo.com', password: 'demo1234' },
  });
  await request.storageState({ path: path.join(AUTH_DIR, 'driver.json') });
});
```

### Pattern 2: Per-Spec storageState (REQUIRED for multi-role)
**What:** Each spec file declares which auth state it uses via `test.use()`.
**When to use:** All sysadmin, owner, and driver spec files.

```typescript
// e2e/sysadmin/tenants.spec.ts
import { test, expect } from '@playwright/test';
import path from 'path';

test.use({
  storageState: path.join(__dirname, '../../.playwright/auth/sysadmin.json'),
});

test('tenant list loads', async ({ page }) => {
  await page.goto('/tenants');
  await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible();
});
```

### Pattern 3: Updated playwright.config.ts
**What:** Config must support 3 auth state files and have the setup project run all 3 setups.

```typescript
// Source: https://playwright.dev/docs/auth#testing-with-multiple-roles
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 3,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // No global storageState — each spec file sets its own
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
      dependencies: ['setup'],
    },
  ],
});
```

**Important:** Remove the global `storageState` from the chromium/mobile project definition. Each spec file must declare its own via `test.use()`. This is the breaking change from the current single-role config.

### Pattern 4: API-Based Login (PREFERRED over UI login)
**What:** Use Playwright's `request` fixture to POST directly to `/api/auth/login` instead of filling the UI form.
**Why:** Faster (no browser rendering), more reliable (no UI flakiness), cleaner.

```typescript
// Source: https://playwright.dev/docs/auth#authenticate-with-api-request
setup('authenticate as owner', async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: { email: 'owner@demo.com', password: 'demo1234' },
  });
  // Confirm login succeeded before saving state
  expect(res.status()).toBe(200);
  await request.storageState({ path: ownerAuthFile });
});
```

### Pattern 5: Smoke-Tagged Tests for Fast CI Feedback
**What:** Tag critical tests with `@smoke` so a fast subset can run first.

```typescript
test('@smoke dashboard loads', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
```

Run smoke tests only: `npx playwright test --grep @smoke`

### Anti-Patterns to Avoid
- **Global storageState in config:** Breaks when some tests need a different role. Use per-spec `test.use()` instead.
- **UI login in every test:** Slow and fragile. Use auth setup once, reuse storageState.
- **`page.waitForTimeout(ms)` as wait:** Use `waitForLoadState`, `waitForSelector`, or `waitForURL` instead. `waitForTimeout` is a code smell.
- **CSS selector dependencies:** Prefer `getByRole`, `getByLabel`, `getByTestId`, `getByText` — they survive style refactors.
- **Checking auth redirect as test pass:** Current pattern `if (page.url().includes('sign-in')) { test.skip() }` hides auth failures. With proper fixtures, tests should assert the logged-in page directly.
- **Parallel CRUD tests sharing data:** Create/edit/delete tests that share the same record will race. Use isolated data per test or sequential ordering.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Multi-role auth | Custom session injection code | `storageState` + `request.post('/api/auth/login')` | Playwright natively handles cookie persistence |
| Waiting for page ready | `waitForTimeout(3000)` sleeps | `waitForLoadState('networkidle')` or `waitForSelector` | Deterministic, faster |
| Test isolation | Manual DB cleanup between tests | Test data strategy (see Pitfalls section) | Fewer moving parts |
| Parallel role testing | Complex fixture composition | Simple per-file `test.use({ storageState })` | Simpler, same result |

**Key insight:** The existing auth infrastructure (session cookies from `/api/auth/login`) maps perfectly to Playwright's `storageState` pattern. No custom auth interceptors needed.

---

## Common Pitfalls

### Pitfall 1: Test Database State — The Hardest Problem
**What goes wrong:** Tests that create records (trucks, loads, etc.) leave dirty state. Later tests find unexpected data or fail because records they needed to create already exist.
**Why it happens:** No DB reset between tests in the current setup.
**How to avoid:** Two-pronged approach:
  1. **Read-only tests first:** Most tests should only assert that pages render, not that specific counts are exact. Test "dashboard shows stat cards" not "dashboard shows exactly 3 trucks."
  2. **Generate unique data:** When creating records in tests, use timestamped or UUID-based names: `Test Truck ${Date.now()}`. Never rely on specific counts.
  3. **Teardown in test:** If a test creates a record, use `test.afterEach` to delete it. Simpler than global DB reset.
**Warning signs:** Tests that pass solo but fail when run together.

### Pitfall 2: Supabase Connection Pool Exhaustion
**What goes wrong:** `Unable to start a transaction` errors under parallel load.
**Why it happens:** The app wraps every query in a transaction for RLS. Too many parallel Playwright workers = too many DB connections.
**How to avoid:** The current config already documents this: `workers: process.env.CI ? 1 : 3`. Keep this limit. Don't increase workers.
**Warning signs:** Intermittent DB errors that don't reproduce solo.

### Pitfall 3: Auth State File Missing at Test Time
**What goes wrong:** `Error: storageState file not found` when running tests without running setup first.
**Why it happens:** Auth state files live in `.playwright/auth/` (gitignored) and are only created by the `setup` project. If you run a single spec without the full suite, setup didn't run.
**How to avoid:** Ensure `setup` project runs before any other project (project `dependencies: ['setup']` in config). Also create the `.playwright/auth/` directory in setup before saving.
**Warning signs:** `ENOENT` errors pointing to `.playwright/auth/*.json`.

### Pitfall 4: SysAdmin Credentials Not in Env
**What goes wrong:** SysAdmin auth setup fails because sysadmin email/password aren't in test env vars.
**Why it happens:** There's no dedicated `ADMIN_SECRET_KEY` web UI login — sysadmin logs in at `/sign-in` just like owners/drivers, but their account has `isSystemAdmin: true` set in the database. The test needs valid sysadmin credentials.
**How to avoid:** Require `TEST_SYSADMIN_EMAIL` and `TEST_SYSADMIN_PASSWORD` env vars (alongside existing demo credentials). Document in README.
**Warning signs:** 401 from `/api/auth/login` in sysadmin setup.

### Pitfall 5: `networkidle` Hangs on Long-Polling/Websocket Pages
**What goes wrong:** `waitForLoadState('networkidle')` never resolves on pages with live GPS tracking or streaming.
**Why it happens:** Some pages have persistent connections that keep the network "active."
**How to avoid:** Use `waitForLoadState('domcontentloaded')` + a specific element wait instead of `networkidle` for `/live-map` and GPS-heavy pages.
**Warning signs:** Test timeouts specifically on live-map or real-time pages.

### Pitfall 6: Removing Global storageState Breaks Existing Tests
**What goes wrong:** When migrating config from single global `storageState` to per-spec, existing spec files that don't declare `test.use({ storageState })` run without any auth and redirect to sign-in.
**Why it happens:** Removing global storageState from the chromium project config removes auth for all specs that relied on it.
**How to avoid:** When updating `playwright.config.ts`, add `test.use({ storageState: '...' })` to all existing spec files at the same time. Alternatively, keep a `storageState` default on the chromium project for backward compat and only override in role-specific specs.
**Warning signs:** Existing passing tests suddenly skip with "Authentication required."

---

## Code Examples

### Auth Setup — API-Based Multi-Role Login
```typescript
// Source: playwright.dev/docs/auth#authenticate-with-api-request (verified)
// e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const AUTH_DIR = path.join(__dirname, '..', '.playwright', 'auth');

setup.beforeAll(async () => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
});

setup('authenticate as owner', async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: {
      email: process.env.TEST_OWNER_EMAIL ?? 'demo@drivecommand.com',
      password: process.env.TEST_OWNER_PASSWORD ?? 'demo1234',
    },
  });
  expect(res.status()).toBe(200);
  await request.storageState({ path: path.join(AUTH_DIR, 'owner.json') });
  // Write legacy path so existing specs still work
  await request.storageState({ path: path.join(AUTH_DIR, '..', 'auth.json') });
});

setup('authenticate as sysadmin', async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: {
      email: process.env.TEST_SYSADMIN_EMAIL!,
      password: process.env.TEST_SYSADMIN_PASSWORD!,
    },
  });
  expect(res.status()).toBe(200);
  await request.storageState({ path: path.join(AUTH_DIR, 'sysadmin.json') });
});

setup('authenticate as driver', async ({ request }) => {
  const res = await request.post('/api/auth/login', {
    data: {
      email: process.env.TEST_DRIVER_EMAIL!,
      password: process.env.TEST_DRIVER_PASSWORD!,
    },
  });
  expect(res.status()).toBe(200);
  await request.storageState({ path: path.join(AUTH_DIR, 'driver.json') });
});
```

### Per-Spec Auth Declaration
```typescript
// e2e/sysadmin/tenants.spec.ts
import { test, expect } from '@playwright/test';
import path from 'path';

test.use({
  storageState: path.join(__dirname, '../../.playwright/auth/sysadmin.json'),
});

test.describe('Tenant Management', () => {
  test('@smoke tenant list page loads', async ({ page }) => {
    await page.goto('/tenants');
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible();
  });

  test('tenant detail page shows company info', async ({ page }) => {
    await page.goto('/tenants');
    const firstRow = page.getByRole('row').nth(1);
    await firstRow.getByRole('link').click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText('Company Name')).toBeVisible();
  });
});
```

### data-testid Usage (add to components as needed)
```typescript
// In React component:
<button data-testid="dispatch-load-btn">Dispatch Load</button>
<tr data-testid={`load-row-${load.id}`}>...</tr>

// In Playwright test:
await page.getByTestId('dispatch-load-btn').click();
const loadRow = page.getByTestId(`load-row-${loadId}`);
```

### API Request Testing (for boundary/auth tests)
```typescript
// Source: gps-tracking.spec.ts (existing pattern)
test('rejects unauthenticated requests', async ({ request }) => {
  // request fixture uses the current context's auth — reset with fresh context for unauth test
  const unauthContext = await request.newContext({ storageState: { cookies: [], origins: [] } });
  const res = await unauthContext.post('/api/some/endpoint', { data: {} });
  expect([401, 403]).toContain(res.status());
});
```

### Unique Data Generation for CRUD Tests
```typescript
// Avoids name collision between test runs
const uniqueName = `Test Truck ${Date.now()}`;
await page.getByLabel('Make').fill(uniqueName);
// After test, verify cleanup
test.afterEach(async ({ page }) => {
  // navigate to list, find row by uniqueName, delete
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Clerk auth (`storageState` from Clerk) | Custom cookie session via `/api/auth/login` | Phase 2 rewrite | Auth setup must POST to API, not fill Clerk forms |
| Single auth role in tests | Multi-role via separate storageState files | Phase 27 | Each portal gets its own session file |
| `waitForTimeout` sleeps | `waitForLoadState` + element waits | Playwright 1.x best practice | Tests faster and deterministic |

**Current state of existing specs:** The older specs (`tags.spec.ts`, `management-flows.spec.ts`, `dashboard-filtering.spec.ts`) still reference Clerk auth comments ("Requires Clerk test mode") but actually work because `auth.setup.ts` now uses the custom login. The comments are stale but the behavior is correct.

---

## Open Questions

1. **Sysadmin test credentials**
   - What we know: Sysadmin logs in via same `/sign-in` → `/api/auth/login` flow; account has `isSystemAdmin: true` in DB
   - What's unclear: Is there a dedicated sysadmin user in the development DB? What are their credentials?
   - Recommendation: Planner should add a task to document/seed the sysadmin test user credentials into `.env.local` test vars (`TEST_SYSADMIN_EMAIL`, `TEST_SYSADMIN_PASSWORD`)

2. **Driver test credentials**
   - What we know: Drivers are invited by owners and set passwords via invitation flow
   - What's unclear: Does the development DB have a seeded driver account with a known password?
   - Recommendation: Same as sysadmin — document what credentials to use, add to `.env.local`. If none exist, Plan 1 should include a task to seed them.

3. **Test data seeding strategy**
   - What we know: Tests need trucks, drivers, and loads to exist to test CRUD flows
   - What's unclear: Does the dev DB have sufficient demo data, or do tests need to create their own?
   - Recommendation: Assume dev DB has demo data (the existing specs all check for existing data). Tests should be additive (create + clean up) rather than relying on pre-seeded state for critical flows.

4. **GitHub Actions CI configuration**
   - What we know: No `.github/` directory exists yet; Phase 27 Plan 3 covers CI setup
   - What's unclear: What CI provider (GitHub Actions vs Vercel-only)? Should the suite run on push or only on demand?
   - Recommendation: GitHub Actions is standard for Next.js projects; use `ubuntu-latest` runner with Node.js 20 and Playwright browser install step.

---

## Sources

### Primary (HIGH confidence)
- Playwright 1.58.x source code in `node_modules/@playwright/test` + installed config
- Existing `playwright.config.ts` — read directly
- `e2e/auth.setup.ts` — read directly
- All 7 existing spec files — read directly
- `src/app/api/auth/login/route.ts` — verified auth mechanism
- `src/middleware.ts` — verified role-based routing
- `src/lib/auth/session.ts` — verified session cookie implementation
- `src/app/(admin)/layout.tsx` — verified sysadmin uses same session cookie, `isSystemAdmin` flag
- `docs/qa/sysadmin-tests.md`, `owner-tests.md`, `driver-tests.md` — Phase 26 test coverage reference

### Secondary (MEDIUM confidence)
- https://playwright.dev/docs/auth#multiple-signed-in-roles — multi-role auth pattern
- https://playwright.dev/docs/auth#authenticate-with-api-request — API-based login pattern
- https://playwright.dev/docs/test-global-setup-teardown — project dependencies vs globalSetup
- https://playwright.dev/docs/test-fixtures — custom fixtures pattern

### Tertiary (LOW confidence)
- None — all critical claims verified against codebase or official docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Playwright already installed and working
- Architecture: HIGH — verified against codebase; auth mechanism fully understood
- Auth pattern: HIGH — verified via official docs + existing working auth.setup.ts
- Pitfalls: HIGH — several sourced from the existing code (worker limit comment, existing auth checks)
- Credentials question: LOW — unknown what sysadmin/driver test accounts exist in dev DB

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable domain; Playwright releases minor versions monthly but 1.58.x APIs are stable)
