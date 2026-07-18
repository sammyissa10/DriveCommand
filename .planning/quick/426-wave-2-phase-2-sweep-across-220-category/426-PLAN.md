---
phase: quick-426
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Batch 1 — carrier lib heavy hitters
  - apps/web/src/lib/carrier/trips.ts
  - apps/web/src/lib/carrier/loads.ts
  # Batch 2 — carrier domain lib
  - apps/web/src/lib/carrier/stops.ts
  - apps/web/src/lib/carrier/stop-completion.ts
  - apps/web/src/lib/carrier/documents.ts
  - apps/web/src/lib/carrier/fleet-trucks.ts
  - apps/web/src/lib/carrier/fleet-drivers.ts
  - apps/web/src/lib/carrier/expenses.ts
  - apps/web/src/lib/carrier/clients.ts
  - apps/web/src/lib/carrier/contracts.ts
  - apps/web/src/lib/carrier/facilities.ts
  - apps/web/src/lib/carrier/compliance.ts
  - apps/web/src/lib/carrier/route-templates.ts
  - apps/web/src/lib/carrier/dispatch-generator.ts
  - apps/web/src/lib/carrier/document-types.ts
  - apps/web/src/lib/carrier/pay-calculator.ts
  - apps/web/src/lib/carrier/revenue-calculator.ts
  - apps/web/src/lib/carrier/reports.ts
  - apps/web/src/lib/carrier/notifications.ts
  - apps/web/src/lib/carrier/in-app-notifications.ts
  # Batch 3 — carrier dashboard + misc API routes
  - apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts
  - apps/web/src/app/api/v1/carrier/dashboard/alerts/route.ts
  - apps/web/src/app/api/v1/carrier/dashboard/activity/route.ts
  - apps/web/src/app/api/v1/carrier/dashboard/messages/route.ts
  - apps/web/src/app/api/v1/carrier/dashboard/drivers-status/route.ts
  - apps/web/src/app/api/v1/carrier/documents/[id]/signed-url/route.ts
  - apps/web/src/app/api/v1/carrier/dispatches/[id]/remove-load/route.ts
  - apps/web/src/app/api/v1/carrier/loads/[id]/cancel/route.ts
  - apps/web/src/app/api/v1/carrier/contracts/[id]/documents/route.ts
  - apps/web/src/app/api/v1/carrier/clients/[id]/documents/route.ts
  - apps/web/src/app/api/v1/carrier/contracts/route.ts
  - apps/web/src/app/api/v1/carrier/notifications/route.ts
  - apps/web/src/app/api/v1/carrier/notifications/mark-read/route.ts
  - apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/photo-view-url/route.ts
  - apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/photo-upload-url/route.ts
  - apps/web/src/app/api/v1/carrier/route-templates/active/route.ts
  - apps/web/src/app/api/v1/carrier/pay-records/route.ts
  - apps/web/src/app/api/v1/carrier/pay-records/[id]/approve/route.ts
  - apps/web/src/app/api/v1/carrier/pay-records/[id]/mark-paid/route.ts
  - apps/web/src/app/api/v1/carrier/pay-records/[id]/void/route.ts
  - apps/web/src/app/api/v1/carrier/stops/[id]/messages/route.ts
  - apps/web/src/app/api/v1/messages/thread/route.ts
  - apps/web/src/app/api/v1/messages/send/route.ts
  - apps/web/src/app/api/v1/messages/[id]/audio-url/route.ts
  - apps/web/src/app/api/v1/messages/broadcast/route.ts
  - apps/web/src/app/api/v1/messages/conversations/route.ts
  - apps/web/src/app/api/driver/stops/[stopId]/messages/route.ts
  - apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts
  - apps/web/src/app/api/driver/gps-ping/route.ts
  - apps/web/src/app/api/driver/notifications/route.ts
  - apps/web/src/app/api/driver/notifications/mark-read/route.ts
  # Batch 4 — driver-pay API routes + lib
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/route.ts
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/route.ts
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/download-url/route.ts
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/suggest-detention/route.ts
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/corrections/route.ts
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts
  - apps/web/src/app/api/driver-pay/settlements/route.ts
  - apps/web/src/app/api/driver-pay/settlements/[settlementId]/void/route.ts
  - apps/web/src/app/api/driver-pay/settlements/[settlementId]/pdf/route.ts
  - apps/web/src/app/api/driver-pay/settlements/[settlementId]/mark-paid/route.ts
  - apps/web/src/app/api/driver-pay/settlements/[settlementId]/finalize/route.ts
  - apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/route.ts
  - apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/[bonusId]/route.ts
  - apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/route.ts
  - apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route.ts
  - apps/web/src/app/api/driver-pay/pending-queue/route.ts
  - apps/web/src/app/api/driver-pay/reports/settlements/route.ts
  - apps/web/src/app/api/driver-pay/reports/drivers/[driverId]/route.ts
  - apps/web/src/app/api/reports/payroll-export/route.ts
  - apps/web/src/lib/driver-pay/auto-base-pay.ts
  - apps/web/src/lib/driver-pay/reporting.ts
  - apps/web/src/lib/driver-pay/settlement-anomaly.ts
  - apps/web/src/lib/driver-pay/reports/component-type-breakdown.ts
  - apps/web/src/lib/driver-pay/reports/accessorial-spend.ts
  - apps/web/src/lib/driver-pay/reports/deduction-balances.ts
  - apps/web/src/lib/driver-pay/reports/load-profitability.ts
  - apps/web/src/lib/driver-pay/reports/settlement-history.ts
  - apps/web/src/lib/driver-pay/reports/override-audit.ts
  - apps/web/src/lib/driver-pay/reports/overtime-exposure.ts
  # Batch 5 — workflow engine
  - apps/web/src/server/services/workflows/generatePlaybookInstance.ts
  - apps/web/src/server/services/workflows/completeStep.ts
  - apps/web/src/server/services/workflows/skipStep.ts
  - apps/web/src/server/services/workflows/failInspectionItem.ts
  - apps/web/src/server/services/workflows/playbookStepService.ts
  - apps/web/src/server/services/workflows/computeDispatchReadiness.ts
  - apps/web/src/server/services/workflows/fireEvent.ts
  - apps/web/src/server/services/workflows/notifications.ts
  - apps/web/src/server/api/routers/workflows/trigger.ts
  - apps/web/src/server/api/routers/workflows/playbook.ts
  - apps/web/src/server/api/routers/workflows/stepTemplate.ts
  - apps/web/src/server/api/routers/workflows/instance.ts
  - apps/web/src/server/api/routers/workflows/stepInstance.ts
  - apps/web/src/server/api/routers/workflows/analytics.ts
  # Batch 6 — actions + misc lib
  - apps/web/src/actions/carrier/soft-delete.ts
  - apps/web/src/actions/carrier/save-route-template.ts
  - apps/web/src/actions/support-tickets.ts
  - apps/web/src/actions/doc-feedback.ts
  - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
  - apps/web/src/app/(driver)/actions/driver-hos.ts
  - apps/web/src/app/(driver)/actions/driver-tasks.ts
  - apps/web/src/app/(owner)/checklists/instances/[id]/_components/actions.ts
  - apps/web/src/lib/notifications/in-app-writer.ts
  - apps/web/src/lib/notifications/idempotency.ts
  - apps/web/src/lib/notifications/notification-deduplication.ts
  - apps/web/src/lib/automations/actions/send-email.ts
  - apps/web/src/lib/email/send-fleet-message-notifications.ts
  - apps/web/src/lib/integrations/samsara.ts
  - apps/web/src/lib/integrations/motive.ts
  - apps/web/src/lib/geofencing/geofence-check.ts
autonomous: true

must_haves:
  truths:
    - "All ~220 Category A bare prisma calls on tenant-scoped tables use getTenantPrisma()"
    - "tsc --noEmit after each batch shows no regression beyond 35 pre-existing errors"
    - "No Category E sites were auto-fixed"
    - "No Category C, D sites were touched"
    - "All existing { where: { tenantId } } and { where: { orgId } } filters remain"
  artifacts:
    - path: "apps/web/src/lib/carrier/trips.ts"
      provides: "RLS-scoped dispatch lib"
      contains: "getTenantPrisma"
    - path: "apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts"
      provides: "RLS-scoped KPI endpoint"
      contains: "getTenantPrisma"
  key_links:
    - from: "each converted function"
      to: "app.current_tenant_id GUC"
      via: "getTenantPrisma() sets GUC via prisma.$executeRawUnsafe before returning client"
      pattern: "const tenantPrisma = await getTenantPrisma"
---

<objective>
Wave 2 — Phase 2 RLS sweep: convert all ~220 Category A bare `prisma` call sites on tenant-scoped tables to use `getTenantPrisma()`. Processed in 6 batches (carrier lib → carrier lib domain → carrier API routes → driver-pay routes + lib → workflow engine → actions + misc). After each batch: run `tsc --noEmit` and verify no regression past the 35-error baseline.

Purpose: Once Phase 2 DATABASE_URL is cut over to `app_user`, RLS policies gate every query. Bare `prisma` bypasses RLS via the superuser role. Every Category A call must route through `getTenantPrisma()` which sets the `app.current_tenant_id` GUC and returns an `app_user` client.

Output: ~80-100 files with tenant-scoped Prisma clients. No commits, no pushes, no deploys.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/quick/424-comprehensive-bare-prisma-audit-across-a/424-SUMMARY.md
@apps/web/src/lib/context/tenant-context.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Batch 1+2 — Convert all Category A bare prisma calls in carrier lib files</name>
  <files>
    apps/web/src/lib/carrier/trips.ts
    apps/web/src/lib/carrier/loads.ts
    apps/web/src/lib/carrier/stops.ts
    apps/web/src/lib/carrier/stop-completion.ts
    apps/web/src/lib/carrier/documents.ts
    apps/web/src/lib/carrier/fleet-trucks.ts
    apps/web/src/lib/carrier/fleet-drivers.ts
    apps/web/src/lib/carrier/expenses.ts
    apps/web/src/lib/carrier/clients.ts
    apps/web/src/lib/carrier/contracts.ts
    apps/web/src/lib/carrier/facilities.ts
    apps/web/src/lib/carrier/compliance.ts
    apps/web/src/lib/carrier/route-templates.ts
    apps/web/src/lib/carrier/dispatch-generator.ts
    apps/web/src/lib/carrier/document-types.ts
    apps/web/src/lib/carrier/pay-calculator.ts
    apps/web/src/lib/carrier/revenue-calculator.ts
    apps/web/src/lib/carrier/reports.ts
    apps/web/src/lib/carrier/notifications.ts
    apps/web/src/lib/carrier/in-app-notifications.ts
  </files>
  <action>
    ## Conversion rules

    **Import to add** (if not already present):
    ```ts
    import { getTenantPrisma } from '@/lib/context/tenant-context';
    ```

    **For each exported function** that has `orgId` (or `tenantId`) as a parameter AND contains bare `prisma.model.operation()` calls on tenant-scoped tables:

    1. Add ONE `const tenantPrisma = await getTenantPrisma();` as the first statement of the function body (after any guard/validation logic that doesn't touch the DB).
    2. Replace every `prisma.model.operation()` call in that function with `tenantPrisma.model.operation()` — **only for calls on tenant-scoped models** (carrier models, load, stop, driver, truck, etc.).
    3. **Do NOT replace** `prisma.$transaction(async (tx) => { ... })` calls — keep those as `prisma.$transaction`. The `tx` variable inside is used as a plain transaction client (it already runs inside a set_config context when applicable).
    4. **Do NOT replace** calls that access platform-level tables: `prisma.tenant.findFirst`, `prisma.user.findUnique`, `prisma.user.findMany`, `prisma.user.findFirst` — these remain bare.
    5. **Do NOT replace** references to `prisma` that are passed as a type reference (e.g., `typeof prisma.carrierDriver.create` in a return type annotation).
    6. Keep ALL `{ where: { orgId } }` and `{ where: { tenantId } }` filter clauses — they stay for defense in depth.

    ## Exceptions in this batch

    **notifications.ts line 56** (E-1): `prisma.carrierDriver.findFirst({ where: { id: driverId } })` — no `orgId` filter. **Skip this line.** Do NOT auto-fix. Add a `// TODO E-1: bare carrierDriver lookup without orgId — needs caller trace before fix` comment next to it.

    **notifications.ts lines 130, 242, 380+** (E-5): `prisma.tenant.findFirst(...)` calls — these are platform-level pre-context lookups. **Skip these lines.** They remain bare `prisma` (Category D-ish, needs Quick-423 set_config(TRUE) pattern, out of scope here).

    ## File-by-file notes

    - **trips.ts**: Already has `getTenantPrisma` imported and used in `createTrip`, `updateTrip`, `transitionTripStatus`, `addLoadToTrip`. Convert remaining functions: `listTrips`, `getTrip`, `reorderTripStops`, and any other functions still using bare `prisma`.
    - **loads.ts**: Already has `getTenantPrisma` imported. Convert remaining functions: `listLoads`, `getLoad`, and any other functions not yet using `tenantPrisma`.
    - **fleet-drivers.ts**: The return type `Awaited<ReturnType<typeof prisma.carrierDriver.create>>` is a type annotation — do NOT change this reference. Only change the runtime call sites.
    - **notifications.ts**: Skip E-1 (line 56) and E-5 (tenant.findFirst lines) per above. Convert all other Category A `prisma.carrierDriver`, `prisma.trip`, etc. calls that have `orgId` in scope.
    - **in-app-notifications.ts**: One bare call — convert it.

    ## After this batch

    Run from the repo root (not apps/web):
    ```
    cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | tail -5
    ```
    Count total error lines. Must be <= 35 (the pre-existing baseline). If count increased, check only the files touched in this batch for new errors and fix before proceeding.
  </action>
  <verify>
    ```
    cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep -c "error TS"
    ```
    Result must be <= 35.

    Also spot-check:
    ```
    grep -c "await getTenantPrisma" apps/web/src/lib/carrier/trips.ts
    grep -c " prisma\." apps/web/src/lib/carrier/trips.ts
    ```
    First count should be several (one per non-already-converted function). Second count should be reduced from the pre-task count of ~34 (only platform table refs and $transaction starters should remain).
  </verify>
  <done>
    All 20 carrier lib files converted. tsc error count <= 35. E-1 and E-5 lines skipped with TODO comments. No $transaction blocks broken.
  </done>
</task>

<task type="auto">
  <name>Task 2: Batch 3+4 — Convert carrier API routes, driver API routes, and driver-pay routes + lib</name>
  <files>
    apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts
    apps/web/src/app/api/v1/carrier/dashboard/alerts/route.ts
    apps/web/src/app/api/v1/carrier/dashboard/activity/route.ts
    apps/web/src/app/api/v1/carrier/dashboard/messages/route.ts
    apps/web/src/app/api/v1/carrier/dashboard/drivers-status/route.ts
    apps/web/src/app/api/v1/carrier/documents/[id]/signed-url/route.ts
    apps/web/src/app/api/v1/carrier/dispatches/[id]/remove-load/route.ts
    apps/web/src/app/api/v1/carrier/loads/[id]/cancel/route.ts
    apps/web/src/app/api/v1/carrier/contracts/[id]/documents/route.ts
    apps/web/src/app/api/v1/carrier/clients/[id]/documents/route.ts
    apps/web/src/app/api/v1/carrier/contracts/route.ts
    apps/web/src/app/api/v1/carrier/notifications/route.ts
    apps/web/src/app/api/v1/carrier/notifications/mark-read/route.ts
    apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/photo-view-url/route.ts
    apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/photo-upload-url/route.ts
    apps/web/src/app/api/v1/carrier/route-templates/active/route.ts
    apps/web/src/app/api/v1/carrier/pay-records/route.ts
    apps/web/src/app/api/v1/carrier/pay-records/[id]/approve/route.ts
    apps/web/src/app/api/v1/carrier/pay-records/[id]/mark-paid/route.ts
    apps/web/src/app/api/v1/carrier/pay-records/[id]/void/route.ts
    apps/web/src/app/api/v1/carrier/stops/[id]/messages/route.ts
    apps/web/src/app/api/v1/messages/thread/route.ts
    apps/web/src/app/api/v1/messages/send/route.ts
    apps/web/src/app/api/v1/messages/[id]/audio-url/route.ts
    apps/web/src/app/api/v1/messages/broadcast/route.ts
    apps/web/src/app/api/v1/messages/conversations/route.ts
    apps/web/src/app/api/driver/stops/[stopId]/messages/route.ts
    apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts
    apps/web/src/app/api/driver/gps-ping/route.ts
    apps/web/src/app/api/driver/notifications/route.ts
    apps/web/src/app/api/driver/notifications/mark-read/route.ts
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/route.ts
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/route.ts
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/download-url/route.ts
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/suggest-detention/route.ts
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/corrections/route.ts
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts
    apps/web/src/app/api/driver-pay/settlements/route.ts
    apps/web/src/app/api/driver-pay/settlements/[settlementId]/void/route.ts
    apps/web/src/app/api/driver-pay/settlements/[settlementId]/pdf/route.ts
    apps/web/src/app/api/driver-pay/settlements/[settlementId]/mark-paid/route.ts
    apps/web/src/app/api/driver-pay/settlements/[settlementId]/finalize/route.ts
    apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/route.ts
    apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/[bonusId]/route.ts
    apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/route.ts
    apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route.ts
    apps/web/src/app/api/driver-pay/pending-queue/route.ts
    apps/web/src/app/api/driver-pay/reports/settlements/route.ts
    apps/web/src/app/api/driver-pay/reports/drivers/[driverId]/route.ts
    apps/web/src/app/api/reports/payroll-export/route.ts
    apps/web/src/lib/driver-pay/auto-base-pay.ts
    apps/web/src/lib/driver-pay/reporting.ts
    apps/web/src/lib/driver-pay/settlement-anomaly.ts
    apps/web/src/lib/driver-pay/reports/component-type-breakdown.ts
    apps/web/src/lib/driver-pay/reports/accessorial-spend.ts
    apps/web/src/lib/driver-pay/reports/deduction-balances.ts
    apps/web/src/lib/driver-pay/reports/load-profitability.ts
    apps/web/src/lib/driver-pay/reports/settlement-history.ts
    apps/web/src/lib/driver-pay/reports/override-audit.ts
    apps/web/src/lib/driver-pay/reports/overtime-exposure.ts
  </files>
  <action>
    ## Conversion rules (same as Task 1)

    **Import** (add if not present):
    ```ts
    import { getTenantPrisma } from '@/lib/context/tenant-context';
    ```

    **For each route handler function or exported lib function** with bare `prisma.model.operation()` on tenant-scoped tables:

    1. Add `const tenantPrisma = await getTenantPrisma();` near the top of the function body (after session extraction and auth guards, before the first DB call).
    2. Replace `prisma.model.operation()` with `tenantPrisma.model.operation()` for all tenant-scoped model calls in that scope.
    3. Keep `prisma.$transaction(async (tx) => { ... })` blocks intact — do NOT convert the `prisma.$transaction` opener or the `tx.*` calls inside.
    4. Keep `prisma.user.*` and `prisma.tenant.*` calls bare (platform tables).
    5. Keep all `{ where: { tenantId } }`, `{ where: { orgId } }` filter clauses intact.

    ## API route pattern

    Most carrier and driver-pay routes already extract `orgId` from `session.tenantId` or verify `tenantId` from session. The `getTenantPrisma()` call reads the same tenant from the `x-tenant-id` middleware header — **this is consistent** because middleware sets the header from the same session. Call `getTenantPrisma()` once per route handler after the auth check.

    Example (kpi/route.ts, currently using bare prisma for 4 parallel queries):
    ```ts
    // Before the try block:
    const tenantPrisma = await getTenantPrisma();
    // Inside the try block, replace prisma.carrierLoad.count → tenantPrisma.carrierLoad.count etc.
    ```

    ## driver/gps-ping/route.ts special handling

    This route uses `prisma.$transaction(async (tx) => { ... })` internally for truck lookup and location creation. Both calls inside the transaction use `tx.*` (the transaction client). The outer `prisma.$transaction(...)` call should remain bare — the `tx` client inside it has a set_config call prepended (or should use the tenantPrisma as the transaction host). Check the file: if `gPSLocation.create` is a standalone `prisma.gPSLocation.create(...)` (not inside a `$transaction`), convert it. If it's inside `tx.gPSLocation.create(...)`, leave it.

    ## driver-pay lib functions

    Files like `auto-base-pay.ts`, `reporting.ts`, etc. have `tenantId: string` as a function parameter. Add `const tenantPrisma = await getTenantPrisma();` at the top of each function. These lib files are always called from within a Next.js API route request so headers() is available.

    ## After this batch

    ```
    cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep -c "error TS"
    ```
    Must remain <= 35.
  </action>
  <verify>
    ```
    cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep -c "error TS"
    ```
    Result <= 35.

    Spot-check conversion:
    ```
    grep "getTenantPrisma" apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts
    grep "getTenantPrisma" apps/web/src/app/api/driver-pay/settlements/route.ts
    grep " prisma\." apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts
    ```
    The kpi route should have getTenantPrisma, and the bare `prisma.` grep should be empty or show only `prisma.$transaction`.
  </verify>
  <done>
    All Batch 3+4 files converted. tsc count <= 35. No $transaction blocks broken. No platform table refs changed.
  </done>
</task>

<task type="auto">
  <name>Task 3: Batch 5+6 — Convert workflow engine (tRPC + services) and actions + misc lib</name>
  <files>
    apps/web/src/server/services/workflows/generatePlaybookInstance.ts
    apps/web/src/server/services/workflows/completeStep.ts
    apps/web/src/server/services/workflows/skipStep.ts
    apps/web/src/server/services/workflows/failInspectionItem.ts
    apps/web/src/server/services/workflows/playbookStepService.ts
    apps/web/src/server/services/workflows/computeDispatchReadiness.ts
    apps/web/src/server/services/workflows/fireEvent.ts
    apps/web/src/server/services/workflows/notifications.ts
    apps/web/src/server/api/routers/workflows/trigger.ts
    apps/web/src/server/api/routers/workflows/playbook.ts
    apps/web/src/server/api/routers/workflows/stepTemplate.ts
    apps/web/src/server/api/routers/workflows/instance.ts
    apps/web/src/server/api/routers/workflows/stepInstance.ts
    apps/web/src/server/api/routers/workflows/analytics.ts
    apps/web/src/actions/carrier/soft-delete.ts
    apps/web/src/actions/carrier/save-route-template.ts
    apps/web/src/actions/support-tickets.ts
    apps/web/src/actions/doc-feedback.ts
    apps/web/src/app/(owner)/actions/load-driver-assignments.ts
    apps/web/src/app/(driver)/actions/driver-hos.ts
    apps/web/src/app/(driver)/actions/driver-tasks.ts
    apps/web/src/app/(owner)/checklists/instances/[id]/_components/actions.ts
    apps/web/src/lib/notifications/in-app-writer.ts
    apps/web/src/lib/notifications/idempotency.ts
    apps/web/src/lib/notifications/notification-deduplication.ts
    apps/web/src/lib/automations/actions/send-email.ts
    apps/web/src/lib/email/send-fleet-message-notifications.ts
    apps/web/src/lib/integrations/samsara.ts
    apps/web/src/lib/integrations/motive.ts
    apps/web/src/lib/geofencing/geofence-check.ts
  </files>
  <action>
    ## Conversion rules (same as Tasks 1+2)

    **Import** (add if not present):
    ```ts
    import { getTenantPrisma } from '@/lib/context/tenant-context';
    ```

    **Pattern**: For each function with `tenantId` (or `orgId`) as a parameter and bare `prisma.model.operation()` on tenant-scoped tables: add `const tenantPrisma = await getTenantPrisma();` at the top of the function, then replace `prisma.model.operation()` with `tenantPrisma.model.operation()`.

    ## Workflow services (server/services/workflows/*)

    These services receive `tenantId` as a parameter and are called from tRPC procedures that run inside Next.js request context (middleware injects `x-tenant-id`). `getTenantPrisma()` will resolve correctly.

    - **generatePlaybookInstance.ts**: Has multiple `prisma.*` calls (playbook, playbookInstance, stepInstance, user, truck, customer, user.findMany). Convert all tenant-scoped model calls. Keep `prisma.user.findFirst`, `prisma.carrierTruck.findFirst`, `prisma.customer.findFirst`, `prisma.user.findMany` — these look up entities by ID within the tenant context and are Category A if they have `tenantId` in the where clause.
    - **$transaction blocks**: The `prisma.$transaction(async (tx) => { ... })` in generatePlaybookInstance creates instance + steps. Keep the `prisma.$transaction(...)` opener bare; the `tx.*` calls inside are fine as-is. After Task 1+2 has set the GUC via `getTenantPrisma()`, the transaction will inherit the session-level GUC.

    ## tRPC routers (server/api/routers/workflows/*)

    tRPC procedures run inside Next.js request context — middleware has already set `x-tenant-id` header. `getTenantPrisma()` reads from headers and is valid here.

    - Each router file currently imports bare `prisma` and uses `ctx.tenantId` for filtering.
    - Add `const tenantPrisma = await getTenantPrisma();` inside each procedure's handler body.
    - Replace `prisma.playbookTrigger.*`, `prisma.playbook.*`, `prisma.playbookInstance.*`, `prisma.stepInstance.*`, etc. with `tenantPrisma.*`.
    - Do NOT replace `prisma.$transaction(...)` openers.

    ## Actions

    Server actions (`'use server'`) run in Next.js RSC context — headers are available.

    - **load-driver-assignments.ts**: May use `defaultPrisma` alias — if so, add the import and replace `defaultPrisma.model.*` with `tenantPrisma.model.*` following the same rules.
    - **support-tickets.ts**: Contains multiple `prisma.$transaction(async (tx) => { tx.* })` blocks. The `tx.*` calls inside are fine. Also contains `prisma.$queryRaw` and `prisma.$queryRawUnsafe` for cross-tenant sysadmin lookups (Category D) — **do NOT convert those**. Only convert `prisma.model.*` calls that are scoped to a single tenant (have `tenantId` in the where).
    - **soft-delete.ts**: Uses bypass_rls approach — check the actual call sites. If it already uses `bypass_rls` via a $transaction, those are Category D. Only convert any bare tenant-scoped calls outside the bypass transaction.

    ## Misc lib

    - **in-app-writer.ts**: Has a `prisma.$transaction(async (tx) => { prisma.inAppNotification.create(...) })` block. Note: inside the transaction, the call uses the OUTER `prisma` object, not `tx`. This is a bug-pattern — convert the inner `prisma.inAppNotification.create` to use `tenantPrisma.inAppNotification.create` (passing tenantPrisma into the transaction or calling outside it). If the transaction is purely for atomicity (not for set_config), consider refactoring to `const result = await tenantPrisma.inAppNotification.create(...)` outside any transaction wrapper.
    - **geofence-check.ts**: All `prisma.$transaction(async (tx) => { tx.$executeRaw\`bypass_rls...\` })` blocks are Category D (intentional bypass). **Do NOT touch these.** Any standalone `prisma.gPSLocation.create`, `prisma.load.update`, etc. outside a bypass transaction should be converted.
    - **integrations/samsara.ts** and **motive.ts**: ELD integration files — convert any bare `prisma.truck.*`, `prisma.driver.*` etc. with `tenantId` in scope.
    - **send-fleet-message-notifications.ts**: Notification delivery — convert any bare `prisma.inAppNotification.*` or `prisma.pushToken.*` calls that have `tenantId` in scope.
    - **send-email.ts**: Automation action — convert `prisma.carrierLoad.*` or other tenant-scoped calls.
    - **notification-deduplication.ts**, **idempotency.ts**: If they query tenant-scoped notification tables with tenantId in scope, convert.

    ## E-4 surface (do NOT fix)

    **apps/web/src/lib/driver-pay/snapshot.ts**: `prisma.driverCompensationTemplate.findFirst({ where: { driverId, effectiveTo: null, deletedAt: null } })` — only `driverId` filter, no tenantId. This is E-4. **Do NOT touch this file.** Add a finding note at the end of this task's completion report.

    ## After this batch (final tsc check)

    ```
    cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep -c "error TS"
    ```
    Must remain <= 35. This is the final gate check for the entire 426 task.
  </action>
  <verify>
    Final tsc check:
    ```
    cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep -c "error TS"
    ```
    Result <= 35.

    Spot-check workflow conversion:
    ```
    grep "getTenantPrisma" apps/web/src/server/services/workflows/generatePlaybookInstance.ts
    grep "getTenantPrisma" apps/web/src/server/api/routers/workflows/trigger.ts
    grep " prisma\." apps/web/src/server/api/routers/workflows/trigger.ts
    ```
    trigger.ts should show no bare `prisma.model.*` calls (only `prisma.$transaction` if any).

    Confirm E-4 not touched:
    ```
    grep "getTenantPrisma" apps/web/src/lib/driver-pay/snapshot.ts
    ```
    Should return empty (file untouched).
  </verify>
  <done>
    All Batch 5+6 files converted. tsc count <= 35. snapshot.ts untouched. E-1, E-2, E-3, E-4, E-5 sites NOT auto-fixed. No commits, no pushes, no deploys executed.

    ## Findings to surface (Category E — do NOT auto-fix)

    1. **E-1** `apps/web/src/lib/carrier/notifications.ts` line 56 — `prisma.carrierDriver.findFirst({ where: { id: driverId } })` — no orgId filter. Comment added: `// TODO E-1`. Needs caller trace.
    2. **E-2** `apps/web/src/lib/notifications/dispatcher.ts` line 90 — `db.tenantNotificationSettings.findUnique` where `db` defaults to bare `prisma`. Not in this file list — flag for separate review.
    3. **E-3** `apps/web/src/app/(owner)/actions/my-notifications.ts` lines 44, 119 — `prisma.userNotificationPreference.*`. Not in this file list — flag for separate review.
    4. **E-4** `apps/web/src/lib/driver-pay/snapshot.ts` line 21 — `prisma.driverCompensationTemplate.findFirst({ where: { driverId } })` — no tenantId. Fix: add `tenantId: string` param to `snapshotActiveTemplate()`, pass from `createAssignment`, add to where clause.
    5. **E-5** `apps/web/src/lib/carrier/notifications.ts` lines 130, 242, 380+ — `prisma.tenant.findFirst(...)` inside carrier lib. Needs Quick-423 `set_config(TRUE)` pattern. Out of scope here.
  </done>
</task>

</tasks>

<verification>
After all 3 tasks complete:

1. tsc --noEmit baseline check: `cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | grep -c "error TS"` — must be <= 35
2. No Category E files auto-fixed: `grep -l "getTenantPrisma" apps/web/src/lib/driver-pay/snapshot.ts` — must return empty
3. All 5 E-sites have TODO comments where applicable (E-1 in notifications.ts)
4. Conversion coverage check: `grep -rL "getTenantPrisma" apps/web/src/lib/carrier/*.ts` should return only files that are legitimately Category C/D (no tenant-scoped models) — verify manually
</verification>

<success_criteria>
- ~220 Category A bare prisma call sites converted to tenantPrisma across ~95 files
- tsc --noEmit count <= 35 after each of the 3 batches
- No Category C, D, or E sites modified (except E-1 gets a TODO comment, snapshot.ts untouched)
- All { where: { tenantId } } and { where: { orgId } } filter clauses preserved
- No commits, pushes, or deploys executed
- 5 Category E findings surfaced in Task 3 completion report
</success_criteria>

<output>
No SUMMARY.md required — this is a Wave 2 sweep task. Findings are surfaced inline in Task 3's done block.
</output>
