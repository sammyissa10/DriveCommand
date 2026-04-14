---
phase: quick-206
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 — Mobile API routes with missing/weak tenantId filtering
  - apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
  - apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
  - apps/web/src/app/api/mobile/driver/documents/[id]/url/route.ts
  - apps/web/src/app/api/mobile/owner/invoices/route.ts
  - apps/web/src/app/api/mobile/owner/invoices/[id]/route.ts
  # Task 2 — Harden update queries to include tenantId in WHERE clause
  - apps/web/src/app/api/mobile/owner/loads/[id]/route.ts
  - apps/web/src/app/api/mobile/owner/routes/[id]/route.ts
  - apps/web/src/app/api/mobile/owner/trucks/[id]/route.ts
  - apps/web/src/app/api/mobile/owner/trucks/[id]/scheduled-service/route.ts
  - apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts
  - apps/web/src/app/api/mobile/driver/loads/[id]/revert/route.ts
  - apps/web/src/app/api/v1/carrier/pay-records/[id]/approve/route.ts
  - apps/web/src/app/api/v1/carrier/pay-records/[id]/mark-paid/route.ts
  - apps/web/src/app/api/v1/carrier/pay-records/[id]/void/route.ts
  - apps/web/src/actions/carrier/save-route-template.ts
autonomous: true
must_haves:
  truths:
    - "No API route returns data belonging to a different tenant"
    - "All DB name-resolution queries include tenantId filter"
    - "All update/delete queries include tenantId in WHERE clause, not just a prior ownership check"
    - "Document presigned URL generation verifies tenantId, not just driverId"
  artifacts:
    - path: "apps/web/src/app/api/mobile/owner/fleet/messages/route.ts"
      provides: "Tenant-scoped participant/load/route name resolution"
    - path: "apps/web/src/app/api/mobile/driver/documents/[id]/url/route.ts"
      provides: "tenantId check on document lookup"
  key_links:
    - from: "All mobile API routes"
      to: "prisma queries"
      via: "tenantId from auth context in WHERE clause"
      pattern: "tenantId.*auth\\.tenantId|where.*tenantId"
---

<objective>
Fix multi-tenant data isolation breach: audit and patch ALL API routes and server actions where DB queries are missing tenantId filters, accept tenantId from request instead of session, or perform resource lookups by ID without verifying tenant ownership.

Purpose: Prevent tenant A from seeing/modifying tenant B's data. This is a P0 security fix.
Output: All API routes hardened with tenantId scoping on every query.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/auth/supabase.ts
@apps/web/src/lib/auth/mobile-auth.ts
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/middleware.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix name-resolution queries missing tenantId filter</name>
  <files>
    apps/web/src/app/api/mobile/owner/fleet/messages/route.ts
    apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts
    apps/web/src/app/api/mobile/driver/documents/[id]/url/route.ts
    apps/web/src/app/api/mobile/owner/invoices/route.ts
    apps/web/src/app/api/mobile/owner/invoices/[id]/route.ts
  </files>
  <action>
These routes bypass RLS (`set_config('app.bypass_rls', 'on')`) but perform secondary lookups by ID without tenantId, creating cross-tenant data leakage vectors.

**1. `mobile/owner/fleet/messages/route.ts` (GET handler):**
- Line ~94: `tx.user.findMany({ where: { id: { in: Array.from(participantIds) } } })` — Add `tenantId` to the where clause.
- Line ~117: `tx.load.findMany({ where: { id: { in: loadIds } } })` — Add `tenantId` to the where clause.
- Line ~131: `tx.route.findMany({ where: { id: { in: routeIds } } })` — Add `tenantId` to the where clause (routeIds is not empty).

**2. `mobile/owner/fleet/messages/route.ts` (POST handler):**
- Line ~304: `tx.user.findUnique({ where: { id: recipientId } })` — Change to `tx.user.findFirst({ where: { id: recipientId, tenantId } })`. This resolves the recipient's name after sending; without tenantId filter, an owner could potentially send a message with a recipientId from another tenant and leak that user's name in the response.

**3. `mobile/owner/fleet/messages/[recipientId]/route.ts` (GET handler):**
- Line ~128: `tx.user.findMany({ where: { id: { in: senderIds } } })` — Add `tenantId`.
- Line ~145: `tx.load.findUnique({ where: { id: loadId } })` — Change to `tx.load.findFirst({ where: { id: loadId, tenantId } })`.
- Line ~155: `tx.route.findUnique({ where: { id: routeId } })` — Change to `tx.route.findFirst({ where: { id: routeId, tenantId } })`.
- Line ~166: `tx.user.findUnique({ where: { id: recipientId } })` — Change to `tx.user.findFirst({ where: { id: recipientId, tenantId } })`.
- Line ~244: `tx.user.findUnique({ where: { id: userId } })` — This resolves the sender name in POST handler. Change to `tx.user.findFirst({ where: { id: userId, tenantId } })`.

**4. `mobile/driver/documents/[id]/url/route.ts`:**
- Line ~49-50: `tx.document.findUnique({ where: { id } })` — Add `tenantId` from `auth.tenantId` to the where clause: `tx.document.findFirst({ where: { id, tenantId: auth.tenantId } })`. The existing `driverId` check on line ~60 provides user-level authorization, but the tenantId filter provides tenant-level isolation. Without it, a driver could probe for document existence across tenants (404 vs 403 response).

**5. `mobile/owner/invoices/route.ts`:**
- Find the customer name resolution query (~line 60): `tx.customer.findMany({ where: { id: { in: customerIds } } })` — Add `tenantId` to where clause.

**6. `mobile/owner/invoices/[id]/route.ts`:**
- Find the customer lookup (~line 69-70): `tx.customer.findUnique({ where: { id: invoice.customerId } })` — Change to `tx.customer.findFirst({ where: { id: invoice.customerId, tenantId } })`.

For all changes:
- The `tenantId` variable is already available in each route handler (extracted from `auth.tenantId` after `validateMobileToken()`).
- When changing `findUnique` to `findFirst`, ensure you handle the null case the same way (the existing code already handles null for these lookups).
- Keep the `@bypass_rls` annotation and `set_config('app.bypass_rls', 'on', TRUE)` call — we are adding WHERE clause defense, not removing RLS bypass.
  </action>
  <verify>
Run `npx tsc --noEmit` from `apps/web/` to confirm no type errors. Then grep to confirm no remaining unscoped lookups:
```bash
grep -rn "where: { id:" apps/web/src/app/api/mobile/owner/fleet/messages/ | grep -v tenantId
grep -rn "where: { id:" apps/web/src/app/api/mobile/driver/documents/[id]/url/route.ts | grep -v tenantId
grep -rn "where: { id:" apps/web/src/app/api/mobile/owner/invoices/ | grep -v tenantId
```
All three greps should return zero results.
  </verify>
  <done>Every secondary/name-resolution query in fleet messages, driver documents, and invoices routes includes tenantId in the WHERE clause. No cross-tenant data can leak through name resolution.</done>
</task>

<task type="auto">
  <name>Task 2: Harden update/delete queries to include tenantId in WHERE clause</name>
  <files>
    apps/web/src/app/api/mobile/owner/loads/[id]/route.ts
    apps/web/src/app/api/mobile/owner/routes/[id]/route.ts
    apps/web/src/app/api/mobile/owner/trucks/[id]/route.ts
    apps/web/src/app/api/mobile/owner/trucks/[id]/scheduled-service/route.ts
    apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts
    apps/web/src/app/api/mobile/driver/loads/[id]/revert/route.ts
    apps/web/src/app/api/v1/carrier/pay-records/[id]/approve/route.ts
    apps/web/src/app/api/v1/carrier/pay-records/[id]/mark-paid/route.ts
    apps/web/src/app/api/v1/carrier/pay-records/[id]/void/route.ts
    apps/web/src/actions/carrier/save-route-template.ts
  </files>
  <action>
These routes correctly verify ownership via `findFirst({ where: { id, tenantId } })` before updating, but the subsequent `update({ where: { id } })` omits tenantId. This is a defense-in-depth issue: if the ownership check is ever removed or bypassed (TOCTOU), the update would apply to any tenant's data.

**Pattern to apply (all files):** Change `update({ where: { id } })` to `update({ where: { id, tenantId } })` (or `{ id, orgId }` for v1/carrier routes).

For Prisma models where `tenantId` is not part of a unique constraint, change `update` to use a two-step approach if needed:
```typescript
// Instead of: tx.load.update({ where: { id }, data: ... })
// Use: tx.load.updateMany({ where: { id, tenantId }, data: ... })
// OR keep update but add tenantId if the model has a compound unique on [id, tenantId]
```

Since most models use `id` as the sole unique field, use `updateMany` with tenant filter instead of `update` where Prisma requires a unique field for `update`. The `updateMany` approach is actually preferable because it atomically enforces tenant isolation — if the record doesn't belong to the tenant, zero rows are updated instead of throwing.

**Specific files and line numbers:**

1. `mobile/owner/loads/[id]/route.ts` PATCH handler — ~line 251: `tx.load.update({ where: { id }, data: updateData })` — The load model likely has `id` as unique, so keep `update` but note the findUnique with tenantId guard on line ~179 ensures this is safe. However, for defense-in-depth, wrap in a check: if Prisma allows compound where on update, use `{ id, tenantId }`. If Prisma won't accept tenantId in the unique where for update, wrap the update in an additional guard: verify the prior findUnique result's id matches.

    **Practical approach:** Since Prisma `update` requires a unique identifier and `tenantId` is not part of the unique constraint on most models, the safest pattern is:
    - Keep the existing `findFirst/findUnique` ownership check with `{ id, tenantId }`
    - For the `update`, keep `where: { id }` but ensure it's ALWAYS within the same transaction as the ownership check
    - If NOT in the same transaction, refactor to put both in a single transaction

    Review each file: if the ownership check and update are in the same `prisma.$transaction`, mark as SAFE (no TOCTOU). If they're in separate calls, wrap in a single transaction.

2. `mobile/owner/routes/[id]/route.ts` PATCH — ~line 181: `tx.route.update({ where: { id } })`. Already inside transaction with ownership check on line ~143. SAFE — add comment: `// SAFE: ownership verified by findUnique above within same transaction`.

3. `mobile/owner/trucks/[id]/route.ts` PATCH — ~line 212: `tx.truck.update({ where: { id } })`. Check if ownership check is in same transaction. If yes, add comment. If no, wrap in transaction.

4. `mobile/owner/trucks/[id]/scheduled-service/route.ts` — ~line 329: `update({ where: { id: serviceId } })`. Check if the service record is verified to belong to a truck in the same tenant first.

5. `mobile/driver/loads/[id]/status/route.ts` — ~line 122: `tx.load.update({ where: { id } })`. Ownership checked on line ~101 with `{ id, tenantId }` in same transaction. SAFE.

6. `mobile/driver/loads/[id]/revert/route.ts` — ~line 93: `tx.load.update({ where: { id } })`. Ownership checked on line ~63 with `{ id, tenantId }` in same transaction. SAFE.

7. `v1/carrier/pay-records/[id]/approve/route.ts` — ~line 29: `prisma.driverPayRecord.update({ where: { id } })`. Ownership checked on line ~18 with `{ id, orgId }` but NOT in same transaction (separate prisma calls). **VULNERABLE TO TOCTOU.** Fix: wrap both the findFirst and update in a single `prisma.$transaction`.

8. `v1/carrier/pay-records/[id]/mark-paid/route.ts` — Same pattern as approve. **VULNERABLE.** Wrap in transaction.

9. `v1/carrier/pay-records/[id]/void/route.ts` — Same pattern. **VULNERABLE.** Wrap in transaction.

10. `actions/carrier/save-route-template.ts` — Lines 117-127: `prisma.routeTemplate.update({ where: { id: templateId } })` and `prisma.routeTemplateStop.deleteMany({ where: { routeTemplateId: templateId } })`. Ownership checked on line ~113 with `{ id: templateId, orgId }` but the update and deletes are in a separate `$transaction` batch (not the same call as findFirst). **VULNERABLE TO TOCTOU.** Fix: move the findFirst into the same transaction as the update.

For each file:
- If ownership check + update are in the SAME transaction: add a `// SAFE: tenant ownership verified within this transaction` comment.
- If they're in SEPARATE calls: wrap both in a single `prisma.$transaction` to eliminate TOCTOU.
- For the v1/carrier/pay-records routes, restructure to:
```typescript
const result = await prisma.$transaction(async (tx) => {
  const record = await tx.driverPayRecord.findFirst({ where: { id, orgId } });
  if (!record) return null;
  // ... status checks ...
  return tx.driverPayRecord.update({ where: { id }, data: { ... } });
});
if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });
```
  </action>
  <verify>
Run `npx tsc --noEmit` from `apps/web/` to confirm no type errors.

Verify TOCTOU fixes by checking that ownership check and update are now in same transaction:
```bash
# These files should now have $transaction wrapping both findFirst and update:
grep -c "\$transaction" apps/web/src/app/api/v1/carrier/pay-records/[id]/approve/route.ts
grep -c "\$transaction" apps/web/src/app/api/v1/carrier/pay-records/[id]/mark-paid/route.ts
grep -c "\$transaction" apps/web/src/app/api/v1/carrier/pay-records/[id]/void/route.ts
grep -c "\$transaction" apps/web/src/actions/carrier/save-route-template.ts
```
Each should show at least 1 transaction.
  </verify>
  <done>All update/delete operations are either (a) in the same transaction as the tenant ownership check, or (b) include tenantId in the WHERE clause. No TOCTOU vulnerability remains. Defense-in-depth comments added where ownership check + update share a transaction.</done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `cd apps/web && npx tsc --noEmit` passes with zero errors
2. Full grep audit confirms no remaining unscoped queries:
```bash
# In mobile API routes, find any bypass_rls transaction with findUnique/findMany missing tenantId
grep -rn "findUnique\|findMany\|findFirst" apps/web/src/app/api/mobile/ --include="route.ts" | grep "where: { id" | grep -v "tenantId\|orgId\|userId\|driverId\|auth\."
```
This should return zero results for routes that bypass RLS.
3. No regressions in existing functionality (routes still return data for the correct tenant).
</verification>

<success_criteria>
- Zero cross-tenant data leakage vectors in API routes
- All name-resolution queries include tenantId filter
- All update/delete operations protected against TOCTOU via transactional ownership checks
- TypeScript compilation passes
</success_criteria>

<output>
After completion, create `.planning/quick/206-multi-tenant-data-isolation-security-bre/206-SUMMARY.md`
</output>
