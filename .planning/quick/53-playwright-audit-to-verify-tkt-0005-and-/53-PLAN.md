---
phase: quick-53
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - e2e/tkt-fixes.spec.ts
autonomous: true
must_haves:
  truths:
    - "All 8 ticket fixes are covered by Playwright assertions"
    - "Tests pass against the running dev server"
  artifacts:
    - path: "e2e/tkt-fixes.spec.ts"
      provides: "E2E test coverage for TKT-0003 through TKT-0011"
      min_lines: 100
---

<objective>
Write and run a Playwright e2e spec that verifies all recent support ticket fixes (Quick-45 through Quick-52), covering 8 tickets across dashboard, trucks, drivers, routes, and auth pages.

Purpose: Automated regression proof that 8 ticket fixes work correctly in the browser.
Output: `e2e/tkt-fixes.spec.ts` with all tests passing.
</objective>

<context>
@playwright.config.ts
@e2e/auth.setup.ts
@e2e/management-flows.spec.ts
@src/components/trucks/truck-form.tsx
@src/components/drivers/driver-invite-form.tsx
@src/components/dashboard/stat-card.tsx
@src/app/(owner)/dashboard/page.tsx
@src/components/documents/document-upload-modal.tsx
@src/components/documents/document-list.tsx
@src/components/trucks/truck-list.tsx
@src/components/drivers/driver-list.tsx
@src/components/routes/route-list.tsx
@src/components/routes/route-form.tsx
@src/app/(auth)/accept-invitation/page.tsx
@src/app/(owner)/trucks/[id]/edit/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write e2e/tkt-fixes.spec.ts covering all 8 tickets</name>
  <files>e2e/tkt-fixes.spec.ts</files>
  <action>
Create `e2e/tkt-fixes.spec.ts` following existing test patterns (import from @playwright/test, use test.describe blocks, waitForLoadState('networkidle') after navigation, auth-redirect skip guard).

Each describe block should start tests with:
```typescript
await page.goto('/path');
await page.waitForLoadState('networkidle');
if (page.url().includes('sign-in')) {
  test.skip(true, 'Authentication required');
}
```

**test.describe('TKT-0003: Accept Invitation Email Read-Only')**

Single test that is `test.skip`ped with reason: "Requires valid invitation ID in DB — verified manually. The /auth/accept-invitation page needs ?id=<uuid> param; without it, renders 'Invalid Invitation Link' and never shows the email field. Cannot automate without a DB seeding fixture."

**test.describe('TKT-0004: Dashboard 5-Card Grid')**

Test: "dashboard shows exactly 5 stat cards with correct labels"
- Navigate to /dashboard
- Wait for stat cards to load (wait for the grid container to have 5 `<a>` children — the stat cards are Link components rendered as `<a>` tags inside a `div.grid` with `lg:grid-cols-5`)
- Use: `const cardLabels = await page.locator('.grid.lg\\:grid-cols-5 a').allTextContents()`
- Assert these exact labels are present among the card text: "Active Drivers", "Active Loads", "Late Loads", "Unpaid Invoices", "Revenue / Mile"
- Assert "Total Trucks" is NOT in the page text
- Assert "Maintenance Alerts" is NOT in the page text

Test: "Late Loads card exists with danger styling"
- Navigate to /dashboard, wait for cards
- Find the card containing "Late Loads" text: `page.locator('a:has(p:text("Late Loads"))').first()`
- Assert it exists/is visible
- Check if it has the danger border class. The card uses `border-t-status-danger-foreground` when variant is 'danger' (lateLoads > 0). Since demo data may have 0 late loads, just assert the card exists. If `lateLoads > 0`, also assert the danger class. Use: `const card = page.locator('a:has(p:text("Late Loads"))').first(); await expect(card).toBeVisible();`

**test.describe('TKT-0005: Truck Form Odometer + Sticky Fields')**

Test: "odometer field accepts comma-formatted numbers without NaN"
- Navigate to /trucks/new
- Locate odometer display input: `page.locator('#odometerDisplay')`
- Type "125000" into it
- Assert displayed value is "125,000": `await expect(page.locator('#odometerDisplay')).toHaveValue('125,000')`
- Assert hidden input has raw value: `await expect(page.locator('input[name="odometer"]')).toHaveValue('125000')`
- Clear and type "999999999" to confirm no NaN: assert value becomes "999,999,999"

Test: "form fields are sticky after validation error"
- Navigate to /trucks/new
- Select year: click `#yearSearch`, type "2024", mousedown on the `li` containing "2024", wait for dropdown to close
- Fill make="TestMake" into `#make`, model="TestModel" into `#model`
- Fill odometer: type "50000" into `#odometerDisplay`
- Fill licensePlate="TESTPLATE" into `#licensePlate`
- Leave VIN EMPTY (required field — will cause validation error)
- Click submit button: `page.getByRole('button', { name: /Create Truck|Saving/i })`
- Wait for error response — either a red error div appears (`.bg-red-50`) or the VIN field gets a validation error. Wait up to 10s.
- After error, assert sticky values: `await expect(page.locator('#make')).toHaveValue('TestMake')` and `await expect(page.locator('#model')).toHaveValue('TestModel')`
- NOTE: The form remounts with `key={JSON.stringify(state.values)}` on error, so inputs get fresh defaultValues from state.values. If browser HTML5 validation catches it before server (VIN has `required`), the form won't submit. To bypass HTML5 validation on VIN, fill a VIN that is invalid format (not 17 chars): type "INVALID" into `#vin` (7 chars, fails pattern but allows submit via formAction which bypasses HTML5). Actually, since the form uses `action={formAction}` (server action), HTML5 validation IS enforced. So instead: fill ALL required fields with valid data BUT use a VIN that will fail server-side validation. Use a 17-char VIN with invalid characters like "00000000000000000" (contains only zeros, which is valid charset but might pass). Better approach: fill VIN with valid format "1FUJGBDV7CLBP8834" and just verify fields are populated after any response. If the truck gets created successfully (redirects to /trucks), then sticky fields aren't testable — skip that assertion with a note.
- SIMPLEST APPROACH: Fill all fields, submit, and check one of two outcomes:
  1. Error appears -> verify sticky fields
  2. Success redirect -> test.skip('Truck created successfully, no validation error to test sticky fields')

**test.describe('TKT-0006: VIN Read-Only on Edit Form')**

Test: "VIN field is read-only on truck edit page"
- Navigate to /trucks, wait for table
- Find first truck row and extract truck ID. Use: click the first "View" link in the actions column, or find first `<a>` with href matching `/trucks/`. Simpler: `const viewLink = page.locator('table tbody tr:first-child a:text("View")').first(); await viewLink.click();`
- Wait for truck detail page URL: `await page.waitForURL(/\/trucks\/[^/]+$/)`
- Extract truck ID from URL: `const truckId = page.url().split('/trucks/')[1]`
- Navigate to `/trucks/${truckId}/edit`
- Wait for page load
- Find VIN input: `page.locator('#vin')`
- Assert it has readOnly property: `await expect(page.locator('#vin')).toHaveAttribute('readonly', '')`
- Assert helper text visible: `await expect(page.getByText('VIN cannot be changed after creation')).toBeVisible()`

**test.describe('TKT-0007: Truck Document Upload Modal Fields')**

Test: "upload modal has name, description, link, file, and expiry date fields"
- Use the same truck detail page (navigate to /trucks, click first View, land on truck detail)
- Click "Upload Document" button: `page.getByRole('button', { name: /Upload Document/i })`
- Wait for modal dialog to appear: `page.locator('[role="dialog"]').waitFor()`
- Assert these fields are visible inside the dialog:
  - Document Name: `page.locator('#doc-name')` — visible
  - Description: `page.locator('#doc-description')` — visible
  - Online Link: `page.locator('#doc-link')` — visible
  - File Upload: `page.locator('#doc-file')` — visible
  - Expiry Date: `page.locator('#doc-expiry')` — visible

**test.describe('TKT-0008: Double-Click Row Navigation')**

Test: "double-clicking truck row navigates to truck detail"
- Navigate to /trucks, wait for table
- Check if table has rows: `const truckRows = page.locator('table tbody tr')`
- If no rows, skip
- Double-click first row: `await truckRows.first().dblclick()`
- Assert URL matches /trucks/{uuid}: `await page.waitForURL(/\/trucks\/[a-f0-9-]+$/i, { timeout: 5000 })`

Test: "double-clicking driver row navigates to driver detail"
- Navigate to /drivers, wait for page
- Check if table has rows: `const driverRows = page.locator('table tbody tr')`
- If count is 0, skip
- Double-click first row: `await driverRows.first().dblclick()`
- Assert URL matches /drivers/{uuid}: `await page.waitForURL(/\/drivers\/[a-f0-9-]+$/i, { timeout: 5000 })`

**test.describe('TKT-0009: Driver Invite Form Fields + Full Name Preview')**

Test: "invite form has all 9 fields"
- Navigate to /drivers/invite
- Assert each field is visible by ID:
  - `#email`, `#firstName`, `#lastName`, `#middleName`
  - `#dateOfBirth`, `#phoneNumber`, `#address`
  - `#licenseNumber`, `#licenseExpirationDate`
- That's 9 fields total. Assert submit button "Send Invitation" is visible.

Test: "full name preview updates live as names are typed"
- Navigate to /drivers/invite
- Type "John" into `#firstName`
- Assert text containing "John" appears in the full name preview: `await expect(page.getByText('Full name:').locator('span')).toHaveText('John')`
- Type "Michael" into `#middleName`
- Assert preview span has text "John Michael"
- Type "Doe" into `#lastName`
- Assert preview span has text "John Michael Doe"
- Clear middleName (triple-click + delete), assert preview becomes "John Doe"

**test.describe('TKT-0011: Route UX — Co-Driver Select + Short ID Badge')**

Test: "route form has co-driver multi-select section"
- Navigate to /routes/new
- Assert "Co-Drivers" text is present on the page: `page.getByText('Co-Drivers')`
- NOTE: The co-drivers section only renders when there are 2+ drivers (primary driver excluded). If only 1 driver exists, section won't appear. Make conditional: check if the section exists within 3s, if not, log and skip that assertion.
- If co-drivers section visible, verify at least one checkbox inside it: `page.locator('input[type="checkbox"]').first()`

Test: "route detail page shows short ID badge"
- Navigate to /routes
- Check if any routes exist in the table
- If routes exist, click first "View" link: `page.locator('table tbody tr:first-child a:text("View")').first().click()`
- Wait for route detail page
- Assert a short ID badge is visible matching pattern `#` + 8 hex chars: `await expect(page.locator('text=/#[a-f0-9]{8}/i').first()).toBeVisible()` — or use `page.getByText(/#[a-f0-9]{8}/i).first()`
- If no routes, skip with message
  </action>
  <verify>File exists at e2e/tkt-fixes.spec.ts with test coverage for all 8 tickets. Verify with: `wc -l e2e/tkt-fixes.spec.ts` (should be 100+ lines)</verify>
  <done>e2e/tkt-fixes.spec.ts created with test.describe blocks for TKT-0003 (skipped), TKT-0004, TKT-0005, TKT-0006, TKT-0007, TKT-0008, TKT-0009, TKT-0011</done>
</task>

<task type="auto">
  <name>Task 2: Start dev server and run Playwright tests, fix any failures</name>
  <files>e2e/tkt-fixes.spec.ts</files>
  <action>
1. Check if dev server is already running: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
2. If NOT running, start in background: `npm run dev` (use run_in_background). Wait for server to respond (poll up to 30s).
3. Run tests: `npx playwright test e2e/tkt-fixes.spec.ts --project=chromium --reporter=list`
4. If any tests fail:
   a. Read the error output carefully
   b. Determine if failure is a selector/timing issue (fix the test) or a genuine regression (report clearly)
   c. Fix and re-run until all tests pass or failures are confirmed as real regressions
5. Report final pass/fail for each test case.

Expected: Most tests should pass. The TKT-0003 test is intentionally skipped. The TKT-0005 sticky fields test may skip if no server validation error is triggered. The TKT-0011 co-driver test may skip if fewer than 2 drivers exist.
  </action>
  <verify>`npx playwright test e2e/tkt-fixes.spec.ts --project=chromium` exits 0 (all pass or expected skips)</verify>
  <done>All tests pass or are intentionally skipped with documented reasons. Console output confirms each ticket's verification status.</done>
</task>

</tasks>

<verification>
- `npx playwright test e2e/tkt-fixes.spec.ts --project=chromium` passes
- Each TKT has at least one test (TKT-0003 has a documented skip)
- No false positives — tests assert the specific fix behavior, not just page loads
</verification>

<success_criteria>
- e2e/tkt-fixes.spec.ts covers all 8 tickets with specific assertions
- Tests pass against running dev server
- TKT-0003 documented as needing DB fixture for automation
- Clear pass/fail report for every ticket
</success_criteria>
