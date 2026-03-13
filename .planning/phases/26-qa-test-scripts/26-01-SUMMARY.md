---
phase: 26-qa-test-scripts
plan: 01
subsystem: testing
tags: [qa, manual-testing, documentation, sysadmin, markdown]

# Dependency graph
requires:
  - phase: 25-sysadmin-invoicing
    provides: billing invoice lifecycle (DRAFT/SENT/PAID/VOID), sysadmin-invoices.ts actions, /billing pages
  - phase: 23-sysadmin-portal
    provides: tenant management, support tickets, /admin/login auth, ADMIN_SECRET_KEY mechanism
provides:
  - docs/qa/sysadmin-tests.md with 56 manual test cases for the SysAdmin portal
  - Complete auth, dashboard, tenant, support, billing, and user management coverage
affects: [26-02, 26-03, 27-automated-playwright]

# Tech tracking
tech-stack:
  added: []
  patterns: [TC-{PORTAL}-{AREA}-{NNN} test ID scheme, Pass/Fail checkbox format, preconditions-with-how-to-achieve pattern]

key-files:
  created:
    - docs/qa/sysadmin-tests.md
  modified: []

key-decisions:
  - "Test case format: preconditions include 'how to achieve' state, not just 'what state is required'"
  - "ADMIN_SECRET_KEY login documented explicitly as distinct from owner/driver /sign-in flow"
  - "Invoice lifecycle covers both DRAFT->VOID and DRAFT->SENT->PAID->VOID paths with explicit blocked actions at each state"
  - "Cross-tenant scope called out explicitly in USR-001 expected result — key distinction from owner portal"

patterns-established:
  - "TC-SA-{AREA}-NNN: SysAdmin portal test ID prefix scheme (AUTH, DASH, TEN, SUP, BILL, USR)"
  - "Smoke tests at top of each file — 7 critical-path tests run first"
  - "Negative test cases present in every section covering invalid input, unauthorized access, illegal state transitions"

# Metrics
duration: 3min
completed: 2026-03-13
---

# Phase 26 Plan 01: SysAdmin QA Test Scripts Summary

**56 manual QA test cases covering SysAdmin auth (ADMIN_SECRET_KEY), tenant CRUD with status lifecycle, cross-tenant support queue, full billing invoice lifecycle (DRAFT/SENT/PAID/VOID), and cross-tenant user management**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-13T16:40:21Z
- **Completed:** 2026-03-13T16:43:26Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Wrote `docs/qa/sysadmin-tests.md` with 56 test cases across 6 feature sections
- Documented the unique ADMIN_SECRET_KEY auth mechanism (separate from Clerk-based owner/driver login)
- Covered all SysAdmin invoice status transitions: DRAFT → SENT → PAID, DRAFT → VOID, SENT → VOID, and negative cases (cannot void PAID, cannot edit SENT)
- Included cross-tenant user management section (TC-SA-USR-001 through 005) explicitly verifying ALL-tenant scope
- Smoke test section at top with 7 critical-path tests to run first

## Task Commits

Each task was committed atomically:

1. **Task 1: Write sysadmin-tests.md** - `6c75751` (feat)

## Files Created/Modified
- `docs/qa/sysadmin-tests.md` — 56 SysAdmin portal QA test cases: auth, dashboard, tenant management, support tickets, billing/invoicing, user management

## Decisions Made
- Test preconditions specify HOW to achieve required state (not just "a tenant exists") — testers can be completely self-sufficient
- ADMIN_SECRET_KEY documentation placed in the intro paragraph so testers see it before attempting any test
- Invoice number format documented as `SINV-XXXX` so testers know what to look for when verifying creation
- Email warning toast on invoice send is documented as expected behavior (not a failure) per actual server action behavior
- Recurring invoice test marked "N/A if toggle not present" to handle UI variance gracefully

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Plan 01 complete: `docs/qa/sysadmin-tests.md` ready for use by QA testers
- Plan 02 (owner-tests.md) can begin immediately — no dependencies on Plan 01 output
- Plan 03 (driver-tests.md + README.md) can also begin — all plans in Phase 26 are independent

## Self-Check: PASSED

- `docs/qa/sysadmin-tests.md` — FOUND
- `.planning/phases/26-qa-test-scripts/26-01-SUMMARY.md` — FOUND
- Commit `6c75751` — FOUND

---
*Phase: 26-qa-test-scripts*
*Completed: 2026-03-13*
