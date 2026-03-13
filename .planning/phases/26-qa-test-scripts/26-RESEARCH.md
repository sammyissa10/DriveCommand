# Phase 26: QA Test Scripts - Research

**Researched:** 2026-03-13
**Domain:** Manual QA documentation — markdown test scripts for a three-portal fleet management SaaS
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Format**
- Markdown files, readable in browser or IDE
- Each test case has: Test ID, Title, Preconditions, Steps (numbered), Expected Result, Pass/Fail checkbox
- Organized by portal → feature area → individual test cases

**Coverage**
- SysAdmin Portal: tenant management, user management, support tickets, invoicing (Phase 25)
- Owner Portal: trucks, drivers, routes, loads, dispatch, finance, documents, maintenance, notifications, integrations
- Driver Portal: login/onboarding, load status view, document uploads, GPS tracking

**Structure (3 plans)**
- Plan 1: SysAdmin portal test scripts
- Plan 2: Owner portal test scripts (loads, dispatch, finance, drivers, trucks)
- Plan 3: Driver portal test scripts + test environment setup guide (how to create test accounts, seed data, reset state)

**Output location**
- `docs/qa/` directory
- One file per portal: `sysadmin-tests.md`, `owner-tests.md`, `driver-tests.md`
- Plus `README.md` explaining how to use the test scripts and set up a test environment

### Claude's Discretion
(No explicit discretion areas listed in CONTEXT.md — all structure decisions are locked)

### Deferred Ideas (OUT OF SCOPE)
- Video walkthrough recordings — defer
- Automated test runner integration — covered in Phase 27
</user_constraints>

---

## Summary

Phase 26 produces four markdown files (`docs/qa/README.md`, `sysadmin-tests.md`, `owner-tests.md`, `driver-tests.md`) that a human QA tester can follow step by step. The domain is documentation writing, not code — there is no library to install, no framework to configure, and no build artifact. The core challenge is accurately cataloguing every testable feature across all three portals and writing test cases that are grounded in the real application behavior.

The application has three distinct portals with separate auth flows: SysAdmin uses `ADMIN_SECRET_KEY` at `/admin/login` (separate `admin_session` cookie); Owner and Manager users log in at `/sign-in` via `/api/auth/login` with role `OWNER` or `MANAGER`; Driver users also log in at `/sign-in` with role `DRIVER`. Middleware enforces portal separation — a DRIVER accessing an owner path is redirected to `/my-route`, and a sysadmin accessing any non-admin path is redirected to `/admin-support`. These boundaries are excellent sources of negative test cases.

The Owner portal is the most complex portal with 21 distinct feature areas catalogued in `docs/modules.md`. The SysAdmin portal has four areas (dashboard, tenants, support, billing/invoicing). The Driver portal has six screens. Across all three portals there are meaningful lifecycle flows — load dispatch through delivery, invoice creation through payment, tenant creation through suspension — that form the most valuable end-to-end test scenarios.

**Primary recommendation:** Write test cases from the perspective of real user scenarios and status lifecycle flows, not individual button clicks. Anchor every test case to a URL path, exact precondition state, and the specific database state change that signals pass (status badge change, record appearing, redirect destination).

---

## Standard Stack

This phase produces only markdown documentation. No libraries are installed.

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Markdown | — | Test script format | Readable in any browser, IDE, or GitHub; matches Phase 24 docs convention |
| `docs/qa/` directory | — | Output location | Siblings to existing `docs/` directory; `docs/README.md` already lists the Table of Contents |

### No Install Required
```bash
# No packages to install — pure markdown documentation
# Files are placed in docs/qa/ alongside the existing docs/
```

---

## Architecture Patterns

### Output File Structure
```
docs/
├── qa/
│   ├── README.md            # Test environment setup + how to run scripts
│   ├── sysadmin-tests.md    # Plan 1 output
│   ├── owner-tests.md       # Plan 2 output
│   └── driver-tests.md      # Plan 3 output
└── (existing docs unchanged)
```

### Pattern 1: Test Case Format
**What:** Every individual test case follows a consistent template.
**When to use:** Every test case in every file.

```markdown
### TC-SA-001: Create New Tenant with Owner Invitation

**Preconditions:**
- Logged in to SysAdmin portal as admin
- No existing tenant named "Test Fleet Co"

**Steps:**
1. Navigate to `/tenants`
2. Click **Create Tenant**
3. Enter Name: `Test Fleet Co`, Slug: `test-fleet-co`
4. Enter Owner First Name: `Jane`, Last Name: `Doe`, Email: `jane@testfleet.com`
5. Click **Create**

**Expected Result:**
- Redirected to `/tenants`
- "Test Fleet Co" appears in the tenant list with status Active
- Owner Setup shows as Pending (invitation email sent)
- Toast/success message confirms creation

**Pass** [ ] **Fail** [ ]
```

### Pattern 2: Smoke Test Section
**What:** Each file opens with a curated list of 5–10 highest-priority test IDs and their one-line descriptions.
**When to use:** At the top of each portal file, before the detailed sections.

```markdown
## Smoke Tests

Run these first. If any smoke test fails, stop and file a bug before continuing.

| Test ID | Description |
|---------|-------------|
| TC-SA-001 | Create new tenant |
| TC-SA-010 | Create and send billing invoice to tenant |
| TC-SA-020 | Reply to support ticket and close it |
| TC-OW-001 | Full load dispatch-to-delivery lifecycle |
| TC-OW-020 | Create driver, invite, accept invitation |
```

### Pattern 3: Section Organization (portal → feature → tests)
**What:** Each file is divided into H2 sections by feature area. Each section has H3 test cases.
**When to use:** All three portal files.

```markdown
# SysAdmin Portal Test Scripts

## Smoke Tests
...

## 1. Authentication
TC-SA-AUTH-001: Login with valid ADMIN_SECRET_KEY
TC-SA-AUTH-002: Login with invalid password shows error
TC-SA-AUTH-003: Accessing /tenants while unauthenticated redirects to /admin/login

## 2. Tenant Management
TC-SA-TEN-001: Create new tenant
TC-SA-TEN-002: Create tenant with duplicate slug shows error
...
```

### Pattern 4: Test ID Scheme
**What:** Namespaced IDs prevent collisions across files. Format: `TC-{PORTAL}-{AREA}-{NNN}`
**When to use:** Every test case.

| Portal Prefix | Area Prefix Examples | Example |
|---------------|---------------------|---------|
| `SA` (SysAdmin) | `AUTH`, `TEN`, `SUP`, `BILL` | `TC-SA-TEN-001` |
| `OW` (Owner) | `AUTH`, `TRK`, `DRV`, `RTE`, `LOD`, `INV`, `PAY`, `CRM`, `COMP`, `FIN`, `SET` | `TC-OW-LOD-003` |
| `DR` (Driver) | `AUTH`, `RTE`, `LOD`, `DOC`, `HOS`, `INC`, `MSG` | `TC-DR-LOD-002` |

### Anti-Patterns to Avoid
- **Step-level vagueness:** "Fill in the form" is not a step. Every step names the exact field and exact value to enter.
- **Missing preconditions:** "A truck exists" is insufficient. Precondition must say HOW to ensure the truck exists (use seeded data, or reference an earlier test case that creates it).
- **No negative tests per section:** Every feature area needs at least one test for invalid input or unauthorized access.
- **Ignoring empty states:** Every list page should have a test for the empty state (no data yet) and a test for the populated state.
- **Platform-specific steps:** Steps must work in any modern browser. Do not reference browser dev tools or network inspection.

---

## Feature Coverage Map

Complete enumeration of testable areas derived from codebase exploration (`src/app/(admin)/`, `src/app/(owner)/`, `src/app/(driver)/`, `docs/modules.md`).

### Plan 1: SysAdmin Portal (`sysadmin-tests.md`)

| Section | Key Test Scenarios | URL Path |
|---------|-------------------|----------|
| Authentication | Login/logout, bad password, session expiry, DRIVER/OWNER blocked from /admin | `/admin/login` |
| Dashboard | Metrics cards visible (total tenants, active loads, new signups, open tickets) | `/admin-dashboard` |
| Tenant List | View all tenants, filter by status, sort | `/tenants` |
| Create Tenant | Happy path, duplicate slug, invalid email, missing required fields | `/tenants/new` |
| Tenant Detail | View tenant resource counts, owner info, pending invitation status | `/tenants/[id]` |
| Tenant Status | Suspend active tenant, reactivate suspended tenant | `/tenants/[id]` |
| Delete Tenant | Delete empty tenant, attempt to delete tenant with users (blocked) | `/tenants/[id]` |
| Support Tickets | View cross-tenant queue, filter by Open/In Progress/Closed | `/admin-support` |
| Support Reply | Reply to ticket, change ticket status (Open → In Progress → Closed) | `/admin-support/[id]` |
| Billing List | View all invoices with status badges, stats cards (unpaid, overdue, paid this month) | `/billing` |
| Create Invoice | Happy path with line items, missing required fields, zero quantity | `/billing/new` |
| Invoice Detail | View line items, totals, tenant name | `/billing/[id]` |
| Send Invoice | DRAFT → SENT transition, email delivery warning surface | `/billing/[id]` |
| Mark Paid | SENT/OVERDUE → PAID, attempt to re-pay an already-PAID invoice | `/billing/[id]` |
| Void Invoice | DRAFT/SENT → VOID, attempt to void a PAID invoice | `/billing/[id]` |
| Archive Invoice | DRAFT → archived (hidden from list), attempt to archive non-DRAFT | `/billing/[id]` |
| Edit Invoice | Edit DRAFT invoice, attempt to edit SENT invoice (blocked) | `/billing/[id]/edit` |
| Mark Overdue Button | Trigger batch overdue transition, verify SENT past-due → OVERDUE | `/billing` |

**SysAdmin total estimated test cases:** ~45–55

### Plan 2: Owner Portal (`owner-tests.md`)

| Section | Key Test Scenarios | URL Path |
|---------|-------------------|----------|
| Authentication | Login, logout, invalid credentials, DRIVER blocked from owner paths | `/sign-in` |
| Dashboard | 5 stat cards present, navigate to feature pages from cards | `/dashboard` |
| Trucks — List | View fleet, empty state, stats visible | `/trucks` |
| Trucks — Create | Add truck with VIN/make/model, missing required fields | `/trucks/new` |
| Trucks — Detail | View details, documents section, maintenance link | `/trucks/[id]` |
| Trucks — Edit | Update odometer, change make/model | `/trucks/[id]/edit` |
| Trucks — Documents | Upload document with expiry date, view existing, download | `/trucks/[id]` |
| Maintenance — Log Event | Add maintenance record with service type, cost, odometer | `/trucks/[id]/maintenance/log-event` |
| Maintenance — Schedule | Add scheduled service (interval days/miles), mark complete | `/trucks/[id]/maintenance/schedule-service` |
| Maintenance — Delete | Delete maintenance event, delete scheduled service | `/trucks/[id]/maintenance` |
| Drivers — List | View drivers, empty state | `/drivers` |
| Drivers — Invite | Invite driver by email, duplicate email blocked, invalid email blocked | `/drivers/invite` |
| Accept Invitation | Driver accepts via email link, sets password, auto-logged in as DRIVER | `/accept-invitation?id=...` |
| Drivers — Detail | View profile, assigned routes, documents, safety score | `/drivers/[id]` |
| Drivers — Edit | Edit name, status | `/drivers/[id]/edit` |
| Drivers — Documents | Upload driver document with expiry, download | `/drivers/[id]` |
| Routes — List | View routes, empty state | `/routes` |
| Routes — Create | Create route with driver, truck, origin, destination, stops | `/routes/new` |
| Routes — Status | PLANNED → IN_PROGRESS → COMPLETED lifecycle | `/routes/[id]` |
| Routes — Documents | Attach document to route, download | `/routes/[id]` |
| Loads — List | View loads, stats cards, empty state | `/loads` |
| Loads — Create | Create load with customer, driver, truck, origin/destination, rate | `/loads/new` |
| Loads — Dispatch Lifecycle | PENDING → DISPATCHED → PICKED_UP → IN_TRANSIT → DELIVERED → INVOICED | `/loads/[id]` |
| Loads — Tracking | Public tracking page accessible via trackingToken, no login required | `/track/[token]` |
| Invoices — List | View invoices by status | `/invoices` |
| Invoices — Create | Create invoice with line items, link to customer | `/invoices/new` |
| Invoices — Status | DRAFT → SENT → PAID lifecycle, delete DRAFT | `/invoices/[id]` |
| Invoices — PDF | Download PDF (if feature active) | `/invoices/[id]` |
| Payroll — List | View pay records | `/payroll` |
| Payroll — Create | Create payroll record for driver with period, base pay, bonuses | `/payroll/new` |
| Payroll — Status | DRAFT → APPROVED → PAID lifecycle | `/payroll/[id]` |
| CRM — List | View customers, total revenue, empty state | `/crm` |
| CRM — Create | Add customer with company name, contact info, priority | `/crm/new` |
| CRM — Interactions | Log interaction (call, email, meeting), view history | `/crm/[id]` |
| Compliance | View expiring documents section, driver safety scores | `/compliance` |
| AI Documents | Upload PDF rate confirmation, extract structured data | `/ai-documents` |
| Profit Predictor | Input load parameters, receive Accept/Caution/Reject assessment | `/profit-predictor` |
| Lane Analytics | View bar chart of top lanes, sortable table | `/lane-analytics` |
| IFTA | View mileage/fuel by jurisdiction, CSV export | `/ifta` |
| Live Map | GPS pings show on map, truck markers visible | `/live-map` |
| Fuel — Log | Log fill-up with quantity, cost, odometer | `/fuel` |
| Safety | View events by type/severity, driver scores | `/safety` |
| Tags — Create | Create tag with color, assign to truck, assign to driver | `/tags` |
| Settings — Integrations | Enable/disable integration, save API key config | `/settings/integrations` |
| Settings — Expense Categories | Add category, edit, delete | `/settings/expense-categories` |
| Settings — Expense Templates | Add template with line items | `/settings/expense-templates` |
| Support — Create Ticket | Submit ticket with title, description, category, priority | `/support` |
| Support — Messaging | Send reply message, view thread | `/support/[id]` |
| Subscription | View subscription invoices list, status badges | `/subscription` |
| Role Guard | Attempting owner path as DRIVER redirects to /my-route | middleware |

**Owner total estimated test cases:** ~90–110

### Plan 3: Driver Portal (`driver-tests.md`) + Environment Setup

| Section | Key Test Scenarios | URL Path |
|---------|-------------------|----------|
| Authentication | Login as driver, logout, OWNER blocked from driver paths | `/sign-in` |
| Onboarding | Accept invitation via email link, set password, land on /my-route | `/accept-invitation?id=...` |
| My Route — Assigned | View route details (origin, dest, dates, stops), truck details | `/my-route` |
| My Route — No Route | Empty state shown when no route assigned | `/my-route` |
| My Route — Documents | Download route document, download truck document (read-only, no upload) | `/my-route` |
| My Load — Assigned | View load details (number, origin, dest, rate, commodity, status timeline) | `/my-load` |
| My Load — No Load | Empty state shown when no load assigned | `/my-load` |
| My Load — Status Advance | DISPATCHED → PICKED_UP → IN_TRANSIT → DELIVERED (forward-only) | `/my-load` |
| My Load — Status Final | No advance button shown when status is DELIVERED | `/my-load` |
| Hours of Service | View HOS dashboard, log new HOS record | `/hours` |
| Incidents — Report | Submit incident with description and severity | `/incidents` |
| Incidents — List | View past incidents | `/incidents` |
| Messages | View message list, read message, compose message | `/messages` |
| My Tickets — List | View driver's own support tickets | `/my-tickets` |
| My Tickets — Create | Submit ticket from driver portal | `/my-tickets` |
| GPS Background | Confirm geolocation tracking submits to /api/gps (observable via Live Map) | background |

**Driver total estimated test cases:** ~25–30

**README.md Content:**
- How to set up a test environment (local vs. staging)
- Creating test accounts (sysadmin login, owner signup, driver invite flow)
- Using seed data (`npm run seed`, `npm run seed:fleet`)
- How to reset test state (delete tenant + recreate)
- Environment variables required for full feature testing
- Conventions used in the test scripts (Test ID format, Pass/Fail checkbox)
- How to log and report failures

---

## Don't Hand-Roll

This phase is documentation-only. The "don't hand-roll" principle applies to documentation organization decisions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Test ID uniqueness | Custom numbering system | Namespaced prefix scheme (TC-SA-001, TC-OW-001) | Simple, human-readable, sorts correctly, no tooling needed |
| Test environment docs | Duplicate the setup.md | Reference `docs/setup.md` from README.md | DRY — setup.md already covers env vars, seed commands, prerequisites |
| Status lifecycle docs | Rewrite what modules.md says | Reference `docs/modules.md` feature descriptions | DRY — modules.md already enumerates all status transitions |
| Auth flow docs | Rewrite what auth.md says | Reference `docs/auth.md` in README.md | DRY — auth.md covers all login flows |

**Key insight:** The test scripts describe WHAT to test and WHAT to expect, not HOW the system works. The "how" is already documented in `docs/`. Cross-reference existing docs; never duplicate them.

---

## Common Pitfalls

### Pitfall 1: Untestable Preconditions
**What goes wrong:** Test case says "Preconditions: A load in DISPATCHED status exists" but gives the tester no way to get there.
**Why it happens:** Writer assumes someone else created the data or the seed script has exactly the right state.
**How to avoid:** Every precondition that requires existing data must either (a) reference a specific seed state created by `npm run seed`, or (b) reference a prior test case by ID that creates the data.
**Warning signs:** Preconditions with "exists" or "is available" without specifying how.

### Pitfall 2: Missing Admin Portal Auth Context
**What goes wrong:** SysAdmin test cases assume a session exists but don't document how to log in as admin (separate `admin_session` cookie, separate `/admin/login` page, uses `ADMIN_SECRET_KEY` not email/password).
**Why it happens:** SysAdmin auth is completely separate from owner/driver auth — easy to overlook.
**How to avoid:** The SysAdmin file's very first section must be Authentication, including the separate login flow at `/admin/login` with `ADMIN_SECRET_KEY` value.
**Warning signs:** Test cases that navigate to `/tenants` or `/billing` without a preceding sysadmin login step.

### Pitfall 3: Status Lifecycle Gaps
**What goes wrong:** Test case advances load from PENDING directly to DELIVERED, skipping required intermediate states.
**Why it happens:** The writer summarizes the flow without checking the actual code.
**How to avoid:** The actual status lifecycle for each entity is documented here:
- **Load:** `PENDING → DISPATCHED → PICKED_UP → IN_TRANSIT → DELIVERED → INVOICED` (+ `CANCELLED`)
- **Route:** `PLANNED → IN_PROGRESS → COMPLETED`
- **Invoice (owner):** `DRAFT → SENT → PAID → OVERDUE` (+ `CANCELLED`)
- **Invoice (sysadmin):** `DRAFT → SENT → PAID → OVERDUE → VOID`
- **Payroll:** `DRAFT → APPROVED → PAID`
- **Driver Invitation:** `PENDING → ACCEPTED | EXPIRED | CANCELLED`
- **SysAdminInvoice:** `DRAFT → SENT → PAID | OVERDUE | VOID` (+ archivable from DRAFT only)
**Warning signs:** A lifecycle test that skips a status or tries an illegal transition.

### Pitfall 4: Driver Portal Edit Permissions
**What goes wrong:** Test includes an "edit load details" step in the driver portal because the owner portal has an edit page.
**Why it happens:** Confusing owner and driver capabilities.
**How to avoid:** Drivers have strictly read-only access to route and load data. The only write actions available to drivers are: advance load status, log HOS, submit incident, send message, submit support ticket. The My Route page has zero edit controls by design.
**Warning signs:** Any "edit" or "update" step in driver portal tests other than the listed exceptions.

### Pitfall 5: Phase 25 Features Not Yet Coded
**What goes wrong:** SysAdmin billing tests written before Phase 25 is complete reference UI that doesn't exist.
**Why it happens:** Phase 26 depends on Phase 25 (SysAdmin Invoicing Module).
**How to avoid:** Phase 26 executes after Phase 25 is complete. The sysadmin-invoices.ts server action file and billing pages were verified to exist during this research — Phase 25 appears to be complete. The billing tests should be written.
**Warning signs:** Test navigates to `/billing` and finds a 404.

### Pitfall 6: Self-Contained vs. Cross-File Dependencies
**What goes wrong:** Driver portal test says "Preconditions: Owner has dispatched a load to this driver" without explaining how to set that up.
**Why it happens:** The driver portal is dependent on owner portal state — a driver cannot view a load unless an owner dispatched one.
**How to avoid:** The README.md environment setup section must document the cross-portal data dependencies. Specifically: before testing the driver portal, an owner must have created a truck, invited the driver, created a route and load, and dispatched the load. The driver-tests.md can reference this by saying "Preconditions: Test environment seeded per README.md Setup Guide, load in DISPATCHED status assigned to test driver."

---

## Code Examples

These are actual behaviors verified in the codebase that test cases must match:

### SysAdmin Billing — Invoice Number Format
Invoice numbers are generated as `SINV-XXXX` (e.g., `SINV-0001`). Test cases that verify the created invoice number must use this format.
```
Source: src/app/(admin)/actions/sysadmin-invoices.ts — generateInvoiceNumber()
Format: SINV-${padStart(4, '0')}
```

### SysAdmin — Send Invoice Behavior
Sending an invoice marks it `SENT` in the database FIRST, then attempts email. If email fails, the status is still `SENT` but the UI shows an `emailWarning` toast (not a failure). Test cases must account for this.
```
Source: src/app/(admin)/actions/sysadmin-invoices.ts — sendInvoiceAction()
```

### Load Status Lifecycle (Owner creates, Driver advances)
Owner sets initial status via dispatch. Driver can only advance forward through:
`PENDING → DISPATCHED → PICKED_UP → IN_TRANSIT → DELIVERED`
Owner can then move to `INVOICED`. The `CANCELLED` status can be set by owner.
```
Source: src/app/(driver)/my-load/page.tsx — DRIVER_STATUS_LIFECYCLE constant
Source: docs/modules.md — Loads section
```

### Tenant Creation — Slug Validation
Slug must be lowercase letters, numbers, and hyphens only. The regex is: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`
Test case for invalid slug: try `Test Fleet` (spaces) or `TestFleet` (uppercase) — must show validation error.
```
Source: src/app/(admin)/actions/tenants.ts — createTenant() z.string().regex(...)
```

### Owner Invoice — Status Transitions
Owner invoices use a different model from SysAdmin invoices. Available owner statuses: `DRAFT`, `SENT`, `PAID`, `OVERDUE`, `CANCELLED`. The UI shows Edit/Delete buttons for DRAFT only; Mark as Paid button for SENT only.
```
Source: src/app/(owner)/invoices/[id]/page.tsx — statusColors and conditional button rendering
```

### Driver Document Access — Read-Only
`/my-route` page shows route documents and truck documents for download only. No upload controls are present in the driver portal for route or truck documents. Driver upload only exists for driver-specific documents (license, etc.) via the owner's driver management page (uploaded by the owner on the driver's behalf).
```
Source: src/app/(driver)/my-route/page.tsx — DocumentListReadOnly component
```

### Middleware Auth Guards
These are the exact redirect behaviors test cases should verify:
- Unauthenticated → protected path = redirect to `/sign-in?redirect_url=...`
- DRIVER role → owner path (e.g., `/dashboard`) = redirect to `/my-route`
- SysAdmin user → non-admin path (e.g., `/dashboard`) = redirect to `/admin-support`
- Authenticated with no `tenantId` → non-onboarding path = redirect to `/onboarding`
```
Source: src/middleware.ts
```

---

## State of the Art

| Area | Pattern Used | Notes |
|------|-------------|-------|
| Test ID naming | Namespaced prefix per portal and feature | Industry standard for manual QA; aligns with TKT-NNNN ticket format already used in support system |
| Smoke tests | Curated top-5–10 per file | Standard practice; "smoke test" terminology is broadly understood |
| Pass/Fail checkbox | `[ ]` checkbox in markdown | Renders as interactive checkbox in GitHub; can be checked/unchecked in browser |
| Preconditions | Explicit state + how to reach it | Matches what Phase 24 docs established as the documentation style |
| Cross-referencing | Link to existing docs, don't duplicate | DRY documentation principle; existing `docs/` is comprehensive |

---

## Open Questions

1. **Phase 25 Billing Feature Completeness**
   - What we know: `src/app/(admin)/billing/` pages and `src/app/(admin)/actions/sysadmin-invoices.ts` exist with full CRUD, send, paid, void, archive actions. Owner-facing subscription page at `/subscription` exists.
   - What's unclear: Whether the billing invoice PDF download feature is implemented (the owner invoice has a PDF generation action referenced in the rate-confirmation action, but the sysadmin billing does not appear to have PDF generation).
   - Recommendation: Omit PDF test case for sysadmin billing unless the feature is confirmed implemented. Write a test for it only if the UI exposes a "Download PDF" button.

2. **Driver Document Upload**
   - What we know: Drivers see read-only document lists on `/my-route` via `DocumentListReadOnly`.
   - What's unclear: Whether the driver portal has any screen where a driver can upload their own documents (e.g., `/incidents` photos, or a dedicated document upload screen not yet discovered).
   - Recommendation: Based on codebase review, driver document upload is an owner-managed operation. Do not write driver upload test cases unless a driver upload route is found. The CONTEXT.md mentions "document uploads" for the driver portal — this likely refers to the driver viewing and downloading documents, or uploading incident-related photos.

3. **Notifications Feature Scope**
   - What we know: CONTEXT.md mentions "notifications" under Owner portal coverage. There is no `/notifications` page in the Owner portal routes discovered. `NotificationLog` model exists in the database for email send audit. The compliance module triggers email reminders.
   - What's unclear: Whether there is a UI notifications page or if "notifications" in the CONTEXT.md refers to email notification behavior (e.g., compliance reminders, ETA emails).
   - Recommendation: Write notification test cases as email-trigger verification tests (e.g., "when a truck document is within 30 days of expiry, compliance page shows it in the expiring list") rather than UI page navigation tests.

---

## Sources

### Primary (HIGH confidence)
- Direct codebase inspection: `src/app/(admin)/`, `src/app/(owner)/`, `src/app/(driver)/` — all page.tsx files enumerated
- `docs/modules.md` — authoritative feature module descriptions including status lifecycles
- `docs/auth.md` — login flows, role model, middleware behavior
- `src/middleware.ts` — exact redirect rules for role enforcement
- `src/app/(admin)/actions/sysadmin-invoices.ts` — SysAdmin billing lifecycle and business rules
- `src/app/(admin)/actions/tenants.ts` — tenant CRUD including validation rules
- `docs/setup.md` — seed scripts, environment setup, test runner commands
- `docs/database.md` — schema model reference with all status enums

### Secondary (MEDIUM confidence)
- `e2e/tkt-fixes.spec.ts` — existing automated test patterns provide reference for what manual tests cover
- Phase 24 documentation convention inferred from `docs/` file structure and content style

### Tertiary (LOW confidence)
- None — all claims are grounded in direct codebase inspection

---

## Metadata

**Confidence breakdown:**
- Feature coverage map: HIGH — derived from direct filesystem enumeration of all page.tsx routes and modules.md
- Status lifecycles: HIGH — verified against action files and page components
- Auth flows: HIGH — verified against middleware.ts and auth.md
- Pitfalls: HIGH — derived from codebase patterns and explicit code inspection
- Notification coverage gap: LOW — "notifications" in CONTEXT.md is ambiguous; requires planner judgement

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable — documentation task; no external library dependencies)
