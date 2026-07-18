---
phase: quick-423
plan: "01"
subsystem: auth/rls
tags: [rls, app_user, login, guc, phase2]
key-files:
  modified:
    - apps/web/src/app/api/auth/login/route.ts
decisions:
  - "Use transaction-scope GUC (TRUE) not session-scope (FALSE) to avoid pool leak per Quick-413 finding"
  - "Drop tenant_jwt_self_read policy — auth.jwt() returns NULL on raw Postgres/PgBouncer, making it dead code"
metrics:
  completed: "2026-06-02"
---

# Quick-423: Fix Login Route to Set Tenant Context Before Tenant Query

One-liner: Wrap `prisma.tenant.findUnique` in a `prisma.$transaction` that sets `app.current_tenant_id` GUC first so `tenant_self_read` RLS policy can match under app_user Phase 2.

## What Was Done

### Task 1 — Login route GUC fix

**Before (broken under app_user):**
```typescript
const tenant = await prisma.tenant.findUnique({
  where: { id: appMeta.tenantId as string },
  select: { isActive: true },
});
```

**After (fixed):**
```typescript
// Quick-423: set app.current_tenant_id GUC inside a tx before querying Tenant so
// the tenant_self_read RLS policy can match. Under app_user (Phase 2), the bare
// findUnique returns null because the GUC is unset — wrapping in a tx with TRUE
// (transaction-scope) avoids pool-leak while allowing the policy to read the row.
const tenant = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${appMeta.tenantId as string}, TRUE)`;
  return tx.tenant.findUnique({
    where: { id: appMeta.tenantId as string },
    select: { isActive: true },
  });
}, TX_OPTIONS);
```

Key details:
- Uses `$executeRaw` with tagged-template interpolation (NOT `$executeRawUnsafe`) — parameterized, SQL-injection safe.
- `TRUE` (transaction-scope) — GUC is automatically cleared when transaction ends, so it cannot bleed across pooled connections (per Quick-413 pool-leak finding).
- `TX_OPTIONS` already imported on line 6 — no new imports needed.
- Diff is localized: only the Tenant lookup block changed. No other lines in the file touched.
- `tsc --noEmit` grep on login/route.ts: zero errors.

### Task 2 — Drop dead tenant_jwt_self_read policy

**Policies before:**
```
bypass_rls_policy
tenant_jwt_self_read   ← dead code: auth.jwt() returns NULL on raw Postgres
tenant_self_read
```

**SQL executed:**
```sql
DROP POLICY IF EXISTS tenant_jwt_self_read ON public."Tenant";
```

**Policies after:**
```
bypass_rls_policy   ← untouched
tenant_self_read    ← untouched
```

`tenant_jwt_self_read` is gone. The two surviving policies are confirmed intact and unmodified. The rollback SQL file at `apps/web/scripts/audit/421-tenant-jwt-self-read-policy-ROLLBACK.sql` was not modified (kept as audit trail).

### Task 3 — Checkpoint (awaiting human verification)

Changes are local-only. No commit, no push, no deploy.

## Restart Instructions

1. Stop the dev server (Ctrl+C in the terminal running `npm run dev`)
2. `cd apps/web && npm run dev`
3. Open `http://localhost:3000/login`
4. Log in as owner@test.com / TestPass123! (or any seeded OWNER account from an active tenant)

**Expected outcomes:**
- Login returns 200 (not 403 "Account not found")
- Browser redirects to `/carrier/dashboard` (activated) or `/onboarding/welcome` (not activated)
- Server logs do NOT contain `"Login: tenantId in app_metadata not found in DB"`
- Navigate to `/owner/loads` or `/owner/drivers` — data renders correctly

**Negative tests:**
- Sysadmin login still redirects to `/admin-dashboard` (that path skips the Tenant lookup entirely)
- The `if (!tenant)` 403 branch is still present and unchanged in the route

## Deviations from Plan

None — plan executed exactly as written. The task description mentioned `false` for session-scope in one place but the plan body and constraint both specify `TRUE` (transaction-scope). Used `TRUE` per the canonical plan instructions and Quick-413 pool-leak finding.

## Self-Check

- [x] `apps/web/src/app/api/auth/login/route.ts` modified — contains `$transaction` with `set_config`
- [x] `421-tenant-jwt-self-read-policy-ROLLBACK.sql` unmodified (audit trail preserved)
- [x] `tenant_jwt_self_read` not present in pg_policies (verified via live query)
- [x] `tenant_self_read` present and untouched
- [x] `bypass_rls_policy` present and untouched
- [x] `tsc --noEmit` grep on login/route.ts: zero new errors
- [x] No commit made (local-only Phase 2 testing per constraints)
