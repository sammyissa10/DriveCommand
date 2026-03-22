# DriveCommand — QA Test Scripts

Manual test documentation for all three portals: SysAdmin, Owner/Manager, and Driver.

For automated browser tests, see Phase 27 (Playwright E2E suite). This suite covers manual functional testing only.

---

## Test Script Index

| File | Portal | Test Cases | Sections |
|------|--------|------------|----------|
| [sysadmin-tests.md](./sysadmin-tests.md) | SysAdmin (`/admin`) | ~56 | Auth, Dashboard, Tenants, Support, Billing, User Management |
| [owner-tests.md](./owner-tests.md) | Owner/Manager (`/sign-in`) | ~106 | Auth, Trucks, Drivers, Routes, Loads, Invoices, Payroll, CRM, Compliance, Finance, AI Docs, Settings, Support, Notifications |
| [driver-tests.md](./driver-tests.md) | Driver (`/sign-in`) | ~48 | Auth, My Route, My Load, Documents, HOS, Incidents, Messages, Tickets, Access Boundaries, GPS Tracking |

**Total manual test cases: ~210**

---

## Test Environment Setup

### Prerequisites

Before running any tests, ensure the following are in place:

- **Node.js 18+** and **npm** installed on your machine
- Access to the DriveCommand application — either:
  - Local development: `npm run dev` running at `http://localhost:3000`, OR
  - Staging URL provided by your team lead
- **Supabase project** running (local via `supabase start`, or remote project)
- **`.env.local`** configured with the following environment variables:

```
DATABASE_URL=<your_database_connection_string>
NEXT_PUBLIC_SUPABASE_URL=<your_supabase_project_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your_supabase_anon_key>
JWT_SECRET=<your_jwt_secret>
```

> **Security note:** Never commit `.env.local` or test credentials to version control.

---

### Required Test Accounts

Three types of accounts are needed to run the full suite. Credentials should be stored in a private file (e.g., `.env.test`) that is not committed.

#### 1. SysAdmin Account

- Login URL: `/sign-in` (same page as Owner/Driver)
- Auth method: Email + Password
- Account creation: A User record with `isSystemAdmin = true` must exist in the database. Create one via the seed script or a direct DB insert (`UPDATE "User" SET "isSystemAdmin" = true WHERE email = 'admin@example.com'`).
- Store the sysadmin email and password in `.env.test`.

#### 2. Owner Account

- Must be an **OWNER** or **MANAGER** role user associated with a tenant.
- Two ways to create:
  - **Option A (new tenant):** Navigate to `/sign-up` and register a new tenant. The first user becomes the owner.
  - **Option B (invited by SysAdmin):** Log in to the SysAdmin portal, create a tenant with an owner email, and accept the invitation email to set a password.
- Store the owner's email and password in `.env.test`.

#### 3. Driver Account

- Must be a **DRIVER** role user invited by an owner.
- How to create:
  1. Log in as the owner
  2. Navigate to `/drivers/invite`
  3. Send an invitation to a test email address (e.g., `test-driver@yourteam.test`)
  4. Accept the invitation email and set a password
- Store the driver's email and password in `.env.test`.

---

### Seeding Test Data

Before running the full suite, set up the following data. Work through this sequence in order — each step builds on the previous one.

1. **Create a tenant (SysAdmin):**
   Log in at `/sign-in` with the sysadmin account → navigate to `/tenants/new` → Create Tenant → set name to `Test Fleet Co`, owner email to `test-owner@yourteam.test`

2. **Accept the owner invitation and complete onboarding:**
   Check `test-owner@yourteam.test` inbox → accept invite → set password → complete any onboarding flow → confirm the Owner portal is accessible at `/dashboard`

3. **Create at least 1 Truck:**
   Owner portal → Trucks → New Truck → fill in make, model, year, license plate, VIN

4. **Create at least 1 CRM Customer:**
   Owner portal → CRM → New Customer → fill in company name and contact details

5. **Invite a Driver:**
   Owner portal → Drivers → Invite Driver (`/drivers/invite`) → enter `test-driver@yourteam.test` → send → accept invitation and set password

6. **Create 1 Route:**
   Owner portal → Routes → New Route → set origin, destination, scheduled date → assign the truck and driver created above

7. **Create 1 Load:**
   Owner portal → Loads → New Load → fill in load details → assign to the CRM customer created above

All major test cases can now be executed against this seeded data. Individual sections may require additional setup — preconditions within each test case explain exactly what state is needed and how to achieve it.

---

### Environment Variables Reference

| Variable | Used by | Description |
|----------|---------|-------------|
| `DATABASE_URL` | All portals | PostgreSQL connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | All portals | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All portals | Supabase anonymous key (public) |
| `JWT_SECRET` | Auth middleware | Secret for signing/verifying JWTs |
| `TEST_SYSADMIN_EMAIL` | SysAdmin tests | Email of the sysadmin User (isSystemAdmin=true) |
| `TEST_SYSADMIN_PASSWORD` | SysAdmin tests | Password for the sysadmin account |

---

## How to Run Tests

### Execution Order (Recommended)

Run tests in this order to respect data dependencies:

1. **SysAdmin tests** (`sysadmin-tests.md`) — creates tenants, can manage billing and users
2. **Owner tests** (`owner-tests.md`) — creates trucks, drivers, routes, loads, invoices
3. **Driver tests** (`driver-tests.md`) — uses data created by owner (routes, loads, docs)

Within each file, tests are ordered so that later tests can use state created by earlier tests (e.g., TC-OW-LOD-006 creates DISPATCHED status used by TC-OW-LOD-007). You may run sections independently if preconditions are met.

### Running Smoke Tests

Each test script file has a **Smoke Tests** section at the top. Run those first:

1. Open the portal you are testing
2. Run only the smoke tests (6–9 tests per portal)
3. If all smoke tests pass, proceed to full section-by-section testing
4. If any smoke test fails, stop and investigate before continuing

Smoke tests are selected to catch the most critical failures quickly. A smoke test failure usually indicates a build or environment problem, not just a feature bug.

### Reporting Results

- **Pass/Fail:** Mark the checkbox directly in the markdown file (`[x]` for pass, leave `[ ]` empty or mark `[x]` in Fail column for fail), OR record results in a separate bug tracking tool.
- **For failures:**
  - Note the test case ID (e.g., `TC-OW-LOD-006`)
  - Record the exact steps taken
  - Document the **actual result** vs. the **expected result**
  - Note the browser, device, and app version (or git commit hash)
- **Filing bugs:**
  - Use the project issue tracker
  - Apply the label/tag: `qa-test-sysadmin`, `qa-test-owner`, or `qa-test-driver` (matching the portal)
  - Include the test case ID in the issue title (e.g., `[TC-OW-LOD-006] Load status does not advance to DISPATCHED`)

---

## Portal Login Quick Reference

| Portal | URL | Auth Method |
|--------|-----|-------------|
| SysAdmin | `/sign-in` | Email + Password (User with `isSystemAdmin=true` in DB) |
| Owner / Manager | `/sign-in` | Email + Password (role: OWNER or MANAGER) |
| Driver | `/sign-in` | Email + Password (role: DRIVER) |

> All three portals share the same login page (`/sign-in`). The portal experience differs based on the user's role. A DRIVER account redirects to `/my-route`, an OWNER account redirects to `/dashboard`, and a sysadmin account (isSystemAdmin=true) redirects to `/admin-dashboard`.

---

## Known Limitations / Out of Scope

This test suite covers **manual functional testing** only.

- **Automated E2E tests** (Playwright) are covered in Phase 27 — not this suite
- **Performance and load testing** are not covered
- **Accessibility audits** (WCAG) are not covered by these scripts
- **Email delivery** for invitations and notifications is verified only by checking that the trigger occurred — actual email receipt depends on your email service configuration and is outside the scope of these tests
- **Mobile device testing** — the Driver portal is mobile-first; driver tests should be verified on a mobile viewport (375px) in browser dev tools, or on an actual mobile device. Owner and SysAdmin portals are desktop-first.

---

*DriveCommand QA Test Scripts — Phase 26*
*Last updated: 2026-03-13*
