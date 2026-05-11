---
phase: 299-driver-pay-phase-4-pay-components
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/driver-pay/calculator.ts
  - apps/web/src/lib/driver-pay/detention.ts
autonomous: true

must_haves:
  truths:
    - "Every formula returns a penny-exact Decimal result matching spec Section 10.1"
    - "calcDetention returns null when elapsed time is within free_time; never returns negative"
    - "computeGrossAmount dispatches to the correct formula for every PayComponentType"
    - "suggestDetention returns null when stop has no detention earned"
  artifacts:
    - path: "apps/web/src/lib/driver-pay/calculator.ts"
      provides: "Pure formula functions + computeGrossAmount dispatcher"
      exports: ["calcCpm", "calcFuelSurcharge", "calcHourly", "calcFlat", "calcPercentage", "calcDaily", "calcSplit", "calcDetention", "calcFederalOT", "calcStateDailyOT", "computeGrossAmount", "ComputeInput"]
    - path: "apps/web/src/lib/driver-pay/detention.ts"
      provides: "suggestDetention helper"
      exports: ["suggestDetention", "DetentionInput", "DetentionSuggestion"]
  key_links:
    - from: "apps/web/src/lib/driver-pay/detention.ts"
      to: "apps/web/src/lib/driver-pay/calculator.ts"
      via: "calcDetention imported and called"
      pattern: "calcDetention"
---

<objective>
Build the pure-function service layer for Driver Pay Phase 4: a complete formula library (calculator.ts) and a detention suggestion helper (detention.ts). These are the computational foundation all API routes and UI depend on.

Purpose: All money arithmetic is centralised in one side-effect-free module using decimal.js. No DB access, no server-only imports — safe to import from both server and client contexts for testing.

Output: calculator.ts with 10 formula functions + dispatcher, and detention.ts with the suggestion helper.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/driver-pay/snapshot.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: calculator.ts — formula library + computeGrossAmount dispatcher</name>
  <files>apps/web/src/lib/driver-pay/calculator.ts</files>
  <action>
    Create `apps/web/src/lib/driver-pay/calculator.ts`. No `'use server'` or `'use client'` directive — this is a pure utility.

    Import: `import Decimal from 'decimal.js'` (decimal.js is already in package.json via the web app — confirm with `grep -r "decimal.js" apps/web/package.json`).

    Export the `ComputeInput` type:
    ```typescript
    export type ComputeInput = {
      componentType: string;          // PayComponentType enum value as string
      quantity: Decimal;              // e.g. miles, hours, days, stops
      rate: Decimal;                  // base rate per unit
      multiplier: Decimal;            // default 1.0
      loadedMilesOnly?: boolean;      // for CPM: use loaded_miles (quantity) when true
      loadRevenue?: Decimal;          // for PERCENTAGE
      splitTotal?: Decimal;           // for SPLIT: total load pay pool
      splitPct?: Decimal;             // for SPLIT: percentage (0-100 scale)
      arrivedAt?: Date;               // for DETENTION
      departedAt?: Date;              // for DETENTION
      freeTimeMinutes?: number;       // for DETENTION, default 120
      weeklyHours?: Decimal;          // for FEDERAL_OT (alias OVERTIME)
      dailyHours?: Decimal;           // for STATE_DAILY_OT
      dailyThreshold?: Decimal;       // for STATE_DAILY_OT, default 8
      otMultiplier?: Decimal;         // for OT calculations
    };
    ```

    Export each formula function (all inputs/outputs use Decimal; never Number for arithmetic):

    1. `export function calcCpm(miles: Decimal, rate: Decimal, multiplier: Decimal): Decimal`
       - Return `miles.mul(rate).mul(multiplier)`
       - Note: when `loadedMilesOnly` is true the CALLER passes loaded miles as `miles` — the function itself does not branch on that flag.

    2. `export function calcFuelSurcharge(miles: Decimal, fscRate: Decimal): Decimal`
       - Return `miles.mul(fscRate)`

    3. `export function calcHourly(hours: Decimal, rate: Decimal, multiplier: Decimal): Decimal`
       - Return `hours.mul(rate).mul(multiplier)`

    4. `export function calcFlat(rate: Decimal, multiplier: Decimal): Decimal`
       - Return `rate.mul(multiplier)`

    5. `export function calcPercentage(revenue: Decimal, rate: Decimal): Decimal`
       - Return `revenue.mul(rate)` where rate is a decimal fraction (0.80 = 80%)

    6. `export function calcDaily(days: Decimal, rate: Decimal): Decimal`
       - Return `days.mul(rate)`

    7. `export function calcSplit(totalLoadPay: Decimal, splitPct: Decimal): Decimal`
       - Return `totalLoadPay.mul(splitPct).div(new Decimal(100))`

    8. `export function calcDetention(arrivedAt: Date, departedAt: Date, freeTimeMinutes: number, detentionRate: Decimal): Decimal`
       - `const elapsedHours = new Decimal(departedAt.getTime() - arrivedAt.getTime()).div(new Decimal(3600000))`
       - `const freeHours = new Decimal(freeTimeMinutes).div(new Decimal(60))`
       - `const billableHours = Decimal.max(new Decimal(0), elapsedHours.minus(freeHours)).toDecimalPlaces(2)`
       - Return `billableHours.mul(detentionRate)`
       - Note: this function always returns a Decimal >= 0. The caller (suggestDetention) checks if billableHours > 0 before constructing a suggestion.

    9. `export function calcFederalOT(weeklyHours: Decimal, baseRate: Decimal, otMultiplier: Decimal): Decimal`
       - `const otHours = Decimal.max(new Decimal(0), weeklyHours.minus(new Decimal(40)))`
       - Return `otHours.mul(baseRate).mul(otMultiplier)`

    10. `export function calcStateDailyOT(dailyHours: Decimal, dailyThreshold: Decimal, baseRate: Decimal, otMultiplier: Decimal): Decimal`
        - `const otHours = Decimal.max(new Decimal(0), dailyHours.minus(dailyThreshold))`
        - Return `otHours.mul(baseRate).mul(otMultiplier)`

    11. `export function computeGrossAmount(input: ComputeInput): Decimal`
        - Switch/map on `input.componentType`:
          - `'BASE_PAY_MILEAGE'` → `calcCpm(input.quantity, input.rate, input.multiplier)`
          - `'FUEL_SURCHARGE'` → `calcFuelSurcharge(input.quantity, input.rate)`
          - `'BASE_PAY_HOURLY'` | `'OVERTIME'` → `calcHourly(input.quantity, input.rate, input.multiplier)`
          - `'BASE_PAY_FLAT'` | `'LOAD_COMPLETION_BONUS'` | `'FUEL_EFFICIENCY_BONUS'` | `'HAZMAT_PREMIUM'` | `'HOLIDAY_PREMIUM'` | `'LAYOVER'` | `'TONU'` | `'STOP_OFF'` | `'TARP'` | `'BREAKDOWN'` | `'ADJUSTMENT_POSITIVE'` | `'ADJUSTMENT_NEGATIVE'` → `calcFlat(input.rate, input.multiplier)`
          - `'BASE_PAY_PERCENTAGE'` → `calcPercentage(input.loadRevenue ?? new Decimal(0), input.rate)`
          - `'BASE_PAY_DAILY'` | `'PER_DIEM'` → `calcDaily(input.quantity, input.rate)`
          - `'DETENTION'` → if `input.arrivedAt && input.departedAt`, `calcDetention(input.arrivedAt, input.departedAt, input.freeTimeMinutes ?? 120, input.rate)`, else `new Decimal(0)`
          - `'LUMPER_REIMBURSEMENT'` | `'SCALE_REIMBURSEMENT'` | `'FUEL_REIMBURSEMENT'` → `calcFlat(input.rate, input.multiplier)` (reimbursements are flat amounts)
          - `'ADVANCE_REPAYMENT'` | `'ESCROW_CONTRIBUTION'` | `'FUEL_CARD_DEBT'` | `'CARGO_CLAIM'` | `'EQUIPMENT_DAMAGE'` | `'GARNISHMENT'` | `'CHILD_SUPPORT'` → `calcFlat(input.rate, input.multiplier)` (category enforcement in the API will negate the result)
          - Default (unknown type): `new Decimal(0)` — do not throw; callers can handle zero gracefully.
        - The function must handle all 30 PayComponentType enum values listed in schema.prisma.
  </action>
  <verify>
    - `grep -n "export function calc" apps/web/src/lib/driver-pay/calculator.ts | wc -l` outputs 10 (ten formula functions).
    - `grep -n "export function computeGrossAmount" apps/web/src/lib/driver-pay/calculator.ts` shows the dispatcher.
    - `grep -n "export type ComputeInput" apps/web/src/lib/driver-pay/calculator.ts` shows the type.
    - `grep -n "Number\|parseFloat\|parseInt" apps/web/src/lib/driver-pay/calculator.ts` returns nothing — no raw Number arithmetic.
    - `npx tsc --noEmit` from repo root passes with zero errors.
  </verify>
  <done>
    calculator.ts exports ComputeInput, 10 named formula functions, and computeGrossAmount. All arithmetic uses Decimal operations only. No DB imports, no server-only imports, no side effects. TypeScript clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: detention.ts — suggestion helper</name>
  <files>apps/web/src/lib/driver-pay/detention.ts</files>
  <action>
    Create `apps/web/src/lib/driver-pay/detention.ts`. No directive — pure utility.

    Import `Decimal from 'decimal.js'` and `{ calcDetention } from './calculator'`.

    Export types:
    ```typescript
    export type DetentionInput = {
      arrivedAt: Date;
      departedAt: Date;
      freeTimeMinutes: number;    // default 120
      detentionRate: Decimal;     // from driver template or org default $25/hr
    };

    export type DetentionSuggestion = {
      detentionHours: Decimal;    // rounded to 2 decimal places
      detentionRate: Decimal;
      grossAmount: Decimal;       // detentionHours × detentionRate
    } | null;
    ```

    Export:
    ```typescript
    export function suggestDetention(input: DetentionInput): DetentionSuggestion
    ```

    Implementation:
    - `const elapsedHours = new Decimal(input.departedAt.getTime() - input.arrivedAt.getTime()).div(new Decimal(3600000))`
    - `const freeHours = new Decimal(input.freeTimeMinutes).div(new Decimal(60))`
    - `const billableHours = Decimal.max(new Decimal(0), elapsedHours.minus(freeHours)).toDecimalPlaces(2)`
    - If `billableHours.lte(new Decimal(0))`: return `null` (within free time, no detention)
    - `const grossAmount = billableHours.mul(input.detentionRate)`
    - Return `{ detentionHours: billableHours, detentionRate: input.detentionRate, grossAmount }`

    Note: do NOT call `calcDetention` here — implement the boundary check inline so the function can return null cleanly without callers having to inspect a zero Decimal. This avoids ambiguity between "no detention" and "$0.00 detention" when rate is zero.
  </action>
  <verify>
    - `grep -n "export function suggestDetention" apps/web/src/lib/driver-pay/detention.ts` shows the export.
    - `grep -n "return null" apps/web/src/lib/driver-pay/detention.ts` shows the early-return guard.
    - `grep -n "export type DetentionSuggestion" apps/web/src/lib/driver-pay/detention.ts` shows the union type with null.
    - `npx tsc --noEmit` from repo root passes with zero errors.
  </verify>
  <done>
    detention.ts exports DetentionInput, DetentionSuggestion (nullable union), and suggestDetention. Returns null when billableHours <= 0. Returns suggestion with hours rounded to 2 decimal places otherwise. No DB imports, no side effects.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` from repo root — zero errors.
2. `grep -rn "Number\|parseFloat\|parseInt" apps/web/src/lib/driver-pay/calculator.ts apps/web/src/lib/driver-pay/detention.ts` — returns nothing (no raw number coercion).
3. Both files have no `import` of any Next.js, Prisma, or server-only module — they are safe to import in tests, server routes, and (if needed) client components.
</verification>

<success_criteria>
- calculator.ts: exports 10 formula functions + computeGrossAmount + ComputeInput type. All 30 PayComponentType values handled in the dispatcher.
- detention.ts: exports suggestDetention returning DetentionSuggestion | null. Returns null when elapsed <= free_time.
- Zero TypeScript errors.
- No raw Number arithmetic in either file.
</success_criteria>

<output>
Wave 1 complete. No summary needed — proceed to plan 02 (API routes).
</output>
---
phase: 299-driver-pay-phase-4-pay-components
plan: 02
type: execute
wave: 2
depends_on: [299-01]
files_modified:
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/suggest-detention/route.ts
autonomous: true

must_haves:
  truths:
    - "GET /components lists non-deleted components; drivers see only visible_to_driver=true items"
    - "POST /components enforces category rules server-side: DEDUCTION negates, REIMBURSEMENT forces is_taxable=false, server recomputes gross_amount via computeGrossAmount"
    - "PATCH and DELETE return 409 when assignment.payStatus === 'PAID'"
    - "DELETE soft-deletes (sets deletedAt); does not hard-delete the row"
    - "GET suggest-detention returns null when stop has no timestamps or no detention earned"
    - "All routes enforce OWNER/MANAGER auth; DRIVER may only POST REIMBURSEMENT on their own assignment"
  artifacts:
    - path: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts"
      provides: "GET (list) and POST (create) handlers"
      exports: ["GET", "POST"]
    - path: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts"
      provides: "PATCH (update) and DELETE (soft-delete) handlers"
      exports: ["PATCH", "DELETE"]
    - path: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/suggest-detention/route.ts"
      provides: "GET preview of detention suggestion"
      exports: ["GET"]
  key_links:
    - from: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts"
      to: "apps/web/src/lib/driver-pay/calculator.ts"
      via: "computeGrossAmount called before insert"
      pattern: "computeGrossAmount"
    - from: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/suggest-detention/route.ts"
      to: "apps/web/src/lib/driver-pay/detention.ts"
      via: "suggestDetention called with stop timestamps"
      pattern: "suggestDetention"
---

<objective>
Build the REST API layer for pay components: list, create, update, soft-delete, and detention suggestion preview. Server is the authoritative source of truth for gross_amount computation and category enforcement.

Purpose: Separating API routes from server actions so mobile clients (future) and the owner web UI share the same endpoint. Category enforcement (DEDUCTION sign flip, REIMBURSEMENT flags) and PAID immutability are enforced here, never trusted from the client.

Output: Three route files totalling 5 HTTP handlers.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/driver-pay/calculator.ts
@apps/web/src/lib/driver-pay/detention.ts
@apps/web/src/lib/driver-pay/snapshot.ts
@apps/web/src/app/api/v1/carrier/loads/route.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: GET + POST /components route</name>
  <files>apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts</files>
  <action>
    Create directory `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/` and file `route.ts`.

    Imports:
    ```typescript
    import { NextRequest, NextResponse } from 'next/server';
    import { z } from 'zod';
    import { getSession } from '@/lib/auth/supabase';
    import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
    import { Prisma } from '@/generated/prisma';
    import { computeGrossAmount } from '@/lib/driver-pay/calculator';
    import Decimal from 'decimal.js';
    ```

    **GET handler** — list components:
    ```typescript
    export async function GET(
      req: NextRequest,
      { params }: { params: Promise<{ assignmentId: string }> }
    )
    ```
    - `const session = await getSession()`. If no session → 401.
    - `const { assignmentId } = await params`
    - `const prisma = await getTenantPrisma()`
    - Fetch assignment: `prisma.loadDriverAssignment.findFirst({ where: { id: assignmentId, deletedAt: null } })`. If not found → 404.
    - Determine role: `session.role` from `session.app_metadata?.role` or `session.user?.app_metadata?.role`.
      - If role is `'driver'`: also verify `assignment.driverId === session.userId` (driver can only see their own). If mismatch → 403.
    - Fetch components:
      - `where: { assignmentId, deletedAt: null }` plus if driver role: also add `visibleToDriver: true`
      - `orderBy: { createdAt: 'asc' }`
    - Return 200 with `{ components: rows.map(serializeComponent) }`.

    Helper `serializeComponent(c)` — converts Decimal fields to strings, Dates to ISO strings:
    ```typescript
    function serializeComponent(c: {
      id: string; tenantId: string; assignmentId: string; loadId: string; driverId: string;
      stopId: string | null; componentType: string; category: string; description: string;
      quantity: Prisma.Decimal; unit: string; rate: Prisma.Decimal; multiplier: Prisma.Decimal;
      grossAmount: Prisma.Decimal; isTaxable: boolean; isReimbursement: boolean;
      originalComponentId: string | null; visibleToDriver: boolean; notes: string | null;
      enteredBy: string; createdAt: Date; updatedAt: Date; createdBy: string; deletedAt: Date | null;
    }) { ... }
    ```
    Returns all fields with Decimal → string (`.toString()`), Date → `.toISOString()`.

    **POST handler** — create component:
    ```typescript
    export async function POST(
      req: NextRequest,
      { params }: { params: Promise<{ assignmentId: string }> }
    )
    ```

    Input schema (define inline):
    ```typescript
    const CreateComponentSchema = z.object({
      componentType: z.string(),
      category: z.string(),
      description: z.string().min(1).max(255),
      quantity: z.string(),        // Decimal as string
      unit: z.string(),
      rate: z.string(),            // Decimal as string
      multiplier: z.string().optional().default('1.0'),
      isTaxable: z.boolean().optional().default(true),
      isReimbursement: z.boolean().optional().default(false),
      visibleToDriver: z.boolean().optional().default(true),
      notes: z.string().nullable().optional(),
      stopId: z.string().uuid().nullable().optional(),
      // Optional fields for gross_amount computation
      loadRevenue: z.string().optional(),
      arrivedAt: z.string().datetime().optional(),   // ISO string
      departedAt: z.string().datetime().optional(),
      freeTimeMinutes: z.number().int().optional(),
      weeklyHours: z.string().optional(),
      dailyHours: z.string().optional(),
      dailyThreshold: z.string().optional(),
      otMultiplier: z.string().optional(),
    });
    ```

    Steps:
    1. Auth: `const session = await getSession()`. If none → 401.
    2. Parse params: `const { assignmentId } = await params`
    3. Parse body: `const body = await req.json()`. Validate with schema. If fail → 400 with field errors.
    4. `const prisma = await getTenantPrisma()`
    5. Fetch assignment: `findFirst({ where: { id: assignmentId, deletedAt: null } })`. Not found → 404.
    6. **PAID guard**: if `assignment.payStatus === 'PAID'` → return 409 `{ error: 'Cannot add components to a paid assignment.' }`.
    7. **Role guard**: if driver role (`session.user?.app_metadata?.role === 'driver'`):
       - `assignment.driverId !== session.userId` → 403.
       - `body.category !== 'REIMBURSEMENT'` → 403 `{ error: 'Drivers may only add reimbursement components.' }`.
    8. **Category enforcement** — apply before computing gross_amount:
       - `DEDUCTION`: flag `negateGross = true`. `isTaxable` keeps client value.
       - `REIMBURSEMENT`: force `isTaxable = false`, `isReimbursement = true`.
       - `PER_DIEM` (category `ALLOWANCE`): force `isTaxable = false`.
       - Other categories: use client-supplied values as-is.
    9. **Server recompute gross_amount**:
       ```typescript
       const grossAmount = computeGrossAmount({
         componentType: body.componentType,
         quantity: new Decimal(body.quantity),
         rate: new Decimal(body.rate),
         multiplier: new Decimal(body.multiplier ?? '1.0'),
         loadRevenue: body.loadRevenue ? new Decimal(body.loadRevenue) : undefined,
         arrivedAt: body.arrivedAt ? new Date(body.arrivedAt) : undefined,
         departedAt: body.departedAt ? new Date(body.departedAt) : undefined,
         freeTimeMinutes: body.freeTimeMinutes,
         weeklyHours: body.weeklyHours ? new Decimal(body.weeklyHours) : undefined,
         dailyHours: body.dailyHours ? new Decimal(body.dailyHours) : undefined,
         dailyThreshold: body.dailyThreshold ? new Decimal(body.dailyThreshold) : undefined,
         otMultiplier: body.otMultiplier ? new Decimal(body.otMultiplier) : undefined,
       });
       const finalGross = negateGross ? grossAmount.neg() : grossAmount;
       ```
    10. **Denormalized IDs**: pull `loadId` and `driverId` from the assignment row.
    11. Insert:
        ```typescript
        const component = await prisma.loadPayComponent.create({
          data: {
            tenantId: assignment.tenantId,
            assignmentId,
            loadId: assignment.loadId,
            driverId: assignment.driverId,
            stopId: body.stopId ?? null,
            componentType: body.componentType as any,
            category: body.category as any,
            description: body.description,
            quantity: new Decimal(body.quantity),
            unit: body.unit as any,
            rate: new Decimal(body.rate),
            multiplier: new Decimal(body.multiplier ?? '1.0'),
            grossAmount: finalGross,
            isTaxable: enforcedIsTaxable,
            isReimbursement: enforcedIsReimbursement,
            visibleToDriver: body.visibleToDriver ?? true,
            notes: body.notes ?? null,
            enteredBy: session.userId,
            createdBy: session.userId,
          },
        });
        ```
    12. Return 201 with `{ component: serializeComponent(component) }`.
  </action>
  <verify>
    - Directory `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/` exists with `route.ts`.
    - `grep -n "export async function GET\|export async function POST" apps/web/src/app/api/driver-pay/assignments/\[assignmentId\]/components/route.ts` shows both exports.
    - `grep -n "computeGrossAmount" apps/web/src/app/api/driver-pay/assignments/\[assignmentId\]/components/route.ts` shows the call before insert.
    - `grep -n "PAID" apps/web/src/app/api/driver-pay/assignments/\[assignmentId\]/components/route.ts` shows the 409 guard.
    - `grep -n "DEDUCTION\|negateGross\|neg()" apps/web/src/app/api/driver-pay/assignments/\[assignmentId\]/components/route.ts` shows DEDUCTION sign flip.
    - `npx tsc --noEmit` passes.
  </verify>
  <done>
    GET returns components array (driver sees only visible_to_driver=true). POST validates input, enforces category rules, recomputes gross_amount server-side, inserts with denormalized loadId/driverId, returns 201. PAID guard returns 409.
  </done>
</task>

<task type="auto">
  <name>Task 2: PATCH + DELETE /components/[componentId] and GET suggest-detention routes</name>
  <files>
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/suggest-detention/route.ts
  </files>
  <action>
    **File 1: `[componentId]/route.ts`** — PATCH and DELETE handlers.

    Imports: same as the list/create route — NextRequest, NextResponse, getSession, getTenantPrisma, Prisma, computeGrossAmount, Decimal.

    **PATCH handler**:
    ```typescript
    export async function PATCH(
      req: NextRequest,
      { params }: { params: Promise<{ assignmentId: string; componentId: string }> }
    )
    ```

    Input schema (define inline):
    ```typescript
    const UpdateComponentSchema = z.object({
      description: z.string().min(1).max(255).optional(),
      quantity: z.string().optional(),
      rate: z.string().optional(),
      multiplier: z.string().optional(),
      isTaxable: z.boolean().optional(),
      visibleToDriver: z.boolean().optional(),
      notes: z.string().nullable().optional(),
      // Recompute inputs (optional)
      loadRevenue: z.string().optional(),
      arrivedAt: z.string().datetime().optional(),
      departedAt: z.string().datetime().optional(),
      freeTimeMinutes: z.number().int().optional(),
      weeklyHours: z.string().optional(),
      dailyHours: z.string().optional(),
      dailyThreshold: z.string().optional(),
      otMultiplier: z.string().optional(),
    });
    ```

    Steps:
    1. Auth: `getSession()`. None → 401. Non-owner/manager role → 403 (only OWNER and MANAGER can edit components).
    2. Parse params: `const { assignmentId, componentId } = await params`
    3. Parse body. Validate. Fail → 400.
    4. `const prisma = await getTenantPrisma()`
    5. Fetch assignment: `findFirst({ where: { id: assignmentId, deletedAt: null } })`. Not found → 404.
    6. **PAID guard**: `assignment.payStatus === 'PAID'` → 409 `{ error: 'Cannot modify components of a paid assignment.' }`.
    7. Fetch component: `prisma.loadPayComponent.findFirst({ where: { id: componentId, assignmentId, deletedAt: null } })`. Not found → 404.
    8. Build merged fields: start with existing component values, overlay with provided body fields (only fields that are defined in body).
    9. If any of quantity, rate, or multiplier changed: recompute grossAmount via `computeGrossAmount` with merged values. Re-apply category enforcement (DEDUCTION → negate, REIMBURSEMENT → force flags).
    10. `await prisma.loadPayComponent.update({ where: { id: componentId }, data: { ...mergedFields, grossAmount: recomputedGross } })`
    11. Return 200 with updated serialized component.

    **DELETE handler**:
    ```typescript
    export async function DELETE(
      req: NextRequest,
      { params }: { params: Promise<{ assignmentId: string; componentId: string }> }
    )
    ```

    Steps:
    1. Auth: `getSession()`. None → 401. Non-owner/manager → 403.
    2. `const { assignmentId, componentId } = await params`
    3. `const prisma = await getTenantPrisma()`
    4. Fetch assignment: `findFirst({ where: { id: assignmentId, deletedAt: null } })`. Not found → 404.
    5. **PAID guard**: `assignment.payStatus === 'PAID'` → 409 `{ error: 'Cannot delete components from a paid assignment.' }`.
    6. If `assignment.payStatus !== 'DRAFT' && assignment.payStatus !== 'PENDING_REVIEW'` → 409 `{ error: 'Components can only be deleted when the assignment is in DRAFT or PENDING_REVIEW status.' }` (belt-and-suspenders; PAID is already caught above).
    7. Fetch component: `findFirst({ where: { id: componentId, assignmentId, deletedAt: null } })`. Not found → 404.
    8. Soft delete: `prisma.loadPayComponent.update({ where: { id: componentId }, data: { deletedAt: new Date() } })`
    9. Return 200 `{ ok: true }`.

    ---

    **File 2: `suggest-detention/route.ts`** — GET detention suggestion preview.

    Imports:
    ```typescript
    import { NextRequest, NextResponse } from 'next/server';
    import { getSession } from '@/lib/auth/supabase';
    import { getTenantPrisma } from '@/lib/context/tenant-context';
    import { suggestDetention } from '@/lib/driver-pay/detention';
    import Decimal from 'decimal.js';
    ```

    **GET handler**:
    ```typescript
    export async function GET(
      req: NextRequest,
      { params }: { params: Promise<{ assignmentId: string }> }
    )
    ```

    Steps:
    1. Auth: `getSession()`. None → 401.
    2. `const { assignmentId } = await params`
    3. `const stopId = req.nextUrl.searchParams.get('stopId')`. If not provided → 400 `{ error: 'stopId query parameter is required.' }`.
    4. `const prisma = await getTenantPrisma()`
    5. Fetch assignment with template:
       ```typescript
       prisma.loadDriverAssignment.findFirst({
         where: { id: assignmentId, deletedAt: null },
         include: { template: { select: { detentionRate: true } } },
       })
       ```
       Not found → 404.
       Note: check schema — `DriverCompensationTemplate` may not have a `detentionRate` field. If it does not exist on the schema, fall back to org default `$25.00/hr`. Read schema to confirm field existence before writing this query. If `detentionRate` is not on the template model, skip the include and use the hardcoded default.
    6. Fetch stop: `prisma.routeStop.findFirst({ where: { id: stopId } })`. (RouteStop model — check schema for exact field names: look for `arrivedAt`/`departedAt` or `arrivalTime`/`departureTime`). If stop not found → 404.
    7. If stop timestamps are null/missing → return 200 `{ suggestion: null, reason: 'Stop has no arrival or departure timestamps.' }`.
    8. Determine detention rate:
       - If template has `detentionRate` and it's not null: use it.
       - Otherwise: `new Decimal('25.00')` (org default $25/hr).
    9. Call `suggestDetention({ arrivedAt: stop.arrivedAt, departedAt: stop.departedAt, freeTimeMinutes: stop.freeTimeMinutes ?? 120, detentionRate })`.
    10. If result is null → return 200 `{ suggestion: null, reason: 'No detention earned within free time window.' }`.
    11. If result is not null → return 200:
        ```json
        {
          "suggestion": {
            "detentionHours": "2.00",
            "detentionRate": "25.00",
            "grossAmount": "50.00"
          }
        }
        ```
        (Serialize Decimal values to string.)

    Important: before writing the RouteStop query, check the actual field names in schema.prisma by reading the model definition. Search for `model RouteStop` and confirm fields like `arrivedAt`, `departedAt`, `freeTimeMinutes`. Use exact Prisma field names.
  </action>
  <verify>
    - `grep -n "export async function PATCH\|export async function DELETE" "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts"` shows both.
    - `grep -n "deletedAt: new Date" "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts"` confirms soft delete.
    - `grep -n "payStatus.*PAID\|409" "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts"` shows PAID guard.
    - `grep -n "export async function GET" apps/web/src/app/api/driver-pay/assignments/\[assignmentId\]/components/suggest-detention/route.ts` shows GET export.
    - `grep -n "suggestDetention" apps/web/src/app/api/driver-pay/assignments/\[assignmentId\]/components/suggest-detention/route.ts` shows the call.
    - `npx tsc --noEmit` passes with zero errors.
  </verify>
  <done>
    PATCH recomputes gross_amount with merged fields and re-applies category enforcement. DELETE soft-deletes only when payStatus is DRAFT or PENDING_REVIEW; returns 409 for PAID. suggest-detention GET reads stop timestamps and driver's detention rate, returns DetentionSuggestion or null. TypeScript clean.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero errors.
2. `curl -X GET /api/driver-pay/assignments/{id}/components` with owner session → returns components array.
3. `curl -X POST /api/driver-pay/assignments/{id}/components` with DEDUCTION category and positive rate → stored gross_amount is negative.
4. `curl -X DELETE /api/driver-pay/assignments/{id}/components/{cid}` on a PAID assignment → 409.
5. `curl -X GET /api/driver-pay/assignments/{id}/components/suggest-detention?stopId={sid}` with valid stop with timestamps → returns suggestion JSON.
</verification>

<success_criteria>
- Three route files exist at the paths specified in files_modified.
- GET list: drivers see only visible_to_driver=true, owners see all.
- POST: server recomputes gross_amount via computeGrossAmount; DEDUCTION category stores negative gross.
- PATCH + DELETE: 409 when payStatus=PAID; DELETE soft-deletes (sets deletedAt).
- suggest-detention: returns null JSON for missing timestamps or no detention earned; returns Decimal strings otherwise.
- Zero TypeScript errors.
</success_criteria>

<output>
Wave 2 complete. No summary needed — proceed to plan 03 (auto base-pay stub).
</output>
---
phase: 299-driver-pay-phase-4-pay-components
plan: 03
type: execute
wave: 3
depends_on: [299-01, 299-02]
files_modified:
  - apps/web/src/lib/driver-pay/auto-base-pay.ts
autonomous: true

must_haves:
  truths:
    - "ensureBasePayComponent is idempotent — called twice on same assignment produces only one BASE_PAY component"
    - "The correct PayComponentType is chosen from the assignment's payType (CPM→BASE_PAY_MILEAGE, HOURLY→BASE_PAY_HOURLY, etc.)"
    - "Actual miles/hours are preferred over estimates when set; falls back to estimates"
    - "grossAmount is computed via computeGrossAmount — never hardcoded"
  artifacts:
    - path: "apps/web/src/lib/driver-pay/auto-base-pay.ts"
      provides: "ensureBasePayComponent async function"
      exports: ["ensureBasePayComponent"]
  key_links:
    - from: "apps/web/src/lib/driver-pay/auto-base-pay.ts"
      to: "apps/web/src/lib/driver-pay/calculator.ts"
      via: "computeGrossAmount called to compute base pay gross"
      pattern: "computeGrossAmount"
---

<objective>
Build the auto base-pay stub: a single exported async function that Phase 6 will wire as a trigger when an assignment transitions from DRAFT to PENDING_REVIEW. This phase just builds the function — the trigger wiring is out of scope.

Purpose: When a dispatcher submits an assignment for review, a BASE_PAY_* component is automatically inserted if none exists, ensuring every assignment has at least one earning component before it reaches the reviewer.

Output: auto-base-pay.ts with ensureBasePayComponent.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/driver-pay/calculator.ts
@apps/web/src/lib/driver-pay/snapshot.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: auto-base-pay.ts — ensureBasePayComponent stub</name>
  <files>apps/web/src/lib/driver-pay/auto-base-pay.ts</files>
  <action>
    Create `apps/web/src/lib/driver-pay/auto-base-pay.ts`. No directive — server-only utility (receives PrismaClient as param).

    Imports:
    ```typescript
    import type { PrismaClient } from '@/generated/prisma';
    import { Prisma } from '@/generated/prisma';
    import { computeGrossAmount } from './calculator';
    import Decimal from 'decimal.js';
    ```

    Export:
    ```typescript
    export async function ensureBasePayComponent(
      assignmentId: string,
      tenantId: string,
      prisma: PrismaClient,
      userId: string,
    ): Promise<void>
    ```

    Implementation:

    1. **Idempotency check** — query for any existing BASE_PAY_* component:
       ```typescript
       const existing = await prisma.loadPayComponent.findFirst({
         where: {
           assignmentId,
           deletedAt: null,
           category: 'EARNING',
           componentType: {
             in: [
               'BASE_PAY_MILEAGE',
               'BASE_PAY_HOURLY',
               'BASE_PAY_FLAT',
               'BASE_PAY_PERCENTAGE',
               'BASE_PAY_DAILY',
             ] as any[],
           },
         },
       });
       if (existing) return; // Already has base pay — idempotent
       ```

    2. **Fetch assignment**:
       ```typescript
       const assignment = await prisma.loadDriverAssignment.findFirst({
         where: { id: assignmentId, deletedAt: null },
       });
       if (!assignment) return; // Assignment not found — silently no-op
       ```

    3. **Map payType → componentType**:
       ```typescript
       const PAY_TYPE_TO_COMPONENT: Record<string, string> = {
         CPM: 'BASE_PAY_MILEAGE',
         HOURLY: 'BASE_PAY_HOURLY',
         FLAT_PER_LOAD: 'BASE_PAY_FLAT',
         PERCENTAGE: 'BASE_PAY_PERCENTAGE',
         DAILY: 'BASE_PAY_DAILY',
         SALARY: 'BASE_PAY_FLAT',
       };
       const componentType = PAY_TYPE_TO_COMPONENT[assignment.payType] ?? 'BASE_PAY_FLAT';
       ```

    4. **Determine unit and quantity**:
       ```typescript
       // Use actuals if available, else estimates
       const UNIT_MAP: Record<string, string> = {
         CPM: 'MILES',
         HOURLY: 'HOURS',
         FLAT_PER_LOAD: 'FLAT',
         PERCENTAGE: 'PERCENTAGE',
         DAILY: 'DAYS',
         SALARY: 'FLAT',
       };
       const unit = UNIT_MAP[assignment.payType] ?? 'FLAT';

       let quantity: Decimal;
       if (assignment.payType === 'CPM') {
         quantity = assignment.actualMiles ?? assignment.estimatedMiles ?? new Decimal(0);
       } else if (assignment.payType === 'HOURLY') {
         quantity = assignment.actualHours ?? assignment.estimatedHours ?? new Decimal(0);
       } else if (assignment.payType === 'DAILY') {
         quantity = assignment.actualHours
           ? assignment.actualHours.div(new Decimal(24))
           : assignment.estimatedHours
             ? assignment.estimatedHours.div(new Decimal(24))
             : new Decimal(1);
       } else {
         quantity = new Decimal(1);
       }
       ```

    5. **Compute grossAmount**:
       ```typescript
       const grossAmount = computeGrossAmount({
         componentType,
         quantity,
         rate: assignment.baseRate,
         multiplier: new Decimal(1),
         loadRevenue: assignment.loadRevenue ?? undefined,
       });
       ```

    6. **Build description**:
       ```typescript
       const DESCRIPTION_MAP: Record<string, string> = {
         CPM: 'Base pay — mileage',
         HOURLY: 'Base pay — hourly',
         FLAT_PER_LOAD: 'Base pay — flat rate',
         PERCENTAGE: 'Base pay — percentage of load revenue',
         DAILY: 'Base pay — daily rate',
         SALARY: 'Base pay — salary',
       };
       const description = DESCRIPTION_MAP[assignment.payType] ?? 'Base pay';
       ```

    7. **Insert**:
       ```typescript
       await prisma.loadPayComponent.create({
         data: {
           tenantId,
           assignmentId,
           loadId: assignment.loadId,
           driverId: assignment.driverId,
           componentType: componentType as any,
           category: 'EARNING' as any,
           description,
           quantity,
           unit: unit as any,
           rate: assignment.baseRate,
           multiplier: new Decimal(1),
           grossAmount,
           isTaxable: true,
           isReimbursement: false,
           visibleToDriver: true,
           enteredBy: userId,
           createdBy: userId,
         },
       });
       ```
  </action>
  <verify>
    - `grep -n "export async function ensureBasePayComponent" apps/web/src/lib/driver-pay/auto-base-pay.ts` shows the export.
    - `grep -n "if (existing) return" apps/web/src/lib/driver-pay/auto-base-pay.ts` shows idempotency guard.
    - `grep -n "BASE_PAY_MILEAGE\|BASE_PAY_HOURLY\|BASE_PAY_FLAT\|BASE_PAY_PERCENTAGE\|BASE_PAY_DAILY" apps/web/src/lib/driver-pay/auto-base-pay.ts` shows all 5 base pay types.
    - `grep -n "actualMiles\|estimatedMiles\|actualHours\|estimatedHours" apps/web/src/lib/driver-pay/auto-base-pay.ts` shows actuals-first logic.
    - `npx tsc --noEmit` passes with zero errors.
  </verify>
  <done>
    ensureBasePayComponent checks for existing BASE_PAY_* component and returns early if found. Otherwise reads assignment payType, maps to componentType, prefers actual values over estimates, computes grossAmount via computeGrossAmount, inserts as EARNING category with isTaxable=true. No return value (void). TypeScript clean.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero errors.
2. The function can be called twice with the same assignmentId and produces exactly one loadPayComponent row.
3. All 6 payType values (CPM, HOURLY, FLAT_PER_LOAD, PERCENTAGE, DAILY, SALARY) map to a valid componentType that exists in the PayComponentType enum.
</verification>

<success_criteria>
- auto-base-pay.ts exports ensureBasePayComponent.
- Idempotent: second call with same assignmentId is a no-op.
- Correct componentType selected for all 6 payType values.
- Actuals used when available; estimates as fallback.
- grossAmount computed via computeGrossAmount (not hardcoded).
- Zero TypeScript errors.
</success_criteria>

<output>
Wave 3 complete. No summary needed — proceed to plan 04 (UI components).
</output>
---
phase: 299-driver-pay-phase-4-pay-components
plan: 04
type: execute
wave: 4
depends_on: [299-02]
files_modified:
  - apps/web/src/components/driver-pay/pay-components-list.tsx
  - apps/web/src/components/driver-pay/add-component-modal.tsx
  - apps/web/src/components/driver-pay/suggest-detention-button.tsx
  - apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/compensation/page.tsx
autonomous: true

must_haves:
  truths:
    - "PayComponentsList groups rows by category with subtotals and renders grand total row"
    - "DEDUCTION rows display with text-destructive and minus sign prefix on the amount"
    - "AddComponentModal step 1 narrows component_type options by selected category"
    - "SuggestDetentionButton calls GET suggest-detention and shows editable preview before posting"
    - "All pay component UI is disabled (non-interactive) when payStatus is PAID"
    - "Empty state shows correct spec message pointing to automatic base pay on review submit"
  artifacts:
    - path: "apps/web/src/components/driver-pay/pay-components-list.tsx"
      provides: "Grouped list with subtotals, tooltips, audit chips, empty state"
    - path: "apps/web/src/components/driver-pay/add-component-modal.tsx"
      provides: "Category picker step + type/fields form step"
    - path: "apps/web/src/components/driver-pay/suggest-detention-button.tsx"
      provides: "Detention suggestion button + preview sheet with editable rate/hours"
    - path: "apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/compensation/page.tsx"
      provides: "Compensation page updated to show pay components for each assignment"
  key_links:
    - from: "apps/web/src/components/driver-pay/pay-components-list.tsx"
      to: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts"
      via: "fetch GET /api/driver-pay/assignments/{id}/components on mount"
      pattern: "fetch.*components"
    - from: "apps/web/src/components/driver-pay/add-component-modal.tsx"
      to: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts"
      via: "fetch POST /api/driver-pay/assignments/{id}/components on submit"
      pattern: "fetch.*components.*POST"
    - from: "apps/web/src/components/driver-pay/suggest-detention-button.tsx"
      to: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/suggest-detention/route.ts"
      via: "fetch GET suggest-detention?stopId= on button click"
      pattern: "suggest-detention"
---

<objective>
Build the UI layer for pay components: the grouped list component, the add-component modal, and the detention suggestion button. Update the driver compensation page to render pay components for each assignment.

Purpose: Dispatchers and owners can see, add, edit, and delete pay components directly from the driver's compensation page and (in Phase 5) from the load detail page. The UI enforces PAID immutability by disabling all interactive controls.

Output: Three new UI components and one page update.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/driver-pay/assignment-section.tsx
@apps/web/src/components/driver-pay/assignment-card.tsx
@apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/compensation/page.tsx
@apps/web/src/app/(owner)/actions/load-driver-assignments.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: pay-components-list.tsx + suggest-detention-button.tsx</name>
  <files>
    apps/web/src/components/driver-pay/pay-components-list.tsx
    apps/web/src/components/driver-pay/suggest-detention-button.tsx
  </files>
  <action>
    **File 1: `pay-components-list.tsx`** — Client component.

    `'use client'` directive.

    Imports: React, useState, useEffect; shadcn Button, Badge, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger from `@/components/ui/*`; import `AddComponentModal` from `./add-component-modal`; import `toast` from `sonner`.

    Type:
    ```typescript
    type SerializedComponent = {
      id: string;
      assignmentId: string;
      componentType: string;
      category: string;
      description: string;
      quantity: string;
      unit: string;
      rate: string;
      multiplier: string;
      grossAmount: string;
      isTaxable: boolean;
      isReimbursement: boolean;
      visibleToDriver: boolean;
      notes: string | null;
      enteredBy: string;
      createdAt: string;
    };
    ```

    Props:
    ```typescript
    type Props = {
      assignmentId: string;
      payStatus: string;           // DriverAssignmentStatus value
      initialComponents: SerializedComponent[];
    };
    ```

    State:
    - `components: SerializedComponent[]` — initialized from `initialComponents`
    - `showAddModal: boolean`

    **Category display order** (constant at top of file):
    ```typescript
    const CATEGORY_ORDER = ['EARNING', 'BONUS', 'ACCESSORIAL', 'ALLOWANCE', 'REIMBURSEMENT', 'DEDUCTION', 'ADJUSTMENT'] as const;
    const CATEGORY_LABELS: Record<string, string> = {
      EARNING: 'Earnings', BONUS: 'Bonuses', ACCESSORIAL: 'Accessorials',
      ALLOWANCE: 'Allowances', REIMBURSEMENT: 'Reimbursements',
      DEDUCTION: 'Deductions', ADJUSTMENT: 'Adjustments',
    };
    ```

    **Component type labels** (readable names for the 30 types):
    ```typescript
    const TYPE_LABELS: Record<string, string> = {
      BASE_PAY_MILEAGE: 'Base Pay — Mileage',
      BASE_PAY_HOURLY: 'Base Pay — Hourly',
      BASE_PAY_FLAT: 'Base Pay — Flat Rate',
      BASE_PAY_PERCENTAGE: 'Base Pay — % of Revenue',
      BASE_PAY_DAILY: 'Base Pay — Daily',
      FUEL_SURCHARGE: 'Fuel Surcharge',
      OVERTIME: 'Overtime',
      HAZMAT_PREMIUM: 'Hazmat Premium',
      HOLIDAY_PREMIUM: 'Holiday Premium',
      LOAD_COMPLETION_BONUS: 'Load Completion Bonus',
      FUEL_EFFICIENCY_BONUS: 'Fuel Efficiency Bonus',
      DETENTION: 'Detention',
      LAYOVER: 'Layover',
      TONU: 'Truck Ordered Not Used (TONU)',
      STOP_OFF: 'Stop-Off Fee',
      TARP: 'Tarping Fee',
      BREAKDOWN: 'Breakdown Pay',
      PER_DIEM: 'Per Diem',
      LUMPER_REIMBURSEMENT: 'Lumper Reimbursement',
      SCALE_REIMBURSEMENT: 'Scale Ticket Reimbursement',
      FUEL_REIMBURSEMENT: 'Fuel Reimbursement',
      ADVANCE_REPAYMENT: 'Advance Repayment',
      ESCROW_CONTRIBUTION: 'Escrow Contribution',
      FUEL_CARD_DEBT: 'Fuel Card Debt',
      CARGO_CLAIM: 'Cargo Claim',
      EQUIPMENT_DAMAGE: 'Equipment Damage',
      GARNISHMENT: 'Wage Garnishment',
      CHILD_SUPPORT: 'Child Support',
      ADJUSTMENT_POSITIVE: 'Positive Adjustment',
      ADJUSTMENT_NEGATIVE: 'Negative Adjustment',
    };
    ```

    **Render logic**:
    1. Group components by category: `Record<string, SerializedComponent[]>`.
    2. For each category in CATEGORY_ORDER: if no components for that category, skip.
    3. Render category heading row: `<tr className="bg-muted/40"><td colSpan={4} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CATEGORY_LABELS[cat]}</td></tr>`.
    4. For each component in category:
       - Row className: `category === 'DEDUCTION' ? 'text-destructive' : ''`
       - Columns: type label, description, `{quantity} × ${rate}` (right-aligned), gross_amount (right-aligned).
       - DEDUCTION gross_amount: format as `−$${Math.abs(Number(c.grossAmount)).toFixed(2)}` (minus sign, not dash).
       - Non-deduction: `$${Number(c.grossAmount).toFixed(2)}`.
       - Reimbursement with no receipt (isReimbursement=true and no notes): render amber chip `<span className="ml-2 text-xs font-medium text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/40 rounded px-1.5 py-0.5">No receipt</span>` after the description.
       - Tooltip on gross_amount cell: use TooltipProvider + Tooltip. TooltipContent: `{quantity} × ${rate} × {multiplier} = ${gross}`.
       - Audit chip below description: `<span className="text-xs text-muted-foreground">Added by {enteredBy.slice(0,8)}… {formatRelativeTime(c.createdAt)}</span>`. Helper `formatRelativeTime(iso: string): string` — use `Intl.RelativeTimeFormat` with seconds/minutes/hours/days thresholds.
    5. Category subtotal row: `<tr className="border-t border-muted"><td colSpan={3} className="px-3 py-1 text-xs text-muted-foreground text-right">Subtotal</td><td className="px-3 py-1 text-xs font-medium text-right">${subtotal.toFixed(2)}</td></tr>`. Subtotal = sum of Number(grossAmount) across category.
    6. Grand total row: `<tr className="border-t-2 border-border"><td colSpan={3} className="px-3 py-2 font-semibold text-right">Total</td><td className="px-3 py-2 font-semibold text-right">${grandTotal.toFixed(2)}</td></tr>`. grandTotal = sum of all grossAmounts (negative DEDUCTION amounts reduce the total).

    **Empty state**:
    - If `components.length === 0`: render a bordered div with text: "No pay components yet. Base pay will appear automatically when you submit this assignment for review."
    - Primary "Add pay component" button below (disabled if `payStatus === 'PAID'`).

    **When has components**:
    - Render table with above structure.
    - Below table: secondary "Add pay component" button (disabled if `payStatus === 'PAID'`).

    Button click → `setShowAddModal(true)`.

    `<AddComponentModal open={showAddModal} onOpenChange={setShowAddModal} assignmentId={assignmentId} onAdded={(c) => setComponents(prev => [...prev, c])} />`

    ---

    **File 2: `suggest-detention-button.tsx`** — Client component.

    `'use client'` directive.

    Imports: React, useState; shadcn Button, Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter, Input, Label from `@/components/ui/*`; toast from `sonner`.

    Props:
    ```typescript
    type Props = {
      assignmentId: string;
      stopId: string;
      payStatus: string;
      hasDetentionComponent: boolean;
      onAdded: (component: unknown) => void;
    };
    ```

    State: `sheetOpen: boolean`, `suggestion: { detentionHours: string; detentionRate: string; grossAmount: string } | null`, `editableRate: string`, `editableHours: string`, `isLoading: boolean`, `isSubmitting: boolean`.

    **On button click**:
    1. Set `isLoading = true`.
    2. `const res = await fetch(\`/api/driver-pay/assignments/${assignmentId}/components/suggest-detention?stopId=${stopId}\`)`.
    3. Parse JSON. If `result.suggestion` is null → `toast.info('No detention earned for this stop — within free time window.')`. Set `isLoading = false`. Return.
    4. Set `suggestion = result.suggestion`, `editableRate = result.suggestion.detentionRate`, `editableHours = result.suggestion.detentionHours`.
    5. Set `sheetOpen = true`, `isLoading = false`.

    **Sheet content**:
    - Title: "Detention Suggestion".
    - Show: "Based on the stop's arrival and departure timestamps, this driver is owed detention pay."
    - Two inputs: "Detention Hours" (value=editableHours, onChange updates editableHours) and "Rate ($/hr)" (value=editableRate, onChange updates editableRate).
    - Live preview: `Total: $${(Number(editableHours) * Number(editableRate)).toFixed(2)}` updated as user types.
    - Footer: "Cancel" button (closes sheet) and "Add to Pay" button.

    **"Add to Pay" handler**:
    1. Set `isSubmitting = true`.
    2. `const res = await fetch(\`/api/driver-pay/assignments/${assignmentId}/components\`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ componentType: 'DETENTION', category: 'ACCESSORIAL', description: 'Detention', quantity: editableHours, unit: 'HOURS', rate: editableRate, multiplier: '1.0', isTaxable: true, isReimbursement: false, visibleToDriver: true, stopId }) })`.
    3. On success: `toast.success('Detention pay added.')`, `onAdded(result.component)`, close sheet.
    4. On error: `toast.error(result.error ?? 'Failed to add detention.')`.
    5. Set `isSubmitting = false`.

    **Button display**:
    - If `payStatus === 'PAID'`: render nothing (return null).
    - If `hasDetentionComponent`: secondary variant button "Detention already added" — still clickable to add another if desired (change label to "Add another detention").
    - Else: primary variant button "Suggest detention".
    - Button disabled when `isLoading`.
  </action>
  <verify>
    - `grep -n "'use client'" apps/web/src/components/driver-pay/pay-components-list.tsx` confirms directive.
    - `grep -n "CATEGORY_ORDER\|DEDUCTION\|text-destructive" apps/web/src/components/driver-pay/pay-components-list.tsx` shows grouping and deduction styling.
    - `grep -n "grandTotal\|subtotal" apps/web/src/components/driver-pay/pay-components-list.tsx` shows total calculations.
    - `grep -n "No pay components yet" apps/web/src/components/driver-pay/pay-components-list.tsx` shows empty state message.
    - `grep -n "suggest-detention" apps/web/src/components/driver-pay/suggest-detention-button.tsx` shows API call.
    - `grep -n "Add to Pay\|onAdded" apps/web/src/components/driver-pay/suggest-detention-button.tsx` shows submission.
    - `npx tsc --noEmit` passes.
  </verify>
  <done>
    PayComponentsList renders components grouped by category with subtotals and grand total. DEDUCTION rows use text-destructive and minus sign. Empty state shows spec message. AddComponentModal triggered by "Add pay component" button (disabled when PAID). SuggestDetentionButton fetches preview, shows editable sheet, posts to components API.
  </done>
</task>

<task type="auto">
  <name>Task 2: add-component-modal.tsx + compensation page integration</name>
  <files>
    apps/web/src/components/driver-pay/add-component-modal.tsx
    apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/compensation/page.tsx
  </files>
  <action>
    **File 1: `add-component-modal.tsx`** — Client component.

    `'use client'` directive.

    Imports: React, useState; shadcn Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, Button, Input, Label, Select, SelectTrigger, SelectContent, SelectItem, SelectValue, Switch, Textarea from `@/components/ui/*`; toast from `sonner`.

    Props:
    ```typescript
    type Props = {
      open: boolean;
      onOpenChange: (v: boolean) => void;
      assignmentId: string;
      onAdded: (component: unknown) => void;
    };
    ```

    **Category → type mapping** (constant):
    ```typescript
    const CATEGORY_TYPES: Record<string, { value: string; label: string }[]> = {
      BONUS: [
        { value: 'LOAD_COMPLETION_BONUS', label: 'Load Completion Bonus' },
        { value: 'FUEL_EFFICIENCY_BONUS', label: 'Fuel Efficiency Bonus' },
        { value: 'HAZMAT_PREMIUM', label: 'Hazmat Premium' },
        { value: 'HOLIDAY_PREMIUM', label: 'Holiday Premium' },
      ],
      ACCESSORIAL: [
        { value: 'DETENTION', label: 'Detention' },
        { value: 'LAYOVER', label: 'Layover' },
        { value: 'TONU', label: 'TONU' },
        { value: 'STOP_OFF', label: 'Stop-Off Fee' },
        { value: 'TARP', label: 'Tarping' },
        { value: 'BREAKDOWN', label: 'Breakdown Pay' },
        { value: 'FUEL_SURCHARGE', label: 'Fuel Surcharge' },
        { value: 'OVERTIME', label: 'Overtime' },
      ],
      ALLOWANCE: [
        { value: 'PER_DIEM', label: 'Per Diem' },
      ],
      REIMBURSEMENT: [
        { value: 'LUMPER_REIMBURSEMENT', label: 'Lumper Reimbursement' },
        { value: 'SCALE_REIMBURSEMENT', label: 'Scale Ticket Reimbursement' },
        { value: 'FUEL_REIMBURSEMENT', label: 'Fuel Reimbursement' },
      ],
      DEDUCTION: [
        { value: 'ADVANCE_REPAYMENT', label: 'Advance Repayment' },
        { value: 'ESCROW_CONTRIBUTION', label: 'Escrow Contribution' },
        { value: 'FUEL_CARD_DEBT', label: 'Fuel Card Debt' },
        { value: 'CARGO_CLAIM', label: 'Cargo Claim' },
        { value: 'EQUIPMENT_DAMAGE', label: 'Equipment Damage' },
        { value: 'GARNISHMENT', label: 'Wage Garnishment' },
        { value: 'CHILD_SUPPORT', label: 'Child Support' },
      ],
      ADJUSTMENT: [
        { value: 'ADJUSTMENT_POSITIVE', label: 'Positive Adjustment' },
        { value: 'ADJUSTMENT_NEGATIVE', label: 'Negative Adjustment' },
      ],
    };
    ```

    **Step state**: `step: 1 | 2`.

    **Step 1 — Category picker**:
    - Render 6 category cards in a 2×3 grid (use `grid grid-cols-2 gap-3`):
      - BONUS, ACCESSORIAL, ALLOWANCE, REIMBURSEMENT, DEDUCTION, ADJUSTMENT
    - Each card: `<button onClick={() => { setSelectedCategory(cat); setStep(2); }}>` with category label and a brief description:
      - BONUS: "Performance bonuses"
      - ACCESSORIAL: "Stop fees, detention, TONU"
      - ALLOWANCE: "Per diem, daily allowances"
      - REIMBURSEMENT: "Lumper, fuel, scale tickets"
      - DEDUCTION: "Advances, deductions, garnishments"
      - ADJUSTMENT: "Manual corrections"
    - Card styling: `border rounded-lg p-4 text-left hover:border-primary hover:bg-muted/50 transition-colors`.

    **Step 2 — Component form**:
    State fields: `componentType: string`, `description: string`, `quantity: string = '1'`, `rate: string = '0.00'`, `multiplier: string = '1.00'`, `unit: string`, `isTaxable: boolean = true`, `visibleToDriver: boolean = true`, `notes: string = ''`, `isSubmitting: boolean`, `error: string | null`.

    Layout:
    - Back button (returns to step 1, clears type selection).
    - `<Label>Type</Label><Select value={componentType} onValueChange={setComponentType}><SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger><SelectContent>{CATEGORY_TYPES[selectedCategory].map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select>`
    - `<Label>Description</Label><Input value={description} onChange={...} placeholder="Brief description" maxLength={255} />`
    - Row: `<Label>Quantity</Label><Input value={quantity} onChange={...} className="text-right" />` and `<Label>Rate ($)</Label><Input value={rate} onChange={...} className="text-right" onBlur={() => setRate(parseFloat(rate || '0').toFixed(4))} />`
    - `<Label>Multiplier</Label><Input value={multiplier} onChange={...} className="text-right" placeholder="1.00" />`
    - Unit select: `<Select value={unit} onValueChange={setUnit}><SelectTrigger /><SelectContent>` — options: MILES, HOURS, STOPS, DAYS, FLAT, PERCENTAGE.
    - `<Switch id="visible" checked={visibleToDriver} onCheckedChange={setVisibleToDriver} /><Label htmlFor="visible">Visible to driver</Label>`
    - If `selectedCategory === 'DEDUCTION'`: show info text "Deduction amounts are entered as positive values and stored as negative." in amber.
    - `<Label>Notes</Label><Textarea value={notes} onChange={...} placeholder="Optional notes" rows={2} />`
    - Live preview line: `Est. gross: ${(Number(quantity) * Number(rate) * Number(multiplier)).toFixed(2)}` — not authoritative, just guidance.
    - Error display: if `error`, `<p className="text-sm text-destructive">{error}</p>`.
    - Footer: "Cancel" button, "Add component" button (`isSubmitting` → "Adding...").

    **Submit handler**:
    1. Validate: `componentType` selected, `description.trim().length >= 1`, rate is parseable number.
    2. `const res = await fetch(\`/api/driver-pay/assignments/${assignmentId}/components\`, { method: 'POST', body: JSON.stringify({ componentType, category: selectedCategory, description: description.trim(), quantity, unit, rate, multiplier, isTaxable, visibleToDriver, notes: notes.trim() || null }) })`.
    3. Parse JSON. On `component`: `toast.success('Pay component added.')`, `onAdded(result.component)`, `onOpenChange(false)`, reset state.
    4. On `error`: set `error = result.error ?? 'Failed to add component.'`.

    **On dialog close**: reset all state fields to initial values, return to step 1.

    ---

    **File 2: `compensation/page.tsx`** — Update server component.

    Read the current file first (already read above). The page currently shows `ActiveTemplateCard` and `TemplateHistory`. The plan spec says: "Update to also render the pay components section for each assignment (if any assignments exist for this driver)."

    Changes:
    1. Add import at top:
       ```typescript
       import { listAssignmentsForLoad } from '@/app/(owner)/actions/load-driver-assignments';
       import { PayComponentsList } from '@/components/driver-pay/pay-components-list';
       ```
       Note: `listAssignmentsForLoad` takes a loadId — but on the compensation page we have a driverId, not a specific loadId. Instead, query assignments by driverId directly:
       ```typescript
       // After the existing prisma calls, add:
       const assignmentsResult = await prisma.loadDriverAssignment.findMany({
         where: { driverId: cd?.id ?? '', deletedAt: null, tenantId },
         include: {
           load: { select: { referenceNumber: true, createdAt: true } },
           payComponents: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
         },
         orderBy: { createdAt: 'desc' },
         take: 10,     // Show the 10 most recent assignments
       });
       ```
       Use the `prisma` and `tenantId` already fetched in the driver name lookup section. Wrap in try/catch; on error, default to empty array.

    2. In the JSX, after `<TemplateHistory templates={allTemplates} />` and before the closing `</>`, add:
       ```tsx
       {assignmentsResult.length > 0 && (
         <div className="space-y-4">
           <h2 className="text-xl font-semibold">Load Assignments</h2>
           <p className="text-sm text-muted-foreground">
             Pay components for this driver's recent load assignments.
           </p>
           {assignmentsResult.map((assignment) => (
             <div key={assignment.id} className="rounded-xl border bg-card p-4 space-y-3">
               <div className="flex items-center justify-between">
                 <span className="font-medium text-sm">
                   Load {assignment.load?.referenceNumber ?? assignment.loadId.slice(0, 8)}
                 </span>
                 <span className="text-xs text-muted-foreground capitalize">
                   {assignment.payStatus.toLowerCase().replace('_', ' ')}
                 </span>
               </div>
               <PayComponentsList
                 assignmentId={assignment.id}
                 payStatus={assignment.payStatus}
                 initialComponents={assignment.payComponents.map((c) => ({
                   id: c.id,
                   assignmentId: c.assignmentId,
                   componentType: c.componentType,
                   category: c.category,
                   description: c.description,
                   quantity: c.quantity.toString(),
                   unit: c.unit,
                   rate: c.rate.toString(),
                   multiplier: c.multiplier.toString(),
                   grossAmount: c.grossAmount.toString(),
                   isTaxable: c.isTaxable,
                   isReimbursement: c.isReimbursement,
                   visibleToDriver: c.visibleToDriver,
                   notes: c.notes,
                   enteredBy: c.enteredBy,
                   createdAt: c.createdAt.toISOString(),
                 }))}
               />
             </div>
           ))}
         </div>
       )}
       ```
  </action>
  <verify>
    - `grep -n "'use client'" apps/web/src/components/driver-pay/add-component-modal.tsx` confirms directive.
    - `grep -n "CATEGORY_TYPES\|DEDUCTION\|REIMBURSEMENT" apps/web/src/components/driver-pay/add-component-modal.tsx` shows the mapping.
    - `grep -n "step.*1.*2\|setStep" apps/web/src/components/driver-pay/add-component-modal.tsx` shows 2-step flow.
    - `grep -n "PayComponentsList" "apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/compensation/page.tsx"` shows integration.
    - `grep -n "assignmentsResult\|payComponents" "apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/compensation/page.tsx"` shows query.
    - `npx tsc --noEmit` passes with zero errors.
  </verify>
  <done>
    AddComponentModal has category picker (step 1) and type/fields form (step 2). Posts to components API on submit. Compensation page fetches up to 10 assignments for the driver and renders PayComponentsList for each. TypeScript clean.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero errors.
2. Visit `/carrier/fleet/drivers/{id}/compensation`. If the driver has assignments, a "Load Assignments" section appears below Template History.
3. Each assignment shows a PayComponentsList. With no components: empty state shows correct message.
4. "Add pay component" button opens AddComponentModal. Step 1 shows 6 category cards. Selecting BONUS advances to step 2 with the 4 BONUS type options in the dropdown.
5. Filling in fields and submitting calls POST /api/driver-pay/.../components. New component appears in the list.
6. On a PAID assignment: "Add pay component" button is disabled and grayed out.
7. DEDUCTION component row shows text-destructive color and minus sign: "−$50.00".
</verification>

<success_criteria>
- pay-components-list.tsx: groups by category, subtotals, grand total, DEDUCTION sign, tooltip, audit chip, empty state, disabled when PAID.
- add-component-modal.tsx: 2-step (category → form), category→type narrowing for all 6 categories, live gross preview, posts to API, resets on close.
- suggest-detention-button.tsx: fetches preview, editable sheet, posts DETENTION component.
- compensation/page.tsx: shows PayComponentsList for each of the driver's recent assignments.
- Zero TypeScript errors.
</success_criteria>

<output>
Wave 4 complete. No summary needed — proceed to plan 05 (tests).
</output>
---
phase: 299-driver-pay-phase-4-pay-components
plan: 05
type: execute
wave: 5
depends_on: [299-01, 299-02]
files_modified:
  - apps/web/src/lib/driver-pay/__tests__/calculator.test.ts
  - apps/web/src/lib/driver-pay/__tests__/detention.test.ts
  - apps/web/src/lib/driver-pay/__tests__/components.test.ts
  - apps/web/src/app/api/driver-pay/__tests__/components-api.test.ts
autonomous: true

must_haves:
  truths:
    - "Every formula test is penny-exact — no floating point tolerance"
    - "DEDUCTION sign convention verified: positive input produces negative stored value"
    - "Total across mixed components: EARNING + BONUS + DEDUCTION = correct net"
    - "All API test scenarios (PAID immutability, tenant isolation, driver RBAC) have passing tests"
    - "detention tests cover: earned, not earned, exact boundary, rounding to 2 decimals"
  artifacts:
    - path: "apps/web/src/lib/driver-pay/__tests__/calculator.test.ts"
      provides: "12 penny-exact formula tests"
    - path: "apps/web/src/lib/driver-pay/__tests__/detention.test.ts"
      provides: "5 detention boundary tests"
    - path: "apps/web/src/lib/driver-pay/__tests__/components.test.ts"
      provides: "3 component-level unit tests (sign convention, totals, dispatcher)"
    - path: "apps/web/src/app/api/driver-pay/__tests__/components-api.test.ts"
      provides: "6 API integration tests"
  key_links:
    - from: "apps/web/src/lib/driver-pay/__tests__/calculator.test.ts"
      to: "apps/web/src/lib/driver-pay/calculator.ts"
      via: "direct import of each formula function"
      pattern: "import.*calculator"
    - from: "apps/web/src/app/api/driver-pay/__tests__/components-api.test.ts"
      to: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts"
      via: "vi.mock for auth/tenant/prisma, direct handler import"
      pattern: "import.*route"
---

<objective>
Write the complete test suite for Phase 4: penny-exact formula tests, detention boundary tests, component unit tests, and API handler tests. All tests must pass before Phase 4 is considered complete.

Purpose: Formula correctness is mission-critical — pay errors erode driver trust. Tests are the proof that every cent is computed correctly.

Output: 4 test files, 26 total tests, all passing.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/driver-pay/__tests__/snapshot.test.ts
@apps/web/src/app/(owner)/actions/__tests__/load-driver-assignments.test.ts
@apps/web/src/lib/driver-pay/calculator.ts
@apps/web/src/lib/driver-pay/detention.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: calculator.test.ts + detention.test.ts + components.test.ts</name>
  <files>
    apps/web/src/lib/driver-pay/__tests__/calculator.test.ts
    apps/web/src/lib/driver-pay/__tests__/detention.test.ts
    apps/web/src/lib/driver-pay/__tests__/components.test.ts
  </files>
  <action>
    All three files: `import { describe, it, expect } from 'vitest'` and `import Decimal from 'decimal.js'`. Use `expect(result.toString()).toBe(expected)` for Decimal comparisons — never `expect(Number(result)).toBeCloseTo(...)`. Penny-exact only.

    **File 1: `calculator.test.ts`**

    Import all formula functions and computeGrossAmount from `@/lib/driver-pay/calculator`.

    Write 12 tests (one per case):

    1. `'calcCpm: 412 miles × $0.58/mi × 1.0 = $238.96'`
       ```typescript
       const result = calcCpm(new Decimal('412'), new Decimal('0.58'), new Decimal('1.0'));
       expect(result.toString()).toBe('239.0000');
       // Wait — 412 × 0.58 = 238.96 exactly. Verify: 412 * 0.58 = 238.96.
       // Decimal('412').mul(Decimal('0.58')) = Decimal('238.96')
       // Then .mul(Decimal('1.0')) = Decimal('238.960') — toString gives '238.960'
       // Use toFixed(2): expect(result.toFixed(2)).toBe('238.96')
       ```
       Pattern for all tests: use `result.toFixed(2)` for dollar comparisons, `result.toString()` only where exact Decimal string matters.

    2. `'calcCpm: loaded_miles_only — pass 380 loaded miles (not 412 total) → $220.40'`
       ```typescript
       // loaded_miles_only: caller passes loaded miles as quantity
       const result = calcCpm(new Decimal('380'), new Decimal('0.58'), new Decimal('1.0'));
       expect(result.toFixed(2)).toBe('220.40');
       ```

    3. `'calcFuelSurcharge: 412 mi × $0.08 = $32.96'`
       ```typescript
       const result = calcFuelSurcharge(new Decimal('412'), new Decimal('0.08'));
       expect(result.toFixed(2)).toBe('32.96');
       ```

    4. `'calcHourly: 45 hr × $22.50 × 1.5 = $1518.75'`
       ```typescript
       const result = calcHourly(new Decimal('45'), new Decimal('22.50'), new Decimal('1.5'));
       expect(result.toFixed(2)).toBe('1518.75');
       ```

    5. `'calcFlat: $250 × 2.0 = $500.00'`
       ```typescript
       const result = calcFlat(new Decimal('250'), new Decimal('2.0'));
       expect(result.toFixed(2)).toBe('500.00');
       ```

    6. `'calcPercentage: $4500 revenue × 0.80 = $3600.00'`
       ```typescript
       const result = calcPercentage(new Decimal('4500'), new Decimal('0.80'));
       expect(result.toFixed(2)).toBe('3600.00');
       ```

    7. `'calcDaily: 3 days × $175 = $525.00'`
       ```typescript
       const result = calcDaily(new Decimal('3'), new Decimal('175'));
       expect(result.toFixed(2)).toBe('525.00');
       ```

    8. `'calcSplit: $1200 total × 35% = $420.00'`
       ```typescript
       const result = calcSplit(new Decimal('1200'), new Decimal('35'));
       expect(result.toFixed(2)).toBe('420.00');
       ```

    9. `'calcDetention: 4hr elapsed, 2hr free, $25/hr → 2hr billable = $50.00'`
       ```typescript
       const arrived = new Date('2026-05-01T08:00:00Z');
       const departed = new Date('2026-05-01T12:00:00Z');
       const result = calcDetention(arrived, departed, 120, new Decimal('25'));
       expect(result.toFixed(2)).toBe('50.00');
       ```

    10. `'calcDetention: 1.5hr elapsed, 2hr free → billable = 0, grossAmount = $0.00'`
        ```typescript
        const arrived = new Date('2026-05-01T08:00:00Z');
        const departed = new Date('2026-05-01T09:30:00Z');
        const result = calcDetention(arrived, departed, 120, new Decimal('25'));
        expect(result.toFixed(2)).toBe('0.00');
        ```

    11. `'calcFederalOT: 50hr week × $22 base × 1.5 OT → (50-40) × $22 × 1.5 = $330.00'`
        ```typescript
        const result = calcFederalOT(new Decimal('50'), new Decimal('22'), new Decimal('1.5'));
        expect(result.toFixed(2)).toBe('330.00');
        ```

    12. `'calcStateDailyOT: 10hr day × $22 × 1.5 with 8hr threshold → (10-8) × $22 × 1.5 = $66.00'`
        ```typescript
        const result = calcStateDailyOT(new Decimal('10'), new Decimal('8'), new Decimal('22'), new Decimal('1.5'));
        expect(result.toFixed(2)).toBe('66.00');
        ```

    ---

    **File 2: `detention.test.ts`**

    Import `{ suggestDetention }` from `@/lib/driver-pay/detention`.

    Write 5 tests:

    1. `'earned detention: 4hr elapsed, 2hr free, $25/hr → 2hr × $25 = $50.00'`
       ```typescript
       const result = suggestDetention({
         arrivedAt: new Date('2026-05-01T08:00:00Z'),
         departedAt: new Date('2026-05-01T12:00:00Z'),
         freeTimeMinutes: 120,
         detentionRate: new Decimal('25'),
       });
       expect(result).not.toBeNull();
       expect(result!.detentionHours.toFixed(2)).toBe('2.00');
       expect(result!.grossAmount.toFixed(2)).toBe('50.00');
       ```

    2. `'within free time: 1.5hr elapsed, 2hr free → null'`
       ```typescript
       const result = suggestDetention({
         arrivedAt: new Date('2026-05-01T08:00:00Z'),
         departedAt: new Date('2026-05-01T09:30:00Z'),
         freeTimeMinutes: 120,
         detentionRate: new Decimal('25'),
       });
       expect(result).toBeNull();
       ```

    3. `'1 minute over free time: 2hr 1min elapsed → non-null, 0.02hr detention'`
       ```typescript
       const result = suggestDetention({
         arrivedAt: new Date('2026-05-01T08:00:00Z'),
         departedAt: new Date('2026-05-01T10:01:00Z'),
         freeTimeMinutes: 120,
         detentionRate: new Decimal('25'),
       });
       expect(result).not.toBeNull();
       expect(result!.detentionHours.toFixed(2)).toBe('0.02');
       expect(result!.grossAmount.toFixed(2)).toBe('0.42'); // 0.0167hr × $25 rounded to 0.02hr × $25 = $0.50... verify math
       // Exact: 1 minute = 1/60 hours = 0.01667hr. toDecimalPlaces(2) = 0.02. 0.02 × 25 = 0.50.
       // Correct expected: '0.50'
       expect(result!.grossAmount.toFixed(2)).toBe('0.50');
       ```
       Note: fix the spec's stated $0.42 — the actual math is 1/60 hour ≈ 0.0167, rounded to 2dp = 0.02, × $25 = $0.50. Write the correct expected value.

    4. `'exact boundary: 2hr elapsed = 2hr free → null'`
       ```typescript
       const result = suggestDetention({
         arrivedAt: new Date('2026-05-01T08:00:00Z'),
         departedAt: new Date('2026-05-01T10:00:00Z'),
         freeTimeMinutes: 120,
         detentionRate: new Decimal('25'),
       });
       expect(result).toBeNull();
       ```

    5. `'hours rounded to 2 decimal places: 2.5hr detention'`
       ```typescript
       const result = suggestDetention({
         arrivedAt: new Date('2026-05-01T08:00:00Z'),
         departedAt: new Date('2026-05-01T12:30:00Z'), // 4.5hr elapsed, 2hr free = 2.5hr billable
         freeTimeMinutes: 120,
         detentionRate: new Decimal('25'),
       });
       expect(result).not.toBeNull();
       expect(result!.detentionHours.toFixed(2)).toBe('2.50');
       expect(result!.grossAmount.toFixed(2)).toBe('62.50');
       ```

    ---

    **File 3: `components.test.ts`**

    Import `{ computeGrossAmount }` from `@/lib/driver-pay/calculator`.

    Write 3 tests:

    1. `'DEDUCTION sign convention: positive $50 rate → computeGrossAmount returns $50 (category enforcement in API negates)'`
       ```typescript
       // The calculator itself does NOT negate — negation happens in the API POST handler.
       // Test that computeGrossAmount returns positive for ADJUSTMENT_NEGATIVE (flat):
       const result = computeGrossAmount({
         componentType: 'ADJUSTMENT_NEGATIVE',
         quantity: new Decimal('1'),
         rate: new Decimal('50'),
         multiplier: new Decimal('1'),
       });
       expect(result.toFixed(2)).toBe('50.00');
       // Note: the API handler then calls .neg() → stored as -50.00
       ```

    2. `'total across mixed components: EARNING $238.96 + BONUS $50 + DEDUCTION −$30 = $258.96'`
       ```typescript
       const components = [
         { grossAmount: new Decimal('238.96') },
         { grossAmount: new Decimal('50.00') },
         { grossAmount: new Decimal('-30.00') },   // DEDUCTION stored as negative
       ];
       const total = components.reduce((sum, c) => sum.plus(c.grossAmount), new Decimal(0));
       expect(total.toFixed(2)).toBe('258.96');
       ```

    3. `'computeGrossAmount dispatches correctly for BASE_PAY_MILEAGE: 412mi × $0.58 × 1.0 = $238.96'`
       ```typescript
       const result = computeGrossAmount({
         componentType: 'BASE_PAY_MILEAGE',
         quantity: new Decimal('412'),
         rate: new Decimal('0.58'),
         multiplier: new Decimal('1.0'),
       });
       expect(result.toFixed(2)).toBe('238.96');
       ```

    After writing all three files, run:
    ```bash
    cd apps/web && npx vitest run src/lib/driver-pay/__tests__/calculator.test.ts src/lib/driver-pay/__tests__/detention.test.ts src/lib/driver-pay/__tests__/components.test.ts
    ```
    All tests must pass. Fix any failures before proceeding.
  </action>
  <verify>
    - `npx vitest run apps/web/src/lib/driver-pay/__tests__/calculator.test.ts` — 12 tests pass.
    - `npx vitest run apps/web/src/lib/driver-pay/__tests__/detention.test.ts` — 5 tests pass.
    - `npx vitest run apps/web/src/lib/driver-pay/__tests__/components.test.ts` — 3 tests pass.
    - `npx tsc --noEmit` from repo root — zero errors.
  </verify>
  <done>
    20 tests across three files, all passing with penny-exact assertions. No floating point tolerance used — all comparisons via Decimal.toFixed(2). DEDUCTION sign convention documented in test comment. Boundary cases for detention (exact boundary = null, 1 minute over = non-null) verified.
  </done>
</task>

<task type="auto">
  <name>Task 2: components-api.test.ts — API handler tests</name>
  <files>apps/web/src/app/api/driver-pay/__tests__/components-api.test.ts</files>
  <action>
    Create directory `apps/web/src/app/api/driver-pay/__tests__/` and file `components-api.test.ts`.

    Follow the exact same mock pattern as `apps/web/src/app/(owner)/actions/__tests__/load-driver-assignments.test.ts`.

    ```typescript
    import { describe, it, expect, vi, beforeEach } from 'vitest';

    vi.mock('@/lib/auth/supabase', () => ({
      getSession: vi.fn(),
    }));

    vi.mock('@/lib/context/tenant-context', () => ({
      requireTenantId: vi.fn().mockResolvedValue('tenant-123'),
      getTenantPrisma: vi.fn(),
    }));

    vi.mock('@/lib/driver-pay/calculator', () => ({
      computeGrossAmount: vi.fn().mockReturnValue({ neg: () => ({ toString: () => '-50.00' }), toString: () => '50.00' }),
    }));

    vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

    import { NextRequest } from 'next/server';
    import { getSession } from '@/lib/auth/supabase';
    import { getTenantPrisma } from '@/lib/context/tenant-context';
    import { GET, POST } from '@/app/api/driver-pay/assignments/[assignmentId]/components/route';
    import { PATCH, DELETE } from '@/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route';
    ```

    Helper to build mock prisma:
    ```typescript
    function makePrisma(overrides: Partial<Record<string, object>> = {}) {
      return {
        loadDriverAssignment: { findFirst: vi.fn() },
        loadPayComponent: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), findFirst: vi.fn() },
        ...overrides,
      };
    }
    ```

    Helper to build NextRequest:
    ```typescript
    function makeReq(method: string, body?: object, searchParams?: Record<string, string>) {
      const url = new URL(`http://localhost/api/driver-pay/assignments/test-assign/components`);
      if (searchParams) {
        Object.entries(searchParams).forEach(([k, v]) => url.searchParams.set(k, v));
      }
      return new NextRequest(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    }
    ```

    Write 6 tests:

    1. `'GET list: returns components, driver sees only visible_to_driver=true'`
       - Mock session: `{ userId: 'driver-1', user: { app_metadata: { role: 'driver' } } }`.
       - Mock prisma: `loadDriverAssignment.findFirst` returns `{ id: 'assign-1', driverId: 'driver-1', payStatus: 'DRAFT', tenantId: 'tenant-123' }`.
       - `loadPayComponent.findMany` returns array with one component that has `visibleToDriver: true`.
       - Call `GET(makeReq('GET'), { params: Promise.resolve({ assignmentId: 'assign-1' }) })`.
       - Assert response status 200. Parse body and assert `components` array has 1 item.
       - Assert that `findMany` was called with `where` including `visibleToDriver: true`.

    2. `'POST creates component, category enforcement applied for DEDUCTION'`
       - Mock session: owner role `{ userId: 'owner-1', user: { app_metadata: { role: 'owner' } } }`.
       - Mock prisma: assignment found with `payStatus: 'DRAFT'`; `loadPayComponent.create` returns a fake component.
       - Call `POST(makeReq('POST', { componentType: 'ADVANCE_REPAYMENT', category: 'DEDUCTION', description: 'Advance', quantity: '1', unit: 'FLAT', rate: '50', multiplier: '1', isTaxable: true, isReimbursement: false, visibleToDriver: true }), { params: Promise.resolve({ assignmentId: 'assign-1' }) })`.
       - Assert response status 201.
       - Assert `loadPayComponent.create` was called. Capture the `data` arg and verify `grossAmount` is the negated value (the mock computeGrossAmount returns `{ neg: () => ..., toString: () => '50.00' }`). Confirm that for DEDUCTION the `.neg()` was called by checking that `create` received the negated value.

    3. `'PATCH on PAID assignment returns 409'`
       - Mock session: owner role.
       - Mock prisma: `loadDriverAssignment.findFirst` returns `{ payStatus: 'PAID' }`.
       - Call `PATCH(makeReq('PATCH', { description: 'Updated' }), { params: Promise.resolve({ assignmentId: 'assign-1', componentId: 'comp-1' }) })`.
       - Assert response status 409.
       - Parse body: `expect(body.error).toContain('paid assignment')`.

    4. `'DELETE on PAID assignment returns 409'`
       - Mock session: owner role.
       - Mock prisma: assignment found with `payStatus: 'PAID'`.
       - Call `DELETE(makeReq('DELETE'), { params: Promise.resolve({ assignmentId: 'assign-1', componentId: 'comp-1' }) })`.
       - Assert 409.

    5. `'DELETE on DRAFT assignment soft-deletes (sets deletedAt)'`
       - Mock session: owner role.
       - Mock prisma: assignment `payStatus: 'DRAFT'`; component found with `deletedAt: null`; `loadPayComponent.update` returns updated row.
       - Call `DELETE(makeReq('DELETE'), ...)`.
       - Assert 200.
       - Assert `loadPayComponent.update` called with `data: { deletedAt: expect.any(Date) }`.

    6. `'Tenant isolation: driver cannot access another tenant's assignment components'`
       - Mock session: driver role with `userId: 'driver-1'`.
       - Mock prisma: assignment found but with `driverId: 'other-driver'` (not matching session userId).
       - Call `GET(makeReq('GET'), { params: Promise.resolve({ assignmentId: 'assign-1' }) })`.
       - Assert response status 403.

    After writing, run:
    ```bash
    cd apps/web && npx vitest run src/app/api/driver-pay/__tests__/components-api.test.ts
    ```
    All 6 tests must pass. Fix any failures before marking done.

    Then run full suite:
    ```bash
    cd apps/web && npx vitest run src/lib/driver-pay/__tests__/ src/app/api/driver-pay/__tests__/
    ```
  </action>
  <verify>
    - `npx vitest run apps/web/src/app/api/driver-pay/__tests__/components-api.test.ts` — 6 tests pass.
    - Full combined run of all 5 test files (26 tests) passes.
    - `npx tsc --noEmit` from repo root — zero errors.
  </verify>
  <done>
    6 API tests covering: driver visibility filter, DEDUCTION sign enforcement in POST, PAID immutability for PATCH and DELETE, soft-delete confirmation, tenant isolation. All 26 total Phase 4 tests pass.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx vitest run src/lib/driver-pay/__tests__/ src/app/api/driver-pay/__tests__/` — 26 tests pass (12 + 5 + 3 + 6).
2. `npx tsc --noEmit` from repo root — zero errors.
3. No test uses `toBeCloseTo` or Number coercion for money — all use Decimal.toFixed(2) or .toString().
</verification>

<success_criteria>
- 26 tests across 4 files, all passing.
- Penny-exact assertions on all formula tests (Decimal.toFixed(2) comparisons).
- DEDUCTION sign test confirms positive input → positive from calculator, negation in API handler.
- PAID immutability: PATCH and DELETE return 409.
- Soft-delete test: update called with `deletedAt: Date`.
- Tenant isolation: driver cannot see another driver's components (403).
- Zero TypeScript errors.
</success_criteria>

<output>
After all 5 plans complete, create `.planning/quick/299-driver-pay-phase-4-pay-components/299-SUMMARY.md` documenting:
- Files created (calculator.ts, detention.ts, auto-base-pay.ts, 3 API routes, 3 UI components, 1 page update, 4 test files)
- Key implementation notes: Decimal-only arithmetic, DEDUCTION sign flip in API not calculator, idempotency pattern in ensureBasePayComponent, suggest-detention preview flow
- Test results: 26 tests passing
- Any deviations from plan and rationale
</output>
