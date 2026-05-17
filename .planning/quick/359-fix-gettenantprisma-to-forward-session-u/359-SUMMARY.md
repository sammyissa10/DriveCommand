---
phase: quick-359
plan: 01
subsystem: audit-columns / tenant-context
tags: [audit, prisma, session, tkt-0015]
dependency_graph:
  requires: [quick-358]
  provides: [getTenantPrisma forwards userId to withAuditColumns]
  affects: [all tenant-scoped writes via getTenantPrisma]
tech_stack:
  added: []
  patterns: [React cache() for getSession, session?.userId ?? null null-safe forwarding]
key_files:
  modified:
    - apps/web/src/lib/context/tenant-context.ts
    - apps/web/src/lib/db/tenant-client.ts
decisions:
  - Forward session?.userId ?? null from getTenantPrisma so audit columns populate automatically; system/cron contexts where session is null remain no-ops.
metrics:
  duration: ~5 minutes
  completed: 2026-05-17
---

# Phase quick-359 Plan 01: Fix getTenantPrisma to Forward Session userId Summary

Forward `session?.userId ?? null` from `getTenantPrisma()` into `createTenantClient()` so the `withAuditColumns` Prisma extension can auto-populate `createdById`/`updatedById` on every tenant-scoped write without callers needing to pass the user ID manually.

## What Changed

### apps/web/src/lib/context/tenant-context.ts

Added import:
```ts
import { getSession } from '@/lib/auth/supabase';
```

Updated `getTenantPrisma()` body from:
```ts
export async function getTenantPrisma(): Promise<PrismaClient> {
  const tenantId = await requireTenantId();
  return createTenantClient(tenantId);
}
```
to:
```ts
export async function getTenantPrisma(): Promise<PrismaClient> {
  const tenantId = await requireTenantId();
  const session = await getSession();
  return createTenantClient(tenantId, session?.userId ?? null);
}
```

Added two sentences to the JSDoc above `getTenantPrisma()` documenting the audit-column forwarding and null-passthrough for unauthenticated contexts.

`tenantRawQuery` was explicitly left untouched — raw queries bypass the audit extension by design.

### apps/web/src/lib/db/tenant-client.ts

Replaced stale comment line:
```
Prompt 3 will wire the actual session userId at the call site.
```
with:
```
Wired by `getTenantPrisma()` in lib/context/tenant-context.ts — it forwards `session?.userId ?? null`
from the React-cached getSession() so writes get audit columns automatically.
```

No other changes to function signature, body, `$extends` composition, or type casts.

## Other Call Sites of createTenantClient

Only one call site exists: `getTenantPrisma()` in `tenant-context.ts`. Updated. `tenantRawQuery` uses `prisma.$transaction` on the base client (not `createTenantClient`), so it was correctly left alone.

## Verification

- `npx tsc --noEmit` from `apps/web` exited 0 (no output = clean).
- `grep -n "getSession" src/lib/context/tenant-context.ts` shows both the import (line 3) and the call (line 40).
- `grep -n "session?.userId ?? null" src/lib/context/tenant-context.ts` matches line 41.
- `grep -n "Prompt 3 will wire" src/lib/db/tenant-client.ts` returns no matches.
- `git log -1 --oneline` confirms commit `8d44a421`.
- `git status` is clean.

## Commit

`8d44a421 fix(audit): forward session userId from getTenantPrisma to withAuditColumns [TKT-0015 Wave 1 fix]`

Pushed to `origin/master`.

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/lib/context/tenant-context.ts` — modified, verified contents.
- `apps/web/src/lib/db/tenant-client.ts` — modified, verified stale line removed.
- Commit `8d44a421` confirmed on master and pushed to origin.
- `tsc --noEmit` clean.

Ready for UI re-verification.
