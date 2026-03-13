# Owner Portal — QA Test Scripts

This document contains manual QA test scripts for the **Owner/Manager portal** of DriveCommand. A QA tester can follow these steps independently to verify every Owner portal feature without reading any source code.

**How to use this document:**
- Log in at `/sign-in` using an account with role `OWNER` or `MANAGER`.
- Each test case lists exact preconditions, numbered steps with field names and values, and the expected observable outcome.
- Mark **Pass** or **Fail** by checking the box after completing each test.
- If a smoke test fails, stop and file a bug before continuing to detailed sections.
- For environment setup (creating test accounts, seeding data, resetting state), refer to `docs/qa/README.md`.

**Test ID format:** `TC-OW-{AREA}-{NNN}`

---

## Smoke Tests (Run First)

Run these 9 tests before anything else. If any fail, stop and file a bug.

| Test ID | Description |
|---------|-------------|
| TC-OW-AUTH-001 | Owner login with valid email and password |
| TC-OW-DASH-001 | Dashboard loads with fleet summary cards |
| TC-OW-TRK-003 | Create truck — happy path |
| TC-OW-DRV-003 | Invite driver via email |
| TC-OW-LOD-003 | Create load — happy path |
| TC-OW-LOD-006 | Dispatch load (PENDING → DISPATCHED) |
| TC-OW-LOD-009 | Advance load status: IN_TRANSIT → DELIVERED |
| TC-OW-CRM-002 | Create customer — happy path |
| TC-OW-SUP-002 | Create support ticket |

---

## Section 1: Authentication & Onboarding (TC-OW-AUTH-xxx)

### TC-OW-AUTH-001: Login as Owner with email and password

**Preconditions:**
- An account with role `OWNER` exists (created via tenant onboarding or test seed).
- The owner's email and password are known.

**Steps:**
1. Navigate to `/sign-in`.
2. Enter the owner's email in the **Email** field (e.g., `owner@testfleet.com`).
3. Enter the correct password in the **Password** field.
4. Click **Sign In**.

**Expected Result:**
- Redirected to `/dashboard`.
- Owner sidebar is visible with navigation items: Dashboard, Trucks, Drivers, Routes, Loads, Invoices, Payroll, CRM, Compliance, Settings, etc.
- User avatar or name appears in the navigation header.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-AUTH-002: Login as Manager role

**Preconditions:**
- An account with role `MANAGER` exists under the same tenant.
- The manager's email and password are known.

**Steps:**
1. Navigate to `/sign-in`.
2. Enter the manager's email in the **Email** field.
3. Enter the correct password in the **Password** field.
4. Click **Sign In**.

**Expected Result:**
- Redirected to `/dashboard`.
- Manager sees the same sidebar and feature set as an Owner.
- No error message is shown.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-AUTH-003: Login with wrong password

**Preconditions:**
- A valid owner email is known.

**Steps:**
1. Navigate to `/sign-in`.
2. Enter the valid owner email in the **Email** field.
3. Enter an incorrect password (e.g., `wrongpassword123`) in the **Password** field.
4. Click **Sign In**.

**Expected Result:**
- An error message is displayed (e.g., "Invalid email or password" or "Incorrect credentials").
- The user remains on `/sign-in` — no redirect occurs.
- No session cookie is created.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-AUTH-004: DRIVER cannot access owner path /dashboard

**Preconditions:**
- An account with role `DRIVER` exists (use the test driver account from seed data or invite a driver per TC-OW-DRV-003).
- The driver's email and password are known.

**Steps:**
1. Log in at `/sign-in` using the driver's credentials.
2. After logging in, manually navigate to `/dashboard` in the browser address bar.

**Expected Result:**
- The browser is redirected to `/my-route`.
- The owner dashboard is NOT shown.
- No error page is displayed.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-AUTH-005: DRIVER cannot access /trucks

**Preconditions:**
- A DRIVER-role session is active (same as TC-OW-AUTH-004).

**Steps:**
1. While logged in as a DRIVER, manually navigate to `/trucks` in the browser address bar.

**Expected Result:**
- The browser is redirected to `/my-route`.
- The trucks list is NOT shown.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-AUTH-006: New owner completes onboarding

**Preconditions:**
- A fresh owner account exists with no associated tenant (account created but onboarding not yet completed).
- Log in with this account's credentials.

**Steps:**
1. Log in at `/sign-in` with the fresh owner account credentials.
2. Observe the redirect destination.
3. On the onboarding form, fill in: Company Name = `Test Fleet LLC`, any required fields.
4. Click **Complete Setup** (or equivalent submit button).

**Expected Result:**
- After login, the browser automatically redirects to `/onboarding`.
- The onboarding form is visible and accepts input.
- After submission, the browser redirects to `/dashboard`.
- The dashboard shows the new company name.

**Pass** [ ] **Fail** [ ]

---

## Section 2: Dashboard (TC-OW-DASH-xxx)

### TC-OW-DASH-001: Dashboard loads with fleet summary cards

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one truck, driver, and load exist in the tenant.

**Steps:**
1. Navigate to `/dashboard`.

**Expected Result:**
- Page loads without error.
- Metric cards are visible showing fleet summary data (e.g., Active Trucks, Active Drivers, Loads This Month, Revenue).
- No broken layout or "undefined" text in any card.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-DASH-002: Dashboard quick-action links navigate correctly

**Preconditions:**
- Logged in as OWNER or MANAGER.
- Dashboard is visible at `/dashboard`.

**Steps:**
1. Navigate to `/dashboard`.
2. Click the **Add Truck** quick-action link or button (if present).
3. Navigate back to `/dashboard`.
4. Click the **Add Driver** quick-action link or button (if present).
5. Navigate back to `/dashboard`.
6. Click the **Create Load** quick-action link or button (if present).

**Expected Result:**
- Clicking **Add Truck** navigates to `/trucks/new`.
- Clicking **Add Driver** navigates to `/drivers/invite` or `/drivers/new`.
- Clicking **Create Load** navigates to `/loads/new`.
- No 404 errors occur.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-DASH-003: Dashboard shows empty state with no data

**Preconditions:**
- Logged in as OWNER on a fresh tenant with no trucks, drivers, routes, or loads created yet.

**Steps:**
1. Navigate to `/dashboard`.

**Expected Result:**
- Dashboard loads without errors.
- Metric cards show `0` values or empty state messaging.
- No broken UI, null errors, or missing data placeholders visible.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-DASH-004: Live map link navigates to /live-map

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/dashboard`.
2. Click any link or button labeled **Live Map** or navigate to `/live-map` directly.

**Expected Result:**
- Browser navigates to `/live-map`.
- Map renders without error.

**Pass** [ ] **Fail** [ ]

---

## Section 3: Trucks (TC-OW-TRK-xxx)

### TC-OW-TRK-001: View truck list (populated)

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one truck exists in the tenant (create one per TC-OW-TRK-003 if needed).

**Steps:**
1. Navigate to `/trucks`.

**Expected Result:**
- Page loads without error.
- Truck list displays rows or cards showing at minimum: Make, Model, Year, License Plate, and Status for each truck.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-TRK-002: View truck list (empty state)

**Preconditions:**
- Logged in as OWNER on a fresh tenant with no trucks created.

**Steps:**
1. Navigate to `/trucks`.

**Expected Result:**
- Page loads without error.
- An empty state message is visible (e.g., "No trucks yet" or "Add your first truck").
- A prompt or button to add a truck is present.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-TRK-003: Create truck — happy path

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/trucks/new`.
2. Enter **Make**: `Freightliner`.
3. Enter **Model**: `Cascadia`.
4. Enter **Year**: `2022`.
5. Enter **License Plate**: `TX-12345`.
6. Enter **VIN**: `1FUJGHDV3CLBP8765` (17-character string).
7. Enter **Odometer**: `50000`.
8. Click **Create Truck** (or equivalent submit button).

**Expected Result:**
- Browser redirects to `/trucks`.
- The new truck (Freightliner Cascadia 2022, TX-12345) appears in the truck list.
- No error message is shown.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-TRK-004: Create truck — missing required field (Make)

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/trucks/new`.
2. Leave the **Make** field blank.
3. Fill in all other required fields (Model = `Kenworth`, Year = `2021`, License Plate = `TX-99999`).
4. Click **Create Truck**.

**Expected Result:**
- Form does not submit.
- A validation error is displayed on or near the **Make** field (e.g., "Make is required").
- The browser remains on `/trucks/new`.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-TRK-005: Edit truck

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one truck exists (created per TC-OW-TRK-003).

**Steps:**
1. Navigate to `/trucks`.
2. Click the truck named **Freightliner Cascadia** (or any existing truck).
3. Click the **Edit** button on the truck detail page.
4. Change the **Odometer** field value to `55000`.
5. Click **Save** (or equivalent submit button).

**Expected Result:**
- Browser returns to the truck detail page.
- The odometer now shows `55000`.
- No error message is displayed.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-TRK-006: View truck detail page

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one truck exists.

**Steps:**
1. Navigate to `/trucks`.
2. Click a truck name or row to open the truck detail.

**Expected Result:**
- Browser navigates to `/trucks/[id]`.
- All truck fields are visible: Make, Model, Year, License Plate, VIN, Odometer, Status.
- A **Maintenance** section or link is visible.
- No missing sections or error states.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-TRK-007: Log maintenance event

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A truck exists (from TC-OW-TRK-003).

**Steps:**
1. Navigate to the truck detail page at `/trucks/[id]` for any existing truck.
2. Click the **Maintenance** link or navigate to `/trucks/[id]/maintenance`.
3. Click **Log Event** (or equivalent button).
4. Fill in: **Type** = `Oil Change`, **Date** = today's date, **Notes** = `Routine service`.
5. Click **Save**.

**Expected Result:**
- The new maintenance event appears in the maintenance history list.
- Event shows Type: Oil Change, the entered date, and the note "Routine service".

**Pass** [ ] **Fail** [ ]

---

### TC-OW-TRK-008: Schedule service

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A truck exists.

**Steps:**
1. Navigate to the truck maintenance page at `/trucks/[id]/maintenance`.
2. Click **Schedule Service** (or equivalent button).
3. Fill in: **Type** = `Tire Rotation`, **Due Date** = 30 days from today.
4. Click **Save**.

**Expected Result:**
- The scheduled service appears in the upcoming/scheduled services list.
- Shows Type: Tire Rotation and the selected due date.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-TRK-009: Truck maintenance — overdue service indicator

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A scheduled service exists on a truck with a **Due Date** set in the past (create per TC-OW-TRK-008, then edit the date to a past date, or create a new one with a past date).

**Steps:**
1. Navigate to the truck maintenance page at `/trucks/[id]/maintenance`.
2. Observe the scheduled service with the past due date.

**Expected Result:**
- The overdue item has a visual indicator (e.g., red badge, "Overdue" label, warning icon) distinguishing it from upcoming services.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-TRK-010: Assign tag to truck

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one tag exists (create per TC-OW-FIN-008 if needed).
- A truck exists.

**Steps:**
1. Navigate to `/trucks/[id]` for any existing truck.
2. Locate the tags section or an **Assign Tag** control.
3. Select or assign the `Region-West` tag (or any existing tag).
4. Save or confirm the assignment.

**Expected Result:**
- The tag label appears on the truck detail page.
- If tags are assigned via `/tags`, the truck appears in that tag's assignments.

**Pass** [ ] **Fail** [ ]

---

## Section 4: Drivers (TC-OW-DRV-xxx)

### TC-OW-DRV-001: View driver list (populated)

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one driver exists in the tenant.

**Steps:**
1. Navigate to `/drivers`.

**Expected Result:**
- Driver list loads without error.
- Each driver row or card shows: Name, Role (DRIVER), Status (Active/Inactive).

**Pass** [ ] **Fail** [ ]

---

### TC-OW-DRV-002: View driver list (empty state)

**Preconditions:**
- Logged in as OWNER on a fresh tenant with no drivers invited yet.

**Steps:**
1. Navigate to `/drivers`.

**Expected Result:**
- Page loads without error.
- An empty state message is visible (e.g., "No drivers yet" or "Invite your first driver").
- A prompt or button to invite a driver is present.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-DRV-003: Invite driver via email

**Preconditions:**
- Logged in as OWNER or MANAGER.
- The email `driver@testfleet.com` does not already exist as a user in this tenant.

**Steps:**
1. Navigate to `/drivers/invite`.
2. Enter **Email**: `driver@testfleet.com`.
3. Click **Send Invitation** (or equivalent submit button).

**Expected Result:**
- A confirmation message appears (e.g., "Invitation sent to driver@testfleet.com").
- The driver appears in the `/drivers` list with a Pending status or the email is shown as invited.
- No error message is displayed.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-DRV-004: Invite driver — duplicate email

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A driver with email `driver@testfleet.com` already exists in the tenant (created per TC-OW-DRV-003).

**Steps:**
1. Navigate to `/drivers/invite`.
2. Enter **Email**: `driver@testfleet.com` (same email that already exists).
3. Click **Send Invitation**.

**Expected Result:**
- An error message is displayed (e.g., "User already exists", "Driver already invited", or similar).
- No duplicate invitation is sent.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-DRV-005: View driver detail

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one driver exists and has accepted their invitation (active driver).

**Steps:**
1. Navigate to `/drivers`.
2. Click a driver's name or row.

**Expected Result:**
- Browser navigates to `/drivers/[id]`.
- Profile information is visible (name, email, role, status).
- A documents section is present (may be empty if no documents uploaded).
- No 404 or error state.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-DRV-006: Edit driver info

**Preconditions:**
- Logged in as OWNER or MANAGER.
- An active driver exists.

**Steps:**
1. Navigate to `/drivers/[id]` for any active driver.
2. Click the **Edit** button.
3. Change the **Phone** field to `214-555-9999`.
4. Click **Save**.

**Expected Result:**
- Browser returns to the driver detail page.
- The phone number now shows `214-555-9999`.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-DRV-007: Driver documents section shows uploaded docs

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A driver exists who has at least one document uploaded (upload a document via the driver detail page if needed).

**Steps:**
1. Navigate to `/drivers/[id]` for a driver that has documents.
2. Locate the **Documents** section.

**Expected Result:**
- The documents section shows at least one file with its name and a download link or button.
- Clicking the download link initiates a file download (or opens the document).

**Pass** [ ] **Fail** [ ]

---

### TC-OW-DRV-008: Deactivate driver

**Preconditions:**
- Logged in as OWNER or MANAGER.
- An active driver exists.

**Steps:**
1. Navigate to `/drivers/[id]/edit` for an active driver.
2. Locate the **Status** or **Active** toggle/field.
3. Change the status to `Inactive` (or toggle Active to off).
4. Click **Save**.

**Expected Result:**
- The driver list at `/drivers` shows the driver with an Inactive status badge.
- If the driver attempts to log in, access should be denied or result in an error.

**Pass** [ ] **Fail** [ ]

---

## Section 5: Routes (TC-OW-RTE-xxx)

### TC-OW-RTE-001: View route list (populated)

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one route exists.

**Steps:**
1. Navigate to `/routes`.

**Expected Result:**
- Route list loads without error.
- Each route shows: Origin, Destination, Status, Scheduled Date.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-RTE-002: Create route — happy path

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one truck (from TC-OW-TRK-003) and one driver (from TC-OW-DRV-003, accepted invitation) exist.

**Steps:**
1. Navigate to `/routes/new`.
2. Enter **Origin**: `Chicago, IL`.
3. Enter **Destination**: `Dallas, TX`.
4. Set **Scheduled Date** to next week's date.
5. Select a **Truck** from the dropdown (e.g., Freightliner Cascadia).
6. Select a **Driver** from the dropdown.
7. Click **Create Route**.

**Expected Result:**
- Browser redirects to `/routes`.
- The new route (Chicago, IL → Dallas, TX) appears in the list with status `PLANNED` or `PENDING`.
- No error message is displayed.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-RTE-003: Create route — missing required fields

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/routes/new`.
2. Fill in **Origin**: `Chicago, IL`.
3. Leave the **Destination** field blank.
4. Click **Create Route**.

**Expected Result:**
- Form does not submit.
- A validation error is displayed on or near the **Destination** field (e.g., "Destination is required").
- Browser remains on `/routes/new`.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-RTE-004: View route detail

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one route exists (from TC-OW-RTE-002).

**Steps:**
1. Navigate to `/routes`.
2. Click the route for Chicago, IL → Dallas, TX (or any existing route).

**Expected Result:**
- Browser navigates to `/routes/[id]`.
- Full route details are visible: Origin, Destination, Status, Scheduled Date, Assigned Truck, Assigned Driver.
- A Documents section is present (may be empty).
- A financial summary section is present (may show $0 values).

**Pass** [ ] **Fail** [ ]

---

### TC-OW-RTE-005: Edit route while PLANNED/PENDING

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A route in `PLANNED` or `PENDING` status exists.

**Steps:**
1. Navigate to `/routes/[id]` for a PLANNED route.
2. Click the **Edit** button.
3. Change the **Destination** to `Houston, TX`.
4. Click **Save**.

**Expected Result:**
- Browser returns to the route detail page.
- The destination now shows `Houston, TX`.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-RTE-006: Add multi-stop route

**Preconditions:**
- Logged in as OWNER or MANAGER.
- Multi-stop feature is visible in the route creation form.

**Steps:**
1. Navigate to `/routes/new`.
2. Fill in **Origin**: `Chicago, IL` and **Destination**: `Dallas, TX`.
3. Locate the **Add Stop** button and click it.
4. Enter an intermediate stop (e.g., `St. Louis, MO`).
5. Click **Add Stop** again and enter a second stop: `Memphis, TN`.
6. Click **Create Route**.

**Expected Result:**
- Route detail page at `/routes/[id]` shows the stops in order: Chicago, IL → St. Louis, MO → Memphis, TN → Dallas, TX.
- If multi-stop UI is not present, note this test as N/A.

**Pass** [ ] **Fail** [ ] **N/A** [ ]

---

### TC-OW-RTE-007: Add expense to route

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A route exists (from TC-OW-RTE-002).

**Steps:**
1. Navigate to `/routes/[id]` for any route.
2. Locate the **Add Expense** button in the financials section and click it.
3. Select **Category**: `Fuel`.
4. Enter **Amount**: `250.00`.
5. Set **Date** to today's date.
6. Click **Save**.

**Expected Result:**
- The expense appears in the route financials section showing Category: Fuel, Amount: $250.00.
- If the route has a rate set, a cost-per-mile value recalculates.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-RTE-008: Route financial summary

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A route exists with a rate/revenue value and at least one expense added (per TC-OW-RTE-007).

**Steps:**
1. Navigate to `/routes/[id]` for a route with both revenue and expenses.
2. Locate the financial summary section.

**Expected Result:**
- The section shows: Revenue (or Rate), Total Expenses, Profit, and Cost Per Mile.
- Values are calculated correctly (e.g., Revenue $1000, Expenses $250 = Profit $750).

**Pass** [ ] **Fail** [ ]

---

## Section 6: Loads & Dispatch (TC-OW-LOD-xxx)

This is the most critical section. The load dispatch lifecycle (PENDING → DISPATCHED → PICKED_UP → IN_TRANSIT → DELIVERED → INVOICED) is the core workflow of DriveCommand.

### TC-OW-LOD-001: View loads list (populated)

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one load exists.

**Steps:**
1. Navigate to `/loads`.

**Expected Result:**
- Loads table loads without error.
- Columns visible: Load #, Customer, Origin, Destination, Status, Pickup Date, Rate.
- Each row shows a load entry.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-LOD-002: View loads list (empty state)

**Preconditions:**
- Logged in as OWNER on a fresh tenant with no loads created.

**Steps:**
1. Navigate to `/loads`.

**Expected Result:**
- Page loads without error.
- Empty state message is visible (e.g., "No loads yet" or "Create your first load").
- A button or prompt to create a load is present.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-LOD-003: Create load — happy path

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one active CRM customer exists (create per TC-OW-CRM-002 if needed).

**Steps:**
1. Navigate to `/loads/new`.
2. Select **Customer** from the dropdown (e.g., `Apex Freight Solutions`).
3. Enter **Origin**: `Memphis, TN`.
4. Enter **Destination**: `Atlanta, GA`.
5. Set **Pickup Date** to next Monday's date.
6. Enter **Rate**: `1500.00`.
7. Enter **Weight**: `22000`.
8. Enter **Commodity**: `Automotive Parts`.
9. Click **Create Load**.

**Expected Result:**
- Browser redirects to `/loads`.
- The new load (Memphis, TN → Atlanta, GA) appears in the list with status `PENDING`.
- A Load # is automatically assigned (e.g., `1001` or auto-incremented).

**Pass** [ ] **Fail** [ ]

---

### TC-OW-LOD-004: Create load — no customers exist

**Preconditions:**
- Logged in as OWNER on a fresh tenant with no CRM customers created.

**Steps:**
1. Navigate to `/loads/new`.
2. Click on the **Customer** dropdown or field.

**Expected Result:**
- The dropdown shows an empty state (e.g., "No customers yet") or a message with a link to `/crm/new`.
- The form does not crash or throw an error.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-LOD-005: Create load — missing required fields

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A CRM customer exists.

**Steps:**
1. Navigate to `/loads/new`.
2. Select a **Customer**.
3. Leave the **Origin** field blank.
4. Fill all other required fields.
5. Click **Create Load**.

**Expected Result:**
- Form does not submit.
- Validation error is displayed on or near the **Origin** field (e.g., "Origin is required").
- Browser remains on `/loads/new`.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-LOD-006: Dispatch load (PENDING → DISPATCHED)

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A load in `PENDING` status exists (created per TC-OW-LOD-003).
- At least one active truck and one active driver exist.

**Steps:**
1. Navigate to `/loads/[id]` for the PENDING load.
2. Click the **Dispatch** button.
3. In the dispatch modal, select a **Driver** from the dropdown.
4. Select a **Truck** from the dropdown.
5. Click **Confirm Dispatch** (or equivalent button).

**Expected Result:**
- The status badge on the load detail page changes to `DISPATCHED`.
- An Assignment card or section shows the selected Driver and Truck.
- The **Dispatch** button is replaced by status-advance buttons (e.g., "Mark Picked Up").

**Pass** [ ] **Fail** [ ]

---

### TC-OW-LOD-007: Advance load status: DISPATCHED → PICKED_UP

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A load in `DISPATCHED` status exists (from TC-OW-LOD-006).

**Steps:**
1. Navigate to `/loads/[id]` for the DISPATCHED load.
2. Click **Mark Picked Up** (or equivalent status-advance button).

**Expected Result:**
- The status badge changes to `PICKED_UP`.
- No error message is displayed.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-LOD-008: Advance load status: PICKED_UP → IN_TRANSIT

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A load in `PICKED_UP` status exists (from TC-OW-LOD-007).

**Steps:**
1. Navigate to `/loads/[id]` for the PICKED_UP load.
2. Click **Mark In Transit** (or equivalent status-advance button).

**Expected Result:**
- The status badge changes to `IN_TRANSIT`.
- No error message is displayed.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-LOD-009: Advance load status: IN_TRANSIT → DELIVERED

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A load in `IN_TRANSIT` status exists (from TC-OW-LOD-008).

**Steps:**
1. Navigate to `/loads/[id]` for the IN_TRANSIT load.
2. Click **Mark Delivered** (or equivalent status-advance button).

**Expected Result:**
- The status badge changes to `DELIVERED`.
- No error message is displayed.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-LOD-010: Advance load status: DELIVERED → INVOICED

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A load in `DELIVERED` status exists (from TC-OW-LOD-009).

**Steps:**
1. Navigate to `/loads/[id]` for the DELIVERED load.
2. Click **Mark Invoiced** (or equivalent status-advance button).

**Expected Result:**
- The status badge changes to `INVOICED`.
- The **Edit** button is no longer displayed (load is finalized).
- No error message is displayed.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-LOD-011: Download rate confirmation PDF

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A load in `DISPATCHED` status or later exists.

**Steps:**
1. Navigate to `/loads/[id]` for a DISPATCHED (or later) load.
2. Click the **Rate Confirmation** button (or equivalent PDF download button).

**Expected Result:**
- A PDF file downloads or opens in a new browser tab.
- The PDF contains the load details: Load #, Customer, Origin, Destination, Rate, Driver, Truck.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-LOD-012: Copy tracking link

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A load with a `trackingToken` exists (dispatched loads typically have a tracking token).

**Steps:**
1. Navigate to `/loads/[id]` for a dispatched load.
2. Click **Copy Tracking Link** (or equivalent button).
3. Open a private/incognito browser window and paste the copied URL.

**Expected Result:**
- A toast or confirmation message appears (e.g., "Copied!") after clicking the button.
- The URL is copied to the clipboard.
- In the private browser window, the tracking page loads showing the load's status and location (no login required).

**Pass** [ ] **Fail** [ ]

---

### TC-OW-LOD-013: Edit PENDING load

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A load in `PENDING` status exists.

**Steps:**
1. Navigate to `/loads/[id]` for a PENDING load.
2. Click the **Edit** button.
3. Change the **Rate** field to `1800.00`.
4. Click **Save**.

**Expected Result:**
- Browser returns to the load detail page.
- The rate now shows `$1,800.00`.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-LOD-014: Delete PENDING load

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A load in `PENDING` status exists (create a new one per TC-OW-LOD-003 if needed; do not delete the load being used in the dispatch lifecycle tests).

**Steps:**
1. Navigate to `/loads/[id]` for a PENDING load.
2. Click the **Delete** button.
3. Confirm the deletion in the confirmation dialog.

**Expected Result:**
- Browser redirects to `/loads`.
- The deleted load is no longer in the list.

**Pass** [ ] **Fail** [ ]

---

## Section 7: Invoices (TC-OW-INV-xxx)

These are owner-generated customer invoices (not SysAdmin invoices to tenants).

### TC-OW-INV-001: View invoice list

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one invoice exists.

**Steps:**
1. Navigate to `/invoices`.

**Expected Result:**
- Invoice list loads without error.
- Each row shows: Invoice #, Customer, Status, Total.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-INV-002: Create invoice — happy path

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one CRM customer exists (from TC-OW-CRM-002).

**Steps:**
1. Navigate to `/invoices/new`.
2. Select **Customer**: `Apex Freight Solutions` (or any existing customer).
3. Set **Issue Date** to today's date.
4. Set **Due Date** to 30 days from today.
5. Click **Add Line Item** (or equivalent).
6. Enter **Description**: `Freight Haul Memphis-Atlanta`, **Qty**: `1`, **Unit Price**: `1500.00`.
7. Click **Create** (or equivalent submit button).

**Expected Result:**
- Invoice detail page is shown with status `DRAFT`.
- Line item is visible: Description = "Freight Haul Memphis-Atlanta", Qty = 1, Unit Price = $1,500.00.
- Total shows `$1,500.00`.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-INV-003: Edit invoice in DRAFT

**Preconditions:**
- Logged in as OWNER or MANAGER.
- An invoice in `DRAFT` status exists (from TC-OW-INV-002).

**Steps:**
1. Navigate to `/invoices/[id]/edit` for a DRAFT invoice.
2. Change the line item **Description** to `Freight Haul Memphis to Atlanta (Updated)`.
3. Click **Save**.

**Expected Result:**
- Browser returns to the invoice detail page.
- The line item description shows the updated text.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-INV-004: Mark invoice as paid

**Preconditions:**
- Logged in as OWNER or MANAGER.
- An invoice in `SENT` status exists (send the DRAFT invoice first if needed — change status via the appropriate button on the detail page).

**Steps:**
1. Navigate to `/invoices/[id]` for a SENT invoice.
2. Click **Mark as Paid** (or equivalent button).

**Expected Result:**
- The invoice status badge changes to `PAID`.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-INV-005: Delete invoice in DRAFT

**Preconditions:**
- Logged in as OWNER or MANAGER.
- An invoice in `DRAFT` status exists (create a new one per TC-OW-INV-002 if needed).

**Steps:**
1. Navigate to `/invoices/[id]` for a DRAFT invoice.
2. Click **Delete**.
3. Confirm the deletion in the confirmation dialog.

**Expected Result:**
- Browser redirects to `/invoices`.
- The deleted invoice is no longer in the list.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-INV-006: Invoice with multiple line items calculates total correctly

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A CRM customer exists.

**Steps:**
1. Navigate to `/invoices/new`.
2. Select a **Customer**.
3. Set **Issue Date** and **Due Date**.
4. Add Line Item 1: Description = `Fuel Surcharge`, Qty = `1`, Unit Price = `200.00`.
5. Add Line Item 2: Description = `Detention Fee`, Qty = `1`, Unit Price = `300.00`.
6. Add Line Item 3: Description = `Freight Haul`, Qty = `1`, Unit Price = `500.00`.
7. Click **Create**.

**Expected Result:**
- Invoice detail shows all 3 line items.
- Total is `$1,000.00` ($200 + $300 + $500).

**Pass** [ ] **Fail** [ ]

---

### TC-OW-INV-007: Invoice list empty state

**Preconditions:**
- Logged in as OWNER on a fresh tenant with no invoices created.

**Steps:**
1. Navigate to `/invoices`.

**Expected Result:**
- Page loads without error.
- An empty state message is shown (e.g., "No invoices yet").

**Pass** [ ] **Fail** [ ]

---

### TC-OW-INV-008: Invoice linked to CRM customer

**Preconditions:**
- Logged in as OWNER or MANAGER.
- An invoice linked to a CRM customer exists.

**Steps:**
1. Navigate to `/invoices/[id]` for any invoice.
2. Click the customer name link on the invoice detail page.

**Expected Result:**
- Browser navigates to `/crm/[id]` for the linked customer.
- The correct customer detail page is shown.

**Pass** [ ] **Fail** [ ]

---

## Section 8: Payroll (TC-OW-PAY-xxx)

### TC-OW-PAY-001: View payroll list

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one payroll record exists.

**Steps:**
1. Navigate to `/payroll`.

**Expected Result:**
- Payroll list loads without error.
- Each row shows: Driver name, Period, Status (DRAFT/APPROVED/PAID), Amount.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-PAY-002: Create payroll record — happy path

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one active driver exists.

**Steps:**
1. Navigate to `/payroll/new`.
2. Select a **Driver** from the dropdown.
3. Set **Period Start** to the first day of the current month.
4. Set **Period End** to the last day of the current month.
5. Enter **Gross Pay**: `3500.00`.
6. Click **Create**.

**Expected Result:**
- Browser redirects or stays on the payroll record detail.
- The new payroll record appears in the list with status `DRAFT`.
- Gross Pay shows `$3,500.00`.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-PAY-003: Approve payroll (DRAFT → APPROVED)

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A payroll record in `DRAFT` status exists (from TC-OW-PAY-002).

**Steps:**
1. Navigate to `/payroll/[id]` for the DRAFT payroll record.
2. Click **Approve** (or equivalent button).

**Expected Result:**
- The payroll record status changes to `APPROVED`.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-PAY-004: Mark payroll as paid (APPROVED → PAID)

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A payroll record in `APPROVED` status exists (from TC-OW-PAY-003).

**Steps:**
1. Navigate to `/payroll/[id]` for the APPROVED payroll record.
2. Click **Mark as Paid** (or equivalent button).

**Expected Result:**
- The payroll record status changes to `PAID`.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-PAY-005: Edit payroll in DRAFT

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A payroll record in `DRAFT` status exists.

**Steps:**
1. Navigate to `/payroll/[id]/edit` for a DRAFT payroll record.
2. Change the **Gross Pay** to `4000.00`.
3. Click **Save**.

**Expected Result:**
- Gross Pay on the detail page now shows `$4,000.00`.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-PAY-006: Payroll empty state

**Preconditions:**
- Logged in as OWNER on a fresh tenant with no payroll records.

**Steps:**
1. Navigate to `/payroll`.

**Expected Result:**
- Page loads without error.
- An empty state message is shown (e.g., "No payroll records yet").

**Pass** [ ] **Fail** [ ]

---

### TC-OW-PAY-007: Payroll list shows all 3 status badge variants

**Preconditions:**
- Logged in as OWNER or MANAGER.
- Three payroll records exist in states: `DRAFT`, `APPROVED`, and `PAID` (create and advance per TC-OW-PAY-002 through TC-OW-PAY-004; create additional records as needed).

**Steps:**
1. Navigate to `/payroll`.
2. Observe the status badges in the list.

**Expected Result:**
- All three badge variants are visible: `DRAFT`, `APPROVED`, and `PAID`.
- Each badge has a distinct visual style (different color or label).

**Pass** [ ] **Fail** [ ]

---

## Section 9: CRM / Customers (TC-OW-CRM-xxx)

### TC-OW-CRM-001: View customer list

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one customer exists.

**Steps:**
1. Navigate to `/crm`.

**Expected Result:**
- Customer list loads without error.
- Each row or card shows: Company Name, Contact Name, Status.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-CRM-002: Create customer — happy path

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/crm/new`.
2. Enter **Company Name**: `Apex Freight Solutions`.
3. Enter **Contact Name**: `John Smith`.
4. Enter **Email**: `john@apexfreight.com`.
5. Enter **Phone**: `214-555-0100`.
6. Click **Create** (or equivalent submit button).

**Expected Result:**
- Browser redirects to `/crm` or the new customer detail page.
- The customer `Apex Freight Solutions` appears in the list with status `ACTIVE`.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-CRM-003: Create customer — duplicate company name (behavior check)

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A customer named `Apex Freight Solutions` already exists (from TC-OW-CRM-002).

**Steps:**
1. Navigate to `/crm/new`.
2. Enter **Company Name**: `Apex Freight Solutions` (same as existing).
3. Fill remaining required fields with different contact info.
4. Click **Create**.

**Expected Result:**
- Either: The system allows the creation (no unique constraint on company name) and the list shows two customers with the same name.
- Or: An error message appears (e.g., "Company name already exists") if a uniqueness constraint exists.
- Note the observed behavior for Pass/Fail.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-CRM-004: Edit customer

**Preconditions:**
- Logged in as OWNER or MANAGER.
- Customer `Apex Freight Solutions` exists (from TC-OW-CRM-002).

**Steps:**
1. Navigate to `/crm`.
2. Click **Apex Freight Solutions** to open the detail page at `/crm/[id]`.
3. Click **Edit**.
4. Change **Phone** to `214-555-0200`.
5. Click **Save**.

**Expected Result:**
- Customer detail page shows the updated phone number `214-555-0200`.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-CRM-005: View customer detail with associated loads

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A customer exists who is linked to at least one load (the customer selected when creating a load in TC-OW-LOD-003).

**Steps:**
1. Navigate to `/crm/[id]` for the customer linked to loads.

**Expected Result:**
- The customer detail page shows an associated loads section or load count.
- The section lists or references the loads created for that customer.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-CRM-006: Customer list empty state

**Preconditions:**
- Logged in as OWNER on a fresh tenant with no customers.

**Steps:**
1. Navigate to `/crm`.

**Expected Result:**
- Page loads without error.
- An empty state message is visible (e.g., "No customers yet" or "Add your first customer").

**Pass** [ ] **Fail** [ ]

---

### TC-OW-CRM-007: Automated customer communication or manual messaging

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A customer exists with an email address.

**Steps:**
1. Navigate to `/crm/[id]` for any customer.
2. Look for a **Send Message**, **Communication Log**, or **Add Interaction** section.
3. If found: fill in the required fields and submit.

**Expected Result:**
- If UI exists: The message or interaction is recorded in the communication log/history section of the customer detail page.
- If UI does not exist: Note "Automated communications are system-triggered; no manual messaging UI present" — this is acceptable.

**Pass** [ ] **Fail** [ ] **N/A** [ ]

---

### TC-OW-CRM-008: Set customer status to Inactive

**Preconditions:**
- Logged in as OWNER or MANAGER.
- An active customer exists.

**Steps:**
1. Navigate to `/crm/[id]/edit` for an active customer.
2. Change **Status** to `INACTIVE`.
3. Click **Save**.
4. Navigate to `/loads/new` and open the Customer dropdown.

**Expected Result:**
- The customer list at `/crm` shows the customer with an Inactive status badge.
- The inactive customer does NOT appear in the Customer dropdown on `/loads/new`.

**Pass** [ ] **Fail** [ ]

---

## Section 10: Compliance (TC-OW-COMP-xxx)

### TC-OW-COMP-001: View compliance dashboard

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/compliance`.

**Expected Result:**
- Page loads without error.
- A document expiry overview is visible for drivers and/or trucks in the tenant.
- Sections for expired documents and/or upcoming expirations are present (may show empty if no documents have expiry dates).

**Pass** [ ] **Fail** [ ]

---

### TC-OW-COMP-002: Compliance shows expired documents

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one driver or truck has a document with an **expiry date in the past** (upload a document with a past expiry date on a driver or truck detail page).

**Steps:**
1. Navigate to `/compliance`.
2. Look for the expired documents section.

**Expected Result:**
- The expired document appears in an expired/overdue section.
- The document name, associated entity (driver or truck), and expiry date are visible.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-COMP-003: Compliance shows upcoming expirations

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one driver or truck has a document with an **expiry date within the next 30 days** (upload a document with an expiry date 2 weeks from today).

**Steps:**
1. Navigate to `/compliance`.
2. Look for the upcoming expirations section.

**Expected Result:**
- The document appears in an upcoming/expiring-soon section.
- The document name, associated entity, and days until expiry are visible.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-COMP-004: Click expired item links to driver or truck

**Preconditions:**
- Logged in as OWNER or MANAGER.
- An expired document is visible on the compliance page (from TC-OW-COMP-002).

**Steps:**
1. Navigate to `/compliance`.
2. Click on an expired document row or the driver/truck name next to it.

**Expected Result:**
- Browser navigates to the driver detail page (`/drivers/[id]`) or truck detail page (`/trucks/[id]`) associated with that document.
- The document is visible on the destination page.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-COMP-005: Compliance empty state

**Preconditions:**
- Logged in as OWNER on a fresh tenant with no documents uploaded to any driver or truck.

**Steps:**
1. Navigate to `/compliance`.

**Expected Result:**
- Page loads without error.
- A clean empty state is shown (no broken UI, no null errors).
- Message indicates no documents to review or all documents are up to date.

**Pass** [ ] **Fail** [ ]

---

## Section 11: Finance & Analytics (TC-OW-FIN-xxx)

### TC-OW-FIN-001: Live Map loads

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/live-map`.

**Expected Result:**
- Page loads without error.
- A map renders with vehicle markers or location indicators.
- If no GPS data exists, an empty map renders (no crashes or missing tiles).

**Pass** [ ] **Fail** [ ]

---

### TC-OW-FIN-002: Safety analytics dashboard

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/safety`.

**Expected Result:**
- Page loads without error.
- Safety score cards are visible.
- Event breakdown (by type/severity) is visible.
- Driver rankings or driver safety scores section is present.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-FIN-003: Fuel & energy dashboard

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/fuel`.

**Expected Result:**
- Page loads without error.
- MPG trend chart or fuel cost analysis section is visible.
- Idle time breakdown section is present.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-FIN-004: Lane analytics

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/lane-analytics`.

**Expected Result:**
- Page loads without error.
- A profitability by lane/route chart or table is visible.
- If no load data exists, an empty state or zero-value chart renders cleanly.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-FIN-005: Profit predictor

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/profit-predictor`.
2. Fill in the load parameters:
   - **Origin**: `Memphis, TN`
   - **Destination**: `Atlanta, GA`
   - **Rate**: `1500`
   - **Weight**: `22000`
3. Click **Predict** (or equivalent submit button).

**Expected Result:**
- A profitability score, estimated profit, or Accept/Caution/Reject assessment is displayed.
- No error or crash occurs.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-FIN-006: IFTA report

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/ifta`.

**Expected Result:**
- Page loads without error.
- IFTA mileage and/or fuel data table is visible (may show zeros if no data entered).
- An export option (CSV or PDF) is present.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-FIN-007: Tags page loads and lists tags

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/tags`.

**Expected Result:**
- Page loads without error.
- Existing tags are listed (or an empty state is shown if no tags exist).
- A button to create a new tag is present.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-FIN-008: Create tag and assign to truck

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one truck exists.

**Steps:**
1. Navigate to `/tags`.
2. Click **New Tag** (or equivalent button).
3. Enter **Name**: `Region-West`.
4. Select **Color**: Blue (or any available color).
5. Click **Save**.
6. Navigate to `/trucks/[id]` for any truck.
7. Assign the `Region-West` tag to the truck (via tags section or dropdown).
8. Save the assignment.

**Expected Result:**
- The `Region-West` tag appears in the tags list.
- The tag label appears on the truck detail page after assignment.

**Pass** [ ] **Fail** [ ]

---

## Section 12: AI Documents (TC-OW-AID-xxx)

### TC-OW-AID-001: AI documents page loads

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/ai-documents`.

**Expected Result:**
- Page loads without error.
- A document upload area (drag-and-drop or file picker) is visible.
- A list of previously processed documents is shown (may be empty on fresh tenant).

**Pass** [ ] **Fail** [ ]

---

### TC-OW-AID-002: Upload a document for AI parsing

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A sample PDF document is available (e.g., a rate confirmation or invoice PDF from any source).

**Steps:**
1. Navigate to `/ai-documents`.
2. Click **Upload** or drag a PDF file onto the upload area.
3. Select the sample PDF file.
4. Wait for the upload to complete.

**Expected Result:**
- Upload succeeds (no error message).
- The document appears in the list with a status of "Processing" or with extracted field data displayed.
- No crash or unhandled error occurs.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-AID-003: View parsed document fields

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one document has been processed by the AI (from TC-OW-AID-002, wait for processing to complete).

**Steps:**
1. Navigate to `/ai-documents`.
2. Click on a processed document.

**Expected Result:**
- Extracted fields are shown (e.g., carrier name, rate, pickup date, delivery date, origin, destination).
- Fields may vary by document type; at minimum some structured data is extracted and displayed.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-AID-004: AI documents empty state

**Preconditions:**
- Logged in as OWNER on a fresh tenant with no documents uploaded.

**Steps:**
1. Navigate to `/ai-documents`.

**Expected Result:**
- Page loads without error.
- An empty state message is visible (e.g., "No documents yet" or "Upload your first document").

**Pass** [ ] **Fail** [ ]

---

## Section 13: Settings (TC-OW-SET-xxx)

### TC-OW-SET-001: View expense categories

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/settings/expense-categories`.

**Expected Result:**
- Page loads without error.
- A list of expense categories is visible (e.g., Fuel, Maintenance, or default categories from seed data).
- An option to add a new category is present.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-SET-002: Create expense category

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/settings/expense-categories`.
2. Click **Add Category** (or equivalent button).
3. Enter **Name**: `Tolls`.
4. Select a **Color** (any available color).
5. Click **Save**.

**Expected Result:**
- The `Tolls` category appears in the expense categories list.
- No error message is displayed.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-SET-003: View expense templates

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/settings/expense-templates`.

**Expected Result:**
- Page loads without error.
- A list of predefined expense templates is visible (may be empty on fresh tenant).
- An option to create a new template is present.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-SET-004: View integrations page

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/settings/integrations`.

**Expected Result:**
- Page loads without error.
- Integration cards or sections are visible (e.g., ELD integration, accounting software, factoring, email).
- Each integration shows its connection status (Connected/Not Connected/Available).

**Pass** [ ] **Fail** [ ]

---

### TC-OW-SET-005: Subscription page loads

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/subscription`.

**Expected Result:**
- Page loads without error.
- Current subscription plan information is visible (plan name, status).
- Upgrade or billing options are present.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-SET-006: Integrations — ELD connection UI

**Preconditions:**
- Logged in as OWNER or MANAGER.
- Integrations page is accessible (from TC-OW-SET-004).

**Steps:**
1. Navigate to `/settings/integrations`.
2. Locate the ELD integration card.
3. Click the ELD integration card or a **Configure** / **Connect** button on it.

**Expected Result:**
- A configuration form or connection modal appears.
- Fields for ELD connection details (e.g., API key, provider, device ID) are visible.
- The form does not crash or show an error on load.

**Pass** [ ] **Fail** [ ]

---

## Section 14: Support Tickets (TC-OW-SUP-xxx)

### TC-OW-SUP-001: View owner support ticket list

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/support`.

**Expected Result:**
- Page loads without error.
- Ticket list is shown with columns: Subject, Status, Created date.
- Only tickets belonging to this tenant are visible (tenant-scoped).

**Pass** [ ] **Fail** [ ]

---

### TC-OW-SUP-002: Create support ticket

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/support`.
2. Click **New Ticket** (or equivalent button).
3. Enter **Subject**: `Cannot dispatch load`.
4. Enter **Body**: `When I click Dispatch nothing happens.`.
5. Click **Submit** (or equivalent button).

**Expected Result:**
- The ticket appears in the list with status `OPEN`.
- Subject shows "Cannot dispatch load".

**Pass** [ ] **Fail** [ ]

---

### TC-OW-SUP-003: View support ticket thread

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one support ticket exists (from TC-OW-SUP-002).

**Steps:**
1. Navigate to `/support`.
2. Click the ticket "Cannot dispatch load".

**Expected Result:**
- Browser navigates to `/support/[id]`.
- The original message body ("When I click Dispatch nothing happens.") is visible.
- A reply thread area is visible (may be empty if no replies yet).

**Pass** [ ] **Fail** [ ]

---

### TC-OW-SUP-004: Owner cannot see other tenants' tickets

**Preconditions:**
- Two separate tenants exist: Tenant A and Tenant B.
- Tenant A has a support ticket with Subject "Tenant A Issue".
- Logged in as OWNER of Tenant B.

**Steps:**
1. Navigate to `/support` while logged in as Tenant B's owner.

**Expected Result:**
- Only Tenant B's tickets are visible.
- "Tenant A Issue" does NOT appear in the list.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-SUP-005: SysAdmin reply appears in owner ticket thread

**Preconditions:**
- A support ticket exists and a SysAdmin has replied to it (perform TC-SA-SUP-005 in sysadmin-tests.md first).
- Logged in as OWNER or MANAGER for the tenant that owns the ticket.

**Steps:**
1. Navigate to `/support/[id]` for the ticket that received a SysAdmin reply.

**Expected Result:**
- The SysAdmin reply is visible in the thread.
- The reply has admin attribution (labeled as "Support", "Admin", or similar — not the owner's name).

**Pass** [ ] **Fail** [ ]

---

### TC-OW-SUP-006: Support ticket empty state

**Preconditions:**
- Logged in as OWNER on a fresh tenant with no support tickets submitted.

**Steps:**
1. Navigate to `/support`.

**Expected Result:**
- Page loads without error.
- An empty state message is visible (e.g., "No tickets yet" or "Submit your first ticket").

**Pass** [ ] **Fail** [ ]

---

## Section 15: Notifications (TC-OW-NOT-xxx)

### TC-OW-NOT-001: Notifications page or panel loads

**Preconditions:**
- Logged in as OWNER or MANAGER.

**Steps:**
1. Navigate to `/notifications` directly in the browser address bar, OR click the notifications bell icon in the top navigation bar (if present).

**Expected Result:**
- The notifications page or dropdown panel loads without error.
- Either a list of notifications is displayed, or a clean empty state message is shown (e.g., "No notifications yet").
- No 404, crash, or unhandled error occurs.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-NOT-002: Notification appears after load status change (event-triggered)

**Preconditions:**
- Logged in as OWNER or MANAGER.
- An active load in `DISPATCHED` status exists and is assigned to a driver in this tenant.

**Steps:**
1. Log in as the assigned **driver** (in a separate browser or incognito window).
2. Navigate to `/my-load`.
3. Click **Mark Picked Up** to advance the load status to `PICKED_UP`.
4. Switch back to the owner browser session.
5. Navigate to `/notifications` or click the notifications bell icon.

**Expected Result:**
- A notification is present for the load status change (e.g., "Load #1042 has been picked up" or similar phrasing).
- The notification references the correct load number.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-NOT-003: Notification appears after document expiry alert

**Preconditions:**
- Logged in as OWNER or MANAGER.
- A driver or truck document exists with an expiry date within the next 30 days (or already expired). Upload a document with an expiry date of 2 weeks from today to a truck or driver if needed.

**Steps:**
1. Navigate to `/notifications` or click the notifications bell icon.

**Expected Result:**
- A compliance or document expiry notification is present referencing the expiring document (e.g., "Driver license for John Doe expires in 14 days" or "Truck inspection expires soon").
- If no notification is shown, check `/compliance` to confirm the document is recognized as expiring — note whether the system generates a notification or only shows the status on the compliance page.

**Pass** [ ] **Fail** [ ]

---

### TC-OW-NOT-004: Mark notification as read

**Preconditions:**
- Logged in as OWNER or MANAGER.
- At least one **unread** notification exists (badge count greater than 0 on the bell icon, or an unread item is visible in the notifications list — use TC-OW-NOT-002 to create one if needed).

**Steps:**
1. Navigate to `/notifications` or open the notifications panel via the bell icon.
2. Locate an unread notification (visually distinguished — e.g., bold text, highlighted background, or unread dot).
3. Click the notification itself or a **Mark as read** control adjacent to it.

**Expected Result:**
- The notification changes to a read visual state (e.g., bold text removed, background color shift to lighter/gray, or unread dot disappears).
- If a badge count was shown on the bell icon, it decrements (e.g., from 1 to 0).
- The notification remains visible in the list — it is not deleted, only marked as read.

**Pass** [ ] **Fail** [ ]

---

*Last updated: 2026-03-13*
*Portal: Owner/Manager*
*Test count: ~105 test cases across 15 sections*
*See also: [docs/qa/sysadmin-tests.md](sysadmin-tests.md) | [docs/qa/driver-tests.md](driver-tests.md) | [docs/qa/README.md](README.md)*
