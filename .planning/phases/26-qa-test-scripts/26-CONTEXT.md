# Phase 26: QA Test Scripts - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning
**Depends on:** Phase 25 (SysAdmin Invoicing Module)

<domain>
## Phase Boundary

Written QA test scripts — documentation that a coworker or QA tester can read and follow step-by-step to manually test every feature of the DriveCommand application. Similar format to Phase 24 (Technical Documentation) — lives in the docs directory as readable markdown files. Covers all three portals: SysAdmin, Owner/Manager, and Driver. Organized by feature with preconditions, numbered steps, and expected results for each test case.

</domain>

<decisions>
## Implementation Decisions

### Format
- Markdown files, readable in browser or IDE
- Each test case has: Test ID, Title, Preconditions, Steps (numbered), Expected Result, Pass/Fail checkbox
- Organized by portal → feature area → individual test cases

### Coverage
- SysAdmin Portal: tenant management, user management, support tickets, invoicing (Phase 25)
- Owner Portal: trucks, drivers, routes, loads, dispatch, finance, documents, maintenance, notifications, integrations
- Driver Portal: login/onboarding, load status view, document uploads, GPS tracking

### Structure (3 plans)
- Plan 1: SysAdmin portal test scripts
- Plan 2: Owner portal test scripts (loads, dispatch, finance, drivers, trucks)
- Plan 3: Driver portal test scripts + test environment setup guide (how to create test accounts, seed data, reset state)

### Output location
- `docs/qa/` directory
- One file per portal: `sysadmin-tests.md`, `owner-tests.md`, `driver-tests.md`
- Plus `README.md` explaining how to use the test scripts and set up a test environment

</decisions>

<specifics>
## Specific Ideas

- Each test script should be self-contained — tester should not need to read other docs to follow it
- Include a "smoke test" section at the top of each file — 5-10 critical tests that cover the most important flows
- Test cases should reflect real user scenarios, not just button-clicking (e.g. "Create a load, dispatch it, mark delivered, generate rate confirmation PDF")
- Include negative test cases (what happens when invalid data is entered, unauthorized access attempted, etc.)

</specifics>

<deferred>
## Deferred Ideas

- Video walkthrough recordings — defer
- Automated test runner integration — covered in Phase 27

</deferred>

---

*Phase: 26-qa-test-scripts*
*Context gathered: 2026-03-11*
