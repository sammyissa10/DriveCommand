---
phase: quick-424
plan: 01
subsystem: database/rls
tags: [audit, rls, bare-prisma, app_user, phase2-cutover]
dependency_graph:
  requires: [quick-423]
  provides: [categorized-bare-prisma-inventory]
  affects: [all-api-routes, server-actions, lib-carrier]
tech_stack:
  added: []
  patterns: [bare-prisma-audit, category-A-B-C-D-E-classification]
key_files:
  created:
    - apps/web/scripts/audit/424-bare-prisma-audit.md
  modified: []
decisions:
  - "Shadow variable pattern (const prisma = await getTenantPrisma()) correctly excluded from bare-prisma count — those calls are already RLS-scoped"
  - "Carrier ops tables use orgId (not tenantId) as FK column name — same UUID value, but fix must use set_config('app.current_tenant_id', orgId, TRUE)"
  - "Category E-1 (carrier/notifications.ts carrierDriver lookup without orgId filter) needs caller trace before fix — may need to add orgId filter or use bypass_rls"
  - "Category E-5 (tenant.findFirst inside carrier libs) is pre-context by nature — needs Quick-423 set_config(TRUE) pattern"
  - "login route line 111 (prisma.user.findUnique) is the key Phase 2 blocker — causes spurious 403 Account setup incomplete errors under app_user"
metrics:
  duration: ~90 minutes
  completed: 2026-06-02
  tasks: 1
  files: 1
---

# Quick-424: Comprehensive Bare-Prisma Audit Summary

**One-liner:** Read-only audit of all 217 files with bare `prisma` imports in `apps/web/src/`, producing a categorized A/B/C/D/E inventory of ~430 call sites to drive the Phase 2 RLS fix pass.

## What Was Done

Grepped `apps/web/src/` for every file importing the bare prisma singleton (`@/lib/db/prisma`), then read enough surrounding context per file to classify each call site as:

- **A** — tenant-scoped model, tenantId already in scope (needs `getTenantPrisma()` swap)
- **B** — tenant-scoped model, runs before tenant context is established (needs `$transaction + set_config(TRUE)`)
- **C** — platform-level table from spec 4.12 allowlist (no change)
- **D** — already has `bypass_rls` GUC or is legitimately cross-tenant (no change)
- **E** — uncertain, needs human review before any fix

## Findings Summary

| Category | Count | Action |
|----------|-------|--------|
| A — Tenant-scoped, tenantId in scope | ~220 | Replace with `getTenantPrisma()` or wrap in `$transaction + set_config` |
| B — Tenant-scoped, pre-context | 2 | Wrap in `$transaction + set_config('app.current_tenant_id', tenantId, TRUE)` |
| C — Platform table | ~30 | No change |
| D — Intentional bypass / cross-tenant | ~165 | No change |
| E — Uncertain | 5 | Human review required |

## Critical Findings (Phase 2 Blockers)

### Category B — 2 sites causing live Phase 2 bugs

1. **`apps/web/src/app/api/auth/login/route.ts` line 111** — `prisma.user.findUnique({ where: { id: authUserId } })` is bare and unwrapped. The tenant check at lines 73–79 is correctly wrapped in `$transaction + set_config`, but this subsequent user-active check is not. Under `app_user`, returns `null` → spurious "Account setup incomplete" 403 error on every login. This is the Phase 2 login blocker.

2. **`apps/web/src/app/api/track/[token]/route.ts` lines 22, 44** — Public shipment tracking endpoint. Neither `prisma.load.findUnique` nor `prisma.gPSLocation.findFirst` has any tenant context. Under `app_user`, both return zero rows → tracking page always shows "not found." Fix: wrap in `$transaction + bypass_rls` (no tenant context available on a public route by design).

### Category E — 5 uncertain sites requiring human review

1. `apps/web/src/lib/carrier/notifications.ts` line 56 — `prisma.carrierDriver.findFirst({ where: { id: driverId } })` — no `orgId` filter. Cross-tenant read or missing filter? Trace callers before fixing.

2. `apps/web/src/lib/notifications/dispatcher.ts` line 90 — `db.tenantNotificationSettings.findUnique` where `db` defaults to the bare `prisma` argument. Tenant-scoped but no GUC set.

3. `apps/web/src/app/(owner)/actions/my-notifications.ts` lines 44, 119 — `prisma.userNotificationPreference.*` — unclear if this model is on the spec 4.12 platform-table allowlist or needs RLS.

4. `apps/web/src/lib/driver-pay/snapshot.ts` line 21 — `prisma.driverCompensationTemplate.findFirst({ where: { driverId } })` — only `driverId` filter, no tenant scope.

5. `apps/web/src/lib/carrier/notifications.ts` lines 130, 242, 380+ — `prisma.tenant.findFirst({ where: { id: orgId } })` — queries the `Tenant` row from inside carrier lib functions where GUC may not be set. Needs Quick-423 `set_config(TRUE)` pattern.

## Scope of Category A Fix Work

The ~220 Category A sites span roughly 80–100 distinct files, primarily:
- `apps/web/src/lib/carrier/trips.ts` (~30+ calls, all with `orgId` param in scope)
- `apps/web/src/lib/carrier/loads.ts` (~16 calls)
- `apps/web/src/lib/carrier/in-app-notifications.ts`
- `apps/web/src/app/api/v1/carrier/dashboard/*` (5 routes)
- `apps/web/src/app/(owner)/actions/load-driver-assignments.ts`
- `apps/web/src/app/(driver)/actions/driver-hos.ts`, `driver-tasks.ts`
- `apps/web/src/app/api/driver/gps-ping/route.ts`
- `apps/web/src/app/api/driver/notifications/route.ts`
- Various other owner/carrier API routes

## Constraints Honored

- No `.ts` or `.tsx` source files were modified
- No `git add`, `git commit`, `git push` was run
- No deploy occurred
- Only file written: `apps/web/scripts/audit/424-bare-prisma-audit.md`

## Next Step

1. Human reviews Category E (5 findings above) and decides classification
2. Authorize a separate quick task for the fix phase — Category B (2 sites) is the urgent unblock; Category A (~220 sites) is the broad sweep
