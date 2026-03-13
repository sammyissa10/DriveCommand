---
phase: 26-qa-test-scripts
plan: 02
subsystem: testing
tags: [qa, manual-testing, owner-portal, loads, dispatch, documentation]

# Dependency graph
requires:
  - phase: 26-01
    provides: sysadmin-tests.md format and test ID scheme (TC-SA-xxx) as reference pattern for TC-OW-xxx naming
provides:
  - docs/qa/owner-tests.md with 106 manual test cases covering the entire Owner/Manager portal
affects: [26-03-driver-tests, 27-playwright-e2e]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TC-OW-{AREA}-{NNN} test ID scheme for Owner portal test cases"
    - "Smoke test table (9 critical tests) at top of portal test file"
    - "Sequential precondition chaining — each lifecycle step references the prior test case ID that creates the prerequisite state"

key-files:
  created:
    - docs/qa/owner-tests.md
  modified: []

key-decisions:
  - "Smoke tests reference TC IDs rather than duplicating steps — testers jump to the full test case for exact steps"
  - "Load lifecycle tests (TC-OW-LOD-006 through TC-OW-LOD-010) are individual test cases per status transition, not one mega-test — enables targeted regression testing"
  - "Notifications section written as UI test cases (page load, event-triggered, mark-as-read) rather than email-trigger verification per plan spec"
  - "TC-OW-RTE-006 (multi-stop route) and TC-OW-CRM-007 (messaging) include N/A checkboxes for features that may not be present in all environments"

patterns-established:
  - "Pattern: Preconditions chain by referencing prior TC IDs (e.g., 'A load in DISPATCHED status exists (from TC-OW-LOD-006)') — eliminates ambiguous preconditions"
  - "Pattern: Negative test cases in every section — wrong password (AUTH), missing fields (TRK/RTE/LOD/INV/PAY), duplicate email (DRV), empty states (all list pages), access denied (AUTH)"
  - "Pattern: N/A checkbox added to tests for conditionally-present UI features"

# Metrics
duration: 5min
completed: 2026-03-13
---

# Phase 26 Plan 02: Owner Portal QA Test Scripts Summary

**106 manual test cases covering the full Owner/Manager portal across 15 sections, including the complete PENDING→DISPATCHED→PICKED_UP→IN_TRANSIT→DELIVERED→INVOICED load dispatch lifecycle and a notifications section with event-triggered and mark-as-read tests**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-13T16:45:30Z
- **Completed:** 2026-03-13T16:50:02Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments
- Created `docs/qa/owner-tests.md` with 106 test cases (exceeds ~105 target) covering all 15 Owner portal feature sections
- Smoke test table at top identifies 9 critical-path tests for fast regression verification
- Complete 6-step load dispatch lifecycle documented as individual test cases (TC-OW-LOD-006 through TC-OW-LOD-010), each with exact preconditions chaining to the previous step
- Notifications section (TC-OW-NOT-001 through TC-OW-NOT-004) covers page load, event-triggered notification from load status change, document expiry alert, and mark-as-read behavior
- DRIVER role boundary tests (TC-OW-AUTH-004, TC-OW-AUTH-005) verify unauthorized access redirects to `/my-route`
- Negative test cases present in all major sections: wrong password, missing required fields, duplicate email, empty states, inactive customer in dropdowns

## Task Commits

1. **Task 1: Write owner-tests.md** - `a155aaa` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `docs/qa/owner-tests.md` - Complete Owner portal manual QA test script, 106 test cases across 15 sections (AUTH, DASH, TRK, DRV, RTE, LOD, INV, PAY, CRM, COMP, FIN, AID, SET, SUP, NOT)

## Decisions Made
- Smoke tests reference TC IDs rather than duplicating steps — testers jump to the full test case for exact steps
- Load lifecycle tests are individual test cases per status transition (not one mega-test) to enable targeted regression testing
- Notifications section written as UI test cases per plan specification rather than email-trigger verification
- TC-OW-RTE-006 (multi-stop route) and TC-OW-CRM-007 (messaging) include N/A checkboxes for conditionally-present features
- TC-OW-CRM-003 (duplicate company name) documents behavior observation rather than prescribing a pass/fail outcome since the constraint is not confirmed

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `docs/qa/owner-tests.md` is complete and standalone
- Plan 03 (Driver portal test scripts + environment setup README) can proceed
- Phase 27 Playwright E2E tests can reference TC-OW-xxx IDs when building automated equivalents

## Self-Check

- [x] `docs/qa/owner-tests.md` exists
- [x] All 15 sections present (AUTH, DASH, TRK, DRV, RTE, LOD, INV, PAY, CRM, COMP, FIN, AID, SET, SUP, NOT)
- [x] Smoke Tests section at top
- [x] TC-OW-LOD-006 through TC-OW-LOD-010 cover DISPATCHED through INVOICED
- [x] TC-OW-NOT-001 through TC-OW-NOT-004 present
- [x] TC-OW-NOT-002 references load status change as trigger
- [x] TC-OW-NOT-004 covers mark-as-read
- [x] 106 Pass/Fail checkboxes (every test case has one)
- [x] Commit a155aaa exists

## Self-Check: PASSED

---
*Phase: 26-qa-test-scripts*
*Completed: 2026-03-13*
