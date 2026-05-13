---
phase: 304-driver-pay-phase-8-settlement-generation
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/driver-pay/settlement-generator.ts
  - apps/web/src/lib/driver-pay/settlement-pdf.tsx
  - apps/web/src/lib/driver-pay/settlement-anomaly.ts
  - apps/web/src/app/api/driver-pay/settlements/generate/route.ts
  - apps/web/src/app/api/driver-pay/settlements/route.ts
  - apps/web/src/app/api/driver-pay/settlements/[settlementId]/route.ts
  - apps/web/src/app/api/driver-pay/settlements/[settlementId]/finalize/route.ts
  - apps/web/src/app/api/driver-pay/settlements/[settlementId]/mark-paid/route.ts
  - apps/web/src/app/api/driver-pay/settlements/[settlementId]/void/route.ts
  - apps/web/src/app/api/driver-pay/settlements/[settlementId]/pdf/route.ts
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/page.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/generate/page.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/GenerateSettlementsModal.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementListTable.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx
  - apps/web/src/app/api/driver-pay/__tests__/settlements-algorithm.test.ts
  - apps/web/src/app/api/driver-pay/__tests__/settlements-rerun.test.ts
  - apps/web/src/app/api/driver-pay/__tests__/settlements-carryover.test.ts
  - apps/web/src/app/api/driver-pay/__tests__/settlements-concurrent.test.ts
  - apps/web/src/app/api/driver-pay/__tests__/settlements-finalize.test.ts
  - apps/web/src/app/api/driver-pay/__tests__/settlements-paid.test.ts
  - apps/web/src/app/api/driver-pay/__tests__/settlements-anomaly.test.ts
  - apps/web/src/app/api/driver-pay/__tests__/settlements-tenant.test.ts
autonomous: true

must_haves:
  truths:
    - "OWNER can generate settlement drafts for a driver + period, summing approved-and-unsettled assignments + scheduled bonuses minus capped deductions"
    - "Concurrent generate attempts for the same driver+period yield exactly one settlement (serializable transaction + FOR UPDATE)"
    - "OWNER can finalize a DRAFT settlement, which generates a PDF and locks the snapshot"
    - "OWNER can mark a FINALIZED settlement PAID, which flips all child LoadDriverAssignment.payStatus to PAID"
    - "OWNER can void a DRAFT or FINALIZED (never PAID) settlement, releasing assignments back to APPROVED"
    - "MANAGER+ can list and view settlements; drivers can view only their own"
    - "Settlement PDF includes per-load breakdown, bonuses, deductions, net pay total, and signature line"
    - "Anomaly flag appears when net pay deviates >25% from driver's 4-week average"
    - "Garnishment cap (maxPercentageOfNet) carries unpaid balance forward across periods"
    - "Re-running generation skips already-settled assignments (settlementId NOT NULL)"
    - "Overlapping FINALIZED/PAID settlement for a driver+period returns 409 with conflicting drivers list"
  artifacts:
    - path: "apps/web/src/lib/driver-pay/settlement-generator.ts"
      provides: "Settlement generation algorithm (spec 10.4) with serializable transaction"
      exports: ["generateSettlementForDriver", "generateSettlementsBatch"]
      min_lines: 250
    - path: "apps/web/src/lib/driver-pay/settlement-pdf.tsx"
      provides: "@react-pdf/renderer PDF generator for settlement"
      exports: ["generateSettlementPdf"]
      min_lines: 150
    - path: "apps/web/src/lib/driver-pay/settlement-anomaly.ts"
      provides: "4-week rolling average + >25% deviation detection"
      exports: ["detectSettlementAnomaly", "computeFourWeekAverage"]
    - path: "apps/web/src/app/api/driver-pay/settlements/generate/route.ts"
      provides: "POST endpoint to generate drafts; OWNER only; 409 on overlap"
      exports: ["POST"]
    - path: "apps/web/src/app/api/driver-pay/settlements/route.ts"
      provides: "GET list with driverId/status/period filters"
      exports: ["GET"]
    - path: "apps/web/src/app/api/driver-pay/settlements/[settlementId]/route.ts"
      provides: "GET full breakdown with assignments + components + bonuses + deductions"
      exports: ["GET"]
    - path: "apps/web/src/app/api/driver-pay/settlements/[settlementId]/finalize/route.ts"
      provides: "POST finalize; OWNER only; writes pdfUrl + finalizedBy/finalizedAt"
      exports: ["POST"]
    - path: "apps/web/src/app/api/driver-pay/settlements/[settlementId]/mark-paid/route.ts"
      provides: "POST mark-paid; OWNER only; flips children to PAID"
      exports: ["POST"]
    - path: "apps/web/src/app/api/driver-pay/settlements/[settlementId]/void/route.ts"
      provides: "POST void DRAFT or FINALIZED; releases children"
      exports: ["POST"]
    - path: "apps/web/src/app/api/driver-pay/settlements/[settlementId]/pdf/route.ts"
      provides: "Streams PDF buffer; MANAGER+ (driver sees own)"
      exports: ["GET"]
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/settlements/page.tsx"
      provides: "Settlements list page with filters"
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx"
      provides: "Settlement detail page mirroring PDF with anomaly badge"
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/settlements/generate/page.tsx"
      provides: "Generate Settlements UI with default Mon-Sun prefill"
  key_links:
    - from: "apps/web/src/app/api/driver-pay/settlements/generate/route.ts"
      to: "apps/web/src/lib/driver-pay/settlement-generator.ts"
      via: "calls generateSettlementsBatch inside POST handler"
      pattern: "generateSettlementsBatch"
    - from: "apps/web/src/lib/driver-pay/settlement-generator.ts"
      to: "Prisma $transaction (Serializable) + $queryRaw FOR UPDATE"
      via: "isolationLevel: 'Serializable' option + SELECT ... FOR UPDATE"
      pattern: "isolationLevel:\\s*['\"]Serializable['\"]"
    - from: "apps/web/src/app/api/driver-pay/settlements/[settlementId]/finalize/route.ts"
      to: "apps/web/src/lib/driver-pay/settlement-pdf.tsx"
      via: "generateSettlementPdf invoked to produce buffer + pdfUrl"
      pattern: "generateSettlementPdf"
    - from: "apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx"
      to: "/api/driver-pay/settlements/[settlementId]"
      via: "fetch in server component (or client useEffect)"
      pattern: "driver-pay/settlements"
    - from: "apps/web/src/app/(owner)/carrier/driver-pay/settlements/page.tsx"
      to: "/api/driver-pay/settlements"
      via: "fetch with filter querystring"
      pattern: "driver-pay/settlements"
---

<objective>
Build Driver Pay Phase 8: settlement generation algorithm (spec 10.4), PDF rendering, REST API surface, owner UI pages, and exhaustive test coverage. This is the capstone of the Driver Pay system — APPROVED LoadDriverAssignments + scheduled DriverBonuses minus capped DriverDeductions roll up into a DriverSettlement (DRAFT → FINALIZED → PAID), printable, voidable, and anomaly-flagged.

Purpose: Convert per-load approved pay into Friday settlement runs that a carrier owner can review, finalize (locks + PDF), and mark paid. Concurrency-safe (serializable transaction with row locks) so the same approved load can never be settled twice.

Output:
- 1 generator service (spec 10.4 algorithm, exact penny math via decimal.js)
- 1 PDF service (@react-pdf/renderer, already installed v4.3.2)
- 1 anomaly helper (4-week rolling avg + >25% deviation)
- 7 API routes (generate, list, detail, finalize, mark-paid, void, pdf)
- 3 owner UI pages + 3 components (list, detail, generate modal)
- 8 test files covering algorithm, rerun, carryover, concurrency, finalize, paid, anomaly, tenant isolation
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/specs/DriverPay_TechnicalSpec_v4.md
@apps/web/prisma/schema.prisma
@apps/web/src/lib/driver-pay/calculator.ts
@apps/web/src/lib/driver-pay/state-machine.ts
@apps/web/src/lib/driver-pay/installment-scheduler.ts
@apps/web/src/lib/auth/supabase.ts
@apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts
@apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/route.ts
@apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/route.ts
@apps/web/src/app/api/driver-pay/pending-queue/route.ts
@apps/web/src/app/api/driver-pay/__tests__/bonuses-deductions-api.test.ts
@apps/web/src/app/api/driver-pay/__tests__/transitions-api.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Settlement generator service + PDF + anomaly helper</name>
  <files>
    apps/web/src/lib/driver-pay/settlement-generator.ts
    apps/web/src/lib/driver-pay/settlement-pdf.tsx
    apps/web/src/lib/driver-pay/settlement-anomaly.ts
  </files>
  <action>
Create three pure-ish service modules following the existing decimal.js + Prisma patterns from `calculator.ts` and `installment-scheduler.ts`.

**A. `settlement-generator.ts`** — implements spec section 10.4 exactly:

```ts
import Decimal from 'decimal.js';
import type { PrismaClient } from '@/generated/prisma';

export interface GenerateInput {
  tenantId: string;
  driverId: string;
  periodStart: Date;
  periodEnd: Date;
  actorUserId: string;
}

export interface GenerateResult {
  settlement: DriverSettlement;
  assignmentCount: number;
  bonusCount: number;
  deductionCount: number;
  carryoverApplied: Decimal;
}

export async function generateSettlementForDriver(
  prisma: PrismaClient,   // pass tenant-scoped client
  input: GenerateInput
): Promise<GenerateResult>

export async function generateSettlementsBatch(
  prisma: PrismaClient,
  inputs: Omit<GenerateInput, 'driverId'> & { driverIds: string[] }
): Promise<{ results: GenerateResult[]; conflicts: { driverId: string; reason: string }[] }>
```

Algorithm steps inside `generateSettlementForDriver` — MUST run inside `prisma.$transaction(async (tx) => { ... }, { isolationLevel: 'Serializable', timeout: 30000 })`:

1. **Pre-check (outside or first inside tx):** Query for any existing `DriverSettlement` where `driverId` matches AND `status IN ('FINALIZED','PAID')` AND `periodStart <= input.periodEnd AND periodEnd >= input.periodStart` (overlap). If exists, throw `SettlementOverlapError` with the conflicting settlement id.

2. **Lock approved-and-unsettled assignments** via `$queryRaw` (NOT `findMany`):
   ```ts
   const rows = await tx.$queryRaw<Array<{id: string}>>`
     SELECT id FROM "LoadDriverAssignment"
     WHERE "tenantId" = ${input.tenantId}
       AND "driverId" = ${input.driverId}
       AND "payStatus" = 'APPROVED'
       AND "settlementId" IS NULL
       AND "approvedAt" IS NOT NULL
       AND "approvedAt" <= ${input.periodEnd}
     FOR UPDATE
   `;
   ```
   Then `tx.loadDriverAssignment.findMany({ where: { id: { in: rows.map(r => r.id) } }, include: { payComponents: true, load: true } })`.

3. **Sum components per assignment** — group `LoadPayComponent` by `category` + `isTaxable`:
   - `grossTaxable` = sum of components where `category IN ('EARNING','BONUS','ACCESSORIAL','ADJUSTMENT')` AND `isTaxable = true`
   - `grossNonTaxable` = same categories where `isTaxable = false` (allowances, reimbursements typically)
   - Per-assignment deductions sum (category = DEDUCTION) — added to running `totalDeductions` (deductions stored as positive amounts; subtracted from gross at end).
   - Use `new Decimal(c.grossAmount.toString())` for every component; reduce via `.plus()`.

4. **Pull scheduled standalone bonuses** (not tied to a load):
   ```ts
   const bonuses = await tx.driverBonus.findMany({
     where: {
       tenantId, driverId,
       paidAt: null,
       settlementId: null,
       scheduledPayDate: { lte: input.periodEnd },
     },
   });
   ```
   Add taxable bonuses to `grossTaxable`, non-taxable to `grossNonTaxable`.

5. **Compute deductions** — fetch active `DriverDeduction` rows:
   ```ts
   const deductions = await tx.driverDeduction.findMany({
     where: {
       tenantId, driverId, paused: false,
       OR: [
         { schedule: 'EVERY_SETTLEMENT' },
         { schedule: 'FIXED_INSTALLMENTS', amountCollected: { lt: prisma.driverDeduction.fields.totalAmount } },
         { schedule: 'ONE_TIME', amountCollected: { lt: prisma.driverDeduction.fields.totalAmount } },
       ],
     },
   });
   ```
   For each, the requested amount is `amountPerPeriod` (or remaining balance for ONE_TIME/FIXED_INSTALLMENTS, whichever is smaller).

6. **Apply garnishment cap (maxPercentageOfNet)** — iterate deductions in order, computing running `netPay = grossTaxable + grossNonTaxable - totalDeductions`. For each deduction with `maxPercentageOfNet != null`:
   - `cap = netPayBeforeThis * (maxPercentageOfNet / 100)`
   - `applied = Decimal.min(requested, cap)`
   - `carryover = requested - applied` → stored on the deduction as `pendingCarryover` (add a new field? No — spec says: write to `DriverDeduction.notes` or a `carryoverAmount` column. **Check schema for an existing column; if none, append "Carryover $X" to notes field and log in audit.** For this task, store carryover by leaving `amountCollected` unbumped on the carryover portion — the next period's pre-check will re-attempt the unpaid balance.)

   Sum `applied` amounts into `totalDeductions`.

7. **Final totals:**
   ```ts
   const netPay = grossTaxable.plus(grossNonTaxable).minus(totalDeductions);
   ```
   If `netPay < 0`, clamp to 0 and carry the excess deductions to next period (note in audit).

8. **Insert `DriverSettlement` row**, status='DRAFT', settlementReference = `SET-${YYYYMMDD}-${driverId.slice(0,6)}-${randomSuffix}`. Persist Decimal as string via `.toFixed(2)` then `new Prisma.Decimal(...)`.

9. **Update touched rows in same tx:**
   - `tx.loadDriverAssignment.updateMany({ where: { id: { in: assignmentIds } }, data: { settlementId: settlement.id } })`
   - `tx.driverBonus.updateMany({ where: { id: { in: bonusIds } }, data: { settlementId: settlement.id } })`
   - For each deduction with applied amount > 0: `tx.driverDeduction.update({ where: { id }, data: { amountCollected: { increment: appliedAmount } } })`

10. **Write audit log** via existing audit pattern (check `pending-queue` or `corrections` route for the audit helper; likely `prisma.driverPayAuditLog.create` or similar). Log: actor, settlementId, totals snapshot, conflict resolutions, carryover applied.

`generateSettlementsBatch` loops over `driverIds`, calling `generateSettlementForDriver` per driver. Catches `SettlementOverlapError` and accumulates into `conflicts[]` instead of throwing. Returns combined `results` + `conflicts`.

Custom error class:
```ts
export class SettlementOverlapError extends Error {
  constructor(public driverId: string, public conflictingSettlementId: string) {
    super(`Driver ${driverId} already has overlapping settlement ${conflictingSettlementId}`);
    this.name = 'SettlementOverlapError';
  }
}
```

**B. `settlement-pdf.tsx`** — uses `@react-pdf/renderer` v4.3.2 (already installed):

```ts
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import type { DriverSettlement, Driver, Tenant, LoadDriverAssignment, LoadPayComponent, DriverBonus, DriverDeduction, Load } from '@/generated/prisma';

interface SettlementPdfInput {
  settlement: DriverSettlement;
  tenant: Pick<Tenant, 'name'>;
  driver: Pick<Driver, 'firstName' | 'lastName' | 'employmentType'>;
  assignments: Array<LoadDriverAssignment & { payComponents: LoadPayComponent[]; load: Pick<Load, 'loadNumber' | 'pickupAt' | 'deliveryAt'> }>;
  bonuses: DriverBonus[];
  deductionsApplied: Array<{ deduction: DriverDeduction; appliedAmount: string }>;
}

export async function generateSettlementPdf(input: SettlementPdfInput): Promise<Buffer> {
  const stream = await pdf(<SettlementDoc {...input} />).toBuffer();
  return stream as Buffer;
}
```

Layout (single component, ~6 sections):
- Header: carrier name (top-left, bold 16pt), settlement reference (top-right), "DRIVER SETTLEMENT" title centered
- Driver block: name, employment type (W2/1099), period dates (e.g., "Pay Period: Apr 8 – Apr 14, 2026"), generation timestamp
- Summary table: 4 rows — Gross Taxable Earnings, Gross Non-Taxable, Total Deductions (red), **Net Pay** (bold, larger font)
- Per-load breakdown: for each assignment, render load number + pickup/delivery dates + a sub-table of pay components (description, category, amount). Skip if zero-load settlement.
- Standalone Bonuses section (only if `bonuses.length > 0`): table of bonus type, description, amount, taxable y/n
- Deductions section (only if applied > 0): table of deduction name, schedule type, amount this period
- Footer: timestamp, settlement id, signature line ("Driver Signature: _______________ Date: ________")

Use `StyleSheet.create` with print-safe colors (no #ffffff/#000000 — use #1f2937 for text, #dc2626 for deductions, #047857 for net pay positive). Font: built-in Helvetica.

**C. `settlement-anomaly.ts`** — anomaly detection:

```ts
import Decimal from 'decimal.js';
import type { PrismaClient } from '@/generated/prisma';

export async function computeFourWeekAverage(
  prisma: PrismaClient,
  tenantId: string,
  driverId: string,
  asOfDate: Date,
): Promise<Decimal | null> // null if <2 prior settlements

export interface AnomalyResult {
  isAnomaly: boolean;
  fourWeekAverage: Decimal | null;
  currentNet: Decimal;
  deviationPct: Decimal | null; // e.g., 32.5 means +32.5%
  reason: string | null;
}

export function detectSettlementAnomaly(
  currentNet: Decimal,
  fourWeekAverage: Decimal | null,
): AnomalyResult
```

`computeFourWeekAverage`: query last 4 FINALIZED-or-PAID settlements for the driver ending before `asOfDate`, average their `netPay`. Returns null if fewer than 2 historical settlements (insufficient data).

`detectSettlementAnomaly`: if avg is null, `isAnomaly = false`. Otherwise compute `deviationPct = ((current - avg) / avg) * 100`. If `Math.abs(deviationPct) > 25`, set `isAnomaly = true` and `reason = "Net pay $X is Y% ${current > avg ? 'higher' : 'lower'} than 4-week average $Z"`.

Use `Decimal` math throughout. Export everything as named exports.
  </action>
  <verify>
    `cd apps/web && pnpm tsc --noEmit` passes for these three files.
    `cd apps/web && pnpm prisma generate` confirms model field names match (DriverSettlement, LoadDriverAssignment, DriverBonus, DriverDeduction, LoadPayComponent).
    Hand-trace algorithm against spec 10.4: confirm steps 1-9 each map to a code block.
  </verify>
  <done>
    All three files exist with named exports listed above. No `any` types. Decimal.js used for every money operation. `$transaction` wrapper present with `isolationLevel: 'Serializable'`. `$queryRaw` with `FOR UPDATE` present. Custom `SettlementOverlapError` exported. PDF buffer returned from `generateSettlementPdf`. Anomaly threshold is 25% deviation (absolute value).
  </done>
</task>

<task type="auto">
  <name>Task 2: Settlement REST API routes (7 endpoints)</name>
  <files>
    apps/web/src/app/api/driver-pay/settlements/generate/route.ts
    apps/web/src/app/api/driver-pay/settlements/route.ts
    apps/web/src/app/api/driver-pay/settlements/[settlementId]/route.ts
    apps/web/src/app/api/driver-pay/settlements/[settlementId]/finalize/route.ts
    apps/web/src/app/api/driver-pay/settlements/[settlementId]/mark-paid/route.ts
    apps/web/src/app/api/driver-pay/settlements/[settlementId]/void/route.ts
    apps/web/src/app/api/driver-pay/settlements/[settlementId]/pdf/route.ts
  </files>
  <action>
Build 7 REST routes following the EXACT patterns from existing driver-pay routes (study `assignments/[assignmentId]/transitions/route.ts`, `drivers/[driverId]/bonuses/route.ts`, and `pending-queue/route.ts` first).

**Common patterns to mirror:**
- `getSession()` then check `session.user` exists
- `getTenantPrisma(session)` for tenant-scoped Prisma client
- Role check via `session.user.role`: `OWNER` (= ADMIN in spec), `MANAGER`, `DRIVER`
- Zod validation for request bodies
- Return `NextResponse.json({ error: '...' }, { status })` for errors
- Structured logger for all mutations: `logger.info({ ... }, 'message')`
- Use `revalidatePath` if applicable

**Idempotency cache (for /generate):** simple in-memory Map keyed by `${tenantId}:${idempotencyKey}` with 5-minute TTL. Module-level `const idempotencyCache = new Map<string, { result: unknown; expiresAt: number }>();`. Clean expired entries on each request. (No Redis required — in-process is acceptable for v1; spec allows.)

---

**1. `POST /api/driver-pay/settlements/generate`**

Auth: OWNER only (`session.user.role !== 'OWNER'` → 403).

Body (Zod):
```ts
z.object({
  driverIds: z.array(z.string().uuid()).min(1).max(50),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  idempotencyKey: z.string().min(1).max(100),
})
```

Validate `periodEnd > periodStart` and `(periodEnd - periodStart) <= 31 days` (reject impossible windows).

Check idempotency cache; if hit, return cached response with `X-Idempotent-Replay: true` header.

Call `generateSettlementsBatch(prisma, { tenantId, periodStart, periodEnd, driverIds, actorUserId })`.

Response:
```ts
{
  results: [{ settlement: {...}, assignmentCount, bonusCount, deductionCount, carryoverApplied }],
  conflicts: [{ driverId, reason, conflictingSettlementId? }],
}
```
Status: 200 if `results.length > 0`; 409 if `results.length === 0 && conflicts.length > 0`.

Cache result with 5-min TTL keyed by idempotency key.

---

**2. `GET /api/driver-pay/settlements`**

Auth: MANAGER+ for all data; DRIVER only their own (auto-filter `driverId = session.user.driverId`).

Query params: `driverId?`, `status?` (DRAFT|FINALIZED|PAID|VOIDED), `periodStart?`, `periodEnd?`, `page?` (default 1), `pageSize?` (default 25, max 100).

Return:
```ts
{
  settlements: Array<DriverSettlement & { driver: { firstName, lastName, employmentType } }>,
  totalCount: number,
  page: number,
  pageSize: number,
}
```

---

**3. `GET /api/driver-pay/settlements/[settlementId]`**

Auth: MANAGER+; DRIVER only own (verify `settlement.driverId === session.user.driverId`).

Returns full breakdown:
```ts
{
  settlement: DriverSettlement,
  driver: Driver,
  assignments: Array<LoadDriverAssignment & { payComponents, load: { loadNumber, pickupAt, deliveryAt } }>,
  bonuses: DriverBonus[],
  deductionsApplied: Array<{ deduction: DriverDeduction, appliedAmount: string }>, // join via amountCollected delta — simpler: include all deductions linked via audit log OR re-query deductions and compute. For v1: deductionsApplied is derived from re-summing the deductions touched in this settlement period (filter deductions where updatedAt between settlement.createdAt and now AND lastSettlementId == this one). Simplest: store deductionsAppliedSnapshot JSON on settlement at generation time. Add this to settlement-generator.ts as a new column? Schema already has `notes` field — embed JSON there with marker `"_deductionsApplied":[...]`. Acceptable for v1.
  anomaly: AnomalyResult,
}
```

For anomaly: call `computeFourWeekAverage` + `detectSettlementAnomaly`.

---

**4. `POST /api/driver-pay/settlements/[settlementId]/finalize`**

Auth: OWNER only.

Validates: settlement.status === 'DRAFT'. If not, 409 `{ error: 'Only DRAFT settlements can be finalized' }`.

Steps:
1. Load settlement with same `include` as detail endpoint
2. Call `generateSettlementPdf(...)` → Buffer
3. Upload buffer to R2 via existing R2 client (check `apps/web/src/lib/r2/` or similar; use same pattern as document uploads). Key: `settlements/${tenantId}/${settlement.id}.pdf`.
4. Update settlement:
   ```ts
   await prisma.driverSettlement.update({
     where: { id: settlementId },
     data: {
       status: 'FINALIZED',
       finalizedBy: session.user.id,
       finalizedAt: new Date(),
       pdfUrl: r2Key, // store key not URL; route handler will generate signed URL
     },
   });
   ```
5. Audit log entry.

Returns updated settlement.

---

**5. `POST /api/driver-pay/settlements/[settlementId]/mark-paid`**

Auth: OWNER only.

Body (optional): `{ settlementReference?: string, paidAt?: Date }`.

Validates: settlement.status === 'FINALIZED'. If not, 409.

Inside `prisma.$transaction`:
1. Update settlement: `status='PAID'`, `paidAt = body.paidAt ?? new Date()`, `settlementReference = body.settlementReference ?? settlement.settlementReference`.
2. Update all child assignments: `updateMany({ where: { settlementId }, data: { payStatus: 'PAID' } })`.
3. Update child bonuses: `updateMany({ where: { settlementId }, data: { paidAt: paidAt } })`.
4. Audit log.

---

**6. `POST /api/driver-pay/settlements/[settlementId]/void`**

Auth: OWNER only.

Body (Zod): `{ reason: z.string().min(5).max(500) }`.

Validates: settlement.status IN ('DRAFT','FINALIZED'). PAID returns 409 `{ error: 'PAID settlements cannot be voided. Issue a correction instead.' }`.

Inside `prisma.$transaction`:
1. Update settlement: `status='VOIDED'`, append reason to `notes`.
2. Release assignments: `updateMany({ where: { settlementId }, data: { settlementId: null } })` — they return to APPROVED status (payStatus already APPROVED, just clear FK).
3. Release bonuses: `updateMany({ where: { settlementId }, data: { settlementId: null } })`.
4. Reverse deduction amountCollected: needs the snapshot from notes JSON; decrement `amountCollected` by `appliedAmount` per affected deduction.
5. Audit log.

---

**7. `GET /api/driver-pay/settlements/[settlementId]/pdf`**

Auth: MANAGER+; DRIVER only own.

If `settlement.pdfUrl` exists (FINALIZED+): generate signed URL from R2 (1-hour expiry), return:
```ts
return NextResponse.json({ url: signedUrl });
```

If DRAFT (no pdfUrl yet): generate PDF on-the-fly and stream:
```ts
const buffer = await generateSettlementPdf(input);
return new NextResponse(buffer, {
  headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `inline; filename="settlement-${settlement.settlementReference}.pdf"`,
  },
});
```

(Streaming buffer directly is fine for serverless; spec acceptable.)

---

**Avoid:** Do NOT add server actions — stick to route handlers like the rest of driver-pay/. Do NOT use raw Prisma client; always `getTenantPrisma(session)`. Do NOT skip role checks. Do NOT use `user_metadata` (use `app_metadata` via session helper).
  </action>
  <verify>
    `cd apps/web && pnpm tsc --noEmit` passes.
    Curl smoke (after one driver has an APPROVED assignment): `POST /api/driver-pay/settlements/generate` returns 200 with a draft settlement.
    Second call with same idempotencyKey returns cached response with `X-Idempotent-Replay: true`.
    `POST .../finalize` on a DRAFT returns 200 + pdfUrl populated.
    `POST .../mark-paid` on FINALIZED returns 200 and child assignment payStatus = 'PAID'.
    `POST .../void` on PAID returns 409.
  </verify>
  <done>
    All 7 route files exist under `apps/web/src/app/api/driver-pay/settlements/`. Each uses `getSession` + `getTenantPrisma`. Role checks present and correct (OWNER for mutations, MANAGER+ for reads, DRIVER scoped to own). Zod validation on all POST bodies. Audit logs written. `revalidatePath('/carrier/driver-pay/settlements')` called after mutations. No `any` types.
  </done>
</task>

<task type="auto">
  <name>Task 3: Owner UI — list, detail, generate modal</name>
  <files>
    apps/web/src/app/(owner)/carrier/driver-pay/settlements/page.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/settlements/generate/page.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/GenerateSettlementsModal.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementListTable.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx
  </files>
  <action>
Build the owner-facing UI for settlements. Follow patterns from existing driver-pay UI under `apps/web/src/app/(owner)/carrier/driver-pay/`. Use shadcn/ui components (Button, Card, Table, Dialog, Badge, Select, Tooltip), Tailwind, dark mode supported.

**Run UI UX Pro Max skill first** per CLAUDE.md — query: "settlement pay run dashboard table financial professional".

---

**A. `settlements/page.tsx`** — Server component (list)

```tsx
export default async function SettlementsPage({ searchParams }: { searchParams: { driverId?: string; status?: string; periodStart?: string; periodEnd?: string; page?: string }}) {
  const session = await getSession();
  if (!session) redirect('/login');
  // Fetch via internal fetch or call route handler directly via tenant prisma
  // Render SettlementListTable client component with data
}
```

- Top action bar: page title "Settlements", "Generate Settlements" button (links to `/carrier/driver-pay/settlements/generate`)
- Filter bar: Driver select (all drivers in tenant), Status select (All/Draft/Finalized/Paid/Voided), Date range pickers for period
- `SettlementListTable` (client component): columns = Settlement Ref, Driver, Period, Net Pay, Status badge (colored: DRAFT=zinc, FINALIZED=blue, PAID=emerald, VOIDED=zinc-strikethrough), Created At; sortable; row click → `/carrier/driver-pay/settlements/[id]`
- Empty state per spec 8.6: heading "No settlements yet", body "Run your first Friday settlement to generate driver pay statements.", primary CTA "Generate Settlements"
- Pagination footer (Prev/Next + page count)

---

**B. `settlements/[settlementId]/page.tsx`** — Server component (detail)

```tsx
export default async function SettlementDetailPage({ params }: { params: { settlementId: string }}) {
  const session = await getSession();
  // Fetch full breakdown from /api/driver-pay/settlements/[settlementId]
  // Render SettlementDetailView client component
}
```

`SettlementDetailView` layout (mirrors PDF):
- Top bar: back link "← Settlements", title "Settlement {settlementReference}", status badge
- **Hero card**: Net Pay $X (huge, bold, emerald-600 in light/emerald-400 in dark); subtitle "Period: Apr 8 – Apr 14, 2026 · {Driver Name}"
- **Anomaly banner** (if `anomaly.isAnomaly`): amber bg, AlertCircle icon, text "Higher than usual — review", Tooltip on hover showing "4-week avg: $X, this period: $Y, deviation: +Z%"
- **Action buttons** (role-gated):
  - DRAFT: "Finalize" (primary), "Void" (destructive), "Download Preview PDF" (ghost)
  - FINALIZED: "Mark Paid" (primary), "Void" (destructive), "Download PDF"
  - PAID: "Download PDF" only (no mutations)
  - VOIDED: "Download PDF" only, grayed out
- **Summary table**: 4 rows (Gross Taxable, Gross Non-Taxable, Total Deductions in red, **Net Pay** bold)
- **Per-load breakdown**: collapsible accordion per assignment showing load number (clickable → load detail), pickup/delivery dates, sub-table of pay components (description, category badge, amount). Show count: "{N} loads"
- **Bonuses section** (if any): table of bonus type badge, description, amount, taxable y/n
- **Deductions section** (if any): table of deduction name, schedule type, amount this period — minus sign prefix, red color
- **Footer metadata**: created at, finalized at (if applicable), paid at (if applicable), settlement reference

**Confirm dialogs (Pattern E from spec 8.x):**
- Finalize: "Finalize this settlement? This will lock {N} assignments and {M} bonuses, generate a PDF, and prevent further edits. The settlement can still be voided if needed." → buttons: Cancel / Finalize
- Mark Paid: "Mark settlement as PAID? This cannot be undone. {driverName} will be marked as paid $X for the period Apr 8–14, 2026. {N} assignments will move to PAID status." → buttons: Cancel / Mark Paid (with red confirm color since irreversible)
- Void: textarea for reason (required, min 5 chars), checkbox "I understand this releases all assignments back to APPROVED and reverses deductions" → buttons: Cancel / Void Settlement

All mutations: optimistic UI + toast on success/failure + revalidate.

---

**C. `settlements/generate/page.tsx`** — Generate flow

Server component wrapping client `GenerateSettlementsModal` (open by default since this is a dedicated route). Pre-fetches list of drivers with `payStatus=APPROVED` assignments (count per driver).

**`GenerateSettlementsModal` features:**
- Period inputs: prefilled to last full Mon–Sun (compute: today minus weekday, minus 7 days = last Monday; +6 = Sunday). Two DatePickers.
- Driver picker: searchable multi-select with checkboxes; default = all drivers who have approved-and-unsettled assignments in the period. Show count next to each: "John Doe (3 loads, $1,240 pending)".
- Preview summary at bottom: "{N} drivers · {M} loads pending · est. total $X" (computed client-side or via preview API).
- Submit: POSTs to `/api/driver-pay/settlements/generate` with auto-generated `idempotencyKey = crypto.randomUUID()`.
- During request: progress bar "Processing {currentDriverIndex} of {total}…" (we don't have streaming; for v1, show indeterminate spinner with text "Generating settlements...").
- Results panel after success:
  - Successes: card per driver "✓ {Driver Name} — Draft created, Net Pay $X" with link to detail
  - Conflicts: amber card per conflict "⚠ {Driver Name} — Already has FINALIZED settlement for overlapping period" with link to conflicting settlement
- Final CTA: "View All Settlements" → /carrier/driver-pay/settlements

---

**Loading & error states:** Use Suspense + skeleton tables for list page; error.tsx file if needed. Toast on mutation success/failure via existing toast util.

**Dark mode:** All colors via Tailwind tokens (zinc/emerald/red/amber/blue); no hardcoded hex.

**Accessibility:** All icon-only buttons have `aria-label`; tables have `<caption>`; confirm dialogs use AlertDialog from shadcn (which handles focus trap).
  </action>
  <verify>
    `cd apps/web && pnpm tsc --noEmit` passes.
    `cd apps/web && pnpm dev`, visit `/carrier/driver-pay/settlements` — list page renders with empty state OR existing settlements.
    Click "Generate Settlements" → modal opens with period pre-filled to last Mon-Sun.
    Generate against a driver with approved pay → draft created, redirects to detail page.
    Detail page shows Net Pay hero, summary, per-load accordion, action buttons appropriate to status.
    Finalize button → confirm dialog → on confirm → status flips to FINALIZED, "Mark Paid" button appears.
    Anomaly banner appears for settlements with >25% net pay deviation from 4-week avg.
    Dark mode toggle works on all 3 pages without color contrast failures.
  </verify>
  <done>
    All 3 pages and 3 components exist. Server components fetch data; client components handle interactions. shadcn/ui used consistently. All mutations go through the API routes from Task 2. Confirm dialogs match spec Pattern E. Empty state matches spec 8.6. Anomaly badge with tooltip rendered when applicable. Dark mode verified. No `any` types. UI UX Pro Max recommendations applied.
  </done>
</task>

<task type="auto">
  <name>Task 4: Test suite — 8 test files covering algorithm, concurrency, lifecycle, PDF, anomaly, tenant isolation</name>
  <files>
    apps/web/src/app/api/driver-pay/__tests__/settlements-algorithm.test.ts
    apps/web/src/app/api/driver-pay/__tests__/settlements-rerun.test.ts
    apps/web/src/app/api/driver-pay/__tests__/settlements-carryover.test.ts
    apps/web/src/app/api/driver-pay/__tests__/settlements-concurrent.test.ts
    apps/web/src/app/api/driver-pay/__tests__/settlements-finalize.test.ts
    apps/web/src/app/api/driver-pay/__tests__/settlements-paid.test.ts
    apps/web/src/app/api/driver-pay/__tests__/settlements-anomaly.test.ts
    apps/web/src/app/api/driver-pay/__tests__/settlements-tenant.test.ts
  </files>
  <action>
Build 8 vitest test files using the EXACT patterns from existing tests in `apps/web/src/app/api/driver-pay/__tests__/` (study `bonuses-deductions-api.test.ts` and `transitions-api.test.ts` first for: test setup, prisma mock vs real-db pattern, fixture helpers, expect patterns).

If existing tests use a real test DB (check for `setupTestDb` helper or `beforeAll` migrations), use the same. If they use prisma-mock or `vi.mock('@/lib/auth/supabase')`, use the same. **Match the existing approach exactly — do not introduce a new test infra pattern.**

Shared fixtures helper at top of each file (or extracted to `__fixtures__/settlements.ts` if multiple tests need it):

```ts
async function createApprovedAssignmentFixture(opts: {
  tenantId: string; driverId: string;
  loadId?: string;
  componentsToSeed: Array<{ category: LoadPayComponentCategory; isTaxable: boolean; grossAmount: string }>;
  approvedAt?: Date;
}): Promise<LoadDriverAssignment> { ... }

async function createBonusFixture(opts: {...}) { ... }
async function createDeductionFixture(opts: {...}) { ... }
async function createSettlementFixture(opts: {...}) { ... } // for setup of historical avg
```

---

**1. `settlements-algorithm.test.ts`** (most comprehensive)

Tests:
- **`generates settlement with single load — exact penny totals`**: 1 approved assignment with components: base $1000.00 taxable, fuel surcharge $150.00 taxable, per-diem $50.00 non-taxable. Expect: grossTaxable = 1150.00, grossNonTaxable = 50.00, totalDeductions = 0, netPay = 1200.00. Assert string equality on `toFixed(2)`.
- **`generates settlement with multiple loads`**: 3 approved assignments. Sum components. Assert exact totals + assignmentCount === 3.
- **`includes scheduled standalone bonus due in period`**: 1 bonus with `scheduledPayDate <= periodEnd`, `paidAt = null`. Expect: included in grossTaxable (or grossNonTaxable if non-taxable).
- **`excludes bonus scheduled after period end`**: bonus with scheduledPayDate > periodEnd → NOT included.
- **`excludes already-paid bonus`**: bonus with paidAt != null → NOT included.
- **`applies EVERY_SETTLEMENT deduction`**: deduction with amountPerPeriod=$100, no cap → totalDeductions += $100, netPay -= $100, deduction.amountCollected incremented.
- **`applies FIXED_INSTALLMENTS deduction within limit`**: totalAmount=$500, amountCollected=$300, amountPerPeriod=$100 → applies $100, amountCollected → $400.
- **`skips FIXED_INSTALLMENTS deduction when fully paid`**: amountCollected === totalAmount → not applied.
- **`skips paused deduction`**: paused=true → not applied.
- **`applies garnishment cap (maxPercentageOfNet)`**: gross $1000, deduction amountPerPeriod=$400 with maxPercentageOfNet=25 (so cap = $250). Expect: applied=$250, totalDeductions=$250, netPay=$750, amountCollected incremented by $250 only.
- **`raises SettlementOverlapError on overlapping FINALIZED settlement`**: pre-seed a FINALIZED settlement for same driver/period; attempting generation throws (or in batch mode returns conflict).
- **`writes audit log entry`**: assert audit row exists with actor + settlementId.

---

**2. `settlements-rerun.test.ts`**

- **`second generate run skips already-settled assignments`**: Run #1 generates a DRAFT including assignments A1, A2. Run #2 (same driver, same period, **same idempotencyKey** → ensure cache MISS by using new key, but same period) — should return 409 conflict because Run #1's DRAFT is in DB. Different test: Run #1 generates DRAFT; void it. Run #2 should re-include A1, A2.
- **`second run after first VOIDED includes the same assignments`**: confirms void releases settlementId FK.
- **`re-running with a new period that does NOT overlap creates a separate settlement`**: shows uniqueness is per period.

---

**3. `settlements-carryover.test.ts`**

- **`garnishment carryover — unpaid balance available next period`**: Period 1: gross $1000, deduction amountPerPeriod=$400 capped at 25% → applied $250, amountCollected += $250. Period 2: gross $1000 again, same deduction amountPerPeriod=$400 capped at 25% → applied $250 again. Confirm amountCollected grows correctly. (Note: spec says carry to next period, but with our simplification—not bumping amountCollected on the excess—the next period just re-requests amountPerPeriod which is $400. Capped to $250 again. Over 2 periods, $500 applied out of $800 requested. Document this is the v1 behavior.)
- **`FIXED_INSTALLMENTS deduction with cap completes when amountCollected reaches totalAmount`**: totalAmount=$500, period 1 applies $250 → period 2 applies $250 → period 3 NOT applied (fully collected).

---

**4. `settlements-concurrent.test.ts`**

- **`two concurrent generate calls — exactly one succeeds`**: use `Promise.all` to fire two `generateSettlementForDriver` calls for the same driver+period in parallel. Expect: one resolves successfully, the other throws (Prisma transaction conflict on Serializable isolation, OR SettlementOverlapError on the second pre-check). Verify only one DriverSettlement row created in DB.
  - This test may require a real test database (PostgreSQL with actual serializable isolation). If existing tests use sqlite/in-memory, mark this test `it.skipIf(!process.env.TEST_PG_URL)` and add a comment.

---

**5. `settlements-finalize.test.ts`**

- **`finalize sets status, finalizedBy, finalizedAt, pdfUrl`**: After finalize, assert all 4 fields populated.
- **`finalize generates a PDF that contains driver name + net pay + load count`**: mock R2 upload (or use a real test bucket); assert `generateSettlementPdf` was called and returned a Buffer with length > 1000.
- **`finalize on non-DRAFT returns 409`**: pre-seed FINALIZED settlement; second finalize → 409.
- **`finalize is idempotent in the sense that the same settlement cannot be finalized twice`** (status check guards this).

---

**6. `settlements-paid.test.ts`**

- **`mark-paid flips status to PAID and sets paidAt`**.
- **`mark-paid updates all child LoadDriverAssignment.payStatus to PAID`**: seed settlement with 3 assignments; assert all 3 transition.
- **`mark-paid updates DriverBonus.paidAt for linked bonuses`**.
- **`mark-paid on DRAFT (non-FINALIZED) returns 409`**.
- **`PAID settlement cannot be voided`**: void attempt → 409 "PAID settlements cannot be voided".
- **`void on DRAFT releases assignments back (settlementId = null)`**: pre-seed DRAFT with 2 assignments; void; assert assignments have settlementId = null and payStatus = APPROVED.
- **`void on FINALIZED releases assignments`**.

---

**7. `settlements-anomaly.test.ts`**

- **`returns null average when fewer than 2 prior settlements`**: only 1 historical PAID settlement → `computeFourWeekAverage` returns null → `isAnomaly = false`.
- **`detects >25% deviation as anomaly`**: 4 prior settlements averaging $1000; current $1300 → deviationPct = 30 → isAnomaly = true.
- **`detects negative >25% deviation as anomaly`**: 4 prior at $1000; current $700 → deviationPct = -30 → isAnomaly = true.
- **`under 25% deviation is not flagged`**: 4 prior at $1000; current $1200 → deviationPct = 20 → isAnomaly = false.
- **`anomaly reason string contains direction and percentages`**: assert "higher" appears when current > avg, "lower" when current < avg.

---

**8. `settlements-tenant.test.ts`**

- **`generateSettlementForDriver only includes assignments from the correct tenant`**: seed two tenants, each with an APPROVED assignment for "same" driverId (impossible in practice but the test isolates by tenantId). Generate for tenant A — only A's assignment is included.
- **`GET /api/driver-pay/settlements does not leak other tenants`** (if testing route handlers): mock session for tenant A; seed settlement under tenant B; assert it does NOT appear in tenant A's list.
- **`DRIVER role can only see own settlements`**: settle two drivers; sign in as driver 1; assert driver 2's settlement is not visible.

---

**General test rules:**
- Use `beforeEach` to reset fixtures (or rely on test DB rollback if existing tests do that).
- Use `Decimal` from decimal.js for money comparisons via `.toFixed(2)` string equality (never `.equals()` on floats).
- No flaky timing-dependent assertions; if concurrency test is brittle, mark `it.skipIf` and document.
- Match the existing tests' use of `vi.mock` vs real DB — DO NOT mix approaches.
  </action>
  <verify>
    `cd apps/web && pnpm vitest run src/app/api/driver-pay/__tests__/settlements-` runs all 8 test files.
    All tests pass (or skipped tests are explicitly marked with reasons).
    No tests reference real R2 / real network without mocks.
    Coverage report shows settlement-generator.ts > 80% line coverage.
  </verify>
  <done>
    All 8 test files exist and pass under vitest. Algorithm test asserts exact penny math on 11+ scenarios. Concurrent test validates one-and-only-one settlement under parallel generation. Tenant isolation verified across both generator + API routes. Anomaly detection covers 5 edge cases. PDF generation verified to produce non-empty buffer with expected content markers.
  </done>
</task>

</tasks>

<verification>

Run full suite + typecheck + smoke test:

```bash
cd apps/web
pnpm tsc --noEmit                                                    # zero TS errors
pnpm vitest run src/app/api/driver-pay/__tests__/settlements-        # all 8 test files pass
pnpm dev                                                              # boot, manual smoke
```

Manual smoke (in browser, signed in as OWNER):

1. Navigate to `/carrier/driver-pay/settlements` — list page renders.
2. Click "Generate Settlements" → modal opens with period prefilled to last Mon-Sun.
3. Select a driver that has at least one APPROVED assignment → Submit.
4. Result panel shows the new DRAFT settlement.
5. Click into the detail page → Net Pay hero displays the correct number.
6. Click "Finalize" → confirm → status flips to FINALIZED, "Mark Paid" button appears, PDF download link works (opens PDF in new tab with header, summary, per-load breakdown, footer).
7. Click "Mark Paid" → confirm → status flips to PAID, child assignments show payStatus=PAID in pending-queue page.
8. Attempt to void the PAID settlement → 409, user-facing error toast.
9. Generate again for the SAME driver/period → 409 conflict shown in result panel.
10. Toggle dark mode — all pages remain readable with no contrast failures.

Database verification (Supabase SQL editor or `pnpm prisma studio`):

- `DriverSettlement` table has new rows with status='PAID', pdfUrl populated, finalizedBy/finalizedAt/paidAt timestamps set.
- `LoadDriverAssignment` rows linked to the settlement have payStatus='PAID' and settlementId set.
- `DriverDeduction.amountCollected` incremented exactly by the applied amount.

</verification>

<success_criteria>

- [ ] `settlement-generator.ts` exists with `generateSettlementForDriver` + `generateSettlementsBatch` + `SettlementOverlapError`, wrapped in `prisma.$transaction(..., { isolationLevel: 'Serializable' })` with `$queryRaw ... FOR UPDATE`.
- [ ] `settlement-pdf.tsx` exports `generateSettlementPdf` returning `Buffer`, rendered via `@react-pdf/renderer`.
- [ ] `settlement-anomaly.ts` exports `computeFourWeekAverage` + `detectSettlementAnomaly` with 25% threshold.
- [ ] 7 API routes exist under `apps/web/src/app/api/driver-pay/settlements/` with correct role gates (OWNER for mutations, MANAGER+ for reads, DRIVER scoped to own).
- [ ] Generate route returns 409 on overlapping FINALIZED/PAID and supports idempotency cache (5-min TTL).
- [ ] Finalize generates PDF, uploads to R2, populates pdfUrl + finalizedBy + finalizedAt.
- [ ] Mark-paid flips all child assignments to PAID inside a transaction.
- [ ] Void releases assignments + bonuses (settlementId=null) and rejects PAID with 409.
- [ ] 3 UI pages + 3 components exist with shadcn/ui, dark mode, accessibility labels, confirm dialogs (Pattern E).
- [ ] Anomaly badge with tooltip appears on detail page when net pay deviates >25%.
- [ ] 8 test files exist and pass: algorithm, rerun, carryover, concurrent, finalize, paid, anomaly, tenant.
- [ ] `pnpm tsc --noEmit` zero errors.
- [ ] All money math uses `decimal.js` (no native float).
- [ ] No `user_metadata` reads; all auth claims via `app_metadata` through `getSession()` helper.
- [ ] No new dependencies installed (@react-pdf/renderer v4.3.2 already present).

</success_criteria>

<output>
After completion, create `.planning/quick/304-driver-pay-phase-8-settlement-generation/304-SUMMARY.md` documenting:
- What was built (services, routes, UI, tests)
- Spec section mappings (10.4 → settlement-generator.ts, 8.9 Flow E → generate modal, 5.6 → schema usage)
- Key decisions: idempotency cache (in-memory v1), carryover handling (don't bump amountCollected on capped portion), PDF storage (R2 keyed by tenant + settlement id)
- Test results: count of passing tests, any skipped + reason
- Manual smoke test outcomes
- Next steps: Phase 9 (driver portal pay statements view) per Driver Pay master plan
</output>
