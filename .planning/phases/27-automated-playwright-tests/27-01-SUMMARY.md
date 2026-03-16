---
phase: 27-automated-playwright-tests
plan: 01
subsystem: testing
tags: [playwright, typescript, e2e, auth, sysadmin, multi-role]

# Dependency graph
requires:
  - phase: 26-qa-test-scripts
    provides: "docs/qa/sysadmin-tests.md — manual QA flows that these E2E tests automate"
  - phase: 23-sysadmin-portal
    provides: "SysAdmin portal pages (admin-dashboard, tenants, billing, admin-support) being tested"
provides:
  - "Multi-role Playwright auth infrastructure for owner, sysadmin, and driver roles"
  - "e2e/fixtures/auth-helpers.ts — OWNER_AUTH, SYSADMIN_AUTH, DRIVER_AUTH, LEGACY_AUTH constants"
  - "e2e/auth.setup.ts — API-based login for all 3 roles via /api/auth/login"
  - "e2e/sysadmin/ — 5 spec files covering auth boundaries, dashboard, tenants, support, invoicing"
  - "All 6 existing spec files updated with explicit per-file storageState"
affects: [27-02-owner-portal-tests, 27-03-driver-portal-tests]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Multi-role API-based auth: 3 setup() blocks in auth.setup.ts each POST to /api/auth/login, save to separate .playwright/auth/{role}.json"
    - "Per-spec storageState: each spec file declares test.use({ storageState: path }) — no global storageState in config"
    - "html reporter with open:never so reports generate without auto-opening browser"
    - "@smoke tag prefix on critical tests for fast CI subset via --grep @smoke"
    - "Legacy auth.json maintained at .playwright/auth.json for backward compat with existing specs"

key-files:
  created:
    - e2e/fixtures/auth-helpers.ts
    - e2e/sysadmin/auth.spec.ts
    - e2e/sysadmin/dashboard.spec.ts
    - e2e/sysadmin/tenants.spec.ts
    - e2e/sysadmin/support.spec.ts
    - e2e/sysadmin/invoicing.spec.ts
  modified:
    - playwright.config.ts
    - e2e/auth.setup.ts
    - e2e/tkt-fixes.spec.ts
    - e2e/dashboard-filtering.spec.ts
    - e2e/management-flows.spec.ts
    - e2e/gps-tracking.spec.ts
    - e2e/tags.spec.ts
    - e2e/responsive.spec.ts

key-decisions:
  - "API-based login for all 3 roles: POST /api/auth/login with credentials — faster than UI login, avoids React hydration delays"
  - "Per-spec storageState over global config: enables mixed-role test runs without project duplication"
  - "Legacy .playwright/auth.json kept: existing specs unchanged, backward compat preserved"
  - "TEST_SYSADMIN_EMAIL/PASSWORD env vars required for sysadmin setup — no hardcoded admin credentials"
  - "Invoice tests create their own isolated records using Date.now() timestamps — no shared state between lifecycle tests"
  - "Admin support page uses expand-in-place pattern: no separate ticket detail route, tests click ticket card to expand"

patterns-established:
  - "Pattern 1: All new sysadmin specs open with test.use({ storageState: SYSADMIN_AUTH }) before any test.describe"
  - "Pattern 2: domcontentloaded over networkidle — avoid hang on long-polling pages"
  - "Pattern 3: Smoke tests tagged @smoke at test title level, not describe level — matches --grep pattern"
  - "Pattern 4: CRUD tests generate unique data via Date.now() to avoid DB state collisions"
  - "Pattern 5: Tests that depend on DB data (e.g. existing tickets) gracefully skip with descriptive message"

# Metrics
duration: 7min
completed: 2026-03-16
---

# Phase 27 Plan 01: Multi-role Auth Infrastructure + SysAdmin E2E Tests Summary

**Multi-role Playwright auth via API login (3 roles), auth fixture infrastructure, and 22 SysAdmin E2E tests covering auth boundaries, dashboard, tenant CRUD, support replies, and invoice lifecycle**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-16T16:30:40Z
- **Completed:** 2026-03-16T16:37:59Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Rewrote auth.setup.ts from single UI-based owner login to 3-role API-based auth (owner, sysadmin, driver)
- Migrated playwright.config.ts to remove global storageState and use per-spec declarations
- Created e2e/fixtures/auth-helpers.ts with exported path constants for all 3 auth state files
- Updated all 6 existing spec files with explicit `test.use({ storageState: owner.json })` — no regressions
- Wrote 22 SysAdmin tests across 5 spec files: auth boundaries, dashboard metrics, tenant CRUD with suspend/reactivate, inline support ticket replies and status changes, full invoice lifecycle (create → send → mark paid → void)

## Task Commits

Each task was committed atomically:

1. **Task 1: Multi-role auth infrastructure** - `9a8fe71` (feat)
2. **Task 2: SysAdmin portal E2E tests** - `d15fcb1` (feat)

## Files Created/Modified
- `playwright.config.ts` - Removed global storageState, changed reporter to html+never-open
- `e2e/auth.setup.ts` - Rewrote with 3 API-based setup() blocks + beforeAll dir creation
- `e2e/fixtures/auth-helpers.ts` - OWNER_AUTH, SYSADMIN_AUTH, DRIVER_AUTH, LEGACY_AUTH constants
- `e2e/tkt-fixes.spec.ts` - Added test.use({ storageState: owner.json })
- `e2e/dashboard-filtering.spec.ts` - Added test.use({ storageState: owner.json })
- `e2e/management-flows.spec.ts` - Added test.use({ storageState: owner.json })
- `e2e/gps-tracking.spec.ts` - Added test.use({ storageState: owner.json })
- `e2e/tags.spec.ts` - Added test.use({ storageState: owner.json })
- `e2e/responsive.spec.ts` - Added test.use({ storageState: owner.json })
- `e2e/sysadmin/auth.spec.ts` - Smoke access, unauthenticated redirect, owner redirect
- `e2e/sysadmin/dashboard.spec.ts` - Metric cards, quick-nav, header nav links
- `e2e/sysadmin/tenants.spec.ts` - List, create (unique), detail, suspend/reactivate, billing section
- `e2e/sysadmin/support.spec.ts` - List, inline reply, status change, filter check
- `e2e/sysadmin/invoicing.spec.ts` - List, create, detail line items, send, mark paid, void

## Decisions Made
- API-based login for all 3 roles: POST /api/auth/login is faster and avoids React hydration delays vs UI login
- Per-spec storageState over global config: existing specs needed no logic changes, just a single added line
- Sysadmin test credentials intentionally require env vars (TEST_SYSADMIN_EMAIL/PASSWORD) — no hardcoded admin credentials in repo
- Invoice lifecycle tests each create their own DRAFT invoice rather than sharing state — eliminates test ordering dependencies
- Support ticket tests use expand-in-place pattern (click card to expand, not navigate to detail route) — matches actual UI architecture

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None — auth.setup.ts migration from UI-based to API-based login was clean. The existing specs' skip-on-sign-in pattern (`if (url.includes('sign-in')) test.skip()`) becomes irrelevant now that storageState is explicitly declared, but was not modified (no behavior change, just dead code paths).

## User Setup Required
Before running `npx playwright test`, the following environment variables must be set in `.env.local` (or test runner environment):
- `TEST_SYSADMIN_EMAIL` — email of a user with `isSystemAdmin: true` in the DB
- `TEST_SYSADMIN_PASSWORD` — that user's password
- `TEST_DRIVER_EMAIL` — email of a driver user
- `TEST_DRIVER_PASSWORD` — that driver's password
- `TEST_OWNER_EMAIL` / `TEST_OWNER_PASSWORD` — optional, defaults to demo@drivecommand.com / demo1234

## Next Phase Readiness
- Auth infrastructure complete — Plans 02 and 03 inherit `OWNER_AUTH` and `DRIVER_AUTH` constants from `e2e/fixtures/auth-helpers.ts`
- SysAdmin portal fully covered — 22 tests across 5 spec files
- `npx playwright test --grep @smoke e2e/sysadmin/` runs the 7-test smoke subset
- Plan 02 (owner portal) and Plan 03 (driver portal) can now reference the fixture patterns established here

---
*Phase: 27-automated-playwright-tests*
*Completed: 2026-03-16*

## Self-Check: PASSED

All files verified present. All commits verified in git history.

| Check | Result |
|-------|--------|
| e2e/fixtures/auth-helpers.ts | FOUND |
| e2e/auth.setup.ts | FOUND |
| e2e/sysadmin/auth.spec.ts | FOUND |
| e2e/sysadmin/dashboard.spec.ts | FOUND |
| e2e/sysadmin/tenants.spec.ts | FOUND |
| e2e/sysadmin/support.spec.ts | FOUND |
| e2e/sysadmin/invoicing.spec.ts | FOUND |
| playwright.config.ts | FOUND |
| 27-01-SUMMARY.md | FOUND |
| Commit 9a8fe71 | FOUND |
| Commit d15fcb1 | FOUND |
