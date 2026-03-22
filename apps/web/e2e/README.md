# DriveCommand E2E Test Suite

Playwright end-to-end tests covering all three portals of DriveCommand: SysAdmin, Owner, and Driver.

## Overview

The test suite uses multi-role authentication with per-spec storageState. Each spec file targets a specific portal and role. The auth setup step (`e2e/auth.setup.ts`) logs in all three roles via the API before any tests run, storing session state in `.playwright/auth/`.

## Prerequisites

- Node.js 20+
- Playwright browsers installed: `npx playwright install`
- App running at `http://localhost:3000` (or set `PLAYWRIGHT_BASE_URL`)
- Required environment variables set (see below)

## Environment Variables

Set these in `.env.local` before running tests locally.

| Variable | Description | Default |
|---|---|---|
| `PLAYWRIGHT_BASE_URL` | Base URL of the running app | `http://localhost:3000` |
| `TEST_OWNER_EMAIL` | Email of an OWNER role user | `demo@drivecommand.com` |
| `TEST_OWNER_PASSWORD` | Owner's password | `demo1234` |
| `TEST_SYSADMIN_EMAIL` | Email of a user with `isSystemAdmin: true` | (required) |
| `TEST_SYSADMIN_PASSWORD` | SysAdmin's password | (required) |
| `TEST_DRIVER_EMAIL` | Email of a DRIVER role user | (required) |
| `TEST_DRIVER_PASSWORD` | Driver's password | (required) |

The owner defaults to `demo@drivecommand.com` / `demo1234` if `TEST_OWNER_EMAIL` and `TEST_OWNER_PASSWORD` are not set. The sysadmin and driver credentials are required — the auth setup step will fail with a 401 if they are missing.

## Running Tests

**Full suite (all portals):**
```sh
npx playwright test
```

**Smoke tests only (fastest CI feedback):**
```sh
npx playwright test --grep @smoke
```

**Single portal:**
```sh
npx playwright test e2e/sysadmin/
npx playwright test e2e/owner/
npx playwright test e2e/driver/
```

**Single spec file:**
```sh
npx playwright test e2e/owner/loads.spec.ts
```

**With Playwright UI mode (interactive):**
```sh
npx playwright test --ui
```

**View HTML report after a run:**
```sh
npx playwright show-report
```

## Directory Structure

```
e2e/
  auth.setup.ts              # Authenticates all 3 roles via API before test run
  fixtures/
    auth-helpers.ts          # Exported path constants: OWNER_AUTH, SYSADMIN_AUTH, DRIVER_AUTH
  sysadmin/
    auth.spec.ts             # SysAdmin access boundaries
    dashboard.spec.ts        # Platform Overview metrics
    tenants.spec.ts          # Tenant CRUD (create, suspend, reactivate)
    support.spec.ts          # Inline ticket replies and status changes
    invoicing.spec.ts        # Invoice lifecycle (create → send → paid → void)
  owner/
    dashboard.spec.ts        # Fleet summary cards and sidebar nav
    trucks.spec.ts           # Truck CRUD lifecycle
    drivers.spec.ts          # Driver invite and detail
    loads.spec.ts            # Full dispatch lifecycle (PENDING→INVOICED)
    routes.spec.ts           # Route creation, multi-stop, finance section
    finance.spec.ts          # Invoices, payroll, CRM, compliance pages
  driver/
    auth.spec.ts             # Driver login, root redirect, unauth block
    my-route.spec.ts         # My Route page render and document read-only
    my-load.spec.ts          # My Load page render, status timeline, action button
    access-boundaries.spec.ts # Cross-role access denial tests
  dashboard-filtering.spec.ts  # (legacy) Dashboard filter flows
  management-flows.spec.ts     # (legacy) Owner management flows
  tkt-fixes.spec.ts            # (legacy) Regression tests for ticket fixes
  gps-tracking.spec.ts         # (legacy) GPS tracking spec
  tags.spec.ts                 # (legacy) Tag management
  responsive.spec.ts           # (legacy) Responsive layout checks
  README.md                    # This file
```

## Auth Architecture

`e2e/auth.setup.ts` runs once before all tests. It contains three `setup()` blocks — one per role — each POSTing to `/api/auth/login` with the role's credentials and saving the resulting session cookie to `.playwright/auth/{role}.json`.

Each spec file then declares which session to use via:
```ts
test.use({ storageState: path.join(__dirname, '../../.playwright/auth/driver.json') });
```

This approach is faster than UI-based login (no React hydration required) and enables mixed-role runs without duplicating project configurations in `playwright.config.ts`.

The `.playwright/auth/` directory is gitignored. If auth state becomes stale (e.g., after a password change), delete the directory and re-run the suite to regenerate it.

## CI

GitHub Actions workflow (`.github/workflows/playwright.yml`) runs on:
- Push to `master`
- Pull requests targeting `master`
- Manual trigger via `workflow_dispatch`

The workflow installs only the Chromium browser to minimize CI time. It runs with `workers: 1` (set automatically in `playwright.config.ts` when `CI=true`) to avoid DB connection pool exhaustion.

The HTML report is uploaded as a GitHub Actions artifact (`playwright-report`) and retained for 30 days. It is available even if tests fail, which helps with debugging.

**Secrets required in GitHub repository settings:**

| Secret | Description |
|---|---|
| `PLAYWRIGHT_BASE_URL` | URL of the deployed app being tested |
| `TEST_OWNER_EMAIL` | Owner test account email |
| `TEST_OWNER_PASSWORD` | Owner test account password |
| `TEST_SYSADMIN_EMAIL` | SysAdmin test account email |
| `TEST_SYSADMIN_PASSWORD` | SysAdmin test account password |
| `TEST_DRIVER_EMAIL` | Driver test account email |
| `TEST_DRIVER_PASSWORD` | Driver test account password |

## Troubleshooting

**Auth setup fails with 401 or "Invalid credentials":**
- Check that `TEST_SYSADMIN_EMAIL`, `TEST_SYSADMIN_PASSWORD`, `TEST_DRIVER_EMAIL`, and `TEST_DRIVER_PASSWORD` are set correctly in `.env.local`.
- Verify the accounts exist in the database and their passwords match.

**Tests fail with "Unable to start a transaction" or connection errors:**
- Reduce parallel workers: `npx playwright test --workers=1`
- The default `workers: 3` locally should be fine, but if you see DB pool errors, drop to 1.

**Stale auth state (tests pass auth check but get unexpected data):**
- Delete `.playwright/auth/` and re-run: the auth setup step will regenerate fresh sessions.

**Tests skip unexpectedly:**
- Some tests use `test.skip(true, 'reason')` when required DB data is absent (e.g., no active load assigned to the test driver). This is intentional — it prevents false failures on fresh tenants. Populate the required data and the tests will run.

**HTML report not opening automatically:**
- The reporter is configured with `open: 'never'` to avoid blocking CI. Run `npx playwright show-report` manually after a test run.
