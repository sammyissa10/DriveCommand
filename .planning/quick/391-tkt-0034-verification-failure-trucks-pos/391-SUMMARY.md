---
phase: quick
plan: 391
subsystem: audit-columns / carrier-api / middleware
tags: [diagnostic, tkt-0034, audit-columns, middleware, read-only]
dependency_graph:
  requires: [quick-390]
  provides: [tkt-0034-root-cause-analysis]
  affects: [carrier-api-routes, audit-columns-extension]
tech_stack:
  added: []
  patterns: []
key_files:
  created:
    - .planning/quick/391-tkt-0034-verification-failure-trucks-pos/391-SUMMARY.md
  modified: []
decisions:
  - "QT-390 fix approach (getTenantPrisma) is architecturally correct — the only blocker is that commits are not pushed to origin/master"
metrics:
  duration: ~10 minutes
  completed: 2026-05-19
---

# QT-391 — TKT-0034 Verification Failure Diagnostic

## Question

Why does truck POST still stamp "Unknown" / NULL audit columns after QT-390's fix?

---

## Findings

### 1. Git Push State

Commits NOT pushed to origin/master (3 commits ahead):

| Hash | Message |
|------|---------|
| `50a780e8` | docs(quick-390): TKT-0034 fix — swap bare prisma to getTenantPrisma on carrier write paths |
| `dba86cd8` | feat(quick-390): swap write ops to getTenantPrisma() in fleet-drivers, dispatches, loads |
| `3192ee63` | feat(quick-390): swap write ops to getTenantPrisma() in clients, contracts, facilities, fleet-trucks, stops |

`origin/master` HEAD: `24b2c0f8` — docs(quick-389): TKT-0034 diagnostic — Created by Unknown / Last updated by Unknown on truck details page

**Verdict: Vercel is NOT running the QT-390 fix.** Production is still at `24b2c0f8`. The 3 fix commits exist only locally.

---

### 2. middleware.ts — x-tenant-id Injection

**File:** `apps/web/src/middleware.ts`

**Matcher config (lines 208–218):**
```ts
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?|ttf|eot)$).*)',
  ],
};
```
This regex matches ALL paths except static assets. `/api/v1/carrier/*` is fully covered.

**Header injection logic (lines 192–198):**
```ts
// Inject tenant ID into request headers for downstream consumers
const requestHeaders = new Headers(request.headers);
requestHeaders.set('x-tenant-id', appMeta.tenantId);

const finalResponse = NextResponse.next({
  request: { headers: requestHeaders },
});
```

**Critical path analysis for `/api/v1/carrier/fleet/trucks` POST:**

1. Line 104: `isPublicPath('/api/v1/carrier/fleet/trucks')` → FALSE (not in PUBLIC_PATHS). Does NOT early-return.
2. Lines 110–118: CSRF validation runs for POST. `/api/v1/carrier/fleet/trucks` is NOT in the `isMobileRoute` or `isWebhookOrCron` skip list — so CSRF `validateOrigin()` fires. If Origin header is present and valid, continues. If blocked here, returns 403 (not NULL columns — different symptom entirely).
3. Lines 125–133: `!user` check — if session cookie valid, continues past.
4. Lines 142–151: `!appMeta.tenantId` check — if tenantId present, continues past.
5. Lines 192–198: **x-tenant-id IS injected** for authenticated users with a tenantId.

**Coverage of `/api/v1/carrier/*` routes: YES — unconditional for authenticated users with tenantId.**

There is one edge-case caveat: unauthenticated API requests hit line 128–130 (`return NextResponse.next()` without header injection). But the route handler already gates on `getSession()` at line 67–71 of `route.ts`, so unauthenticated requests never reach `createCarrierTruck()`.

---

### 3. requireTenantId() Behavior

**File:** `apps/web/src/lib/context/tenant-context.ts`

```ts
export async function requireTenantId(): Promise<string> {
  const tenantId = await getTenantId();
  if (!tenantId) {
    throw new Error('Tenant context is required but not found. Ensure middleware.ts is injecting x-tenant-id header.');
  }
  return tenantId;
}
```

**Behavior when header is missing: THROWS** — explicit `Error` with a descriptive message.

`getTenantPrisma()` (line 38–42) calls `requireTenantId()` first. If the header is missing, it throws before any Prisma client is created. This throw propagates up to `createCarrierTruck()` caller, then to the POST handler's `catch` block (line 119–131 of `route.ts`), which returns `{ error: 'Internal server error' }` with status 500.

**Impact on POST handler: 500 error (not silent NULL)** — but only if header is genuinely missing. Since middleware DOES inject it (Finding 2), the header will be present for all authenticated carrier API calls once the fix is deployed.

---

### 4. withAuditColumns Null-userId Behavior

**File:** `apps/web/src/lib/db/extensions/audit-columns.ts`

```ts
// No session user → never inject (caller supplies explicitly if needed).
if (userId == null) {
  return query(args);
}
```
(Lines 155–157)

**Behavior: SILENT SKIP** — when `userId` is `null`, the extension calls `query(args)` unchanged. No injection, no warning, no error. The `createdById`/`updatedById` columns remain as whatever value was provided (NULL if caller didn't supply them).

**getSession() sharing analysis:**

`getTenantPrisma()` (tenant-context.ts line 40–41):
```ts
const session = await getSession();
return createTenantClient(tenantId, session?.userId ?? null);
```

`getSession()` reads from the Supabase server-side cookie — the same session that authenticated the request. For a web browser POST to `/api/v1/carrier/fleet/trucks`, the session cookie IS present (middleware already validated it at line 122). So `getSession()` returns a valid session with `userId`.

**getSession() sharing: WORKS** — both the route handler (`getSession()` at line 68 of `route.ts`) and `getTenantPrisma()` (`getSession()` at line 40 of `tenant-context.ts`) read from the same Supabase cookie. No conflict, no double-call issue.

**This is why "Unknown" appears in the old code:** The pre-QT-390 `createCarrierTruck` used bare `prisma` (no audit extension), so `createdById` was never set → NULL in DB → UI displayed "Unknown". The QT-390 fix switches to `tenantPrisma` which has the audit extension — once pushed, `createdById` will be injected from `session.userId`.

---

### 5. Trucks POST Handler State (After QT-390)

**File:** `apps/web/src/lib/carrier/fleet-trucks.ts` (post QT-390 fix, locally)

```ts
export async function createCarrierTruck(orgId: string, data: CarrierTruckCreateInput) {
  const tenantPrisma = await getTenantPrisma();  // ← QT-390 added this
  // ...
  return tenantPrisma.carrierTruck.create({ data: { ... } });  // ← uses tenantPrisma
}
```

**Uses getTenantPrisma(): YES** (after QT-390 fix at commit `3192ee63`)

**Route handler state:** `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts` — the route handler itself was NOT modified by QT-390. It still calls `createCarrierTruck(orgId, parsed.data)` at line 92 and passes `orgId` from the session. The fix is entirely in the lib layer (`fleet-trucks.ts`), which now calls `getTenantPrisma()` internally.

**Error handling:** Unhandled exceptions from `createCarrierTruck()` are caught at lines 119–131 and return `{ error: 'Internal server error' }` with status 500. Errors ARE visible but only as a generic 500 — not descriptive to the user.

---

## Root Cause Hypothesis (Ranked)

### 1. [HIGH — CONFIRMED ROOT CAUSE] Commits not pushed → Vercel running old code

The QT-390 fix exists locally in 3 commits but has NOT been pushed to `origin/master`. Vercel deploys from GitHub, so production is still running `24b2c0f8` (pre-fix). Every truck POST on the live site goes through the old `createCarrierTruck` that uses bare `prisma` → no audit extension → `createdById` = NULL → UI shows "Unknown".

**This is why verification failed: the fix was never deployed.**

### 2. [LOW — NOT A FACTOR, CONFIRMED] middleware.ts does not cover carrier routes

This was a genuine concern going in but is definitively ruled out. The matcher regex covers all non-static paths. The injection block at lines 192–198 runs for every authenticated request with a tenantId. `/api/v1/carrier/*` is fully covered.

### 3. [LOW — NOT A FACTOR, CONFIRMED] withAuditColumns throws on null userId

The extension does a silent skip (returns `query(args)` unchanged) when `userId` is null. It never throws. A null userId results in no injection — columns stay NULL — but this is secondary to hypothesis 1 (old code never called the extension at all).

### 4. [LOW — NOT A FACTOR] getSession() conflict inside getTenantPrisma()

Both the route handler and `getTenantPrisma()` call `getSession()` independently, reading the same Supabase cookie. No state conflict. `getSession()` is idempotent/stateless per request.

---

## Recommendation

**Immediate action: Push the 3 commits to origin/master.**

```bash
git push origin master
```

This triggers a Vercel auto-deploy. Once deployed (~2 min), create a new truck via the web UI. The `createdById` and `updatedById` columns should be populated with the authenticated user's ID, and the truck details page should show the actual user name instead of "Unknown".

**No new code is needed.** The QT-390 fix is architecturally correct:
- middleware.ts injects `x-tenant-id` for all carrier routes (confirmed)
- `getTenantPrisma()` reads `x-tenant-id` and resolves `userId` via `getSession()` (confirmed working)
- `withAuditColumns` injects `createdById`/`updatedById` when `userId` is non-null (confirmed)
- The `create` call in `fleet-trucks.ts` now uses `tenantPrisma` (confirmed in commit `3192ee63`)

**After pushing and deploying, verify:**
1. Create a new truck
2. Open truck details — "Created by" should show the user's name
3. Update a truck field — "Last updated by" should update to the current user

---

## What We Did Not Change

- No source files were modified
- No git commits to source code
- This task only adds PLAN.md and SUMMARY.md docs artifacts

---

## Self-Check: PASSED

- SUMMARY.md exists at `.planning/quick/391-tkt-0034-verification-failure-trucks-pos/391-SUMMARY.md`
- All 5 finding sections present
- Ranked root cause hypotheses with reasoning
- Actionable recommendation (single command: `git push origin master`)

---

TKT-0034 verification failure diagnosed. Root cause: QT-390 fix commits (3192ee63, dba86cd8, 50a780e8) were never pushed to origin/master, so Vercel is still running the pre-fix code that uses bare prisma with no audit column extension. Fix scope: `git push origin master` only — zero code changes required.
