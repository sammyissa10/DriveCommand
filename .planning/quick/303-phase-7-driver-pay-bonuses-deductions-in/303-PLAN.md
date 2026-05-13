---
phase: 303-phase-7-driver-pay-bonuses-deductions-in
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
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
  - apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx
  - apps/web/src/lib/driver-pay/__tests__/installment-scheduler.test.ts
  - apps/web/src/app/api/driver-pay/__tests__/bonuses-deductions-api.test.ts
autonomous: true

must_haves:
  truths:
    - "Owner/Manager can create a bonus for a driver via API"
    - "Multi-installment bonuses split totalAmount penny-exact across N installments"
    - "Owner/Manager can create a deduction for a driver with garnishment cap validation"
    - "Manager+ can pause/unpause deductions and mark bonuses paid"
    - "Driver profile page shows Bonuses and Deductions tabs with running balances"
    - "Cross-tenant access to bonuses/deductions is blocked"
  artifacts:
    - path: "apps/web/src/lib/driver-pay/installment-scheduler.ts"
      provides: "Pure function scheduleInstallments() splitting Decimal amount across N installments"
      exports: ["scheduleInstallments"]
    - path: "apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/route.ts"
      provides: "GET (list bonuses) + POST (create bonus, with installment scheduler call)"
      exports: ["GET", "POST"]
    - path: "apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/[bonusId]/route.ts"
      provides: "PUT (update bonus) + PATCH (mark paid)"
      exports: ["PUT", "PATCH"]
    - path: "apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/route.ts"
      provides: "GET (list deductions) + POST (create deduction, with 50% cap validation)"
      exports: ["GET", "POST"]
    - path: "apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route.ts"
      provides: "PUT (update deduction) + PATCH (pause/unpause)"
      exports: ["PUT", "PATCH"]
    - path: "apps/web/src/components/driver-pay/bonuses/bonuses-tab.tsx"
      provides: "Client component listing bonuses with paid/unpaid badges, type filter, Add button"
    - path: "apps/web/src/components/driver-pay/deductions/deductions-tab.tsx"
      provides: "Client component listing deductions with running balance progress bar, pause toggle"
  key_links:
    - from: "POST /api/driver-pay/drivers/[driverId]/bonuses"
      to: "scheduleInstallments() in installment-scheduler.ts"
      via: "import + call when totalInstallments >= 2"
      pattern: "scheduleInstallments\\("
    - from: "bonuses-tab.tsx"
      to: "GET /api/driver-pay/drivers/[driverId]/bonuses"
      via: "fetch in useEffect or SWR hook"
      pattern: "fetch.*driver-pay/drivers/.*/bonuses"
    - from: "deductions-tab.tsx"
      to: "GET /api/driver-pay/drivers/[driverId]/deductions"
      via: "fetch in useEffect or SWR hook"
      pattern: "fetch.*driver-pay/drivers/.*/deductions"
    - from: "Driver profile page.tsx"
      to: "BonusesTab + DeductionsTab"
      via: "Tabs component from shadcn/ui"
      pattern: "<TabsContent.*bonuses|<TabsContent.*deductions"
---

<objective>
Phase 7 — Driver Pay: Bonuses, Deductions & Installment Scheduler.

Build API routes, installment scheduler service, driver-profile tabbed UI, and tests for the bonus/deduction subsystem. Schema is already migrated (DriverBonus, DriverDeduction, BonusType, DeductionType, DeductionSchedule enums). No Prisma changes.

Purpose: Owners need to grant bonuses (sign-on, retention, safety, referral, with optional installment plans) and apply deductions (advances, garnishments, equipment leases) that flow into driver settlements. Federal 50% net-pay cap on garnishments must be enforced server-side.

Output:
- 1 pure scheduler module (Decimal-safe installment splitter)
- 4 API route files (GET/POST + PUT/PATCH per resource)
- 5 React components (2 tabs, 2 forms, 1 preview)
- Driver profile page wired to new tabs
- 2 test files (scheduler unit tests + API integration tests)
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md

# Existing API route pattern to mirror exactly (serializer + zod + getSession + getTenantPrisma)
@apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts

# Existing API test pattern to mirror exactly (vi.mock for getSession, getTenantPrisma, etc.)
@apps/web/src/app/api/driver-pay/__tests__/components-api.test.ts

# Existing scheduler-style pure module pattern
@apps/web/src/lib/driver-pay/snapshot.ts

# Roles + RBAC helpers
@apps/web/src/lib/auth/roles.ts

# Driver profile page that needs the new tabs section
@apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx

# Prisma models for reference (DO NOT MODIFY — already migrated)
# DriverBonus: lines 2694-2729 in apps/web/prisma/schema.prisma
# DriverDeduction: lines 2732-2759
# Enums: lines 1511-1535
</context>

<tasks>

<task type="auto">
  <name>Task 1: Installment scheduler service (pure module)</name>
  <files>
    apps/web/src/lib/driver-pay/installment-scheduler.ts
  </files>
  <action>
Create the pure installment-splitter module. NO Prisma imports here — this is a pure pre-computation step. The route handler will call this, then run the create-many in a Prisma transaction.

Implementation:
```typescript
import Decimal from 'decimal.js';
import type { Prisma, BonusType } from '@/generated/prisma';

export interface InstallmentBaseInput {
  tenantId: string;
  driverId: string;
  bonusType: BonusType;
  description: string;
  triggerDate: Date;
  referredDriverId?: string | null;
  isTaxable: boolean;
  visibleToDriver: boolean;
  notes?: string | null;
  createdBy: string;
}

export interface ScheduledInstallment {
  amount: Decimal;
  scheduledPayDate: Date;
  installmentNumber: number;
  totalInstallments: number;
  // parentBonusId is null for installment 1, set to parent's id for 2..N (assigned at insert time)
  isParent: boolean;
}

export function scheduleInstallments(params: {
  totalAmount: Decimal;
  count: number;
  startDate: Date;
  intervalDays: number; // 7, 14, or 30
}): ScheduledInstallment[] {
  if (params.count < 2) {
    throw new Error('scheduleInstallments requires count >= 2');
  }

  // Decimal.js floor-to-2-decimals (NOT JS float). Use toDecimalPlaces with ROUND_DOWN (mode 1).
  const base = params.totalAmount
    .div(params.count)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN);

  const installments: ScheduledInstallment[] = [];
  let runningSum = new Decimal(0);

  for (let i = 0; i < params.count; i++) {
    const isLast = i === params.count - 1;
    const amount = isLast
      ? params.totalAmount.minus(runningSum) // absorbs rounding remainder
      : base;
    runningSum = runningSum.plus(amount);

    const scheduledPayDate = new Date(params.startDate);
    scheduledPayDate.setDate(scheduledPayDate.getDate() + i * params.intervalDays);

    installments.push({
      amount,
      scheduledPayDate,
      installmentNumber: i + 1,
      totalInstallments: params.count,
      isParent: i === 0,
    });
  }

  return installments;
}
```

Why this approach:
- Pure function with no I/O — trivially unit-testable.
- ROUND_DOWN floor ensures children are equal or smaller; last installment absorbs the remainder so sum is penny-exact.
- `isParent` flag tells the caller which row gets `parentBonusId = null` (the parent) vs which rows get the parent's id wired in after creation.
- Caller (POST handler) creates parent first, captures its id, then creates children with `parentBonusId = parent.id` inside a `prisma.$transaction([])`.

Do NOT use JS Math.floor or `/` — Decimal.js only for money.
  </action>
  <verify>
    Run: `cd apps/web && npx tsc --noEmit` — no type errors.
    File exists and exports `scheduleInstallments`.
  </verify>
  <done>
    Pure function exists, returns ScheduledInstallment[] with penny-exact split.
    No Prisma client imports in this file.
  </done>
</task>

<task type="auto">
  <name>Task 2: Bonus API routes (list/create + update/mark-paid)</name>
  <files>
    apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/route.ts
    apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/[bonusId]/route.ts
  </files>
  <action>
Mirror the pattern from `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts` exactly: top-of-file serializer, zod schema, `getSession()`, `getTenantPrisma()`, `Decimal` for money, proper 401/403/404/422 status codes.

**RBAC helpers (define inline at top of each file or import from roles.ts):**
```typescript
import { UserRole } from '@/lib/auth/roles';

function isManagerOrAbove(role: string): boolean {
  const r = role.toUpperCase();
  return r === UserRole.SYSTEM_ADMIN || r === UserRole.OWNER || r === UserRole.MANAGER;
}
function isOwnerOrAbove(role: string): boolean {
  const r = role.toUpperCase();
  return r === UserRole.SYSTEM_ADMIN || r === UserRole.OWNER;
}
```

**File 1: `route.ts` (collection)**

Serializer `serializeBonus(b)`:
- id, tenantId, driverId, bonusType, amount.toString(), description, triggerDate.toISOString(), scheduledPayDate (null or ISO), paidAt (null or ISO), installmentNumber, totalInstallments, parentBonusId, referredDriverId, settlementId, isTaxable, visibleToDriver, notes, createdAt/updatedAt (ISO), createdBy, deletedAt (null or ISO).

GET (MANAGER+):
- Validate session, check role with `isManagerOrAbove`. If false → 403.
- Verify driver exists in tenant: `await prisma.carrierDriver.findFirst({ where: { id: driverId, deletedAt: null } })`. If null → 404. (getTenantPrisma scopes the query, so this also blocks cross-tenant.)
- `prisma.driverBonus.findMany({ where: { driverId, deletedAt: null }, orderBy: { triggerDate: 'desc' } })`.
- Return `{ bonuses: rows.map(serializeBonus) }`.

POST (OWNER+):
- Validate session, check role with `isOwnerOrAbove`. If false → 403.
- Verify driver exists (as above) → 404 if not.
- Zod schema:
  ```typescript
  const CreateBonusSchema = z.object({
    bonusType: z.enum(['SIGN_ON','RETENTION','SAFETY','FUEL_EFFICIENCY','REFERRAL','PERFORMANCE','OTHER']),
    amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
    description: z.string().min(1).max(255),
    triggerDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    scheduledPayDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
    totalInstallments: z.number().int().min(2).optional(),
    intervalDays: z.number().int().positive().optional(), // required if totalInstallments set
    referredDriverId: z.string().uuid().nullable().optional(),
    isTaxable: z.boolean().optional().default(true),
    visibleToDriver: z.boolean().optional().default(true),
    notes: z.string().nullable().optional(),
  });
  ```
- REFERRAL validation (both directions):
  - If `bonusType === 'REFERRAL'` and no `referredDriverId` → return 422 `{ error: 'Referral bonus requires referredDriverId.' }`
  - If `bonusType !== 'REFERRAL'` and `referredDriverId` is set → return 422 `{ error: 'referredDriverId is only allowed for REFERRAL bonuses.' }`
- If `totalInstallments` provided (>= 2):
  - Require `intervalDays` in body, default startDate = `scheduledPayDate ?? triggerDate`.
  - Call `scheduleInstallments({ totalAmount: new Decimal(body.amount), count: body.totalInstallments, startDate, intervalDays: body.intervalDays })`.
  - In a `prisma.$transaction(async (tx) => { ... })`:
    1. Create parent (installment 1) with `parentBonusId: null`, capture `parent.id`.
    2. Create children 2..N with `parentBonusId: parent.id`.
    3. Return parent + children.
  - Response: `{ bonus: serializeBonus(parent), installments: children.map(serializeBonus) }` status 201.
- If not multi-installment: single create, return `{ bonus: serializeBonus(created) }` status 201.

**File 2: `[bonusId]/route.ts`**

PUT (OWNER+):
- Same RBAC + driver check + look up bonus by id, scope filter: `where: { id: bonusId, driverId, deletedAt: null }`. 404 if not found.
- Reject if `paidAt !== null` → 409 `{ error: 'Cannot edit a paid bonus.' }`.
- Zod schema mirrors create but all fields optional. Same REFERRAL validation if `bonusType` or `referredDriverId` changes.
- Update only provided fields. Return `{ bonus: serializeBonus(updated) }`.

PATCH mark-paid (MANAGER+):
- Body: `{ paidAt?: string }` — defaults to `new Date()` if missing.
- 404 if bonus not found in this driver. 409 if `paidAt !== null`.
- `prisma.driverBonus.update({ where: { id: bonusId }, data: { paidAt: parsedPaidAt } })`.
- Return `{ bonus: serializeBonus(updated) }`.

All errors must return JSON `{ error: string }` with proper status. Always use `Decimal` for `amount` writes. Always set `createdBy: session.userId` on create.

Cross-tenant safety: `getTenantPrisma()` adds the tenant filter; never trust `tenantId` from the request body — always pull from session/driver record.
  </action>
  <verify>
    `cd apps/web && npx tsc --noEmit` — no errors.
    Manual smoke (after deploy or local dev): `curl -X POST /api/driver-pay/drivers/{id}/bonuses -d '{...}'` returns 201 with serialized bonus.
  </verify>
  <done>
    Both route files exist with GET/POST and PUT/PATCH respectively.
    REFERRAL validation blocks both invalid cases with 422.
    Installment flow creates parent + N-1 children in a transaction.
    Manager cannot create bonus (403), but can mark paid (200).
  </done>
</task>

<task type="auto">
  <name>Task 3: Deduction API routes (list/create + update/pause)</name>
  <files>
    apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/route.ts
    apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route.ts
  </files>
  <action>
Same pattern as Task 2 (serializer at top, zod schema, getSession, getTenantPrisma, Decimal, status codes). RBAC helpers same as Task 2.

**File 1: `route.ts` (collection)**

Serializer `serializeDeduction(d)`:
- id, tenantId, driverId, deductionType, schedule, amountPerPeriod.toString(), totalAmount (null or string), amountCollected.toString(), maxPercentageOfNet (null or string), startsOn.toISOString(), endsOn (null or ISO), paused, visibleToDriver, notes, createdAt/updatedAt (ISO), createdBy, deletedAt (null or ISO).

GET (MANAGER+):
- Auth gate, role check, driver-exists check (404 if not in tenant).
- `prisma.driverDeduction.findMany({ where: { driverId, deletedAt: null }, orderBy: { startsOn: 'desc' } })`.
- Return `{ deductions: rows.map(serializeDeduction) }`.

POST (OWNER+):
- Auth + RBAC + driver check.
- Zod schema:
  ```typescript
  const CreateDeductionSchema = z.object({
    deductionType: z.enum(['ADVANCE','ESCROW','GARNISHMENT','CHILD_SUPPORT','EQUIPMENT_LEASE','INSURANCE','OTHER']),
    schedule: z.enum(['ONE_TIME','EVERY_SETTLEMENT','FIXED_INSTALLMENTS']),
    amountPerPeriod: z.string().regex(/^\d+(\.\d{1,2})?$/),
    totalAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
    maxPercentageOfNet: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
    startsOn: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    endsOn: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
    visibleToDriver: z.boolean().optional().default(true),
    notes: z.string().nullable().optional(),
  });
  ```
- Validations:
  1. **Federal garnishment cap**: if `maxPercentageOfNet` is set, parse as Decimal; if `> 50` → 422 `{ error: 'maxPercentageOfNet cannot exceed 50% (federal garnishment cap).' }`.
  2. **Date range**: if both `startsOn` and `endsOn` set, ensure `startsOn <= endsOn`. Else 422.
  3. **FIXED_INSTALLMENTS requires totalAmount**: if `schedule === 'FIXED_INSTALLMENTS'` and `totalAmount` is null/missing → 422 `{ error: 'FIXED_INSTALLMENTS requires totalAmount.' }`.
  4. **GARNISHMENT/CHILD_SUPPORT should have maxPercentageOfNet** (warn-level — accept but no validation error per spec; just trust client).
- Create: `prisma.driverDeduction.create({ data: { tenantId: driver.tenantId, driverId, ...mapped, amountCollected: new Decimal(0), paused: false, createdBy: session.userId } })`.
- Return `{ deduction: serializeDeduction(created) }` status 201.

**File 2: `[deductionId]/route.ts`**

PUT (OWNER+):
- Look up deduction scoped to `driverId`. 404 if not found.
- Zod with all fields optional. Re-run validations on whatever's provided (50% cap, date range, FIXED_INSTALLMENTS requirement if schedule changes).
- Update only provided fields. Return `{ deduction: serializeDeduction(updated) }`.

PATCH pause/unpause (MANAGER+):
- Body: `{ paused: boolean }` (required).
- 404 if not found.
- `prisma.driverDeduction.update({ where: { id: deductionId }, data: { paused: body.paused } })`.
- Return `{ deduction: serializeDeduction(updated) }`.

All money fields written as `new Decimal(string)`. Never trust client tenantId. All errors return `{ error: string }`.
  </action>
  <verify>
    `cd apps/web && npx tsc --noEmit` — no errors.
    Manual smoke: POST with `maxPercentageOfNet: '60'` returns 422.
  </verify>
  <done>
    Both route files exist with GET/POST and PUT/PATCH.
    50% cap enforced (422 on excess).
    Date range and FIXED_INSTALLMENTS totalAmount validations both enforced.
    Manager can pause but not create (403 on POST as manager).
  </done>
</task>

<task type="auto">
  <name>Task 4: UI — Bonuses & Deductions tabs on driver profile</name>
  <files>
    apps/web/src/components/driver-pay/bonuses/bonuses-tab.tsx
    apps/web/src/components/driver-pay/bonuses/add-bonus-form.tsx
    apps/web/src/components/driver-pay/bonuses/installment-preview.tsx
    apps/web/src/components/driver-pay/deductions/deductions-tab.tsx
    apps/web/src/components/driver-pay/deductions/add-deduction-form.tsx
    apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx
  </files>
  <action>
All new components are `'use client'` React components using shadcn/ui primitives (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `Dialog`, `Sheet`, `Button`, `Badge`, `Input`, `Label`, `Select`, `Textarea`, `Progress`). Use `decimal.js` for any math; never JS float on money.

**1. `bonuses/bonuses-tab.tsx`** (`'use client'`)
- Props: `{ driverId: string; driverName: string; canEdit: boolean }` (canEdit = role is OWNER+).
- State: `bonuses: Bonus[]`, `loading`, `typeFilter: BonusType | 'ALL'`, `addOpen: boolean`.
- On mount: `fetch('/api/driver-pay/drivers/' + driverId + '/bonuses')` → setBonuses.
- Render:
  - Header row: type filter `<Select>` (All / SIGN_ON / RETENTION / SAFETY / FUEL_EFFICIENCY / REFERRAL / PERFORMANCE / OTHER), plus "Add Bonus" button (only if canEdit) → opens `<AddBonusForm>`.
  - Filtered list:
    - Each row: bonus type badge, description, amount ($X.XX formatted with `Intl.NumberFormat`), triggerDate, scheduledPayDate, status badge.
    - Status badge: if `paidAt` set → `<Badge variant="default" class="bg-green-600">Paid</Badge>`; else → `<Badge variant="secondary">Unpaid</Badge>`.
    - Installment indicator: if `totalInstallments`, show "Installment {n} of {total}" in small muted text.
    - If unpaid and canEdit (MANAGER+ via canEdit OR canMarkPaid prop — keep it simple: pass `canMarkPaid: boolean` from server): show "Mark Paid" button. Click → confirmation dialog per spec Section 8 Pattern E: "Mark $X bonus as paid? This adds it to the next settlement run for {driverName}." → PATCH `/api/driver-pay/drivers/[driverId]/bonuses/[bonusId]` with `{ paidAt: new Date().toISOString() }`. On success: refetch list, show inline checkmark for 2s.
  - Empty state: when `bonuses.length === 0` and not loading: card with text "No bonuses recorded for this driver yet." + "Add Bonus" button.
- Use `useTransition` or simple `isSubmitting` state for inline save spinner.

**2. `bonuses/add-bonus-form.tsx`** (`'use client'`)
- Props: `{ driverId: string; onClose: () => void; onSaved: () => void; tenantDrivers: { id: string; name: string }[] }` (tenantDrivers used for REFERRAL picker).
- Fields (controlled inputs):
  - `bonusType` — Select with 7 options.
  - `amount` — Input type="text" with `inputMode="decimal"` and pattern `^\d+(\.\d{0,2})?$`.
  - `description` — Input, max 255.
  - `triggerDate` — Input type="date".
  - `scheduledPayDate` — Input type="date" (optional).
  - `totalInstallments` — Input type="number" min=1 (treat 1 as "no installments"; only call scheduler if >= 2). Default 1.
  - `intervalDays` — Select 7 / 14 / 30. Shown only when `totalInstallments >= 2`.
  - `referredDriverId` — Select from `tenantDrivers`. Shown only when `bonusType === 'REFERRAL'`.
  - `isTaxable` — Checkbox, default true.
  - `visibleToDriver` — Checkbox, default true.
  - `notes` — Textarea, optional.
- When `totalInstallments >= 2` AND amount + intervalDays + (scheduledPayDate || triggerDate) all set:
  - Render `<InstallmentPreview totalAmount={amount} count={totalInstallments} startDate={scheduledPayDate || triggerDate} intervalDays={intervalDays} />` BEFORE the Save button.
- On submit: POST to `/api/driver-pay/drivers/[driverId]/bonuses`. If 422 → show inline error from response. On 201 → onSaved(); onClose(). Show inline spinner + 2s checkmark.

**3. `bonuses/installment-preview.tsx`** (`'use client'`)
- Props: `{ totalAmount: string; count: number; startDate: string; intervalDays: number }`.
- Imports `scheduleInstallments` from `@/lib/driver-pay/installment-scheduler` and `Decimal` from `decimal.js`.
- Computes the schedule client-side (same pure function — that's why it's pure). Wraps in try/catch (count<2 throws).
- Renders a small table: "Installment {n} | {date} | ${amount}".
- Above the table: "Schedule preview ({count} installments totaling ${totalAmount}):"

**4. `deductions/deductions-tab.tsx`** (`'use client'`)
- Props: `{ driverId: string; driverName: string; canEdit: boolean }`.
- Fetch GET `/api/driver-pay/drivers/[driverId]/deductions` on mount.
- Header: "Add Deduction" button (if canEdit) → `<AddDeductionForm>`.
- For each deduction row:
  - Type badge, description, schedule label, "$X/period".
  - If `schedule === 'FIXED_INSTALLMENTS'` and `totalAmount`: show progress bar (`<Progress>` from shadcn/ui) with `value={(amountCollected / totalAmount) * 100}`, label "Collected $X of $Y" in `text-green-600`.
  - Date range: "Starts {startsOn}{endsOn ? ` — Ends ${endsOn}` : ''}".
  - If `paused`: outer wrapper gets `opacity-50`; show gray `<Badge>Paused</Badge>`.
  - Pause/Unpause button (if canEdit): PATCH `/api/driver-pay/drivers/[driverId]/deductions/[deductionId]` with `{ paused: !current }`. Inline spinner + refetch.
- Empty state: "No active deductions." + "Add Deduction" button.

**5. `deductions/add-deduction-form.tsx`** (`'use client'`)
- Props: `{ driverId: string; onClose; onSaved }`.
- Fields:
  - `deductionType` — Select with 7 options.
  - `schedule` — Select (ONE_TIME / EVERY_SETTLEMENT / FIXED_INSTALLMENTS).
  - `amountPerPeriod` — Input decimal.
  - `totalAmount` — Input decimal. Shown only when `schedule === 'FIXED_INSTALLMENTS'`.
  - `maxPercentageOfNet` — Input decimal 0-50. Shown only when `deductionType in ['GARNISHMENT','CHILD_SUPPORT']`. Client-side block on >50 with inline error.
  - `startsOn` — Input type="date" (required).
  - `endsOn` — Input type="date" (optional).
  - `visibleToDriver` — Checkbox, default true.
  - `notes` — Textarea optional.
- Submit POST. 422 errors shown inline. On 201 → onSaved(); onClose().

**6. Wire into `apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx`**
- Read existing file first. Find the section after the existing compensation/driver-info card.
- Add server-side fetch of tenant drivers list for the REFERRAL picker: use existing `getCarrierDrivers(orgId)` or similar (check `apps/web/src/lib/carrier/fleet-drivers.ts`; if no list function, do `prisma.carrierDriver.findMany({ where: { deletedAt: null }, select: { id: true, firstName: true, lastName: true } })` via getTenantPrisma).
- Determine `canEdit`: `const role = session.role.toUpperCase(); const canEdit = role === 'SYSTEM_ADMIN' || role === 'OWNER';`
- Determine `canMarkPaid`: `role === 'SYSTEM_ADMIN' || role === 'OWNER' || role === 'MANAGER'`.
- Render a new `<Tabs>` section below the existing driver detail content:
  ```tsx
  <Tabs defaultValue="bonuses" className="mt-8">
    <TabsList>
      <TabsTrigger value="bonuses">Bonuses</TabsTrigger>
      <TabsTrigger value="deductions">Deductions</TabsTrigger>
    </TabsList>
    <TabsContent value="bonuses">
      <BonusesTab driverId={id} driverName={`${driver.firstName} ${driver.lastName}`} canEdit={canEdit} canMarkPaid={canMarkPaid} tenantDrivers={tenantDrivers} />
    </TabsContent>
    <TabsContent value="deductions">
      <DeductionsTab driverId={id} driverName={`${driver.firstName} ${driver.lastName}`} canEdit={canEdit} />
    </TabsContent>
  </Tabs>
  ```
- Imports added: `Tabs, TabsList, TabsTrigger, TabsContent` from `@/components/ui/tabs`; `BonusesTab`, `DeductionsTab` from the new client components.

UI/UX cues from spec Section 8:
- Empty states use the exact copy specified above.
- Mark-paid confirmation uses Pattern E text exactly.
- Paused deductions use `opacity-50` and gray `Paused` badge.
- FIXED_INSTALLMENTS progress bar uses `text-green-600` for the label.
- Use shadcn/ui `Dialog` for the confirmation prompts, `Sheet` for the Add forms (consistent with rest of carrier portal).
- Inline save state: while submitting, button shows spinner; after success, swap to checkmark for 2s before closing the sheet.
- All money displayed via `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`.
- No Math.* on money — always Decimal.

Do NOT add new dependencies. Use existing shadcn/ui primitives already in the project. Tailwind classes follow existing carrier portal style (refer to `apps/web/src/components/driver-pay/pay-components-list.tsx` for tone).
  </action>
  <verify>
    `cd apps/web && npx tsc --noEmit` — no errors.
    Visit `/carrier/fleet/drivers/{id}` locally — Bonuses + Deductions tabs render below existing detail; "Add Bonus" opens sheet; setting installments=3 shows preview table.
  </verify>
  <done>
    Driver profile page has working Bonuses & Deductions tabs.
    Add Bonus form shows installment preview when installments >= 2.
    Add Deduction form blocks >50% client-side and server-side.
    Empty states, mark-paid confirmation, paused styling all match spec Section 8.
  </done>
</task>

<task type="auto">
  <name>Task 5: Tests — installment scheduler unit tests + bonus/deduction API tests</name>
  <files>
    apps/web/src/lib/driver-pay/__tests__/installment-scheduler.test.ts
    apps/web/src/app/api/driver-pay/__tests__/bonuses-deductions-api.test.ts
  </files>
  <action>
Use `vitest`, mirror the patterns from existing tests in those same directories.

**File 1: `installment-scheduler.test.ts`** — pure unit tests, no mocks needed.

```typescript
import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { scheduleInstallments } from '@/lib/driver-pay/installment-scheduler';

describe('scheduleInstallments', () => {
  it('splits $1000 / 3 to penny-exact [333.33, 333.33, 333.34]', () => {
    const result = scheduleInstallments({
      totalAmount: new Decimal('1000.00'),
      count: 3,
      startDate: new Date('2026-06-01'),
      intervalDays: 14,
    });
    expect(result.map(r => r.amount.toString())).toEqual(['333.33', '333.33', '333.34']);
    const sum = result.reduce((acc, r) => acc.plus(r.amount), new Decimal(0));
    expect(sum.toString()).toBe('1000');
  });

  it('splits $100 / 4 evenly when no remainder', () => {
    const result = scheduleInstallments({
      totalAmount: new Decimal('100.00'),
      count: 4,
      startDate: new Date('2026-06-01'),
      intervalDays: 7,
    });
    expect(result.map(r => r.amount.toString())).toEqual(['25', '25', '25', '25']);
  });

  it('schedules pay dates at intervalDays offsets', () => {
    const start = new Date('2026-06-01');
    const result = scheduleInstallments({
      totalAmount: new Decimal('600'),
      count: 3,
      startDate: start,
      intervalDays: 30,
    });
    expect(result[0].scheduledPayDate.toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(result[1].scheduledPayDate.toISOString().slice(0, 10)).toBe('2026-07-01');
    expect(result[2].scheduledPayDate.toISOString().slice(0, 10)).toBe('2026-07-31');
  });

  it('marks installment 1 as parent and 2..N as non-parent', () => {
    const result = scheduleInstallments({
      totalAmount: new Decimal('300'),
      count: 3,
      startDate: new Date('2026-06-01'),
      intervalDays: 7,
    });
    expect(result[0].isParent).toBe(true);
    expect(result[1].isParent).toBe(false);
    expect(result[2].isParent).toBe(false);
    expect(result.map(r => r.installmentNumber)).toEqual([1, 2, 3]);
    expect(result.every(r => r.totalInstallments === 3)).toBe(true);
  });

  it('throws when count < 2', () => {
    expect(() => scheduleInstallments({
      totalAmount: new Decimal('100'),
      count: 1,
      startDate: new Date(),
      intervalDays: 7,
    })).toThrow();
  });
});
```

**File 2: `bonuses-deductions-api.test.ts`** — mirror `components-api.test.ts` mocking pattern.

Top of file:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/supabase', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/context/tenant-context', () => ({
  requireTenantId: vi.fn().mockResolvedValue('tenant-A'),
  getTenantPrisma: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { POST as createBonus } from '@/app/api/driver-pay/drivers/[driverId]/bonuses/route';
import { PATCH as patchDeduction } from '@/app/api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route';
import { GET as listDeductions, POST as createDeduction } from '@/app/api/driver-pay/drivers/[driverId]/deductions/route';
```

Helper to build a mocked prisma instance:
```typescript
function makePrisma(opts: { driver?: object | null; bonus?: object | null; deduction?: object | null } = {}) {
  return {
    carrierDriver: {
      findFirst: vi.fn().mockResolvedValue(opts.driver === undefined ? { id: 'd1', tenantId: 'tenant-A', firstName: 'A', lastName: 'B' } : opts.driver),
    },
    driverBonus: {
      create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'b-new', ...data, createdAt: new Date(), updatedAt: new Date(), paidAt: null, deletedAt: null })),
      findFirst: vi.fn().mockResolvedValue(opts.bonus ?? null),
      update: vi.fn(),
    },
    driverDeduction: {
      create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'd-new', ...data, amountCollected: { toString: () => '0' }, createdAt: new Date(), updatedAt: new Date(), deletedAt: null })),
      findFirst: vi.fn().mockResolvedValue(opts.deduction ?? null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'd-1', tenantId: 'tenant-A', driverId: 'd1', ...data, amountCollected: { toString: () => '0' }, amountPerPeriod: { toString: () => '100' }, startsOn: new Date(), createdAt: new Date(), updatedAt: new Date(), deletedAt: null })),
    },
    $transaction: vi.fn().mockImplementation(async (fn: any) => {
      if (typeof fn === 'function') return fn(this);
      return Promise.all(fn);
    }),
  };
}
```

Tests to write (cover all four scenarios from the spec):

1. **Installment splitter penny-exact (integration)** — POST bonus with `amount: '1000', totalInstallments: 3, intervalDays: 14`. Assert `prisma.driverBonus.create` called 3 times with amounts `333.33, 333.33, 333.34` (sum = 1000). (Stub `$transaction` to invoke its callback so the create calls happen.)

2. **Pause persists** — PATCH deduction with `{ paused: true }` as MANAGER. Mock `findFirst` to return an existing deduction. Assert `update` called with `data: { paused: true }`, response status 200, returned `deduction.paused === true`.

3. **REFERRAL validation both directions**:
   - 3a: POST bonus `bonusType: 'REFERRAL'` with no `referredDriverId` → expect 422 + error message mentions "Referral".
   - 3b: POST bonus `bonusType: 'SAFETY'` WITH `referredDriverId: 'some-uuid'` → expect 422 + error message mentions "REFERRAL".

4. **Tenant isolation** — Session is `tenant-A` but the driver lookup returns `null` (simulating a driverId from tenant-B since getTenantPrisma scopes the query). POST bonus → expect 404. Assert `driverBonus.create` NOT called.

5. **Bonus garnishment cap on deduction** — POST deduction with `maxPercentageOfNet: '60'` as OWNER → 422.

Each test sets:
```typescript
beforeEach(() => {
  vi.clearAllMocks();
  (getSession as any).mockResolvedValue({ userId: 'u1', tenantId: 'tenant-A', role: 'OWNER' });
  (getTenantPrisma as any).mockResolvedValue(makePrisma());
});
```

For RBAC test (Manager cannot create): override `getSession` to return `role: 'MANAGER'`, POST → 403.

Use `new NextRequest('http://localhost/api/...', { method: 'POST', body: JSON.stringify({...}) })` per existing test patterns.

Each handler signature takes `{ params: Promise<{ driverId: string }> }` — pass `{ params: Promise.resolve({ driverId: 'd1' }) }`.
  </action>
  <verify>
    `cd apps/web && npx vitest run src/lib/driver-pay/__tests__/installment-scheduler.test.ts src/app/api/driver-pay/__tests__/bonuses-deductions-api.test.ts` — all tests pass.
  </verify>
  <done>
    All 5 scenario tests pass.
    Scheduler unit tests prove penny-exact behavior.
    REFERRAL validation tested both directions.
    Cross-tenant access blocked (404).
    Pause persists (200 + paused: true in response).
  </done>
</task>

</tasks>

<verification>
After all tasks:

1. **Type check:** `cd apps/web && npx tsc --noEmit` — zero errors.
2. **Unit + API tests:** `cd apps/web && npx vitest run` — new tests green, existing tests still green.
3. **Manual smoke (local dev server):**
   - Visit `/carrier/fleet/drivers/{some-driver-id}` as OWNER — see Bonuses + Deductions tabs.
   - Click "Add Bonus" → set installments=3, amount=1000, intervalDays=14 — preview table shows 333.33 / 333.33 / 333.34.
   - Submit → list refreshes with 3 rows (Installment 1/3, 2/3, 3/3).
   - Click "Mark Paid" on installment 1 → confirmation dialog shows exact spec copy → confirms → badge flips to Paid.
   - Switch to Deductions tab → "Add Deduction" → set `deductionType: GARNISHMENT, maxPercentageOfNet: 60` → server returns 422, inline error shown.
   - Set to 25, FIXED_INSTALLMENTS, totalAmount=500, amountPerPeriod=100 → saves → progress bar shows "Collected $0 of $500".
4. **Cross-tenant:** log in as a different tenant, try to GET `/api/driver-pay/drivers/{tenant-A-driver-id}/bonuses` — returns 404.
</verification>

<success_criteria>
- [ ] Pure `scheduleInstallments` exists in `lib/driver-pay/installment-scheduler.ts`, no Prisma imports.
- [ ] 4 API route files exist with documented status codes and RBAC.
- [ ] REFERRAL validation rejects both invalid directions with 422.
- [ ] 50% garnishment cap enforced server-side with 422.
- [ ] Installment POST creates parent + N-1 children in a transaction.
- [ ] Driver profile page renders Bonuses + Deductions tabs.
- [ ] Bonus form shows installment preview when installments >= 2.
- [ ] Deduction list shows progress bar for FIXED_INSTALLMENTS; paused rows are opacity-50 with badge.
- [ ] Mark-paid uses exact Pattern E confirmation copy.
- [ ] Empty state copy matches spec Section 8.6 exactly.
- [ ] Test file proves penny-exact split for $1000/3.
- [ ] Test proves pause persists.
- [ ] Test proves cross-tenant returns 404.
- [ ] All money math uses `Decimal` from `decimal.js` — zero JS float arithmetic on money.
- [ ] `tsc --noEmit` and `vitest run` both pass.
</success_criteria>

<output>
After completion, create `.planning/quick/303-phase-7-driver-pay-bonuses-deductions-in/303-SUMMARY.md` covering:
- Files created and their roles
- API endpoints exposed (with RBAC matrix)
- How installment scheduler is invoked
- Test coverage delivered
- Any deviations from the plan with reasoning
- Next phase hand-off notes (Phase 8 will likely wire bonuses/deductions into settlement run)
</output>
