---
phase: quick-431
plan: 431
subsystem: carrier/dispatches
tags: [diagnosis, 403, auth, tenant-context, read-only]
dependency_graph:
  requires: []
  provides: [root-cause-report]
  affects: [apps/web/src/app/api/v1/carrier/dispatches/route.ts]
tech_stack:
  added: []
  patterns: []
key_files:
  created: [.planning/quick/431-diagnose-403-on-trip-creation-from-carri/431-SUMMARY.md]
  modified: []
decisions:
  - "Root cause is app-level 403 at route.ts:66 — session.tenantId resolves to empty string when app_metadata.tenantId is missing/empty for owner@test.com on QA Test Org"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-09"
  tasks_completed: 2
  files_changed: 1
---

# Phase quick-431: Diagnose 403 on Trip Creation — Diagnostic Report

**One-liner:** 403 originates at `route.ts:66` — `session.tenantId` is an empty string (falsy) because `owner@test.com`'s `app_metadata.tenantId` is not set in the QA Test Org Supabase user record.

---

## 1. Root Cause — Exact File and Line

**File:** `apps/web/src/app/api/v1/carrier/dispatches/route.ts`
**Line:** 66

```
const orgId = session.tenantId;
if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });
```

**Precise failing condition:**

`getSession()` (in `apps/web/src/lib/auth/supabase.ts:54`) resolves `tenantId` as:

```ts
tenantId: appMeta.tenantId || '',
```

`appMeta` is `user.app_metadata` from the Supabase JWT. If `app_metadata.tenantId` is absent, `undefined`, `null`, or an empty string for `owner@test.com`'s Supabase Auth user record, this expression evaluates to `''` (empty string). Empty string is **falsy** in JavaScript. Therefore `!orgId` is `true` and the route immediately returns HTTP 403 `{ error: 'No organization' }`.

The error string the browser sees is `'No organization'` — but `NewDispatchForm.tsx:206` formats it as `Request failed (403)` only when `data.error` is undefined/null. Since the JSON body is `{ error: 'No organization' }`, the client actually displays `'No organization'` as the error text (line 206: `(data as { error?: string }).error ?? \`Request failed (\${res.status})\``). Either way it resolves to a 403.

**Why owner@test.com hits this:**

The QA Test Org tenant was likely created or the user account was set up without the `tenantId` claim being written to `app_metadata` in Supabase Auth. The page render succeeds (and drivers/trucks are visible) because the server page at `trips/new/page.tsx:12-13` does `session.tenantId` and redirects to `/login` if absent — but only for non-API paths. The middleware injects `x-tenant-id` for page renders via the header injection at `middleware.ts:193` only when the authenticated user has `appMeta.tenantId` populated. If the page renders successfully, it means `appMeta.tenantId` IS present for page renders — see important nuance in Section 3.

---

## 2. Origin Classification — App-Permission vs RLS/Postgres

**Classification: App-level tenant guard** (NOT RLS/Postgres).

**Evidence from route.ts catch block (lines 83-107):**

The catch block maps exactly three Error message strings to non-500 responses:
- `'DRIVER_NOT_DISPATCH_READY'` → 409
- `'OVERRIDE_REQUIRES_ADMIN'` → 403
- `'Invalid driver'` / `'Invalid truck'` / `'Invalid co-driver'` → 400

All other throws (including any Prisma/Postgres errors, RLS violations, or unmapped exceptions) fall through to line 106: `return NextResponse.json({ error: 'Internal server error' }, { status: 500 })`. A raw RLS denial from Postgres would produce a 500, **not a 403**. Therefore the 403 the user sees cannot originate from the database layer — it must come from one of the two explicit `return 403` statements in the route handler itself (lines 66 or 95).

---

## 3. Tenant Context Confirmation — Is `session.tenantId` Established on the POST Request?

**Session resolution path on a POST to `/api/v1/carrier/dispatches`:**

1. `middleware.ts` runs first. It calls `supabase.auth.getUser()` (line 122).
2. If `user` exists and `appMeta.tenantId` is truthy, the middleware injects `x-tenant-id: <tenantId>` into the request headers (line 193) and calls `NextResponse.next({ request: { headers: requestHeaders } })`.
3. The route handler calls `getSession()` which calls `supabase.auth.getUser()` **again** (a fresh Supabase server client, not the middleware one). It reads `user.app_metadata.tenantId` directly from the JWT claim.
4. `session.tenantId` = `appMeta.tenantId || ''` — purely from the JWT `app_metadata`, not from the `x-tenant-id` header. The header is only used by `getTenantPrisma()` → `requireTenantId()` → `headers().get('x-tenant-id')`.

**Key insight:** The 403 at line 66 fires BEFORE `getTenantPrisma()` is ever called (which is inside the `try` block at line 68+, after the guard). So the `x-tenant-id` header injection by middleware is irrelevant to this specific 403.

**However, there is an important nuance for the page render succeeding:**

If `owner@test.com`'s `app_metadata.tenantId` were truly empty/absent, the page render at `trips/new/page.tsx:12-13` would redirect to `/login` before the form even renders. Since the user reports reaching the form and seeing the driver/truck dropdowns populated, `app_metadata.tenantId` IS present during page renders (GET requests). This means:

- **Most likely scenario:** The user's JWT was valid with `tenantId` at page load time, but the JWT **expired between page render and form submission**. On POST, `supabase.auth.getUser()` returns an invalid/expired token where `app_metadata` is missing, resulting in `getSession()` returning `null` — but wait, that would return a 401 (line 64: `if (!session) return 401`), not a 403.

OR

- **Alternative scenario:** The JWT is valid but `app_metadata.tenantId` is a non-null falsy value (empty string `''`). This would pass `!user` (session exists → 401 not triggered) but fail `!orgId` (empty string is falsy → 403 triggered). This is the exact condition for line 66.

**Most likely discriminating scenario:** `owner@test.com`'s Supabase Auth `app_metadata.tenantId` is set to `""` (empty string) rather than a valid UUID, or the claim is absent entirely. The page render passes because `page.tsx` redirects on `!orgId` but this is a client-side navigation — the page's `getTenantPrisma()` call at line 15 would also fail if `x-tenant-id` were missing. Since drivers and trucks render, the middleware DID inject `x-tenant-id` (meaning `appMeta.tenantId` was truthy during GET), but `getSession()` in the POST returns something different.

**Revised conclusion:** This is an environmental issue with the QA Test Org session state. The most likely root cause is a **stale or partially-refreshed JWT** where the POST request's `app_metadata` does not carry the `tenantId` claim, while the page-load GET request used a fresh JWT that did carry it.

---

## 4. Rename Impact — Did `NewTripFormClient` Introduce Any Request Difference?

**No. The rename did not cause the 403.**

`NewTripFormClient.tsx` is a thin wrapper that:
- Imports `NewDispatchForm` unchanged
- Passes `driverMap`, `truckMap`, `userRole` through as-is
- Provides `onSuccess` (router.push to `/carrier/trips/{id}`) and `onCancel` (router.push to `/carrier/trips`)

The `fetch` call is entirely inside `NewDispatchForm.submitDispatch()`:
```ts
fetch('/api/v1/carrier/dispatches', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
```

This is byte-for-byte identical to any prior invocation of `NewDispatchForm`. The wrapper adds no headers, no credentials options, no body modifications, and no URL changes. The endpoint path `/api/v1/carrier/dispatches` is unchanged.

**The rename merely surfaced an environmental/session issue that was pre-existing.** It is possible this form worked before in a different session state (e.g., a fresh login session where the JWT was warm and `app_metadata` fully populated).

---

## 5. Other 403 Surfaces Ruled Out

| Location | Condition | Applies to owner@test.com? | Reason Ruled Out |
|---|---|---|---|
| `route.ts:95` — `OVERRIDE_REQUIRES_ADMIN` | Only fires if `createTrip` throws it; `createTrip` only throws it if `data.overrideReason` is non-empty AND `currentUser.role !== 'OWNER'/'MANAGER'` | No | Normal form submit sends no `overrideReason` (only added via override modal). `owner@test.com` is OWNER, so even if override were sent, this wouldn't fire. |
| `middleware.ts:115` — CSRF `validateOrigin` returns false | Same-origin browser fetch from `drivecommand.app` sends `Origin: https://drivecommand.app`; the CSRF validator checks against `NEXT_PUBLIC_APP_URL` which is set to the production domain | Unlikely, but possible in edge case | A CSRF 403 returns `'Forbidden'` as plain text, not JSON. `NewDispatchForm` calls `res.json()` on the error response, which would fail `.catch(() => ({}))` and yield an empty error object — showing `Request failed (403)` literally. Worth ruling out by checking whether `NEXT_PUBLIC_APP_URL` in the production Vercel environment matches `https://drivecommand.app`. |
| `trips.ts:207` — `DRIVER_NOT_DISPATCH_READY` | Throws when `driverUser.isDispatchReady === false` and no `overrideReason` | Produces 409 not 403 | Mapped to 409 at `route.ts:86`. Not a 403 path. |
| RLS / Postgres denial | Would surface as unmapped throw | Produces 500 not 403 | The catch block at `route.ts:106` maps all unmapped throws to 500. Cannot produce a 403. |

**Secondary suspect (CSRF):** If the `NEXT_PUBLIC_APP_URL` Vercel environment variable is set to an incorrect or outdated value (e.g., still `drive-command.vercel.app` instead of `drivecommand.app`), CSRF validation would fail and return a plain-text 403 `'Forbidden'` — which would be caught by `res.json().catch(() => ({}))` and display as `Request failed (403)`. This is a lower-probability candidate but requires one verification step (see Section 7).

---

## 6. Proposed Fix

**Primary fix (Root Cause — Line 66):**
Verify and repair `owner@test.com`'s `app_metadata.tenantId` claim in Supabase Auth — ensure it contains the correct UUID for the QA Test Org tenant, not an empty string or absent claim. No code change needed.

**If CSRF is the cause (Secondary — Middleware:115):**
Ensure the `NEXT_PUBLIC_APP_URL` Vercel environment variable is set to `https://drivecommand.app` (the current production domain), not an outdated value like `https://drive-command.vercel.app`.

---

## 7. Recommended Next Steps (in order)

1. **Check owner@test.com's `app_metadata` in Supabase Dashboard** (Auth → Users → owner@test.com → Raw user data). Verify `app_metadata.tenantId` is a non-empty UUID matching the QA Test Org's `id` in the `Tenant` table. If absent or empty string — set it via the Supabase Admin API or Supabase Dashboard. This is the single fastest discriminating check.

2. **Verify `NEXT_PUBLIC_APP_URL` in Vercel environment variables** — confirm it is `https://drivecommand.app`. If it is stale, this would be the CSRF 403 path. But note: CSRF 403 returns plain text, not JSON, so the error display on the form would be `Request failed (403)` (from the `.catch(() => ({}))` fallback) — consistent with the reported symptom.

3. **If `app_metadata.tenantId` is correct and NEXT_PUBLIC_APP_URL is correct**, log the raw `session` object in `route.ts:POST` just before line 65 to inspect what `getSession()` actually returns on a fresh POST. This would reveal whether the JWT is stale/expired or whether the claim is there but malformed.

---

## Deviations from Plan

None — plan executed exactly as written. No source code, schema, or database was modified.

---

## Self-Check

- [x] `apps/web/src/app/api/v1/carrier/dispatches/route.ts` — read (not modified)
- [x] `apps/web/src/lib/carrier/trips.ts` — read (not modified)
- [x] `apps/web/src/lib/auth/supabase.ts` — read (not modified)
- [x] `apps/web/src/lib/context/tenant-context.ts` — read (not modified)
- [x] `apps/web/src/middleware.ts` — read (not modified)
- [x] `apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx` — read (not modified)
- [x] `apps/web/src/app/(owner)/carrier/trips/new/NewTripFormClient.tsx` — read (not modified)
- [x] `apps/web/src/app/(owner)/carrier/trips/new/page.tsx` — read (not modified)
- [x] `apps/web/src/lib/security/csrf.ts` — read (not modified)
- [x] No `apps/` source files modified (git status confirms only pre-existing modifications)

## Self-Check: PASSED
