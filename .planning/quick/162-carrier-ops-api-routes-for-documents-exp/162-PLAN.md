---
phase: quick-162
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/documents.ts
  - apps/web/src/lib/carrier/expenses.ts
  - apps/web/src/lib/carrier/pay-calculator.ts
  - apps/web/src/app/api/v1/carrier/documents/route.ts
  - apps/web/src/app/api/v1/carrier/documents/[id]/route.ts
  - apps/web/src/app/api/v1/carrier/expenses/route.ts
  - apps/web/src/app/api/v1/carrier/expenses/[id]/route.ts
  - apps/web/src/app/api/v1/carrier/expenses/[id]/approve/route.ts
  - apps/web/src/app/api/v1/carrier/pay-records/route.ts
  - apps/web/src/app/api/v1/carrier/pay-records/[id]/approve/route.ts
  - apps/web/src/app/api/v1/carrier/pay-records/[id]/void/route.ts
  - apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts
  - vercel.json
autonomous: true
must_haves:
  truths:
    - "Documents can be uploaded via multipart form data with file type and size validation"
    - "Documents can be listed by parent_type + parent_id, and soft-deleted"
    - "Documents can be verified by a dispatcher"
    - "Expenses can be CRUD'd filtered by dispatch_id or load_id"
    - "Expenses can be approved, triggering reimbursement linkage"
    - "Pay records can be listed filtered by driver_id, pay_period, status"
    - "Pay records can be approved (pending only) or voided (not paid)"
    - "Pay calculator generates records for all 5 pay models including relay mile-split"
    - "Nightly cron auto-generates dispatches per org in isolation"
  artifacts:
    - path: "apps/web/src/lib/carrier/documents.ts"
      provides: "Document upload microflow with Supabase Storage"
      exports: ["uploadDocument", "listDocuments", "deleteDocument", "verifyDocument"]
    - path: "apps/web/src/lib/carrier/expenses.ts"
      provides: "Expense CRUD + approval"
      exports: ["listExpenses", "getExpense", "createExpense", "updateExpense", "deleteExpense", "approveExpense"]
    - path: "apps/web/src/lib/carrier/pay-calculator.ts"
      provides: "Pay Record Generation Microflow — 5 pay models + relay split"
      exports: ["generateDriverPayRecords"]
    - path: "apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts"
      provides: "Nightly cron for auto-dispatch generation"
  key_links:
    - from: "apps/web/src/lib/carrier/documents.ts"
      to: "Supabase Storage"
      via: "createAdminClient().storage.from('carrier-documents')"
      pattern: "storage\\.from.*upload"
    - from: "apps/web/src/lib/carrier/pay-calculator.ts"
      to: "prisma.driverPayRecord"
      via: "create pay records from dispatch data"
      pattern: "driverPayRecord\\.create"
    - from: "apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts"
      to: "dispatch-generator.ts"
      via: "generateDispatches call per template per org"
      pattern: "generateDispatches"
---

<objective>
Create the final batch of Carrier Ops API routes: document upload microflow (Supabase Storage), expenses CRUD + approval, pay record management with the 5-model pay calculator, and the nightly auto-dispatch cron job.

Purpose: Completes the carrier ops backend API surface. Documents, expenses, and pay records are the financial/compliance layer. The cron automates recurring dispatch creation.
Output: 3 lib modules + 9 API route files + 1 cron route + vercel.json update.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/dispatches.ts (pattern reference for lib module structure — imports, types, prisma queries, decStr helper)
@apps/web/src/app/api/v1/carrier/dispatches/route.ts (pattern reference for API route — getSession, orgId, try/catch, NextResponse.json)
@apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts (pattern reference for [id] route — params: Promise<{ id: string }>)
@apps/web/src/lib/carrier/stop-completion.ts (pattern reference for microflow — result union type { data } | { error, status })
@apps/web/src/lib/carrier/dispatch-generator.ts (generateDispatches function — used by cron)
@apps/web/src/lib/supabase/admin.ts (createAdminClient for Supabase Storage access)
@apps/web/src/app/api/cron/send-reminders/route.ts (cron auth pattern — CRON_SECRET bearer check, force-dynamic, tenant iteration)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create documents.ts, expenses.ts, and pay-calculator.ts lib modules</name>
  <files>
    apps/web/src/lib/carrier/documents.ts
    apps/web/src/lib/carrier/expenses.ts
    apps/web/src/lib/carrier/pay-calculator.ts
  </files>
  <action>
**documents.ts** — Document Upload Microflow. Follow stop-completion.ts pattern (result union type).

Import prisma, logger, `createAdminClient` from `@/lib/supabase/admin`. Use bucket name `carrier-documents`.

1. `uploadDocument(orgId, userId, data: { parentType, parentId, documentType, file: File })` — Validate file type: allowed extensions are pdf, jpg, jpeg, png, heic, webp. Validate file size <= 25MB (25 * 1024 * 1024 bytes). Return `{ error: 'Invalid file type...', status: 400 }` or `{ error: 'File too large...', status: 400 }` on failure. Generate UUID for filename via `crypto.randomUUID()`. Build storage path: `${orgId}/${data.parentType}/${data.parentId}/${data.documentType}/${uuid}.${ext}`. Upload to Supabase Storage: `createAdminClient().storage.from('carrier-documents').upload(storagePath, buffer, { contentType: file.type })`. If upload error, return 500. Create `prisma.carrierDocument.create` with: parentType, parentId, documentType, fileUrl = storagePath, filename = original filename, fileSizeBytes = file.size, uploadedBy = userId. If parentType === 'stop': set stopId = parentId. If documentType === 'bol' or 'pod' and parentType === 'stop': look up the stop to find its loadId, set clientId from load if available. Return `{ data: document }`.

2. `listDocuments(orgId, parentType: string, parentId: string)` — Query carrierDocument where parentType + parentId, ordered by createdAt DESC. NOTE: CarrierDocument has no orgId column. To scope by org, join through the parent. For parentType = 'stop': `where: { parentType, parentId, stop: { dispatch: { orgId } } }`. For parentType = 'load': `where: { parentType, parentId, stop: { is: null }, client: { orgId } }` OR use a raw query. Simplest approach: query by parentType + parentId, then verify the parent belongs to orgId (fetch parent and check). Return `{ data: documents }`.

3. `deleteDocument(orgId, docId: string)` — Find document, verify org ownership through parent chain. Remove from Supabase Storage: `createAdminClient().storage.from('carrier-documents').remove([doc.fileUrl])`. Prisma delete the record (hard delete — there is no deletedAt column on CarrierDocument in the actual schema). Return `{ data: { deleted: true } }`.

4. `verifyDocument(orgId, docId: string, userId: string)` — Find document, verify org ownership. Update: `verified = true, verifiedBy = userId, verifiedAt = new Date()`. Return `{ data: document }`.

**expenses.ts** — Follow dispatches.ts pattern (types section, functions section, decStr helper).

1. `listExpenses(orgId, filters: { dispatchId?, loadId?, stopId?, driverId?, page?, pageSize? })` — Where clause: `{ orgId }` plus optional filters. Include `{ driver: { select: { firstName: true, lastName: true } } }`. OrderBy createdAt DESC. Return `{ items, total }`.

2. `getExpense(orgId, id)` — findFirst where `{ id, orgId }`, include driver + dispatch + load. Return null if not found.

3. `createExpense(orgId, data: ExpenseCreateInput)` — ExpenseCreateInput: dispatchId?, loadId?, stopId?, driverId?, expenseType, amount, currency?, paidBy, notes?, receiptDocumentId?. Validate: at least one of dispatchId or loadId must be provided (return error if neither). If loadId provided, fetch load to get clientId. If paidBy === 'driver_cash', set reimbursable = true. Create with orgId. Return created expense.

4. `updateExpense(orgId, id, data: Partial<ExpenseCreateInput>)` — findFirst to verify orgId ownership. Update allowed fields. Return null if not found.

5. `deleteExpense(orgId, id)` — findFirst to verify orgId. Prisma delete (hard delete). Return null if not found.

6. `approveExpense(orgId, id, userId)` — findFirst to verify orgId. Set approvedBy = userId, approvedAt = new Date(). Return updated expense.

**pay-calculator.ts** — Pay Record Generation Microflow.

RELAY MILE-SPLIT APPROACH: For relay dispatches, miles are split at the relay_handoff_stop: the primary driver gets loaded/empty miles from the dispatch origin to the handoff stop, and the relay driver gets miles from the handoff stop to the final destination. Each driver's pay is calculated independently using their own pay model and rate configuration against their respective mile segments.

Import prisma, logger.

`generateDriverPayRecords(orgId: string, dispatchId: string)` — Main export. Steps:

Step 1: Load dispatch with includes: `{ primaryDriver: true, coDriver: true, carrierLoads: { include: { client: true } }, stops: { orderBy: { sequenceOrder: 'asc' } } }`. Verify dispatch.orgId === orgId.

Step 2: Determine if relay. `const isRelay = !!dispatch.relayHandoffStopId && !!dispatch.coDriverId`. If relay, find the handoff stop in dispatch.stops by matching id === relayHandoffStopId.

Step 3: Calculate mile segments. Total loaded miles = sum of miles from pickup-type stops to delivery-type stops (use dispatch.actualMiles if available, else dispatch.plannedMiles, converted from Decimal to number). For relay: split at handoff stop's sequenceOrder. Primary driver miles = proportional share up to handoff. Relay driver miles = remainder. For simplicity, use sequenceOrder ratios: `primaryMiles = Math.round(totalMiles * (handoffIndex / totalStops))`, `relayMiles = totalMiles - primaryMiles`. Empty miles: estimate as 10% of loaded miles (industry convention placeholder).

Step 4: For each driver (primary, and coDriver if relay), calculate pay based on their payModel from CarrierDriver:

- `per_mile`: basePay = (loadedMiles * driver.payRate) + (emptyMiles * (driver.payRate * 0.8)). Store loadedRate = driver.payRate, emptyRate = driver.payRate * 0.8.
- `percentage_gross`: For EACH load on the dispatch — create one DriverPayRecord per load. basePay = load.totalRevenue * driver.payRate (payRate stores the percentage as decimal, e.g., 0.25 for 25%). Store grossRevenue = load.totalRevenue, percentageApplied = driver.payRate. Use load's clientId.
- `hourly`: basePay = hoursWorked * driver.payRate. Calculate hoursWorked from dispatch actualDeparture to actualArrival (if both exist), else 0. Store hourlyRate = driver.payRate, hoursWorked.
- `flat_rate`: basePay = driver.payRate. Store flatAmount = driver.payRate.
- `team_split`: Same as per_mile but divide total miles by 2 (for co-driver scenarios).

Step 5: Fetch approved reimbursable expenses for this dispatch + driver: `prisma.carrierExpense.findMany({ where: { dispatchId, driverId: driver.id, reimbursable: true, approvedAt: { not: null } } })`. Sum amounts as reimbursements.

Step 6: Compute netPay = basePay + bonuses(0) + tips(0) - deductions(0) + reimbursements.

Step 7: Create DriverPayRecord with: orgId, driverId, dispatchId, loadId (if percentage_gross), clientId, payModel, loadedMiles, emptyMiles, loadedRate, emptyRate, hoursWorked, hourlyRate, grossRevenue, percentageApplied, flatAmount, basePay, reimbursements, netPay, status = 'pending'. Use Decimal constructor for all decimal fields.

Return `{ data: { recordsCreated: N } }`.
  </action>
  <verify>Run `cd apps/web && npx tsc --noEmit` — zero type errors in the 3 new lib files.</verify>
  <done>documents.ts exports uploadDocument, listDocuments, deleteDocument, verifyDocument with Supabase Storage integration. expenses.ts exports full CRUD + approveExpense with auto-reimbursable on driver_cash. pay-calculator.ts exports generateDriverPayRecords implementing all 5 pay models with relay mile-split at handoff stop.</done>
</task>

<task type="auto">
  <name>Task 2: Create all 9 API route files for documents, expenses, and pay-records</name>
  <files>
    apps/web/src/app/api/v1/carrier/documents/route.ts
    apps/web/src/app/api/v1/carrier/documents/[id]/route.ts
    apps/web/src/app/api/v1/carrier/expenses/route.ts
    apps/web/src/app/api/v1/carrier/expenses/[id]/route.ts
    apps/web/src/app/api/v1/carrier/expenses/[id]/approve/route.ts
    apps/web/src/app/api/v1/carrier/pay-records/route.ts
    apps/web/src/app/api/v1/carrier/pay-records/[id]/approve/route.ts
    apps/web/src/app/api/v1/carrier/pay-records/[id]/void/route.ts
  </files>
  <action>
Follow the exact pattern from dispatches/route.ts: import NextRequest/NextResponse, z, getSession, logger. Auth: `const session = await getSession(); if (!session) return 401; const orgId = session.tenantId; if (!orgId) return 403;`. All [id] routes use `{ params }: { params: Promise<{ id: string }> }` with `const { id } = await params;`.

**documents/route.ts** — POST + GET:
- POST: Use `req.formData()` to get the file. Extract fields: parent_type, parent_id, document_type from formData. Get file from formData.get('file'). Validate file exists. Call uploadDocument(orgId, session.userId, { parentType, parentId, documentType, file }). Return 201 on success, or error status.
- GET: Extract query params parent_type + parent_id (both required, return 400 if missing). Call listDocuments(orgId, parentType, parentId). Return `{ data: documents }`.

**documents/[id]/route.ts** — DELETE + PATCH:
- DELETE: Call deleteDocument(orgId, id). Return `{ data: { deleted: true } }` or 404.
- PATCH: This is the verify endpoint. Call verifyDocument(orgId, id, session.userId). Return `{ data: document }` or 404.

**expenses/route.ts** — GET + POST:
- GET: Extract query params dispatch_id, load_id, stop_id, driver_id, page, pageSize. Call listExpenses(orgId, filters). Return `{ data: { items, total, page, pageSize } }`.
- POST: Zod schema ExpenseCreateSchema: dispatchId (uuid optional), loadId (uuid optional), stopId (uuid optional), driverId (uuid optional), expenseType (string required), amount (number required, positive), currency (string optional default 'USD'), paidBy (string required), notes (string optional), receiptDocumentId (uuid optional). Refine: at least one of dispatchId or loadId required. Call createExpense. Return 201.

**expenses/[id]/route.ts** — GET + PATCH + DELETE:
- GET: Call getExpense(orgId, id). 404 if null. Return `{ data: expense }`.
- PATCH: Zod partial schema for update fields. Call updateExpense. 404 if null.
- DELETE: Call deleteExpense. 404 if null. Return `{ data: { deleted: true } }`.

**expenses/[id]/approve/route.ts** — PATCH only:
- Call approveExpense(orgId, id, session.userId). Handle error/data pattern.

**pay-records/route.ts** — GET only:
- Extract query params: driver_id, status, pay_period_start, pay_period_end, page, pageSize. Query prisma.driverPayRecord directly: `where: { orgId }` plus optional filters. Include `{ driver: { select: { firstName: true, lastName: true } }, dispatch: { select: { id: true, status: true, scheduledDeparture: true } } }`. OrderBy createdAt DESC. Paginate. Return `{ data: { items, total, page, pageSize } }`.

**pay-records/[id]/approve/route.ts** — PATCH only:
- findFirst where `{ id, orgId }`. If not found, 404. If status !== 'pending', return 422 `{ error: 'Only pending records can be approved' }`. Update: status = 'approved', approvedBy = session.userId, approvedAt = new Date(). Return `{ data: record }`.

**pay-records/[id]/void/route.ts** — PATCH only:
- findFirst where `{ id, orgId }`. If not found, 404. If status === 'paid', return 422 `{ error: 'Paid records cannot be voided' }`. Update: status = 'voided'. Return `{ data: record }`.
  </action>
  <verify>Run `cd apps/web && npx tsc --noEmit` — zero type errors. Verify directory structure: `ls -R apps/web/src/app/api/v1/carrier/documents/ apps/web/src/app/api/v1/carrier/expenses/ apps/web/src/app/api/v1/carrier/pay-records/`.</verify>
  <done>8 API route files created. Documents: POST upload (multipart), GET by parent, DELETE (storage + record), PATCH verify. Expenses: full CRUD + approve endpoint. Pay records: GET list with filters, PATCH approve (pending only), PATCH void (not paid). All routes follow established auth + error handling pattern.</done>
</task>

<task type="auto">
  <name>Task 3: Create nightly auto-dispatch cron + vercel.json update</name>
  <files>
    apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts
    vercel.json
  </files>
  <action>
**carrier-auto-dispatch/route.ts** — Follow send-reminders/route.ts cron pattern exactly.

Add `export const dynamic = 'force-dynamic';` at top.

Export `GET` handler (Vercel cron triggers GET, matching existing cron pattern in send-reminders):

1. Auth: Read `authorization` header, compare to `Bearer ${process.env.CRON_SECRET}`. Return 401 if mismatch.

2. Fetch all active tenants that have at least one active route template: `prisma.tenant.findMany({ where: { isActive: true, routeTemplates: { some: { active: true } } }, select: { id: true, name: true } })`. Add `@bypass_rls` comment same as send-reminders pattern (system operation, no user context).

3. Initialize summary: `{ orgs_processed: 0, total_dispatches_created: 0, total_errors: 0, details: [] }`.

4. For each tenant, wrap in try/catch:
   - Fetch active route templates for this tenant: `prisma.routeTemplate.findMany({ where: { orgId: tenant.id, active: true, autoGenerateDaysAhead: { gt: 0 } } })`.
   - For each template: compute generateThroughDate as today + template.autoGenerateDaysAhead days (format YYYY-MM-DD). Call `generateDispatches(tenant.id, template.id, generateThroughDate)`.
   - Accumulate dispatchesCreated from each result.
   - On catch: logger.error with tenant context, increment total_errors, continue to next tenant.
   - Push per-tenant detail to details array.

5. Return NextResponse.json with summary. Log total summary.

**vercel.json** — Create the file (it does not currently exist based on earlier check). Content:
```json
{
  "crons": [
    {
      "path": "/api/cron/carrier-auto-dispatch",
      "schedule": "0 0 * * *"
    }
  ]
}
```

IMPORTANT: Check if vercel.json already exists first. If it does, READ it and merge the new cron entry into the existing crons array. If it has other config (rewrites, headers, etc.), preserve all of it.

Also update stop-completion.ts: Replace the TODO comment `// TODO: call generateDriverPayRecords from pay-calculator.ts when built` with an actual import and call: `import { generateDriverPayRecords } from '@/lib/carrier/pay-calculator';` at the top, and in the dispatch completion cascade section, call `await generateDriverPayRecords(orgId, stop.dispatchId);` after setting dispatch status to completed.
  </action>
  <verify>Run `cd apps/web && npx tsc --noEmit` — zero type errors. Verify cron route exists: `cat apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts | head -5`. Verify vercel.json has the cron schedule. Verify stop-completion.ts now calls generateDriverPayRecords (grep for the import).</verify>
  <done>Nightly cron at 00:00 UTC iterates active tenants, generates dispatches for active route templates through auto_generate_days_ahead, processes each org in isolation. vercel.json updated with cron schedule. stop-completion.ts now calls pay calculator on dispatch completion.</done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` — zero type errors across all 13 new/modified files
2. Confirm all 12 new files exist at correct paths
3. Verify documents.ts uses Supabase Storage via createAdminClient (not R2)
4. Verify storage path pattern: `{orgId}/{parentType}/{parentId}/{docType}/{uuid}.ext`
5. Verify pay-calculator.ts handles all 5 models: per_mile, percentage_gross, hourly, flat_rate, team_split
6. Verify pay-calculator.ts implements relay mile-split at relayHandoffStopId
7. Verify pay-records approve rejects non-pending (422), void rejects paid (422)
8. Verify cron uses GET (matching Vercel cron pattern), checks CRON_SECRET, iterates tenants in try/catch isolation
9. Verify stop-completion.ts TODO is replaced with actual generateDriverPayRecords call
10. Verify vercel.json has `"schedule": "0 0 * * *"` for carrier-auto-dispatch
</verification>

<success_criteria>
- 12 new files + 1 modified file (stop-completion.ts), zero type errors
- Document upload validates file type (pdf/jpg/jpeg/png/heic/webp) and size (25MB max)
- Document upload stores to Supabase Storage at correct path pattern
- Expense create auto-sets reimbursable=true when paidBy=driver_cash
- Expense create propagates clientId from load
- Pay calculator generates records for per_mile, percentage_gross, hourly, flat_rate, team_split
- Percentage_gross creates one record per load on the dispatch
- Relay dispatches split miles at handoff stop between primary and co-driver
- Pay records with status=paid return 422 on any mutation
- Cron processes each org independently — one failure does not block others
- stop-completion.ts cascade now triggers pay record generation on dispatch completion
</success_criteria>

<output>
After completion, create `.planning/quick/162-carrier-ops-api-routes-for-documents-exp/162-SUMMARY.md`
</output>
