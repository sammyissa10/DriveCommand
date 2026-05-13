---
phase: quick
plan: "304"
subsystem: driver-pay
tags: [settlement-generation, payroll, pdf, decimal.js, serializable-transactions, anomaly-detection, rbac]
dependency_graph:
  requires: [quick-301, quick-302, quick-303]
  provides: [settlement-generation-api, settlement-pdf, settlement-anomaly, settlement-ui]
  affects: [driver-pay]
tech_stack:
  added: []
  patterns:
    - Prisma $transaction with isolationLevel:Serializable + SELECT FOR UPDATE
    - decimal.js for all monetary arithmetic (no native floats)
    - "@react-pdf/renderer v4 for server-side PDF (Buffer/ReadableStream compat)"
    - In-memory idempotency cache (Map + TTL) on generate endpoint
    - Vitest mutex mock for simulating serializable transaction ordering
key_files:
  created:
    - apps/web/src/lib/driver-pay/settlement-generator.ts
    - apps/web/src/lib/driver-pay/settlement-pdf.tsx
    - apps/web/src/lib/driver-pay/settlement-anomaly.ts
    - apps/web/src/app/api/driver-pay/settlements/generate/route.ts
    - apps/web/src/app/api/driver-pay/settlements/route.ts
    - "apps/web/src/app/api/driver-pay/settlements/[settlementId]/route.ts"
    - "apps/web/src/app/api/driver-pay/settlements/[settlementId]/finalize/route.ts"
    - "apps/web/src/app/api/driver-pay/settlements/[settlementId]/mark-paid/route.ts"
    - "apps/web/src/app/api/driver-pay/settlements/[settlementId]/void/route.ts"
    - "apps/web/src/app/api/driver-pay/settlements/[settlementId]/pdf/route.ts"
    - apps/web/src/app/(owner)/carrier/driver-pay/settlements/page.tsx
    - "apps/web/src/app/(owner)/carrier/driver-pay/settlements/[settlementId]/page.tsx"
    - apps/web/src/app/(owner)/carrier/driver-pay/settlements/generate/page.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementListTable.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/SettlementDetailView.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/settlements/_components/GenerateSettlementsModal.tsx
    - apps/web/src/app/api/driver-pay/__tests__/settlements-algorithm.test.ts
    - apps/web/src/app/api/driver-pay/__tests__/settlements-anomaly.test.ts
    - apps/web/src/app/api/driver-pay/__tests__/settlements-carryover.test.ts
    - apps/web/src/app/api/driver-pay/__tests__/settlements-concurrent.test.ts
    - apps/web/src/app/api/driver-pay/__tests__/settlements-finalize.test.ts
    - apps/web/src/app/api/driver-pay/__tests__/settlements-paid.test.ts
    - apps/web/src/app/api/driver-pay/__tests__/settlements-rerun.test.ts
    - apps/web/src/app/api/driver-pay/__tests__/settlements-tenant.test.ts
  modified: []
decisions:
  - "Deduction snapshot stored in settlement.notes as JSON ({_deductionsApplied: [...]}) — no separate join table needed for v1"
  - "v1 carryover: garnishment cap does not bump amountCollected by uncollected portion — next period re-requests same amountPerPeriod and is re-capped"
  - "Use Collapsible (not Accordion) and Switch (not Checkbox) — only available shadcn/ui components in project"
  - "PDF served via on-the-fly generation for DRAFT status; R2 presigned URL for FINALIZED/PAID"
  - "Idempotency cache keyed by tenantId:idempotencyKey with 5-minute TTL"
  - "Vitest mutex pattern (txQueue promise chain) for simulating serializable transaction ordering in unit tests"
metrics:
  duration: ~90 minutes (across two sessions)
  completed: "2026-05-13"
  tasks_completed: 4
  files_created: 24
  tests: "52 passed, 1 skipped (real PG integration test)"
---

# Quick Task 304: Driver Pay Phase 8 - Settlement Generation Summary

**One-liner:** Serializable-transaction settlement generator with garnishment cap, 4-week anomaly detection, @react-pdf/renderer PDF upload to R2, and complete owner UI with 52 Vitest tests.

## What Was Built

### Task 1: Service Library Files

**settlement-generator.ts** — Core settlement generation algorithm:
- `generateSettlementForDriver()` wraps all DB work in `prisma.$transaction({ isolationLevel: 'Serializable', timeout: 30000 })`
- Pre-check overlap guard (SettlementOverlapError) before SELECT FOR UPDATE via `$queryRaw`
- Sums approved assignment pay components (decimal.js throughout, never native float)
- Applies bonuses (EVERY_SETTLEMENT and CURRENT_PERIOD schedules)
- Deduction engine: FIXED_INSTALLMENTS skips fully-paid, garnishment cap via maxPercentageOfNet
- Deductions snapshot stored in settlement.notes as JSON for void reversal and detail display
- `generateSettlementsBatch()` catches SettlementOverlapError per-driver into conflicts[] array
- `SettlementOverlapError` class exported for test assertions

**settlement-anomaly.ts** — 4-week rolling average anomaly detection:
- `computeFourWeekAverage()`: returns null if fewer than 2 prior FINALIZED/PAID settlements
- `detectSettlementAnomaly()`: pure function, >25% threshold (strict), handles zero-avg division guard

**settlement-pdf.tsx** — Server-side PDF generation via @react-pdf/renderer v4:
- 6-section layout: header, driver block, summary table, per-load breakdown, bonuses, deductions, footer with signature line
- Buffer/ReadableStream compatibility shim for v4's environment-dependent return type

### Task 2: REST API Routes (7 routes)

| Route | Method | Auth | Description |
|---|---|---|---|
| `/settlements/generate` | POST | OWNER | Batch generation with idempotency cache |
| `/settlements` | GET | MANAGER+/DRIVER | List with pagination, DRIVER auto-scoped |
| `/settlements/[id]` | GET | MANAGER+/DRIVER | Full detail + anomaly result |
| `/settlements/[id]/finalize` | POST | OWNER | Generate PDF, upload to R2, transition DRAFT→FINALIZED |
| `/settlements/[id]/mark-paid` | POST | OWNER | Transition FINALIZED→PAID, stamp assignments |
| `/settlements/[id]/void` | POST | OWNER | Void DRAFT/FINALIZED, restore deduction amountCollected |
| `/settlements/[id]/pdf` | GET | MANAGER+/DRIVER | Presigned R2 URL or on-the-fly for DRAFT |

All routes: PAID settlements return 409 on any mutation attempt.

### Task 3: Owner UI Pages and Components

**Pages (server components):**
- `/carrier/driver-pay/settlements` — paginated list with status/period filters
- `/carrier/driver-pay/settlements/[settlementId]` — full detail with anomaly alert
- `/carrier/driver-pay/settlements/generate` — pre-fetches drivers with approved assignments

**Components (client):**
- `SettlementListTable` — table with StatusBadge, empty state, pagination controls
- `SettlementDetailView` — hero KPI card, collapsible per-load breakdown, confirm dialogs for finalize/mark-paid/void
- `GenerateSettlementsModal` — period picker, Switch-based driver selection, results panel with conflicts

### Task 4: Test Suite (52 tests, 8 files)

| File | Tests | Coverage |
|---|---|---|
| settlements-algorithm | 12 | Penny math, bonuses, garnishment cap, overlap guard |
| settlements-anomaly | 12 | Pure functions, boundary at 25%, zero avg guard |
| settlements-carryover | 2 | v1 cap behavior, FIXED_INSTALLMENTS completion |
| settlements-concurrent | 3+1skip | Sequential overlap, Promise.all with mutex mock, batch |
| settlements-finalize | 6 | Finalize route: auth, status validation, PDF+R2 flow |
| settlements-paid | 8 | Mark-paid and void lifecycle enforcement |
| settlements-rerun | 3 | Rerun after void, non-overlapping periods |
| settlements-tenant | 6 | Tenant scoping, DRIVER role isolation |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CarrierDriver has no employmentType field**
- Found during: Task 1
- Issue: schema has firstName/lastName/payModel but no employmentType
- Fix: Changed PDF input type to `Pick<CarrierDriver, 'firstName' | 'lastName'> & { employmentType?: string | null }`, made employmentLabel logic handle undefined
- Files modified: settlement-pdf.tsx

**2. [Rule 1 - Bug] Prisma NullableJsonNullValueInput type error**
- Found during: Task 1
- Issue: `previousValue: null` not assignable to `NullableJsonNullValueInput` in audit log
- Fix: Changed to `previousValue: Prisma.JsonNull`
- Files modified: settlement-generator.ts

**3. [Rule 1 - Bug] @react-pdf/renderer v4 toBuffer() returns ReadableStream in some environments**
- Found during: Task 1
- Issue: `pdf().toBuffer()` does not always return Buffer in v4
- Fix: Added Buffer.isBuffer check + ReadableStream chunk collection fallback
- Files modified: settlement-pdf.tsx

**4. [Rule 1 - Bug] Prisma DriverSettlementWhereInput type mismatch**
- Found during: Task 2
- Issue: Custom `WhereClause` type didn't satisfy Prisma's generated type
- Fix: Changed to `const where: PrismaTypes.DriverSettlementWhereInput = { tenantId: session.tenantId }`
- Files modified: settlements/route.ts

**5. [Rule 3 - Blocker] Missing shadcn/ui components (Checkbox, Accordion)**
- Found during: Task 3
- Issue: Plan spec referenced Checkbox and Accordion, but project only has Switch and Collapsible
- Fix: Replaced Checkbox with Switch, replaced Accordion with Collapsible
- Files modified: GenerateSettlementsModal.tsx, SettlementDetailView.tsx

**6. [Rule 1 - Bug] Buffer not assignable to BodyInit in NextResponse**
- Found during: Task 2
- Issue: `new NextResponse(buffer, {...})` fails TypeScript type check
- Fix: `new NextResponse(buffer as unknown as BodyInit, {...})`
- Files modified: settlements/[settlementId]/pdf/route.ts

**7. [Rule 1 - Bug] Test property path errors (result.X vs result.settlement.X)**
- Found during: Task 4
- Issue: GenerateResult wraps settlement: tests accessed `result.grossTaxable` but it's under `result.settlement.grossTaxable` as Decimal instances
- Fix: Updated all test assertions to use `result.settlement.grossTaxable.toFixed(2)` etc.
- Files modified: settlements-algorithm.test.ts, settlements-carryover.test.ts

**8. [Rule 1 - Bug] Concurrent test mock: both Promise.all calls succeed**
- Found during: Task 4
- Issue: JS is single-threaded — both `$transaction` invocations start before either resolves, so both see `settlementsCreated=0`
- Fix: Added txQueue promise chain (mutex) so transactions run serially in tests. Second transaction runs after first completes and sees `settlementsCreated=1`
- Files modified: settlements-concurrent.test.ts

## Commits

| Hash | Description |
|---|---|
| 7b910ae | feat(quick-304): add settlement generator service, PDF renderer, and anomaly helper |
| 11146f4 | feat(quick-304): add 7 settlement REST API routes |
| 748f95a | feat(quick-304): add settlement owner UI pages and components |
| 75accc7 | test(quick-304): add settlement generation test suite (52 tests, 8 files) |

## Self-Check: PASSED

All 16 created files verified on disk. All 4 task commits verified in git history. 52 tests pass, 1 skipped (real PG integration). TypeScript: zero errors in new files (1 pre-existing unrelated error in render-mdx.ts for remark-gfm types).
