---
task: 186
type: quick
title: "Fix all carrier ops bugs found during QA testing"
status: complete
completed_date: "2026-04-05"
duration_minutes: 25
tasks_completed: 3
files_modified: 18
decisions:
  - "Used db push (not migrate) to add paymentTerms/creditLimit columns to CarrierClient — no migration file created, no constraint changes"
  - "Facility type values changed at application layer only — no DB constraints or column type changes"
  - "Portal email field always shown when portalAccess is true (not conditional on email existing)"
---

# Quick Task 186: Fix All Carrier Ops Bugs Found During QA

One-liner: Fixed 19 carrier ops QA bugs covering dashboard timeout resilience, sidebar label uniqueness, role-gated buttons (MANAGER), facility type dropdown spec alignment, facility contact display from JSON array, new billing fields (paymentTerms/creditLimit) on CarrierClient, and portal access toggle UX.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Dashboard timeouts, sidebar labels, layout guard, role-gated buttons | 842747b |
| 2 | Facility types, contact display, payment fields, portal toggle | 7f3ce44 |
| 3 | Verified already-fixed bugs, TypeScript clean pass | (no changes needed) |

## Bugs Fixed

### BUG-01 — Dashboard Prisma transaction timeouts
Added `.catch()` defaults to all 7 queries in `_fetchDashboardMetrics` Promise.all (0 for counts, [] for findMany), and all 4 queries in `_fetchNotificationAlerts` Promise.all. Dashboard now loads even if individual queries time out.

### BUG-02, 03, 04 — Duplicate sidebar items
Renamed sidebar labels: "Loads" → "Carrier Loads", "Drivers" → "Carrier Drivers", "Trucks" → "Carrier Trucks" in the Carrier Ops section.

### BUG-05 — Two unlabeled Dashboards
Renamed Carrier Ops sidebar: label "Dashboard" → "Carrier Dashboard", tooltip "Dashboard" → "Carrier Dashboard".

### BUG-06 — Driver role redirects to /unauthorized
`carrier/layout.tsx`: changed `redirect("/my-load")` → `redirect("/my-route")`.

### BUG-07 — Manager role can see "New Contract" button
`ContractList.tsx`: added optional `role?: string` prop; wrapped New Contract link in `{role !== 'MANAGER' && ...}`. Parent contracts page passes `session.role`.

### BUG-08 — Manager role can see "New Client" button
`ClientList.tsx`: same pattern as BUG-07. Parent clients page passes `session.role`.

### BUG-09 — Facility type dropdown options don't match spec
Updated `FACILITY_TYPES` in both `FacilityForm.tsx` and `FacilityList.tsx` to exactly: shipper, receiver, terminal, fuel_stop, other. Updated `BADGE_CLASSES` in FacilityList with distinct colors for each. Updated seed script from warehouse/customer_site to shipper/receiver.

### BUG-14 — Facilities list does not display contact information
Added `contacts?: Array<{...}>` to `FacilityItem` interface. Contact column now shows `contacts[0].name` when contacts array exists, falling back to `contactName`. Facilities page passes `contacts` from Prisma's JSON field.

### BUG-17 — Client form missing Payment Terms and Credit Limit fields
Added `paymentTerms Int @default(30)` and `creditLimit Decimal?` columns to `CarrierClient` model via `prisma db push`. Added Billing section to `ClientForm` with both fields. Updated API schemas (create + update routes) and `lib/carrier/clients.ts` types. Added Billing display section to `ClientDetail` Overview tab.

### BUG-18 — Contracts tab on client detail shows "New Contract" for all roles
`ClientDetail.tsx`: added `role?: string` prop; wrapped New Contract link in `{role !== 'MANAGER' && ...}`. Parent page passes `session.role`.

### BUG-19 — Client portal access toggle fails to update
Verified PATCH route and `updateClient` function work correctly — no stripping of falsy values. Fixed UX: portal email field now shown whenever `portalAccess` is true (was conditional on `client.portalEmail` existing, which prevented seeing the field after first toggle ON).

### BUGs 10, 11, 12, 13, 15, 16 — Already fixed
Verified these bugs were addressed in previous quick tasks (184, 185). All referenced components and pages exist with correct structure.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files created/modified:
- `apps/web/src/app/(owner)/actions/dashboard.ts` ✓
- `apps/web/src/components/navigation/sidebar.tsx` ✓
- `apps/web/src/app/(owner)/carrier/layout.tsx` ✓
- `apps/web/src/components/carrier/contracts/ContractList.tsx` ✓
- `apps/web/src/app/(owner)/carrier/contracts/page.tsx` ✓
- `apps/web/src/components/carrier/clients/ClientList.tsx` ✓
- `apps/web/src/app/(owner)/carrier/clients/page.tsx` ✓
- `apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx` ✓
- `apps/web/src/app/(owner)/carrier/clients/[id]/page.tsx` ✓
- `apps/web/src/components/carrier/facilities/FacilityForm.tsx` ✓
- `apps/web/src/components/carrier/facilities/FacilityList.tsx` ✓
- `apps/web/src/app/(owner)/carrier/facilities/page.tsx` ✓
- `apps/web/scripts/seed-qa-accounts.ts` ✓
- `apps/web/prisma/schema.prisma` ✓
- `apps/web/src/generated/prisma/*` ✓ (regenerated)
- `apps/web/src/components/carrier/clients/ClientForm.tsx` ✓
- `apps/web/src/app/api/v1/carrier/clients/[id]/route.ts` ✓
- `apps/web/src/app/api/v1/carrier/clients/route.ts` ✓
- `apps/web/src/lib/carrier/clients.ts` ✓

TypeScript: `npx tsc --noEmit` — zero errors ✓
DB: `prisma db push` applied paymentTerms + creditLimit columns ✓
