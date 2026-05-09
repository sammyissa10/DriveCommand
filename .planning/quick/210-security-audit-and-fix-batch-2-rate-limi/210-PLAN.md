---
phase: quick-210
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/rate-limit.ts
  - apps/web/src/app/api/track/[token]/route.ts
  - apps/web/src/app/api/documents/request-upload-url/route.ts
  - apps/web/src/app/api/documents/upload/route.ts
  - apps/web/src/app/api/documents/complete-upload/route.ts
  - apps/web/src/app/api/documents/download-url/[id]/route.ts
  - apps/web/src/app/api/documents/delete/[id]/route.ts
  - apps/web/src/app/api/documents/multipart/initiate/route.ts
  - apps/web/src/app/api/documents/multipart/part-url/route.ts
  - apps/web/src/app/api/documents/multipart/complete/route.ts
  - apps/web/src/app/api/support/upload-attachment/route.ts
  - apps/web/src/app/api/mobile/owner/loads/route.ts
  - apps/web/src/app/api/mobile/owner/loads/[id]/route.ts
  - apps/web/src/app/api/mobile/owner/routes/[id]/route.ts
autonomous: true
must_haves:
  truths:
    - "Public tracking endpoint is rate-limited to prevent enumeration"
    - "Document upload/download endpoints are rate-limited to prevent abuse"
    - "Support attachment upload is rate-limited"
    - "No API route leaks internal error messages (Prisma errors, stack traces) to clients"
    - "NEXT_PUBLIC_ variables contain only truly public values"
  artifacts:
    - path: "apps/web/src/lib/rate-limit.ts"
      provides: "publicLimiter and uploadLimiter rate limiters"
    - path: "apps/web/src/app/api/track/[token]/route.ts"
      provides: "Rate-limited public tracking endpoint"
  key_links:
    - from: "apps/web/src/app/api/track/[token]/route.ts"
      to: "apps/web/src/lib/rate-limit.ts"
      via: "import publicLimiter + applyRateLimit"
      pattern: "applyRateLimit.*publicLimiter"
---

<objective>
Security audit and fix (batch 2): Add rate limiting to unprotected endpoints, fix error message leakage that exposes internal details to clients, and verify NEXT_PUBLIC_ variable safety.

Purpose: Harden the application against brute-force token enumeration on the public tracking endpoint, prevent upload abuse, and stop internal error details (Prisma errors, stack traces) from reaching API consumers.

Output: Patched route files with rate limiting and sanitized error responses.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/rate-limit.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add rate limiters and apply to unprotected endpoints</name>
  <files>
    apps/web/src/lib/rate-limit.ts
    apps/web/src/app/api/track/[token]/route.ts
    apps/web/src/app/api/documents/request-upload-url/route.ts
    apps/web/src/app/api/documents/upload/route.ts
    apps/web/src/app/api/documents/complete-upload/route.ts
    apps/web/src/app/api/documents/download-url/[id]/route.ts
    apps/web/src/app/api/documents/delete/[id]/route.ts
    apps/web/src/app/api/documents/multipart/initiate/route.ts
    apps/web/src/app/api/documents/multipart/part-url/route.ts
    apps/web/src/app/api/documents/multipart/complete/route.ts
    apps/web/src/app/api/support/upload-attachment/route.ts
  </files>
  <action>
**1. Add two new limiters to `apps/web/src/lib/rate-limit.ts`:**

```ts
/** Public endpoint limiter: 30 requests per minute per IP.
 *  Applied to unauthenticated public pages (e.g. /api/track/[token]).
 *  Prevents token enumeration attacks. */
export const publicLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, '1 m'),
      prefix: 'rl:public',
    })
  : null;

/** Upload limiter: 20 requests per minute per user.
 *  Applied to document upload URL generation and file upload routes.
 *  Prevents storage abuse. */
export const uploadLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, '1 m'),
      prefix: 'rl:upload',
    })
  : null;
```

**2. Add rate limiting to `/api/track/[token]/route.ts`:**
- Import `publicLimiter` and `applyRateLimit` from `@/lib/rate-limit`
- At the top of the GET handler, extract IP from `x-forwarded-for` header (same pattern as login route)
- Call `applyRateLimit(publicLimiter, ip)` and return if limited
- This is the HIGHEST PRIORITY fix: the public tracking endpoint has zero authentication and zero rate limiting, making it vulnerable to token enumeration

**3. Add rate limiting to ALL document routes (6 routes):**
These are authenticated but have no abuse protection. For each route, add at the beginning of the handler (after auth checks):
- Import `uploadLimiter` and `applyRateLimit`
- After `requireTenantId()`, call `applyRateLimit(uploadLimiter, userId)` using the authenticated user's ID
- For routes that use `getCurrentUser()` (upload, complete-upload), use `user.id`
- For routes that use `requireRole` only (request-upload-url, download-url, delete, multipart/*), extract userId from the session. Since these already call `requireTenantId()`, use a pattern like: `const { userId } = await getSessionOrThrow();` — or alternatively, just use tenantId as the rate limit key (simpler, still prevents abuse per tenant)
- Simplest approach: use `tenantId` as the rate limit identifier for all document routes (rate limits per tenant, not per user — acceptable since each tenant has few users)

**4. Add rate limiting to `/api/support/upload-attachment/route.ts`:**
- Import `uploadLimiter` and `applyRateLimit`
- After `requireTenantId()`, call `applyRateLimit(uploadLimiter, tenantId)`

**NOTE on v1/carrier routes:** These 40 routes lack rate limiting but they are ALL authenticated (session-based via `getSession()`). They are internal API routes, not public. Rate limiting is lower priority — flag in summary but do NOT add rate limiting to all 40 routes in this task. A future task can add middleware-level rate limiting for the entire v1 prefix.
  </action>
  <verify>
Run `npx tsc --noEmit` from `apps/web` to confirm no type errors.
Grep for `applyRateLimit` in all modified files to confirm rate limiting is applied:
`grep -r "applyRateLimit" apps/web/src/app/api/track apps/web/src/app/api/documents apps/web/src/app/api/support`
  </verify>
  <done>
- `publicLimiter` (30/min per IP) and `uploadLimiter` (20/min per user/tenant) exist in rate-limit.ts
- `/api/track/[token]` GET is rate-limited by IP
- All 6 document routes are rate-limited
- `/api/support/upload-attachment` is rate-limited
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix error message leakage in API routes</name>
  <files>
    apps/web/src/app/api/documents/download-url/[id]/route.ts
    apps/web/src/app/api/documents/delete/[id]/route.ts
    apps/web/src/app/api/documents/multipart/part-url/route.ts
    apps/web/src/app/api/documents/multipart/complete/route.ts
    apps/web/src/app/api/documents/multipart/initiate/route.ts
    apps/web/src/app/api/mobile/owner/loads/route.ts
    apps/web/src/app/api/mobile/owner/loads/[id]/route.ts
    apps/web/src/app/api/mobile/owner/routes/[id]/route.ts
  </files>
  <action>
**The following routes leak `error.message` to clients in their catch blocks. Fix each one.**

Pattern to fix: `{ error: error instanceof Error ? error.message : 'Fallback' }` in 500 responses.
Replace with: `{ error: 'Generic safe message' }` and add `logger.error(...)` if missing.

**Files and exact fixes:**

1. **`documents/download-url/[id]/route.ts`** line ~44-47:
   - BEFORE: `{ error: error instanceof Error ? error.message : 'Failed to generate download URL' }`
   - AFTER: Add `logger.error('[download-url] error:', error);` then `{ error: 'Failed to generate download URL' }`
   - Also add `import { logger } from '@/lib/logger';`

2. **`documents/delete/[id]/route.ts`** line ~42-45:
   - BEFORE: `{ error: error instanceof Error ? error.message : 'Failed to delete document' }`
   - AFTER: Add `logger.error('[delete] error:', error);` then `{ error: 'Failed to delete document' }`
   - Also add `import { logger } from '@/lib/logger';`

3. **`documents/multipart/part-url/route.ts`** line ~49-51:
   - BEFORE: `{ error: error instanceof Error ? error.message : 'Failed to generate part upload URL' }`
   - AFTER: `{ error: 'Failed to generate part upload URL' }`
   - (logger.error already present)

4. **`documents/multipart/complete/route.ts`** line ~126-128:
   - BEFORE: `{ error: error instanceof Error ? error.message : 'Failed to complete multipart upload' }`
   - AFTER: `{ error: 'Failed to complete multipart upload' }`
   - (logger.error already present)

5. **`documents/multipart/initiate/route.ts`** line ~103-105:
   - BEFORE: `{ error: error instanceof Error ? error.message : 'Failed to initiate multipart upload' }`
   - AFTER: `{ error: 'Failed to initiate multipart upload' }`
   - (logger.error already present)

6. **`mobile/owner/loads/route.ts`** line ~293:
   - BEFORE: `const message = err instanceof Error ? err.message : 'Internal server error'; return NextResponse.json({ error: message }, { status: 500 });`
   - AFTER: `return NextResponse.json({ error: 'Internal server error' }, { status: 500 });`
   - (logger.error already present)

7. **`mobile/owner/loads/[id]/route.ts`** line ~335:
   - BEFORE: `const message = err instanceof Error ? err.message : 'Internal server error'; return NextResponse.json({ error: message }, { status: 500 });`
   - AFTER: `return NextResponse.json({ error: 'Internal server error' }, { status: 500 });`
   - (logger.error already present)

8. **`mobile/owner/routes/[id]/route.ts`** line ~215:
   - BEFORE: `const message = err instanceof Error ? err.message : 'Internal server error'; return NextResponse.json({ error: message }, { status: 500 });`
   - AFTER: `return NextResponse.json({ error: 'Internal server error' }, { status: 500 });`
   - (logger.error already present)

**Routes that are ACCEPTABLE (do NOT change):**
- `v1/carrier/clients/route.ts` and `v1/carrier/clients/[id]/route.ts` — use `detail: process.env.NODE_ENV !== 'production' ? detail : undefined` — this is the correct pattern (dev-only detail, hidden in prod)
- `v1/carrier/contracts/route.ts` — uses `process.env.NODE_ENV === 'development'` guard — correct
- `v1/carrier/fleet/drivers/route.ts` — returns `err.message` only for the specific known error "User already linked to a carrier driver" — this is a controlled business error, acceptable
- `v1/carrier/loads/route.ts` — returns `err.message` only for the specific known error about client_id — controlled business error, acceptable
- `v1/carrier/route-templates/[id]/generate/route.ts` — checks for specific "not found" message, falls through to generic — correct
  </action>
  <verify>
Run `npx tsc --noEmit` from `apps/web`.
Search for remaining leakage: `grep -rn "err\.message\|error\.message" apps/web/src/app/api/ --include="*.ts" | grep -v "NODE_ENV\|=== 'development'\|!== 'production'\|parsed\.error\|result\.error\|'User already linked\|client_id is required\|not found or inactive\|DRIVER_NOT_FOUND\|TRUCK_NOT_FOUND\|NOT_FOUND"` — should return zero results in 500-status responses.
  </verify>
  <done>
- All 8 routes no longer leak internal error.message to clients in 500 responses
- Every catch block either returns a generic message OR uses dev-only conditional
- Logger captures the real error server-side in every case
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` — zero type errors
2. `grep -rn "applyRateLimit" apps/web/src/app/api/track apps/web/src/app/api/documents apps/web/src/app/api/support` — all target routes show rate limiting
3. `grep -rn "error instanceof Error ? error.message" apps/web/src/app/api/` — only appears in routes with NODE_ENV guards or controlled business error checks
</verification>

<success_criteria>
- Public tracking endpoint rate-limited (30 req/min per IP)
- Document routes rate-limited (20 req/min per tenant)
- Support upload route rate-limited (20 req/min per tenant)
- Zero routes leak raw error.message to clients in 500 responses (outside dev-only guards)
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/210-security-audit-and-fix-batch-2-rate-limi/210-SUMMARY.md`
</output>
