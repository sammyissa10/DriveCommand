---
phase: quick-143
plan: 01
subsystem: mobile-owner-portal
tags: [mobile, owner-portal, crm, payroll, react-native, api-routes, expo-router]
dependency_graph:
  requires:
    - packages/api-client
    - apps/web/src/app/api/mobile/owner/crm/route.ts
    - apps/web/src/app/api/mobile/owner/payroll/route.ts
    - apps/mobile/components/ui/BottomSheet.tsx
    - apps/mobile/components/ui/PageSpeedDial.tsx
  provides:
    - Full CRM contact CRUD on mobile (detail + edit)
    - Full payroll record detail and create on mobile
    - GET/PATCH /api/mobile/owner/crm/[id]
    - GET /api/mobile/owner/payroll/[id]
    - POST /api/mobile/owner/payroll
  affects:
    - apps/mobile/app/(owner)/more/crm/index.tsx (cards now tappable)
    - apps/mobile/app/(owner)/more/payroll.tsx (rows tappable, FAB added)
tech_stack:
  added: []
  patterns:
    - BottomSheet for inline edit/create forms (no full-screen navigation)
    - Pill-button pickers for enum fields (priority, status) inline in edit sheet
    - Separate BottomSheet for driver picker (follows invoices/new.tsx pattern)
    - TX_OPTIONS + bypass_rls pattern for all new API routes
key_files:
  created:
    - apps/web/src/app/api/mobile/owner/crm/[id]/route.ts
    - apps/web/src/app/api/mobile/owner/payroll/[id]/route.ts
    - apps/mobile/app/(owner)/more/crm/[id].tsx
  modified:
    - apps/web/src/app/api/mobile/owner/payroll/route.ts (added POST handler)
    - packages/api-client/src/owner.ts (4 new types, 4 new methods)
    - packages/api-client/src/index.ts (export new types)
    - apps/mobile/app/(owner)/more/crm/index.tsx (tappable cards)
    - apps/mobile/app/(owner)/more/payroll.tsx (detail sheet + create form + FAB)
decisions:
  - Used BottomSheet snapPoint 80% for edit/create forms (plan specified 85%/90% which are not valid BottomSheet values — nearest valid is 80%)
  - Pill-button selectors (Pressable rows in a row) for priority and status in edit sheet rather than nested BottomSheet
  - Full-field update on save (all fields sent) rather than delta-only PATCH to avoid stale-data edge cases
metrics:
  duration: ~35 minutes
  completed: 2026-03-31
  tasks: 3
  files: 8
---

# Quick Task 143: Mobile Owner Portal — CRM Contact Detail/Edit + Payroll Detail/Create

**One-liner:** Completed mobile owner portal CRUD — CRM contact detail screen with inline edit sheet and payroll detail bottom sheet with draft record creation via FAB form.

## What Was Built

### Task 1: API Routes + api-client

Four new API endpoints and four new api-client methods connecting them:

**New routes:**
- `GET /api/mobile/owner/crm/[id]` — returns full Customer model fields (all 17 fields including address, performance stats)
- `PATCH /api/mobile/owner/crm/[id]` — partial update with enum validation for priority (LOW/MEDIUM/HIGH/VIP) and status (ACTIVE/INACTIVE/PROSPECT)
- `GET /api/mobile/owner/payroll/[id]` — returns full PayrollRecord with basePay, bonuses, deductions, totalPay, milesLogged, loadsCompleted, paidAt, driverName
- `POST /api/mobile/owner/payroll` — creates draft payroll record, validates UUID driverId, date ordering, basePay >= 0

**New api-client types:** `CrmContactDetail`, `UpdateCrmContactPayload`, `PayrollRecordDetail`, `CreatePayrollPayload`

**New api-client methods:** `getCrmContact`, `updateCrmContact`, `getPayrollRecord`, `createPayrollRecord`

All routes follow the established `TX_OPTIONS + bypass_rls` pattern with rate limiting and OWNER role guard.

### Task 2: CRM Contact Detail Screen + Tappable List

**New screen `crm/[id].tsx`:**
- 4 organized sections: Contact Information, Business Details, Performance (conditional), Notes (conditional)
- Colored status and priority badges in Business Details
- Edit button (Pencil icon) in header opens 80% BottomSheet
- Edit sheet: all customer fields, pill-button pickers for priority/status, Switch for emailNotifications
- useMutation with haptic feedback, query invalidation, and toast on success/error
- Pre-populated from current query data when sheet opens

**Updated `crm/index.tsx`:**
- `CustomerCard` outer `View` changed to `Pressable` accepting an `onPress` prop
- `renderCustomer` callback passes `router.push(/(owner)/more/crm/${id})` as handler

### Task 3: Payroll Detail Sheet + Create Form + FAB

**Updated `payroll.tsx`:**
- `PayrollRow` component outer `View` changed to `Pressable` with `onPress` prop
- Detail bottom sheet (80%): driver name + period header, status badge, pay breakdown (base/bonuses in green/deductions in red/total bold), performance section (conditional), paid date (green, conditional), notes
- FAB via `PageSpeedDial` with DollarSign icon and purple color opens create form
- Create form bottom sheet (80%): driver picker (separate 60% BottomSheet), period start/end side-by-side, base pay, bonuses/deductions side-by-side, notes
- Validation: driver required, both dates required, basePay > 0
- `createRecord` mutation invalidates `owner-payroll` query on success

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Export] Added new types to api-client index.ts**
- **Found during:** Task 2 TypeScript verification
- **Issue:** `CrmContactDetail`, `UpdateCrmContactPayload`, `PayrollRecordDetail`, `CreatePayrollPayload` were defined in `owner.ts` but not exported from `packages/api-client/src/index.ts`, causing mobile TypeScript errors
- **Fix:** Added all 4 types to the export list in `index.ts` and rebuilt the package
- **Files modified:** `packages/api-client/src/index.ts`

**2. [Rule 3 - BottomSheet snapPoint] Adjusted snap points to valid values**
- **Found during:** Task 2 implementation
- **Issue:** Plan specified `snapPoint="90%"` and `snapPoint="85%"` which are not valid values in `BottomSheet.tsx` (only `40%`, `60%`, `80%`, `full` are accepted)
- **Fix:** Used `80%` for all edit/create sheets, `60%` for the driver picker — closest valid values
- **Files modified:** `apps/mobile/app/(owner)/more/crm/[id].tsx`, `apps/mobile/app/(owner)/more/payroll.tsx`

## Self-Check: PASSED

Files exist:
- `apps/web/src/app/api/mobile/owner/crm/[id]/route.ts` — FOUND
- `apps/web/src/app/api/mobile/owner/payroll/[id]/route.ts` — FOUND
- `apps/mobile/app/(owner)/more/crm/[id].tsx` — FOUND

Commits:
- `8cd3173` feat(quick-143): add CRM contact detail/edit and payroll detail/create API routes
- `6c8bf50` feat(quick-143): add CRM contact detail screen and tappable list items
- `d20a60c` feat(quick-143): add payroll detail bottom sheet, create form, and FAB

TypeScript: web PASS, api-client PASS, mobile passes on all new files (pre-existing FlashList `estimatedItemSize` errors in other files are unrelated to this task).
