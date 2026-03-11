# Phase 27: Automated Playwright E2E Tests - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning
**Depends on:** Phase 26 (QA Test Scripts)

<domain>
## Phase Boundary

Full Playwright end-to-end test suite covering all three portals (SysAdmin, Owner/Manager, Driver) and all critical user flows. Automated tests run in a real browser simulation via CI or a single command. Phase 26's written QA scripts serve as the source of truth for what to automate. App is considered "production ready" when this suite passes cleanly.

</domain>

<decisions>
## Implementation Decisions

### Test infrastructure
- Playwright with TypeScript
- Auth fixtures for all 3 roles (sysadmin, owner/manager, driver) — avoids logging in on every test
- Test environment: separate test database or seeded data that can be reset between runs
- Single command to run full suite: `npx playwright test`
- HTML report output for sharing results

### Coverage (mirrors Phase 26 QA scripts)
- SysAdmin: login, tenant list, tenant detail, support tickets, invoicing
- Owner Portal: dashboard, trucks CRUD, drivers CRUD, loads/dispatch full lifecycle, route finance, document uploads, maintenance
- Driver Portal: login, load status view, document access

### Structure (3 plans)
- Plan 1: Playwright setup + auth fixtures + sysadmin tests
- Plan 2: Owner portal tests (loads, dispatch, trucks, drivers, finance)
- Plan 3: Driver portal tests + CI configuration + production readiness sign-off

### Output location
- `e2e/` directory (already exists with some tests from quick-53)
- Organized as: `e2e/sysadmin/`, `e2e/owner/`, `e2e/driver/`
- Shared fixtures in `e2e/fixtures/`

</decisions>

<specifics>
## Specific Ideas

- Build on existing `e2e/tkt-fixes.spec.ts` from quick-53 — don't duplicate, extend
- Smoke test subset should run in under 2 minutes for fast CI feedback
- Full suite can be slower — correctness over speed
- Tests should use data-testid attributes where needed — add them during this phase
- Phase is complete when: full suite passes, HTML report generated, README documents how to run

</specifics>

<deferred>
## Deferred Ideas

- Unit tests (Jest/Vitest) for individual functions — lower priority for SaaS at this stage
- Integration tests for individual API routes — covered well enough by E2E
- Visual regression testing (Percy, Chromatic) — defer

</deferred>

---

*Phase: 27-automated-playwright-tests*
*Context gathered: 2026-03-11*
