# Quick Task 425 — SUMMARY

**Quick-424 Wave 1: Fix 2 Category B RLS Sites**  
**Date:** 2026-06-03  
**Status:** Complete (no commit per user instruction)

---

## Changes Made

### 1. `apps/web/src/app/api/auth/login/route.ts` (line 111)

Wrapped `prisma.user.findUnique` in a `$transaction` with `set_config('app.current_tenant_id', tenantId, TRUE)` — same pattern as the tenant lookup at lines 73–79. Under app_user (Phase 2), the User table has an RLS policy that requires `app.current_tenant_id` to be set; without the GUC the query returned null, blocking login.

### 2. `apps/web/src/app/api/track/[token]/route.ts` (lines 22 and 44)

- Added `TX_OPTIONS` to the import from `@/lib/db/prisma`.
- Wrapped `prisma.load.findUnique` in a `$transaction` with `set_config('app.bypass_rls', 'on', TRUE)`.
- Wrapped `prisma.gPSLocation.findFirst` in a `$transaction` with `set_config('app.bypass_rls', 'on', TRUE)`.

This is a public endpoint (no auth, no tenant context) — `bypass_rls` is the correct mechanism per spec §2.3 for cross-tenant token lookups. Using `current_tenant_id` here is not possible because there is no tenant in scope.

---

## Not committed (per user instruction)

User requested no commit/push/deploy for Wave 1 — changes are file-only pending login test confirmation.
