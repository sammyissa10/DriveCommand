---
phase: quick-303
plan: "01"
subsystem: driver-pay
tags: [bonuses, deductions, installments, garnishment, rbac]
dependency_graph:
  requires: [prisma-schema-driver-bonus, prisma-schema-driver-deduction]
  provides: [bonus-api, deduction-api, installment-scheduler, driver-profile-tabs]
  affects: [driver-pay-settlements-phase-8]
tech_stack:
  added: []
  patterns:
    - Decimal.js for all money arithmetic (no JS float)
    - Unchecked Prisma input types for direct FK string assignment
    - Pure function installment splitter (zero I/O, trivially testable)
    - $transaction for multi-installment atomic create
key_files:
  created:
    - apps/web/src/lib/driver-pay/installment-scheduler.ts
    - apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/route.ts
    - apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/[bonusId]/route.ts
    - apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/route.ts
    - apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route.ts
    - apps/web/src/components/driver-pay/bonuses/bonuses-tab.tsx
    - apps/web/src/components/driver-pay/bonuses/add-bonus-form.tsx
    - apps/web/src/components/driver-pay/bonuses/installment-preview.tsx
    - apps/web/src/components/driver-pay/deductions/deductions-tab.tsx
    - apps/web/src/components/driver-pay/deductions/add-deduction-form.tsx
    - apps/web/src/lib/driver-pay/__tests__/installment-scheduler.test.ts
    - apps/web/src/app/api/driver-pay/__tests__/bonuses-deductions-api.test.ts
  modified:
    - apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx
decisions:
  - "Used DriverBonusUncheckedCreateInput/UncheckedUpdateInput for direct FK string assignment (avoids verbose relation connect/disconnect syntax)"
  - "CarrierDriver.orgId used (not tenantId) as the FK source for DriverBonus.tenantId — these are the same Tenant record"
  - "InstallmentPreview imports the same pure scheduleInstallments function used server-side — no duplication, no drift"
  - "No Progress shadcn component in project — implemented inline div progress bar"
  - "Zod strict UUID validation (version+variant bits) requires real UUIDs in tests"
metrics:
  duration: "15 minutes"
  completed: "2026-05-13T17:15:05Z"
  tasks_completed: 5
  files_created: 12
  files_modified: 1
---

# Quick Task 303: Phase 7 — Driver Pay: Bonuses, Deductions & Installment Scheduler

One-liner: Bonus/deduction CRUD APIs with penny-exact installment scheduler, garnishment cap enforcement, and tabbed UI on the driver profile page.

## What Was Built

### 1. Installment Scheduler (`lib/driver-pay/installment-scheduler.ts`)

Pure function `scheduleInstallments()` with no I/O or Prisma imports. Uses Decimal.js `ROUND_DOWN` to floor each base slice to 2 decimal places, then assigns the rounding remainder to the last installment. This guarantees the sum is always penny-exact to `totalAmount`. Exported as a named function used by both the POST API route (server-side) and the `InstallmentPreview` component (client-side preview).

### 2. API Endpoints

#### Bonus endpoints (4 handlers across 2 files)

| Method | Endpoint | RBAC | Description |
|--------|----------|------|-------------|
| GET | `/api/driver-pay/drivers/[driverId]/bonuses` | MANAGER+ | List all bonuses |
| POST | `/api/driver-pay/drivers/[driverId]/bonuses` | OWNER+ | Create bonus (single or multi-installment) |
| PUT | `/api/driver-pay/drivers/[driverId]/bonuses/[bonusId]` | OWNER+ | Update unpaid bonus |
| PATCH | `/api/driver-pay/drivers/[driverId]/bonuses/[bonusId]` | MANAGER+ | Mark bonus paid |

REFERRAL validation enforced in both directions:
- `bonusType=REFERRAL` without `referredDriverId` → 422
- `bonusType!=REFERRAL` with `referredDriverId` → 422

Multi-installment flow: `scheduleInstallments()` called when `totalInstallments >= 2`, then parent created first in a `$transaction`, children wired to parent via `parentBonusId`.

#### Deduction endpoints (4 handlers across 2 files)

| Method | Endpoint | RBAC | Description |
|--------|----------|------|-------------|
| GET | `/api/driver-pay/drivers/[driverId]/deductions` | MANAGER+ | List all deductions |
| POST | `/api/driver-pay/drivers/[driverId]/deductions` | OWNER+ | Create deduction |
| PUT | `/api/driver-pay/drivers/[driverId]/deductions/[deductionId]` | OWNER+ | Update deduction |
| PATCH | `/api/driver-pay/drivers/[driverId]/deductions/[deductionId]` | MANAGER+ | Pause/unpause |

Server-side validations:
- Federal garnishment cap: `maxPercentageOfNet > 50` → 422
- Date range: `startsOn > endsOn` → 422
- `FIXED_INSTALLMENTS` without `totalAmount` → 422

Cross-tenant safety: `getTenantPrisma()` applies RLS automatically; `carrierDriver.findFirst({ where: { id: driverId } })` returns null for foreign-tenant IDs → 404.

### 3. UI Components

**`BonusesTab`** — client component with:
- Type filter Select (ALL / 7 bonus types)
- Bonus list with status badges (Paid/Unpaid), installment indicator
- "Mark Paid" confirmation dialog using exact Pattern E copy: "Mark $X bonus as paid? This adds it to the next settlement run for {driverName}."
- Empty state with "Add Bonus" call-to-action
- `AddBonusForm` in a Sheet (right side)

**`AddBonusForm`** — controlled form with conditional fields:
- REFERRAL bonus type shows referred driver picker
- `totalInstallments >= 2` shows interval selector and live `InstallmentPreview`
- Inline 422 error display from server response

**`InstallmentPreview`** — calls `scheduleInstallments()` client-side for real-time preview table. Decimal-safe (same function as server).

**`DeductionsTab`** — client component with:
- Deduction list with type/schedule badges
- `FIXED_INSTALLMENTS`: inline progress bar (div-based, no external component needed) with `text-green-600` "Collected $X of $Y" label
- Paused rows: `opacity-50` + gray "Paused" badge
- Pause/Unpause button per row (PATCH inline)
- Empty state: "No active deductions."

**`AddDeductionForm`** — controlled form with conditional fields:
- `FIXED_INSTALLMENTS` shows totalAmount input
- `GARNISHMENT`/`CHILD_SUPPORT` show maxPercentageOfNet with client-side >50 block and inline error
- Submit blocked while client-side validation error present

**Driver profile page** updated with:
- Server-side tenant drivers fetch for REFERRAL picker (excludes current driver)
- `canEdit` = OWNER/SYSTEM_ADMIN; `canMarkPaid` = MANAGER/OWNER/SYSTEM_ADMIN
- New `<Tabs>` section below existing content: Bonuses + Deductions tabs

### 4. Tests

**`installment-scheduler.test.ts`** — 6 unit tests, no mocks:
- $1000/3 splits to [333.33, 333.33, 333.34]
- $100/4 splits evenly to [25, 25, 25, 25]
- Pay dates offset at intervalDays
- `isParent` flags correct
- `count < 2` throws
- Arbitrary amount cases all sum exactly to totalAmount

**`bonuses-deductions-api.test.ts`** — 10 integration tests with mocked getSession/getTenantPrisma:
1. Multi-installment creates 3 rows summing to $1000 (penny-exact)
2. Pause PATCH persists `paused: true` and returns 200
3a. REFERRAL without referredDriverId → 422
3b. Non-REFERRAL with referredDriverId → 422
4. Cross-tenant driver → 404, create never called
5. `maxPercentageOfNet: 60` → 422; `maxPercentageOfNet: 50` → 201 (boundary)
6. Manager POST bonus → 403
7. Unauthenticated GET → 401
8. Empty deductions list → 200 with `[]`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CarrierDriver uses `orgId` not `tenantId`**
- **Found during:** Task 2 (type errors)
- **Issue:** Plan specified `driver.tenantId` but `CarrierDriver` schema uses `orgId` as the FK to `Tenant`
- **Fix:** All create calls use `driver.orgId` as the value for `DriverBonus.tenantId`/`DriverDeduction.tenantId`
- **Files modified:** bonuses/route.ts, deductions/route.ts

**2. [Rule 1 - Bug] CarrierDriver has no `deletedAt` field**
- **Found during:** Task 2 (type errors)
- **Issue:** Plan's `where: { id: driverId, deletedAt: null }` is invalid for CarrierDriver
- **Fix:** Use `where: { id: driverId }` only; RLS from `getTenantPrisma()` handles tenant scoping
- **Files modified:** all 4 route files

**3. [Rule 1 - Bug] Prisma typed UpdateInput excludes `referredDriverId` direct assignment**
- **Found during:** Task 2 (type error TS2551)
- **Issue:** `DriverBonusUpdateInput` uses relation connect/disconnect syntax; direct FK string not accepted
- **Fix:** Used `Prisma.DriverBonusUncheckedUpdateInput` / `Prisma.DriverDeductionUncheckedUpdateInput` for update payloads
- **Files modified:** bonuses/[bonusId]/route.ts, deductions/[deductionId]/route.ts

**4. [Rule 2 - Missing functionality] No `Progress` shadcn component in project**
- **Found during:** Task 4
- **Issue:** Plan referenced `<Progress>` from shadcn/ui but it's not installed
- **Fix:** Implemented inline div-based progress bar (`h-2 bg-muted rounded-full overflow-hidden` + inner div with dynamic `width: X%`)
- **Files modified:** deductions-tab.tsx

**5. [Rule 1 - Bug] Test UUID `11111111-1111-1111-1111-111111111111` fails Zod v4 UUID validation**
- **Found during:** Task 5 (test 3b failing with 400 instead of 422)
- **Issue:** Zod v4 enforces UUID variant nibble (must be 89ab); `1111` variant nibble is invalid
- **Fix:** Replaced with valid UUID v4 `a3bb189e-8bf9-4bc5-8e72-9e8ca24c3e11`
- **Files modified:** bonuses-deductions-api.test.ts

## Phase 8 Hand-off Notes

Phase 8 (settlement run) will need to:
1. **Query unpaid bonuses**: `driverBonus.findMany({ where: { driverId, paidAt: null, scheduledPayDate: { lte: settlementPeriodEnd } } })`
2. **Apply deductions**: `driverDeduction.findMany({ where: { driverId, paused: false, deletedAt: null, startsOn: { lte: today } } })` — filter by schedule type and apply `amountPerPeriod` up to `totalAmount - amountCollected`
3. **Enforce per-deduction cap**: if `maxPercentageOfNet` set, cap individual deduction at `maxPercentageOfNet% * netPay` before writing
4. **Mark bonuses paid**: set `paidAt = settlementDate` and `settlementId = settlement.id`
5. **Increment amountCollected**: `driverDeduction.update({ data: { amountCollected: { increment: amountApplied } } })`

## Self-Check: PASSED

Files verified:
- `apps/web/src/lib/driver-pay/installment-scheduler.ts` — FOUND
- `apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/route.ts` — FOUND
- `apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/[bonusId]/route.ts` — FOUND
- `apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/route.ts` — FOUND
- `apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route.ts` — FOUND
- `apps/web/src/components/driver-pay/bonuses/bonuses-tab.tsx` — FOUND
- `apps/web/src/components/driver-pay/bonuses/add-bonus-form.tsx` — FOUND
- `apps/web/src/components/driver-pay/bonuses/installment-preview.tsx` — FOUND
- `apps/web/src/components/driver-pay/deductions/deductions-tab.tsx` — FOUND
- `apps/web/src/components/driver-pay/deductions/add-deduction-form.tsx` — FOUND
- `apps/web/src/lib/driver-pay/__tests__/installment-scheduler.test.ts` — FOUND
- `apps/web/src/app/api/driver-pay/__tests__/bonuses-deductions-api.test.ts` — FOUND

Commits verified: 6e79987, 912a602, 8b3f3df, cb55260, 3c90d4a

Test results: 16 new tests pass (6 scheduler + 10 API); pre-existing failures in auth tests unaffected.

Type check: `tsc --noEmit` passes with zero new errors (1 pre-existing remark-gfm module error unrelated).
