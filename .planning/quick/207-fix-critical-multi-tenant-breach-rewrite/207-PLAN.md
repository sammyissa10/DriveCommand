---
phase: quick-207
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/db/extensions/tenant-rls.ts
autonomous: true

must_haves:
  truths:
    - "Tenant A cannot see, create, update, or delete records belonging to Tenant B"
    - "Models without tenantId field are unaffected and operate normally"
    - "All existing callers of getTenantPrisma() benefit automatically with zero code changes"
    - "set_config still runs as defense-in-depth alongside application-layer filtering"
  artifacts:
    - path: "apps/web/src/lib/db/extensions/tenant-rls.ts"
      provides: "Application-layer tenant isolation via query arg injection"
      contains: "tenantId"
  key_links:
    - from: "apps/web/src/lib/db/extensions/tenant-rls.ts"
      to: "apps/web/src/lib/db/tenant-client.ts"
      via: "withTenantRLS import"
      pattern: "withTenantRLS"
---

<objective>
Fix critical multi-tenant data breach by rewriting the `withTenantRLS` Prisma extension to inject `tenantId` directly into all query arguments at the application layer, replacing the broken PostgreSQL RLS approach (bypassed by Supabase's `postgres` role having `BYPASSRLS` privilege).

Purpose: The entire multi-tenant isolation is currently non-functional. Every tenant can see every other tenant's data. This is a P0 security fix.
Output: Rewritten `tenant-rls.ts` that enforces tenant isolation at the application layer.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/db/extensions/tenant-rls.ts
@apps/web/src/lib/db/tenant-client.ts
@apps/web/src/lib/context/tenant-context.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite withTenantRLS to inject tenantId into all query arguments</name>
  <files>apps/web/src/lib/db/extensions/tenant-rls.ts</files>
  <action>
Rewrite the `withTenantRLS` Prisma extension to enforce tenant isolation at the application layer by injecting `tenantId` into query args for every operation.

**Step 1: Define the exempt models set.**

These models do NOT have a `tenantId` field and MUST be skipped (no injection):
- `Tenant`
- `RouteDriver`
- `SysAdminInvoiceItem`
- `TicketMessage`
- `PushToken`
- `CarrierClient`
- `CarrierContract`
- `CarrierFacility`
- `CarrierDriver`
- `CarrierTruck`
- `RouteTemplate`
- `RouteTemplateStop`
- `CarrierDispatch`
- `CarrierLoad`
- `CarrierStop`
- `CarrierDocument`
- `CarrierExpense`
- `DriverPayRecord`
- `CarrierCatalogMeta`

Create a `const EXEMPT_MODELS = new Set([...])` with these model names (PascalCase, matching Prisma model names).

**Step 2: In the `$allOperations` handler, check if `model` is in `EXEMPT_MODELS`. If so, call `query(args)` directly (no injection, no transaction).**

**Step 3: For non-exempt models, inject tenantId based on operation type.**

Use a switch on `operation`:

- **`findMany`, `findFirst`, `findFirstOrThrow`, `count`, `aggregate`, `groupBy`:**
  ```ts
  args.where = args.where ? { AND: [{ tenantId }, args.where] } : { tenantId };
  ```

- **`findUnique`, `findUniqueOrThrow`:**
  These operations require unique field constraints in `where`, so we cannot add `tenantId` directly.
  Rewrite strategy: Change the operation to NOT use findUnique. Instead, manipulate args to work with the query.
  Actually, the safest approach: let the query run, then verify the result's tenantId matches. If mismatch, throw an error for `findUniqueOrThrow` or return null for `findUnique`.
  ```ts
  const result = await runWithSetConfig(query, args);
  if (result && (result as any).tenantId !== tenantId) {
    if (operation === 'findUniqueOrThrow') {
      throw new Error(`Tenant isolation violation: record belongs to another tenant`);
    }
    return null; // findUnique returns null when not found
  }
  return result;
  ```
  Return early after this block (skip the normal query execution at the end).

- **`create`:**
  ```ts
  args.data = { ...args.data, tenantId };
  ```

- **`createMany`:**
  ```ts
  if (Array.isArray(args.data)) {
    args.data = args.data.map((item: any) => ({ ...item, tenantId }));
  } else {
    args.data = { ...args.data, tenantId };
  }
  ```

- **`createManyAndReturn`:**
  Same as `createMany`.

- **`update`:**
  ```ts
  args.where = { ...args.where, tenantId };
  ```

- **`updateMany`:**
  ```ts
  args.where = args.where ? { AND: [{ tenantId }, args.where] } : { tenantId };
  ```

- **`upsert`:**
  ```ts
  args.where = { ...args.where, tenantId };
  args.create = { ...args.create, tenantId };
  ```

- **`delete`:**
  ```ts
  args.where = { ...args.where, tenantId };
  ```

- **`deleteMany`:**
  ```ts
  args.where = args.where ? { AND: [{ tenantId }, args.where] } : { tenantId };
  ```

**Step 4: Keep the `set_config` call as defense-in-depth.**

After injecting tenantId into args, still wrap the query execution in a sequential transaction with `set_config` (belt and suspenders). Extract this into a helper function `runWithSetConfig`:

```ts
async function runWithSetConfig(query: any, args: any) {
  const [, result] = await client.$transaction([
    client.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
    query(args),
  ]);
  return result;
}
```

For all operations except `findUnique`/`findUniqueOrThrow` (which handle their own return), call `return runWithSetConfig(query, args)` at the end of the switch/after injection.

**Step 5: Update the JSDoc comment** to explain the new approach: application-layer tenantId injection as primary isolation mechanism, with `set_config` as defense-in-depth.

**Important notes:**
- Do NOT change the function signature or export. `withTenantRLS(tenantId: string)` must remain the same.
- Do NOT modify any other files. All callers use `createTenantClient` / `getTenantPrisma` which call this extension.
- The `tenantRawQuery` helper in `tenant-context.ts` handles raw queries separately and is unaffected.
- Use `as any` type assertions where needed for the args manipulation — the Prisma extension types are complex and the cast in `tenant-client.ts` already handles the outer type.
  </action>
  <verify>
1. Run `npx tsc --noEmit` from `apps/web` to confirm no TypeScript errors.
2. Manually verify the logic by reading the file: every operation type must have tenantId injection.
3. Start the dev server (`npm run dev` from apps/web) and confirm it starts without errors.
4. If possible, test by logging in as a tenant and checking that only that tenant's data appears (e.g., checking driver list, truck list).
  </verify>
  <done>
- `withTenantRLS` injects `tenantId` into query args for all 14 Prisma operations (findMany, findFirst, findFirstOrThrow, findUnique, findUniqueOrThrow, count, aggregate, groupBy, create, createMany, createManyAndReturn, update, updateMany, upsert, delete, deleteMany)
- Models without `tenantId` field are exempt (19 models in EXEMPT_MODELS set)
- `set_config` still runs as defense-in-depth
- No other files modified
- TypeScript compiles cleanly
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes in `apps/web`
- Dev server starts without errors
- A tenant user sees only their own data (drivers, trucks, loads, routes, etc.)
- A different tenant user sees only their own data
- SysAdmin operations (which use base `prisma` client, not `getTenantPrisma`) continue to work cross-tenant
</verification>

<success_criteria>
Multi-tenant isolation is enforced at the application layer. No tenant can access another tenant's data through any Prisma model operation routed through `getTenantPrisma()` / `createTenantClient()`.
</success_criteria>

<output>
After completion, create `.planning/quick/207-fix-critical-multi-tenant-breach-rewrite/207-SUMMARY.md`
</output>
