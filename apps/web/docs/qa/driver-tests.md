# Driver Portal — QA Test Scripts

> **Portal:** Driver
> **Login URL:** `/sign-in` (same login page as Owner; role = DRIVER)
> **Design:** Mobile-first — test on a mobile device or using browser dev tools in mobile viewport (375px width recommended)
> **Test ID prefix:** `TC-DR-`
> **Total test cases:** ~39
> **Sections:** Auth, My Route, My Load, Documents, HOS, Incidents, Messages, Tickets, Access Boundaries, GPS Tracking

---

## Smoke Tests (Run First)

Run these 6 tests before any full section testing. If any smoke test fails, stop and investigate before continuing.

| # | Test ID | Name | Pass | Fail |
|---|---------|------|------|------|
| 1 | TC-DR-AUTH-001 | Login as driver with email and password | [ ] | [ ] |
| 2 | TC-DR-RTE-001 | View assigned route | [ ] | [ ] |
| 3 | TC-DR-LOD-004 | Advance load status DISPATCHED → PICKED_UP | [ ] | [ ] |
| 4 | TC-DR-HOS-002 | Log HOS entry — driving time | [ ] | [ ] |
| 5 | TC-DR-INC-002 | Submit incident report — happy path | [ ] | [ ] |
| 6 | TC-DR-SEC-001 | Driver blocked from /dashboard | [ ] | [ ] |

---

## Section 1: Authentication (TC-DR-AUTH-xxx)

### TC-DR-AUTH-001: Login as driver with email and password

**Preconditions:**
- A DRIVER role user exists (invited by an owner, invitation accepted, password set)
- User is NOT currently logged in

**Steps:**
1. Navigate to `/sign-in`
2. Enter the driver's email address
3. Enter the driver's password
4. Click **Sign In**

**Expected Result:**
- Redirected to `/my-route`
- Driver bottom navigation is visible with tabs: My Route, My Load, Hours, Incidents, Messages
- No owner-portal navigation visible (no sidebar with Trucks, Drivers, Routes, etc.)

**Pass** [ ] **Fail** [ ]

---

### TC-DR-AUTH-002: Login with wrong password

**Preconditions:**
- A DRIVER role user exists
- User is NOT currently logged in

**Steps:**
1. Navigate to `/sign-in`
2. Enter the driver's valid email address
3. Enter an incorrect password (e.g., `wrongpassword123`)
4. Click **Sign In**

**Expected Result:**
- Error message displayed on the page (e.g., "Invalid email or password")
- User remains on `/sign-in`
- No session created

**Pass** [ ] **Fail** [ ]

---

### TC-DR-AUTH-003: Driver root URL redirects to /my-route

**Preconditions:**
- Logged in as a DRIVER

**Steps:**
1. Navigate to `/` (root URL)
2. Observe redirect behavior

**Expected Result:**
- Redirected to `/my-route`

**Steps (variation):**
1. Navigate to `/dashboard` directly
2. Observe redirect behavior

**Expected Result:**
- Redirected to `/my-route` (driver cannot access owner dashboard)

**Pass** [ ] **Fail** [ ]

---

### TC-DR-AUTH-004: Logout

**Preconditions:**
- Logged in as a DRIVER on any driver screen

**Steps:**
1. Locate the account menu or user avatar (typically top-right corner or accessible via a settings icon in the nav)
2. Tap/click the logout or sign-out option

**Expected Result:**
- Redirected to `/sign-in`
- Session is cleared (navigating back does not restore the session)

**Pass** [ ] **Fail** [ ]

---

### TC-DR-AUTH-005: Unauthenticated access to /my-route is redirected

**Preconditions:**
- User is NOT logged in (clear cookies/session or use incognito mode)

**Steps:**
1. Navigate directly to `/my-route`

**Expected Result:**
- Redirected to `/sign-in`
- The `/my-route` page does NOT render

**Pass** [ ] **Fail** [ ]

---

## Section 2: My Route (TC-DR-RTE-xxx)

### TC-DR-RTE-001: My Route shows assigned route

**Preconditions:**
- Logged in as DRIVER
- Owner has created a route and assigned this driver to it (how to achieve: Owner → Routes → New Route → assign this driver)

**Steps:**
1. Navigate to `/my-route`

**Expected Result:**
- Route details are visible including: origin, destination, status, scheduled date
- Truck information is visible (make/model or truck number)
- Page renders without errors

**Pass** [ ] **Fail** [ ]

---

### TC-DR-RTE-002: My Route shows empty state when no route assigned

**Preconditions:**
- Logged in as DRIVER
- No route is currently assigned to this driver (or use a fresh driver account with no assignments)

**Steps:**
1. Navigate to `/my-route`

**Expected Result:**
- An empty state message is displayed (e.g., "No route assigned" or "Contact your dispatcher")
- No broken UI or JavaScript errors
- Page renders cleanly

**Pass** [ ] **Fail** [ ]

---

### TC-DR-RTE-003: Route documents section — view and download

**Preconditions:**
- Logged in as DRIVER
- Driver has an assigned route
- Owner has uploaded at least one document to the route (how to achieve: Owner → Routes → [route] → Upload Document)

**Steps:**
1. Navigate to `/my-route`
2. Scroll to the **Route Documents** section
3. Verify the document list is visible with file names and download buttons
4. Click the **Download** button (or file name link) for one document

**Expected Result:**
- Document list is visible with file names and download/view controls
- Clicking Download either starts a file download or opens the file in a new browser tab
- No upload button or file input is present in this section

**Pass** [ ] **Fail** [ ]

---

### TC-DR-RTE-004: Truck documents section — view and download

**Preconditions:**
- Logged in as DRIVER
- Driver has an assigned route with a truck
- The assigned truck has at least one document uploaded by the owner (how to achieve: Owner → Trucks → [truck] → Upload Document)

**Steps:**
1. Navigate to `/my-route`
2. Scroll to the **Truck Documents** section
3. Verify the document list is visible

**Expected Result:**
- Truck documents list is visible with file names and download buttons
- No upload button is present in this section

**Pass** [ ] **Fail** [ ]

---

### TC-DR-RTE-005: Driver CANNOT upload documents on My Route page

**Preconditions:**
- Logged in as DRIVER
- Driver has an assigned route

**Steps:**
1. Navigate to `/my-route`
2. Inspect both the Route Documents and Truck Documents sections
3. Look for any upload button, "Add Document", file input (`<input type="file">`), or drag-and-drop area

**Expected Result:**
- No upload button exists anywhere on the page
- No file picker or drag-and-drop area is visible
- Document sections show only download/view controls

**Pass** [ ] **Fail** [ ]

---

### TC-DR-RTE-006: My Route shows correct truck details

**Preconditions:**
- Logged in as DRIVER
- Driver has an assigned route with a truck that has make, model, year, license plate filled in (how to achieve: Owner → Trucks → [truck] → verify fields are populated)

**Steps:**
1. Navigate to `/my-route`
2. Locate the truck details section

**Expected Result:**
- Truck make, model, and year are visible
- License plate number is visible
- Odometer reading is visible (if available)

**Pass** [ ] **Fail** [ ]

---

## Section 3: My Load — Status Management (TC-DR-LOD-xxx)

### TC-DR-LOD-001: My Load shows active load with details

**Preconditions:**
- Logged in as DRIVER
- Owner has created a load and dispatched it to this driver (status = DISPATCHED)
- How to achieve: Owner → Loads → New Load → assign driver → change status to DISPATCHED

**Steps:**
1. Navigate to `/my-load`

**Expected Result:**
- Load number (or ID) is visible
- Origin and destination are shown
- Pickup date is shown
- Weight, commodity, and rate are shown (if populated)
- Customer name is visible
- Page renders without errors

**Pass** [ ] **Fail** [ ]

---

### TC-DR-LOD-002: My Load shows empty state when no active load

**Preconditions:**
- Logged in as DRIVER
- No load is currently assigned to this driver (or use a fresh driver account)

**Steps:**
1. Navigate to `/my-load`

**Expected Result:**
- An empty state message is displayed (e.g., "No active load assigned" or "Contact your dispatcher")
- No broken UI or JavaScript errors

**Pass** [ ] **Fail** [ ]

---

### TC-DR-LOD-003: Status timeline shows current state highlighted

**Preconditions:**
- Logged in as DRIVER
- Active load exists in **DISPATCHED** status

**Steps:**
1. Navigate to `/my-load`
2. Locate the status timeline/progress bar

**Expected Result:**
- Timeline shows 5 steps: Pending, Dispatched, Picked Up, In Transit, Delivered
- **Dispatched** step is visually highlighted as the current status (different color, bold, or indicator icon)
- Steps before Dispatched (Pending) appear as completed
- Steps after Dispatched (Picked Up, In Transit, Delivered) appear as upcoming/inactive

**Pass** [ ] **Fail** [ ]

---

### TC-DR-LOD-004: Advance load status: DISPATCHED → PICKED_UP

**Preconditions:**
- Logged in as DRIVER
- Active load in **DISPATCHED** status (from TC-DR-LOD-001)

**Steps:**
1. Navigate to `/my-load`
2. Click the **Mark as Picked Up** button (or equivalent action button)

**Expected Result:**
- Status timeline updates to highlight **PICKED_UP** as the current status
- The action button changes to **Mark In Transit** (or equivalent)
- No error message is displayed
- Change is immediate (or refreshes automatically)

**Pass** [ ] **Fail** [ ]

---

### TC-DR-LOD-005: Advance load status: PICKED_UP → IN_TRANSIT

**Preconditions:**
- Logged in as DRIVER
- Active load in **PICKED_UP** status (from TC-DR-LOD-004)

**Steps:**
1. Navigate to `/my-load`
2. Click the **Mark In Transit** button (or equivalent)

**Expected Result:**
- Status timeline updates to highlight **IN_TRANSIT** as the current status
- The action button changes to **Mark Delivered** (or equivalent)
- No error message displayed

**Pass** [ ] **Fail** [ ]

---

### TC-DR-LOD-006: Advance load status: IN_TRANSIT → DELIVERED

**Preconditions:**
- Logged in as DRIVER
- Active load in **IN_TRANSIT** status (from TC-DR-LOD-005)

**Steps:**
1. Navigate to `/my-load`
2. Click the **Mark Delivered** button (or equivalent)

**Expected Result:**
- Status timeline updates to highlight **DELIVERED** as the current status
- No further advance action button is shown (load is fully delivered)
- Completion message or updated UI state is displayed

**Pass** [ ] **Fail** [ ]

---

### TC-DR-LOD-007: Driver cannot skip status steps

**Preconditions:**
- Logged in as DRIVER
- Active load in **DISPATCHED** status

**Steps:**
1. Navigate to `/my-load`
2. Observe the available action button(s)
3. Verify that only one forward action is available (Mark as Picked Up — not Mark In Transit or Mark Delivered)

**Expected Result:**
- Only one forward action button is visible at a time
- The driver cannot skip from DISPATCHED directly to IN_TRANSIT or DELIVERED
- The UI presents only the next valid status transition

**Pass** [ ] **Fail** [ ]

---

### TC-DR-LOD-008: Status update reflected in owner portal immediately

**Preconditions:**
- Driver has advanced a load to **PICKED_UP** status (from TC-DR-LOD-004)
- Owner test credentials are available

**Steps:**
1. After advancing the load to PICKED_UP as driver, open a new browser tab (or log in as owner in incognito)
2. Log in as the owner
3. Navigate to **Loads** → click on the same load

**Expected Result:**
- The load shows status **PICKED_UP** in the owner portal
- The status change is visible without requiring any owner action

**Pass** [ ] **Fail** [ ]

---

## Section 4: Documents (TC-DR-DOC-xxx)

> **Note to tester:** The driver document experience is **VIEW/DOWNLOAD only**. Drivers cannot upload documents anywhere in the portal. All document upload functionality is restricted to the Owner portal. Do not expect any upload controls — their absence is correct behavior.

### TC-DR-DOC-001: Driver cannot access an upload form

**Preconditions:**
- Logged in as DRIVER
- Driver has an assigned route

**Steps:**
1. Navigate to `/my-route`
2. Thoroughly inspect the Route Documents section — look for: "Upload", "Add Document", "Attach File", file input fields, drag-and-drop zones
3. Inspect the Truck Documents section in the same way

**Expected Result:**
- No upload button exists anywhere on the page
- No file picker (`<input type="file">`) or drag-and-drop area is present
- Document sections display only download/view controls

**Pass** [ ] **Fail** [ ]

---

### TC-DR-DOC-002: Download a route document

**Preconditions:**
- Logged in as DRIVER
- Driver has an assigned route
- Route has at least one document attached (PDF or image)

**Steps:**
1. Navigate to `/my-route`
2. Scroll to the **Route Documents** section
3. Click the **Download** button (or file name link) for any document

**Expected Result:**
- File download begins in the browser (file saved to downloads folder), OR
- File opens in a new browser tab for viewing
- No error message is displayed
- The file matches the document name shown in the list

**Pass** [ ] **Fail** [ ]

---

### TC-DR-DOC-003: Empty documents state

**Preconditions:**
- Logged in as DRIVER
- Driver has an assigned route
- The route has **no documents** attached (how to achieve: create a route without uploading any documents)

**Steps:**
1. Navigate to `/my-route`
2. Scroll to the Route Documents section

**Expected Result:**
- An empty state message is displayed (e.g., "No documents available" or similar)
- No broken UI or JavaScript errors
- Section renders cleanly without document items

**Pass** [ ] **Fail** [ ]

---

## Section 5: Hours of Service (TC-DR-HOS-xxx)

### TC-DR-HOS-001: HOS dashboard loads

**Preconditions:**
- Logged in as DRIVER

**Steps:**
1. Navigate to `/hours`

**Expected Result:**
- HOS dashboard is visible
- Remaining hours indicators are present (e.g., driving hours remaining, on-duty hours remaining)
- Duty status information is shown
- Page renders without errors

**Pass** [ ] **Fail** [ ]

---

### TC-DR-HOS-002: Log HOS entry — driving time

**Preconditions:**
- Logged in as DRIVER
- On the `/hours` page

**Steps:**
1. Navigate to `/hours`
2. Locate the log entry form
3. Set Status to **Driving**
4. Set Duration to **4 hours** (or enter 4 in the hours field)
5. Click **Submit** (or **Log Entry**)

**Expected Result:**
- Entry is recorded successfully
- Remaining driving hours update downward (reduce by 4 hours)
- Success confirmation shown (toast or inline message)

**Pass** [ ] **Fail** [ ]

---

### TC-DR-HOS-003: Log HOS entry — off duty

**Preconditions:**
- Logged in as DRIVER
- On the `/hours` page

**Steps:**
1. Navigate to `/hours`
2. Locate the log entry form
3. Set Status to **Off Duty**
4. Set Duration to **8 hours**
5. Click **Submit**

**Expected Result:**
- Off duty time is recorded
- Driving hours remaining are **not** reduced (off duty time does not consume driving time)
- Success confirmation shown

**Pass** [ ] **Fail** [ ]

---

### TC-DR-HOS-004: HOS hours remaining display

**Preconditions:**
- Logged in as DRIVER
- On the `/hours` page (with or without existing entries)

**Steps:**
1. Navigate to `/hours`
2. Observe the hours remaining display

**Expected Result:**
- Remaining hours for the **11-hour driving limit** are clearly displayed
- Remaining hours for the **14-hour on-duty window** are clearly displayed
- Values are presented in a readable format (e.g., "7h 30m remaining")

**Pass** [ ] **Fail** [ ]

---

### TC-DR-HOS-005: HOS empty state (no entries yet)

**Preconditions:**
- Logged in as DRIVER using a **fresh driver account** with no HOS log entries

**Steps:**
1. Navigate to `/hours`

**Expected Result:**
- HOS page loads without errors
- Clean empty state is shown (no broken layout or missing data errors)
- Log entry form is accessible so the driver can create the first entry

**Pass** [ ] **Fail** [ ]

---

## Section 6: Incidents (TC-DR-INC-xxx)

### TC-DR-INC-001: Incident report form loads

**Preconditions:**
- Logged in as DRIVER

**Steps:**
1. Navigate to `/incidents`

**Expected Result:**
- Incident report form is visible with the following fields (at minimum): incident type, description, location, date
- Submit button is present
- Page renders without errors

**Pass** [ ] **Fail** [ ]

---

### TC-DR-INC-002: Submit incident report — happy path

**Preconditions:**
- Logged in as DRIVER
- On the `/incidents` page

**Steps:**
1. Navigate to `/incidents`
2. Select Type: **Minor Collision**
3. Set Date: **today's date**
4. Enter Location: `I-40 Westbound Mile Marker 212`
5. Enter Description: `Sideswiped guardrail at low speed, no injuries, minor damage to front bumper`
6. Click **Submit**

**Expected Result:**
- Success confirmation message is displayed (e.g., "Incident report submitted" or form clears)
- The incident is recorded and does not reappear as a blank form with errors
- No JavaScript errors in the browser console

**Pass** [ ] **Fail** [ ]

---

### TC-DR-INC-003: Submit incident report — missing required field

**Preconditions:**
- Logged in as DRIVER
- On the `/incidents` page

**Steps:**
1. Navigate to `/incidents`
2. Select incident type and fill all fields except **Description** (leave it blank)
3. Click **Submit**

**Expected Result:**
- Validation error is shown on the Description field (e.g., "Description is required")
- Form is NOT submitted
- User remains on the incidents page with the partially-filled form

**Pass** [ ] **Fail** [ ]

---

### TC-DR-INC-004: Incident types are selectable

**Preconditions:**
- Logged in as DRIVER
- On the `/incidents` page

**Steps:**
1. Navigate to `/incidents`
2. Click the **Type** dropdown (or selector)
3. Observe all available incident type options

**Expected Result:**
- Dropdown opens and displays at minimum the following options: Minor Collision, Breakdown, Safety Concern, Other
- Options are selectable (clicking one sets the field value)

**Pass** [ ] **Fail** [ ]

---

### TC-DR-INC-005: Incident reports visible to owner

**Preconditions:**
- Driver has submitted an incident report (from TC-DR-INC-002)
- Owner test credentials are available

**Steps:**
1. Log out of the driver account
2. Log in as the owner
3. Navigate to the incidents section (check Dashboard, or Driver detail page, or a dedicated Incidents area if available)

**Expected Result:**
- The incident submitted by the driver is accessible to the owner
- Incident details (type, date, description, location) are visible

**Pass** [ ] **Fail** [ ]

---

## Section 7: Messages (TC-DR-MSG-xxx)

### TC-DR-MSG-001: Messages page loads

**Preconditions:**
- Logged in as DRIVER

**Steps:**
1. Navigate to `/messages`

**Expected Result:**
- Message thread interface or conversation list is visible
- Page renders without errors
- Message input field is present

**Pass** [ ] **Fail** [ ]

---

### TC-DR-MSG-002: Send a message

**Preconditions:**
- Logged in as DRIVER
- On the `/messages` page

**Steps:**
1. Navigate to `/messages`
2. Click the message input field
3. Type: `Load 1042 is delayed 2 hours due to traffic on I-95`
4. Click **Send** (or press Enter)

**Expected Result:**
- Message appears in the thread with the text entered
- Timestamp is displayed alongside the message
- Input field clears after sending

**Pass** [ ] **Fail** [ ]

---

### TC-DR-MSG-003: Messages are received by owner

**Preconditions:**
- Driver has sent a message (from TC-DR-MSG-002)
- Owner test credentials are available

**Steps:**
1. Log out of the driver account (or open a second browser/incognito tab)
2. Log in as the owner
3. Navigate to messaging or notifications area in the owner portal

**Expected Result:**
- The driver's message is visible to the owner in the appropriate inbox or notification area
- Message content and sender identification are correct

**Pass** [ ] **Fail** [ ]

---

### TC-DR-MSG-004: Messages empty state

**Preconditions:**
- Logged in as DRIVER using a **fresh driver account** with no message history

**Steps:**
1. Navigate to `/messages`

**Expected Result:**
- Clean empty state is displayed (e.g., "No messages yet")
- No broken UI, no JavaScript errors
- Message input is still accessible so the driver can send the first message

**Pass** [ ] **Fail** [ ]

---

## Section 8: Support Tickets (TC-DR-TKT-xxx)

### TC-DR-TKT-001: View support ticket list

**Preconditions:**
- Logged in as DRIVER

**Steps:**
1. Navigate to `/my-tickets`

**Expected Result:**
- List of tickets submitted by this driver is displayed (driver's own tickets only — not tickets from other drivers)
- If no tickets exist, an empty state is shown without errors
- Page renders without errors

**Pass** [ ] **Fail** [ ]

---

### TC-DR-TKT-002: Submit a support ticket

**Preconditions:**
- Logged in as DRIVER
- On the `/my-tickets` page

**Steps:**
1. Navigate to `/my-tickets`
2. Click **New Ticket** (or equivalent button)
3. Enter Subject: `My load status won't update`
4. Enter Body: `When I tap Mark Picked Up nothing happens. The button appears but the status does not change.`
5. Click **Submit**

**Expected Result:**
- Ticket appears in the list on `/my-tickets` with status **OPEN**
- Ticket subject is visible in the list
- Success confirmation shown

**Pass** [ ] **Fail** [ ]

---

### TC-DR-TKT-003: View ticket thread with admin reply

**Preconditions:**
- A ticket submitted by this driver exists and an admin (SysAdmin) has replied to it
- How to achieve: Follow TC-SA-SUP-005 to reply to the ticket from the admin portal

**Steps:**
1. Navigate to `/my-tickets`
2. Click on the ticket that has an admin reply

**Expected Result:**
- Ticket detail page opens
- Admin reply is visible in the thread below the driver's original message
- Reply shows admin name/identifier and timestamp

**Pass** [ ] **Fail** [ ]

---

### TC-DR-TKT-004: Driver tickets are scoped to driver only

**Preconditions:**
- Driver A has submitted at least one ticket (from TC-DR-TKT-002)
- Driver B credentials are available (a second driver account in the same tenant)

**Steps:**
1. Log out of Driver A's account
2. Log in as Driver B
3. Navigate to `/my-tickets`

**Expected Result:**
- Driver B's ticket list does NOT contain Driver A's tickets
- Only tickets submitted by Driver B are visible

**Pass** [ ] **Fail** [ ]

---

## Section 9: Access Boundary Tests (TC-DR-SEC-xxx)

> These tests verify that a DRIVER role user cannot access owner-portal pages. All attempts should redirect to `/my-route`.

### TC-DR-SEC-001: Driver blocked from /dashboard

**Preconditions:**
- Logged in as DRIVER

**Steps:**
1. Navigate directly to `/dashboard` (type URL in address bar)

**Expected Result:**
- Redirected to `/my-route`
- The `/dashboard` page content does NOT render

**Pass** [ ] **Fail** [ ]

---

### TC-DR-SEC-002: Driver blocked from /trucks

**Preconditions:**
- Logged in as DRIVER

**Steps:**
1. Navigate directly to `/trucks`

**Expected Result:**
- Redirected to `/my-route`
- The trucks list page does NOT render

**Pass** [ ] **Fail** [ ]

---

### TC-DR-SEC-003: Driver blocked from /loads (owner loads list)

**Preconditions:**
- Logged in as DRIVER

**Steps:**
1. Navigate directly to `/loads`

**Expected Result:**
- Redirected to `/my-route`
- The loads list page does NOT render

**Pass** [ ] **Fail** [ ]

---

### TC-DR-SEC-004: Driver blocked from /drivers

**Preconditions:**
- Logged in as DRIVER

**Steps:**
1. Navigate directly to `/drivers`

**Expected Result:**
- Redirected to `/my-route`
- The drivers list page does NOT render

**Pass** [ ] **Fail** [ ]

---

## Section 10: GPS Tracking (TC-DR-GPS-xxx)

> These tests verify that the driver's real-time location is tracked and surfaced correctly — both on any driver-facing map view and on the owner's public tracking link. GPS tests require a real device or browser with location permissions granted.

### TC-DR-GPS-001: Driver location/tracking view loads

**Preconditions:**
- Logged in as DRIVER
- Driver has an active load in DISPATCHED status
- Browser/device location permissions are granted (how to achieve: click "Allow" when browser prompts for location, or enable location in browser settings)

**Steps:**
1. Navigate to the driver's GPS or location page — check for `/my-location`, `/tracking`, or a map icon in the driver bottom navigation
2. If a map icon is present in the nav, tap it
3. Observe the page or section that loads

**Expected Result:**
- Page loads without error
- Either: a map is displayed showing the driver's current position (map marker visible), OR
- A status message indicates that location sharing is active (e.g., "Your location is being shared with dispatch")
- No JavaScript errors in the browser console

**Pass** [ ] **Fail** [ ]

---

### TC-DR-GPS-002: Live driver location is visible on the owner's tracking page

**Preconditions:**
- An active load with a tracking token exists (obtained from TC-OW-LOD-012 — the owner copied the tracking link)
- Driver has location permissions enabled in browser/device
- Driver's load is in DISPATCHED or later status

**Steps:**
1. Obtain the public tracking URL from TC-OW-LOD-012 (owner copies tracking link from `/loads/[id]`)
2. Open the tracking URL in a **private/incognito browser tab** (no login required)
3. Observe the tracking page

**Expected Result:**
- Tracking page loads without requiring authentication
- A map is displayed showing a marker or coordinate representing the driver's current location
- Current load status is also visible on the tracking page (e.g., "Status: DISPATCHED")
- Page title or header identifies the load or driver

**Pass** [ ] **Fail** [ ]

---

### TC-DR-GPS-003: Driver location updates when load status advances

**Preconditions:**
- Driver has a DISPATCHED load open in `/my-load`
- Tracking URL (from TC-OW-LOD-012) is open in a second browser tab
- Driver has location permissions enabled

**Steps:**
1. In the driver tab, navigate to `/my-load`
2. Note the current status shown on the tracking URL tab (should be DISPATCHED)
3. In the driver tab, click **Mark as Picked Up**
4. Switch to the tracking URL tab
5. Refresh the tracking page (or wait for live update if real-time polling is implemented)

**Expected Result:**
- The tracking page reflects the updated status (**PICKED_UP**)
- The map marker position corresponds to the driver's location at the time of the status change
- The status label on the tracking page updates from DISPATCHED to PICKED_UP

**Pass** [ ] **Fail** [ ]

---

### TC-DR-GPS-004: Owner live map cross-reference (TC-OW-LOD-012)

**Preconditions:**
- Owner is logged in and viewing `/loads/[id]` for a DISPATCHED load
- The load has a driver assigned

**Steps:**
1. As owner, navigate to `/loads/[id]` for an active DISPATCHED load
2. Click **Copy Tracking Link** (see TC-OW-LOD-012 for the exact button location)
3. Open the copied link in a new browser tab (no login)
4. Observe the public tracking page

**Expected Result:**
- The public tracking page loads without authentication
- The driver's last-known GPS location is shown on a map
- The current load status is displayed
- This confirms that driver GPS data is correctly surfaced to external viewers (customers, dispatch managers) without requiring a DriveCommand login

**Pass** [ ] **Fail** [ ]

---

*Driver Portal QA Test Scripts — Phase 26 Plan 03*
*Total test cases: 39*
*Last updated: 2026-03-13*
