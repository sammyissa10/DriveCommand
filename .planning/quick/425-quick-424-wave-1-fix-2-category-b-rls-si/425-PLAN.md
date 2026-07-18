# Quick Task 425 — Quick-424 Wave 1: Fix 2 Category B RLS Sites

**Date:** 2026-06-03  
**Goal:** Wrap 2 bare prisma calls with RLS-safe transaction patterns so they pass under app_user (Phase 2 cutover prep).

---

## Task 1 — login/route.ts: Wrap user.findUnique in tenant-context transaction

**File:** `apps/web/src/app/api/auth/login/route.ts`  
**Line:** 111  
**Problem:** `prisma.user.findUnique` is called without setting `app.current_tenant_id` GUC, so under app_user the RLS policy blocks it.  
**Fix:** Wrap in `$transaction` with `set_config('app.current_tenant_id', tenantId, TRUE)` — same pattern as lines 73–79.

## Task 2 — track/[token]/route.ts: Wrap both prisma calls in bypass_rls transaction

**File:** `apps/web/src/app/api/track/[token]/route.ts`  
**Lines:** 22 and 44  
**Problem:** Public endpoint has no tenant context — bare prisma calls fail under app_user RLS.  
**Fix:** Wrap each call in `$transaction` with `set_config('app.bypass_rls', 'on', TRUE)`. Import `TX_OPTIONS` alongside `prisma`.
