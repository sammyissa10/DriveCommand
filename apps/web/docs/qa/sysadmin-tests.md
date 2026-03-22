# SysAdmin Portal — QA Test Scripts

This document contains the complete manual QA test script for the DriveCommand SysAdmin portal. A QA tester can follow these instructions step by step to verify every SysAdmin feature without reading source code.

**How to use:** Work through each section top to bottom. Before running a full test pass, run the Smoke Tests first. If any smoke test fails, stop and file a bug before continuing. Mark each test **Pass** or **Fail** as you go.

**Login instructions:** The SysAdmin portal uses the same login page as Owner/Driver portals. Navigate to `/sign-in` and enter the sysadmin account's email and password. Access is controlled by the `isSystemAdmin` flag on the User record in the database — a sysadmin account must be created directly in the DB or via a seed script.

**Base URL:** All paths in this document are relative to the application's root URL (e.g., `http://localhost:3000` for local testing or the deployed staging URL).

---

## Smoke Tests

Run these first. If any smoke test fails, stop and file a bug before continuing.

| Test ID | Title | Section |
|---------|-------|---------|
| TC-SA-AUTH-001 | Login as sysadmin at /sign-in | Section 1: Authentication |
| TC-SA-DASH-001 | Dashboard loads with metrics cards | Section 2: Dashboard |
| TC-SA-TEN-003 | Create tenant — happy path | Section 3: Tenant Management |
| TC-SA-TEN-008 | Suspend active tenant | Section 3: Tenant Management |
| TC-SA-SUP-005 | Reply to support ticket | Section 4: Support Tickets |
| TC-SA-BILL-003 | Create invoice — happy path with line items | Section 5: Billing & Invoicing |
| TC-SA-BILL-013 | Send invoice (DRAFT → SENT) | Section 5: Billing & Invoicing |

---

## Section 1: Authentication

### TC-SA-AUTH-001: Login as sysadmin at /sign-in

**Preconditions:**
- Application is running (local or staging)
- A User record with `isSystemAdmin = true` exists in the database (created via seed script or direct DB insert)
- You have that user's email and password
- No active `session` cookie (open a private/incognito browser window to ensure clean state)

**Steps:**
1. Navigate to `/sign-in`
2. Enter the sysadmin account's email address
3. Enter the sysadmin account's password
4. Click **Sign In**

**Expected Result:**
- Redirected to `/admin-dashboard`
- Admin navigation is visible (links to Tenants, Support, Billing)
- Page shows SysAdmin dashboard content (metrics cards or welcome screen)

**Pass** [ ] **Fail** [ ]

---

### TC-SA-AUTH-002: Login with wrong password

**Preconditions:**
- Application is running
- No active `session` cookie

**Steps:**
1. Navigate to `/sign-in`
2. Enter the sysadmin email with password `wrong-password-123`
3. Click **Sign In**

**Expected Result:**
- Error message appears (e.g., "Invalid credentials" or similar)
- Stays on `/sign-in` — no redirect to dashboard
- No `session` cookie is set

**Pass** [ ] **Fail** [ ]

---

### TC-SA-AUTH-003: Logout from SysAdmin portal

**Preconditions:**
- Logged in as SysAdmin (completed TC-SA-AUTH-001)

**Steps:**
1. While on any admin page, locate and click the **Logout** button (typically in the header)

**Expected Result:**
- Redirected to `/sign-in`
- `session` cookie is cleared
- Navigating to `/admin-dashboard` redirects back to `/sign-in`

**Pass** [ ] **Fail** [ ]

---

### TC-SA-AUTH-004: Access /admin-dashboard without login

**Preconditions:**
- No active `session` cookie (use a private/incognito window or clear cookies)

**Steps:**
1. Navigate directly to `/admin-dashboard`

**Expected Result:**
- Redirected to `/sign-in`
- Admin dashboard content is not visible

**Pass** [ ] **Fail** [ ]

---

### TC-SA-AUTH-005: DRIVER role cannot access /admin portal

**Preconditions:**
- A Driver user account exists (created via owner invite flow — see Section 3 for tenant and driver creation)
- The driver account has accepted their invitation and can log in at `/sign-in`

**Steps:**
1. Log in as the Driver user at `/sign-in`
2. After successful login, navigate directly to `/admin-dashboard`

**Expected Result:**
- Redirected away from the admin area (to `/my-route` or `/unauthorized`)
- Admin UI is NOT displayed

**Pass** [ ] **Fail** [ ]

---

### TC-SA-AUTH-006: OWNER role cannot access /admin portal

**Preconditions:**
- An Owner user account exists and is logged in at `/sign-in`
- The Owner session is active (not the admin session)

**Steps:**
1. Log in as an Owner user at `/sign-in`
2. After successful login, navigate directly to `/admin-dashboard`

**Expected Result:**
- Redirected away from the admin area (to `/admin-support`, `/unauthorized`, or similar — NOT the admin dashboard)
- Admin dashboard UI is NOT displayed for the Owner user

**Pass** [ ] **Fail** [ ]

---

## Section 2: Dashboard

### TC-SA-DASH-001: Dashboard loads with metrics cards

**Preconditions:**
- Logged in as SysAdmin (completed TC-SA-AUTH-001)
- At least one tenant exists in the system

**Steps:**
1. Navigate to `/admin-dashboard`

**Expected Result:**
- Page loads without errors
- Metrics cards are visible (e.g., Total Tenants, Active Users, Open Support Tickets, or similar counts)
- Each card displays a numeric value (not blank or loading)
- Admin navigation links are present in the header/sidebar

**Pass** [ ] **Fail** [ ]

---

### TC-SA-DASH-002: Dashboard empty state (fresh environment)

**Preconditions:**
- Logged in as SysAdmin
- Testing environment with no tenants, no users beyond the admin, no support tickets

*Note: This test is only applicable in a fresh/reset environment. Skip if testing against a populated database.*

**Steps:**
1. Navigate to `/admin-dashboard`

**Expected Result:**
- Metrics cards show `0` for tenant count, user count, and ticket count (or equivalent empty indicators)
- No errors or broken UI elements

**Pass** [ ] **Fail** [ ]

---

### TC-SA-DASH-003: Dashboard navigation links work

**Preconditions:**
- Logged in as SysAdmin

**Steps:**
1. Navigate to `/admin-dashboard`
2. Click the **Tenants** navigation link (in sidebar or header)
3. Return to `/admin-dashboard`
4. Click the **Support** navigation link
5. Return to `/admin-dashboard`
6. Click the **Billing** navigation link

**Expected Result:**
- Clicking Tenants navigates to `/tenants`
- Clicking Support navigates to `/admin-support`
- Clicking Billing navigates to `/billing`
- All pages load without errors

**Pass** [ ] **Fail** [ ]

---

## Section 3: Tenant Management

### TC-SA-TEN-001: View tenant list — populated

**Preconditions:**
- Logged in as SysAdmin
- At least one tenant exists in the system

**Steps:**
1. Navigate to `/tenants`

**Expected Result:**
- Page loads showing a table or list of tenants
- Columns include: Name, Slug (or ID), Status, and Created Date (or similar)
- At least one tenant row is visible

**Pass** [ ] **Fail** [ ]

---

### TC-SA-TEN-002: View tenant list — empty state

**Preconditions:**
- Logged in as SysAdmin
- No tenants exist in the database

*Note: Only applicable in a fresh/reset environment.*

**Steps:**
1. Navigate to `/tenants`

**Expected Result:**
- Empty state message is displayed (e.g., "No tenants yet" or similar)
- No table rows are shown
- A "Create Tenant" or "New Tenant" button is still visible

**Pass** [ ] **Fail** [ ]

---

### TC-SA-TEN-003: Create tenant — happy path

**Preconditions:**
- Logged in as SysAdmin
- No tenant with slug `test-fleet-co` already exists

**Steps:**
1. Navigate to `/tenants/new`
2. Enter Name: `Test Fleet Co`
3. Enter Slug: `test-fleet-co`
4. Enter Owner Email: `owner@testfleet.com`
5. Click **Create** (or **Create Tenant**)

**Expected Result:**
- Redirected to `/tenants`
- "Test Fleet Co" appears in the tenant list with status **Active**
- Success toast or confirmation message is displayed

**Pass** [ ] **Fail** [ ]

---

### TC-SA-TEN-004: Create tenant — duplicate slug

**Preconditions:**
- Logged in as SysAdmin
- A tenant with slug `test-fleet-co` already exists (created via TC-SA-TEN-003)

**Steps:**
1. Navigate to `/tenants/new`
2. Enter Name: `Another Fleet Co`
3. Enter Slug: `test-fleet-co` (the already-existing slug)
4. Enter Owner Email: `another@fleet.com`
5. Click **Create**

**Expected Result:**
- Validation error appears (e.g., "Slug already taken", "Slug must be unique", or similar)
- Stays on `/tenants/new` — no redirect
- No new tenant is created

**Pass** [ ] **Fail** [ ]

---

### TC-SA-TEN-005: Create tenant — invalid email format

**Preconditions:**
- Logged in as SysAdmin

**Steps:**
1. Navigate to `/tenants/new`
2. Enter Name: `Email Test Co`
3. Enter Slug: `email-test-co`
4. Enter Owner Email: `notanemail` (intentionally invalid)
5. Click **Create**

**Expected Result:**
- Validation error displayed on the email field (e.g., "Invalid email address")
- Form is not submitted — stays on `/tenants/new`

**Pass** [ ] **Fail** [ ]

---

### TC-SA-TEN-006: Create tenant — invalid slug format (spaces or uppercase)

**Preconditions:**
- Logged in as SysAdmin

**Steps:**
1. Navigate to `/tenants/new`
2. Enter Name: `Bad Slug Co`
3. Enter Slug: `Bad Slug` (contains space and uppercase letters)
4. Enter Owner Email: `test@badslug.com`
5. Click **Create**

**Expected Result:**
- Validation error on Slug field (e.g., "Slug may only contain lowercase letters, numbers, and hyphens")
- Form is not submitted

**Pass** [ ] **Fail** [ ]

---

### TC-SA-TEN-007: Create tenant — missing required fields (blank Name)

**Preconditions:**
- Logged in as SysAdmin

**Steps:**
1. Navigate to `/tenants/new`
2. Leave Name blank
3. Enter Slug: `missing-name-co`
4. Enter Owner Email: `test@missing.com`
5. Click **Create**

**Expected Result:**
- Validation error on the Name field
- Form is not submitted — stays on `/tenants/new`

**Pass** [ ] **Fail** [ ]

---

### TC-SA-TEN-008: View tenant detail page

**Preconditions:**
- Logged in as SysAdmin
- "Test Fleet Co" tenant exists (created via TC-SA-TEN-003)

**Steps:**
1. Navigate to `/tenants`
2. Click on the **Test Fleet Co** tenant name or row

**Expected Result:**
- Navigated to `/tenants/[id]` for "Test Fleet Co"
- Page shows: tenant name, slug, owner email, resource counts (users, trucks, routes — may show 0 if empty)
- Tenant status badge is visible (Active or Suspended)

**Pass** [ ] **Fail** [ ]

---

### TC-SA-TEN-009: Suspend active tenant

**Preconditions:**
- Logged in as SysAdmin
- "Test Fleet Co" tenant exists with status **Active**
- On the `/tenants/[id]` detail page for "Test Fleet Co"

**Steps:**
1. On `/tenants/[id]`, locate the **Suspend** button (or status change control)
2. Click **Suspend**
3. Confirm the action if a confirmation dialog appears

**Expected Result:**
- Status badge changes from **Active** to **Suspended**
- Success toast or confirmation message shown
- The action button changes from "Suspend" to "Reactivate" (or equivalent)

**Pass** [ ] **Fail** [ ]

---

### TC-SA-TEN-010: Reactivate suspended tenant

**Preconditions:**
- Logged in as SysAdmin
- "Test Fleet Co" tenant is currently **Suspended** (from TC-SA-TEN-009)
- On `/tenants/[id]` for "Test Fleet Co"

**Steps:**
1. Click **Reactivate** (visible after suspending in TC-SA-TEN-009)
2. Confirm if a dialog appears

**Expected Result:**
- Status badge changes from **Suspended** back to **Active**
- Success toast shown
- Button reverts to "Suspend"

**Pass** [ ] **Fail** [ ]

---

### TC-SA-TEN-011: Filter tenants by status

**Preconditions:**
- Logged in as SysAdmin
- Both Active and Suspended tenants exist (suspend one via TC-SA-TEN-009 if needed)

**Steps:**
1. Navigate to `/tenants`
2. Locate the status filter control (dropdown, tabs, or filter buttons)
3. Select **Suspended** filter

**Expected Result:**
- Only Suspended tenants appear in the list
- Active tenants are hidden from view

**Steps (continued):**
4. Select **Active** filter

**Expected Result:**
- Only Active tenants appear in the list

**Pass** [ ] **Fail** [ ]

---

### TC-SA-TEN-012: Sort tenant list by name

**Preconditions:**
- Logged in as SysAdmin
- Multiple tenants exist

**Steps:**
1. Navigate to `/tenants`
2. Click the **Name** column header (if sortable)

**Expected Result:**
- Tenant list re-sorts alphabetically (A to Z) by name
- Clicking again reverses sort order (Z to A) if toggle sort is supported

**Pass** [ ] **Fail** [ ]

---

### TC-SA-TEN-013: Navigate to billing from tenant detail

**Preconditions:**
- Logged in as SysAdmin
- "Test Fleet Co" tenant exists

**Steps:**
1. Navigate to `/tenants/[id]` for "Test Fleet Co"
2. Click **Create Invoice** or the billing/invoicing link (if present on the tenant detail page)

**Expected Result:**
- Navigated to `/billing/new`
- Tenant field is pre-populated with "Test Fleet Co" (populated from the URL parameter `tenantId`)

**Pass** [ ] **Fail** [ ]

---

### TC-SA-TEN-014: Tenant detail shows correct resource counts after adding data

**Preconditions:**
- Logged in as SysAdmin
- "Test Fleet Co" tenant exists
- Log in as the owner of "Test Fleet Co" in a separate browser session and add one truck

**Steps:**
1. As owner of "Test Fleet Co", navigate to `/trucks/new` and create a truck (e.g., Make: `Ford`, Model: `F-150`, Year: `2022`, VIN: `1FTFW1ET0EKE00001`, License Plate: `TEST123`)
2. Switch back to the SysAdmin browser session
3. Navigate to `/tenants/[id]` for "Test Fleet Co"

**Expected Result:**
- Truck count on the tenant detail page reflects 1 (or incremented by 1 from before)

**Pass** [ ] **Fail** [ ]

---

### TC-SA-TEN-015: OWNER cannot access SysAdmin tenant management pages

**Preconditions:**
- Logged in as an Owner user at `/sign-in` (NOT as SysAdmin)

**Steps:**
1. Navigate to `/tenants`

**Expected Result:**
- Redirected away (to `/admin-support`, `/unauthorized`, `/dashboard`, or `/sign-in`)
- Tenant management UI is NOT accessible to the Owner role

**Pass** [ ] **Fail** [ ]

---

## Section 4: Support Tickets

### TC-SA-SUP-001: View cross-tenant support queue — populated

**Preconditions:**
- Logged in as SysAdmin
- At least one support ticket exists (submitted from any tenant's Owner portal via `/support`)

**Steps:**
1. Navigate to `/admin-support`

**Expected Result:**
- Page loads with a table or list of support tickets
- Tickets from ALL tenants are visible (not scoped to a single tenant)
- Each row shows: ticket title/subject, status, tenant name, submitter name, and created date (or similar)

**Pass** [ ] **Fail** [ ]

---

### TC-SA-SUP-002: Support queue — empty state

**Preconditions:**
- Logged in as SysAdmin
- No support tickets exist in the system

*Note: Only applicable in a fresh/reset environment.*

**Steps:**
1. Navigate to `/admin-support`

**Expected Result:**
- Empty state message is displayed (e.g., "No support tickets" or similar)
- No ticket rows shown

**Pass** [ ] **Fail** [ ]

---

### TC-SA-SUP-003: Filter support tickets by status

**Preconditions:**
- Logged in as SysAdmin
- Support tickets in multiple statuses exist (Open, In Progress, Closed)

**Steps:**
1. Navigate to `/admin-support`
2. Locate the status filter control
3. Select **Open** filter

**Expected Result:**
- Only tickets with status **Open** are shown

**Steps (continued):**
4. Select **In Progress** filter

**Expected Result:**
- Only tickets with status **In Progress** are shown

**Steps (continued):**
5. Select **Closed** filter

**Expected Result:**
- Only tickets with status **Closed** are shown

**Pass** [ ] **Fail** [ ]

---

### TC-SA-SUP-004: View support ticket detail

**Preconditions:**
- Logged in as SysAdmin
- At least one support ticket exists in the queue

**Steps:**
1. Navigate to `/admin-support`
2. Click on a ticket in the list

**Expected Result:**
- Navigated to `/admin-support/[id]`
- Page shows: ticket subject/title, full description body, submitter info (name, email), tenant name, current status badge, and created date
- Thread/message history is visible

**Pass** [ ] **Fail** [ ]

---

### TC-SA-SUP-005: Reply to support ticket

**Preconditions:**
- Logged in as SysAdmin
- On `/admin-support/[id]` for an Open ticket

**Steps:**
1. Locate the reply/response text area on the ticket detail page
2. Enter reply text: `Testing admin reply. This is a response from support.`
3. Click **Reply** (or **Send**, **Submit**)

**Expected Result:**
- Reply appears in the ticket thread immediately
- Reply is attributed to the admin (shows admin name, timestamp, or "Admin" label)
- The text entered is displayed verbatim in the thread

**Pass** [ ] **Fail** [ ]

---

### TC-SA-SUP-006: Change ticket status — Open to In Progress

**Preconditions:**
- Logged in as SysAdmin
- On `/admin-support/[id]` for an Open ticket

**Steps:**
1. Locate the status selector or status change control
2. Change status to **In Progress**
3. Save/confirm if required

**Expected Result:**
- Status badge updates to **In Progress**
- Change is persisted (reload the page and status still shows In Progress)

**Pass** [ ] **Fail** [ ]

---

### TC-SA-SUP-007: Change ticket status — In Progress to Closed

**Preconditions:**
- Logged in as SysAdmin
- On `/admin-support/[id]` for a ticket with status **In Progress** (from TC-SA-SUP-006)

**Steps:**
1. Change status to **Closed**
2. Save/confirm if required

**Expected Result:**
- Status badge updates to **Closed**
- Change is persisted on page reload

**Pass** [ ] **Fail** [ ]

---

## Section 5: Billing & Invoicing

### TC-SA-BILL-001: View billing list — populated

**Preconditions:**
- Logged in as SysAdmin
- At least one invoice exists in the system

**Steps:**
1. Navigate to `/billing`

**Expected Result:**
- Page loads with a table or list of invoices
- Columns include: Invoice Number (in `SINV-XXXX` format), Tenant Name, Status badge, Total amount, and Due Date
- Stats cards are visible showing totals (e.g., Total Outstanding, Total Paid, Overdue)

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-002: View billing list — empty state

**Preconditions:**
- Logged in as SysAdmin
- No invoices exist in the system

*Note: Only applicable in a fresh/reset environment.*

**Steps:**
1. Navigate to `/billing`

**Expected Result:**
- Empty state message is displayed (e.g., "No invoices yet")
- Stats cards show `$0` or `0` values
- A "Create Invoice" or "New Invoice" button is visible

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-003: Create invoice — happy path with single line item

**Preconditions:**
- Logged in as SysAdmin
- "Test Fleet Co" tenant exists (created via TC-SA-TEN-003)

**Steps:**
1. Navigate to `/billing/new`
2. Select Tenant: `Test Fleet Co` from the tenant dropdown
3. Set Issue Date to today's date
4. Set Due Date to 30 days from today
5. Click **Add Line Item** (or equivalent button to add a line item row)
6. Enter Description: `Monthly SaaS Fee`
7. Enter Quantity: `1`
8. Enter Unit Price: `299.00`
9. Click **Create Invoice** (or **Save**)

**Expected Result:**
- Redirected to `/billing/[id]` for the newly created invoice
- Invoice number is displayed in `SINV-XXXX` format (e.g., `SINV-0001`)
- Status badge shows **DRAFT**
- Line item "Monthly SaaS Fee" is visible with Qty=1, Unit Price=$299.00
- Total displays as `$299.00`
- Tenant shows "Test Fleet Co"

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-004: Create invoice — multiple line items with correct total

**Preconditions:**
- Logged in as SysAdmin
- "Test Fleet Co" tenant exists

**Steps:**
1. Navigate to `/billing/new`
2. Select Tenant: `Test Fleet Co`
3. Set Issue Date to today's date
4. Set Due Date to 30 days from today
5. Add first line item: Description=`Platform Fee`, Quantity=`1`, Unit Price=`200.00`
6. Click **Add Line Item** to add a second row
7. Add second line item: Description=`Setup Fee`, Quantity=`1`, Unit Price=`150.00`
8. Click **Create Invoice**

**Expected Result:**
- Invoice created with status **DRAFT**
- Both line items visible: "Platform Fee" ($200.00) and "Setup Fee" ($150.00)
- Total displays as `$350.00`

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-005: Create invoice — missing required field (no tenant selected)

**Preconditions:**
- Logged in as SysAdmin

**Steps:**
1. Navigate to `/billing/new`
2. Leave Tenant field blank (do not select a tenant)
3. Set Issue Date to today's date
4. Set Due Date to 30 days from today
5. Add one line item: Description=`Test Item`, Quantity=`1`, Unit Price=`100.00`
6. Click **Create Invoice**

**Expected Result:**
- Validation error displayed on the Tenant field (e.g., "Please select a tenant")
- Form is not submitted — stays on `/billing/new`

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-006: Create invoice — missing required field (no due date)

**Preconditions:**
- Logged in as SysAdmin
- "Test Fleet Co" tenant exists

**Steps:**
1. Navigate to `/billing/new`
2. Select Tenant: `Test Fleet Co`
3. Set Issue Date to today's date
4. Leave Due Date blank
5. Add one line item: Description=`Test Item`, Quantity=`1`, Unit Price=`100.00`
6. Click **Create Invoice**

**Expected Result:**
- Validation error on Due Date field
- Form is not submitted

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-007: Create invoice — with optional notes and billing period

**Preconditions:**
- Logged in as SysAdmin
- "Test Fleet Co" tenant exists

**Steps:**
1. Navigate to `/billing/new`
2. Select Tenant: `Test Fleet Co`
3. Set Issue Date to today's date
4. Set Due Date to 30 days from today
5. Enter Notes: `Payment due via ACH transfer. Reference invoice number.`
6. Set Billing Period Start: first day of the current month
7. Set Billing Period End: last day of the current month
8. Add one line item: Description=`Monthly Fee`, Quantity=`1`, Unit Price=`299.00`
9. Click **Create Invoice**

**Expected Result:**
- Invoice created with status **DRAFT**
- Invoice detail page shows the Notes field with entered text
- Billing period start and end dates are displayed on the invoice detail

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-008: Create invoice — tenant pre-selected via URL parameter

**Preconditions:**
- Logged in as SysAdmin
- "Test Fleet Co" tenant exists; note its tenant ID from the URL on `/tenants/[id]`

**Steps:**
1. Navigate to `/billing/new?tenantId=[valid-tenant-id]` (replace `[valid-tenant-id]` with the actual ID from the URL)

**Expected Result:**
- The `/billing/new` form loads with the Tenant dropdown already set to "Test Fleet Co"
- No manual tenant selection needed

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-009: View invoice detail

**Preconditions:**
- Logged in as SysAdmin
- At least one invoice exists (created via TC-SA-BILL-003 or later)

**Steps:**
1. Navigate to `/billing`
2. Click on an invoice in the list

**Expected Result:**
- Navigated to `/billing/[id]`
- Page shows: invoice number (`SINV-XXXX`), status badge, tenant name, issue date, due date, line items table with descriptions/quantities/prices, and grand total
- Status-appropriate action buttons are visible (e.g., Send Invoice, Edit, Void for DRAFT status)

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-010: Edit DRAFT invoice — change line item description

**Preconditions:**
- Logged in as SysAdmin
- On `/billing/[id]` for an invoice with status **DRAFT** (from TC-SA-BILL-003)

**Steps:**
1. Click **Edit** button on the invoice detail page
2. Navigated to `/billing/[id]/edit`
3. Change the Description of the first line item from `Monthly SaaS Fee` to `Monthly Platform License`
4. Click **Save** (or **Update Invoice**)

**Expected Result:**
- Redirected back to `/billing/[id]`
- First line item now shows description `Monthly Platform License`
- Invoice status remains **DRAFT**
- Total is unchanged at `$299.00`

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-011: Edit DRAFT invoice — add new line item

**Preconditions:**
- Logged in as SysAdmin
- On `/billing/[id]/edit` for a DRAFT invoice (navigate to edit from TC-SA-BILL-010 invoice)

**Steps:**
1. Navigate to `/billing/[id]/edit` for the invoice from TC-SA-BILL-003 (if not already there)
2. Click **Add Line Item**
3. Enter Description: `Support Addon`, Quantity: `1`, Unit Price: `49.00`
4. Click **Save**

**Expected Result:**
- Invoice detail shows 2 line items: original line item and "Support Addon" ($49.00)
- Total is recalculated correctly (e.g., $299.00 + $49.00 = $348.00)

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-012: Cannot edit a SENT invoice

**Preconditions:**
- Logged in as SysAdmin
- An invoice with status **SENT** exists (send an invoice via TC-SA-BILL-013 first, then return to this test)

**Steps:**
1. Navigate to `/billing/[id]` for a **SENT** invoice
2. Attempt to click **Edit** (if the button is visible)
3. OR navigate directly to `/billing/[id]/edit`

**Expected Result:**
- **Edit** button is NOT visible on the SENT invoice detail page, OR
- Navigating to `/billing/[id]/edit` redirects back or displays an error: "Cannot edit a sent invoice" (or similar)
- The invoice line items cannot be modified

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-013: Send invoice — DRAFT to SENT

**Preconditions:**
- Logged in as SysAdmin
- On `/billing/[id]` for an invoice with status **DRAFT** (use invoice from TC-SA-BILL-003 or create a new one)

**Steps:**
1. Click **Send Invoice** button on the invoice detail page
2. Confirm the action if a dialog appears

**Expected Result:**
- Status badge changes from **DRAFT** to **SENT**
- **Send Invoice** button disappears
- **Mark as Paid** button appears
- A success toast or notification is shown
- *Note: An email warning toast may appear if the email delivery fails — this is expected behavior. The status still transitions to SENT even if email fails.*

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-014: Mark invoice as paid — SENT to PAID

**Preconditions:**
- Logged in as SysAdmin
- On `/billing/[id]` for an invoice with status **SENT** (from TC-SA-BILL-013)

**Steps:**
1. Click **Mark as Paid** button

**Expected Result:**
- Status badge changes from **SENT** to **PAID**
- Status badge color is green (or a "success" color)
- **Mark as Paid** button disappears
- No further action buttons are visible for a PAID invoice (no re-pay option)

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-015: Mark overdue invoice as paid — OVERDUE to PAID

**Preconditions:**
- Logged in as SysAdmin
- An invoice exists with status **OVERDUE**

*To create an overdue state: Create a new DRAFT invoice with a Due Date in the past (e.g., yesterday), send it so it becomes SENT, then use the "Mark Overdue" batch action on `/billing` if available, OR the system should automatically display it as OVERDUE once the due date passes.*

**Steps:**
1. Navigate to `/billing/[id]` for an **OVERDUE** invoice
2. Click **Mark as Paid**

**Expected Result:**
- Status badge changes from **OVERDUE** to **PAID**
- Green/success styling applied to status badge

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-016: Void a DRAFT invoice

**Preconditions:**
- Logged in as SysAdmin
- On `/billing/[id]` for an invoice with status **DRAFT**

**Steps:**
1. Click **Void** button on the invoice detail page
2. Confirm the action if a dialog appears

**Expected Result:**
- Status badge changes to **VOID** (or **VOIDED**)
- Line items are still visible on the page (for record-keeping)
- No action buttons remain (cannot send or pay a voided invoice)

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-017: Void a SENT invoice

**Preconditions:**
- Logged in as SysAdmin
- On `/billing/[id]` for an invoice with status **SENT**

**Steps:**
1. Click **Void** button
2. Confirm if a dialog appears

**Expected Result:**
- Status badge changes to **VOID**
- No action buttons remain after voiding

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-018: Cannot void a PAID invoice

**Preconditions:**
- Logged in as SysAdmin
- On `/billing/[id]` for an invoice with status **PAID**

**Steps:**
1. Observe the action buttons on the invoice detail page for a PAID invoice

**Expected Result:**
- **Void** button is NOT visible on a PAID invoice
- No destructive action buttons are available once payment is recorded

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-019: Billing stats cards reflect correct totals

**Preconditions:**
- Logged in as SysAdmin
- Multiple invoices exist in various statuses: at least one DRAFT/SENT (outstanding), one PAID, one VOID

**Steps:**
1. Note the amounts of the invoices in each status
2. Navigate to `/billing`
3. Review the stats cards at the top of the page

**Expected Result:**
- "Total Outstanding" (or similar) card reflects the sum of SENT/OVERDUE invoice totals
- "Total Paid" (or similar) card reflects the sum of PAID invoice totals
- Voided invoices are not counted in totals
- Stat card values are numerically consistent with the invoice list

**Pass** [ ] **Fail** [ ]

---

### TC-SA-BILL-020: Create invoice with recurring flag

**Preconditions:**
- Logged in as SysAdmin
- "Test Fleet Co" tenant exists

**Steps:**
1. Navigate to `/billing/new`
2. Select Tenant: `Test Fleet Co`
3. Set Issue Date to today's date
4. Set Due Date to 30 days from today
5. Locate the **Recurring** toggle or checkbox and enable it (if present in the UI)
6. Add one line item: Description=`Monthly Recurring Fee`, Quantity=`1`, Unit Price=`299.00`
7. Click **Create Invoice**

**Expected Result:**
- Invoice created and invoice detail page shows a **Recurring** badge (purple or similar)
- Recurring indicator is visible on the `/billing` list for this invoice

*Note: If no Recurring toggle is present in the UI, skip this test and mark as N/A.*

**Pass** [ ] **Fail** [ ]

---

## Section 6: User Management

### TC-SA-USR-001: View all users list — cross-tenant

**Preconditions:**
- Logged in as SysAdmin
- Users from multiple tenants exist (create at least 2 tenants with owner users)

**Steps:**
1. Navigate to `/admin-users` (or the user management page — check SysAdmin navigation for a "Users" link)

**Expected Result:**
- Page loads with a table listing users from ALL tenants (not scoped to a single tenant)
- Columns include: Name or Email, Tenant, Role (OWNER/MANAGER/DRIVER), and Status (active/inactive)
- Users from multiple different tenants are visible in the same list

**Pass** [ ] **Fail** [ ]

---

### TC-SA-USR-002: View user detail — tenant, role, and status

**Preconditions:**
- Logged in as SysAdmin
- On the user management page with at least one user listed

**Steps:**
1. Click on a user's name or row in the user list

**Expected Result:**
- Navigated to `/admin-users/[id]` or a detail panel opens
- Page or panel shows: user email address, display name, role (OWNER, MANAGER, or DRIVER), associated tenant name, and account status (active or inactive)

**Pass** [ ] **Fail** [ ]

---

### TC-SA-USR-003: Filter users by tenant

**Preconditions:**
- Logged in as SysAdmin
- Users from multiple tenants exist (at least "Test Fleet Co" and one other tenant)

**Steps:**
1. Navigate to the user management page
2. Locate the Tenant filter control (dropdown or search)
3. Select **Test Fleet Co** from the tenant filter

**Expected Result:**
- User list narrows to display only users belonging to "Test Fleet Co"
- Users from all other tenants are hidden

**Pass** [ ] **Fail** [ ]

---

### TC-SA-USR-004: Deactivate a user

**Preconditions:**
- Logged in as SysAdmin
- An active user exists who is NOT an admin (e.g., a DRIVER or OWNER user from "Test Fleet Co")
- On `/admin-users/[id]` or the user detail view for that user

**Steps:**
1. Locate the **Deactivate** button (or Active/Inactive toggle)
2. Click **Deactivate**
3. Confirm the action if a dialog appears

**Expected Result:**
- User status badge changes to **Inactive**
- Success toast or confirmation shown
- The deactivated user can no longer log in (verify by attempting login with that user's credentials — expect an error)

**Pass** [ ] **Fail** [ ]

---

### TC-SA-USR-005: Cannot deactivate or delete a SysAdmin user (negative)

**Preconditions:**
- Logged in as SysAdmin
- On the user management page

**Steps:**
1. Locate any user that has admin-level access (or the admin account being used to log in)
2. Observe the available action buttons for that admin user

**Expected Result:**
- **Deactivate** and/or **Delete** button is either: absent for admin users, visually disabled, OR clicking it returns an error such as "Cannot deactivate admin accounts" or "This action is not permitted"
- The SysAdmin user's account remains active after the attempt

**Pass** [ ] **Fail** [ ]
