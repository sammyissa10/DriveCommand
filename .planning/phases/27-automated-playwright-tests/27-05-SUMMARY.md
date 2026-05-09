---
phase: 27-automated-playwright-tests
plan: "05"
subsystem: testing
tags: [playwright, e2e, carrier-portal, dispatches, loads, clients, contracts]

requires:
  - phase: 27-04
    provides: carrier dashboard + fleet E2E tests, owner auth storageState

provides:
  - carrier dispatch E2E tests (list, sheet-open-via-URL-param, detail panels)
  - carrier loads E2E tests (list, new form, create happy path, edit navigation)
  - carrier clients E2E tests (list, create, edit, validation)
  - carrier contracts E2E tests (list, add button, form render, edit navigation)

affects: ["apps/web/e2e/carrier/"]

tech-stack:
  added: []
  patterns:
    - "Commodity field located via placeholder text when labels lack htmlFor"
    - "Native <select> targeted as getByRole('combobox') for non-shadcn selects"
    - "selectOption({ index: 1 }) for native selects to pick first non-placeholder option"
    - "Button text matches create-mode: 'Create Client', 'Create Load', 'Create Contract'"
    - "JS validation error text assertion ('Name is required') preferred over URL-stay check"

key-files:
  created:
    - apps/web/e2e/carrier/dispatches.spec.ts
    - apps/web/e2e/carrier/loads.spec.ts
    - apps/web/e2e/carrier/clients.spec.ts
  modified: []

key-decisions:
  - "LoadForm labels lack htmlFor — commodity field located via placeholder text 'General freight|Palletized goods'; client field via getByRole('combobox')"
  - "Button text corrected: ClientForm create='Create Client', LoadForm create='Create Load', ContractForm create='Create Contract'"
  - "Client form validation test asserts 'Name is required' error text (JS validation in ClientForm.validate()) rather than HTML5 required-attribute behavior"
  - "DispatchExpensesPanel renders both 'Expenses' and 'Driver Pay Records' headings in the same component — separate pay records test uses getByText(/Pay Records/i)"

duration: ~10min
completed: 2026-04-12
---

# Phase 27 Plan 05: Carrier Dispatches, Loads, Clients, and Contracts E2E Tests Summary

**22 Playwright tests covering carrier dispatches (sheet-open-via-?new=true, detail panels), loads (create happy path with native select handling), clients (create/validation), and contracts.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-12T00:29:43Z
- **Completed:** 2026-04-12T00:39:43Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Dispatch tests: 7 tests including the critical `?new=true` sheet-open smoke test and graceful skips for detail panels when no seed data
- Load tests: 7 tests with corrected field locators (placeholder text for commodity, combobox for client select, `selectOption({ index: 1 })` for native select)
- Client/contract tests: 8 tests including JS validation error assertion for required Name field

## Task Commits

Each task was committed atomically:

1. **Task 1: Dispatch tests** - `5342842` (feat)
2. **Task 2: Load tests and client + contract tests** - `8af2a16` (feat)

**Plan metadata:** see final commit below

## Files Created/Modified
- `apps/web/e2e/carrier/dispatches.spec.ts` - 7 tests: dispatch list, ?new=true sheet, filter toggle, detail navigation, stop timeline, expenses panel, pay records panel
- `apps/web/e2e/carrier/loads.spec.ts` - 7 tests: loads list, New Load button, new form render, client/commodity fields, create happy path, edit navigation
- `apps/web/e2e/carrier/clients.spec.ts` - 8 tests: client list/create/edit/validation + contract list/add/form render/edit

## Decisions Made
- **Commodity field via placeholder:** LoadForm renders labels without `htmlFor` so `getByLabel` doesn't work. Used `getByPlaceholder(/General freight|Palletized goods/i)` which matches the actual placeholder attribute on the commodity description input.
- **Button text corrected:** Plan spec used generic `/Save|Create|Submit/i` but actual button text in create mode is "Create Client" / "Create Load" / "Create Contract". Used exact create-mode text for precision.
- **Native select handling:** LoadForm uses a native `<select>` (not shadcn Select) for the Client dropdown. `getByRole('combobox')` targets it correctly; `selectOption({ index: 1 })` picks the first real client option.
- **Client validation test:** ClientForm.validate() sets a React state error `'Name is required'` rendered as an error `<p>` — asserting `getByText(/Name is required/i)` is more reliable than checking URL stays (Next.js router can navigate even after JS validation).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Commodity field selector corrected from getByLabel to getByPlaceholder**
- **Found during:** Task 2 (Load tests)
- **Issue:** Plan used `page.getByLabel(/Commodity/i)` but LoadForm renders `<label className={labelClass}>Commodity Description</label>` without a `htmlFor` attribute, so Playwright's getByLabel won't associate it with the input
- **Fix:** Changed to `page.getByPlaceholder(/General freight|Palletized goods/i)` which matches the actual placeholder on the input element
- **Files modified:** apps/web/e2e/carrier/loads.spec.ts

**2. [Rule 1 - Bug] Button text updated to actual create-mode values**
- **Found during:** Task 2 (Load and client tests)
- **Issue:** Plan used `/Save|Create|Submit/i` (broad) but specific button texts found in source: "Create Load" (LoadForm), "Create Client" (ClientForm), "Create Contract" (ContractForm) — being explicit avoids accidental matches
- **Fix:** Updated to use exact create-mode button names in each spec file
- **Files modified:** apps/web/e2e/carrier/loads.spec.ts, apps/web/e2e/carrier/clients.spec.ts

**3. [Rule 1 - Bug] Client list "New Client" button text confirmed (not "Add Client")**
- **Found during:** Task 2 (Client tests)
- **Issue:** Plan used `/Add Client|New Client/i` — ClientList renders "New Client" (confirmed in source)
- **Fix:** Primary selector uses `/New Client/i` as the first option (the `.or()` fallback kept for resilience)
- **Files modified:** apps/web/e2e/carrier/clients.spec.ts

---

**Total deviations:** 3 auto-fixed (all Rule 1 — selector accuracy corrections)
**Impact on plan:** All corrections make tests more reliable by using locators that actually match the DOM. No scope changes.

## Issues Encountered
None — all selector mismatches resolved inline via code review of actual component implementations.

## User Setup Required
None - no external service configuration required. Tests run against local dev server with existing auth setup from plan 27-01.

## Next Phase Readiness
- Phase 27 carrier portal coverage complete: dashboard (7), fleet (11), dispatches (7), loads (7), clients+contracts (8) = 40 carrier portal E2E tests
- Phase 27 plan 06 (if any) can build on the established `owner.json` auth + graceful skip patterns
- All 3 new spec files use identical patterns to existing carrier tests for consistency

---
*Phase: 27-automated-playwright-tests*
*Completed: 2026-04-12*
