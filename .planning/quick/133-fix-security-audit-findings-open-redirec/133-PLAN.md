---
phase: quick-133
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/auth/callback/route.ts
  - apps/web/src/app/api/geocoding/autocomplete/route.ts
  - apps/web/src/app/api/auth/accept-invitation/route.ts
  - apps/web/src/app/api/documents/upload/route.ts
  - apps/web/src/app/api/documents/request-upload-url/route.ts
  - apps/web/src/app/api/support/upload-attachment/route.ts
  - apps/web/src/app/api/documents/complete-upload/route.ts
  - apps/web/src/app/api/integrations/motive/sync/route.ts
  - apps/web/src/app/api/integrations/samsara/sync/route.ts
  - apps/web/next.config.ts
  - apps/mobile/lib/storage.ts
  - apps/web/src/middleware.ts
  - apps/web/src/lib/rate-limit.ts
autonomous: true
must_haves:
  truths:
    - "Auth callback only redirects to relative paths, never external URLs"
    - "Geocoding endpoint requires authentication before processing"
    - "Geocoding and accept-invitation endpoints are rate limited"
    - "No error.message values leak to client-facing API responses"
    - "Security headers are present on all HTTP responses"
    - "MMKV session storage usage is documented with security context"
    - "Public API routes are documented in middleware"
  artifacts:
    - path: "apps/web/src/app/api/auth/callback/route.ts"
      provides: "Safe redirect validation"
      contains: "startsWith('/')"
    - path: "apps/web/src/app/api/geocoding/autocomplete/route.ts"
      provides: "Authenticated + rate-limited geocoding"
      contains: "getSession"
    - path: "apps/web/next.config.ts"
      provides: "Security headers"
      contains: "X-Frame-Options"
  key_links:
    - from: "apps/web/src/app/api/geocoding/autocomplete/route.ts"
      to: "@/lib/rate-limit"
      via: "applyRateLimit import"
      pattern: "applyRateLimit"
---

<objective>
Fix security audit findings across the web and mobile apps: open redirect prevention, authentication/rate-limiting gaps, error message sanitization, security headers, and documentation improvements.

Purpose: Harden the application against common attack vectors identified in security audit.
Output: Patched files with security fixes, passing TypeScript check.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/api/auth/callback/route.ts
@apps/web/src/app/api/geocoding/autocomplete/route.ts
@apps/web/src/app/api/auth/accept-invitation/route.ts
@apps/web/src/lib/rate-limit.ts
@apps/web/next.config.ts
@apps/mobile/lib/storage.ts
@apps/web/src/middleware.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix open redirect, add auth + rate limiting to unprotected endpoints</name>
  <files>
    apps/web/src/app/api/auth/callback/route.ts
    apps/web/src/app/api/geocoding/autocomplete/route.ts
    apps/web/src/app/api/auth/accept-invitation/route.ts
    apps/web/src/lib/rate-limit.ts
  </files>
  <action>
1. **Open redirect fix** in `apps/web/src/app/api/auth/callback/route.ts`:
   - Line 13: Change the `next` param handling to validate it is a relative path only:
     ```ts
     const next = searchParams.get('next');
     const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
     ```
   - Use `safeNext` in the redirect on line 19 instead of `next`. The `!next.startsWith('//')` check prevents protocol-relative URL bypass (e.g., `//evil.com`).

2. **Add authentication to geocoding endpoint** in `apps/web/src/app/api/geocoding/autocomplete/route.ts`:
   - Import `getSession` from `@/lib/auth/session` and `validateMobileToken` from `@/lib/auth/mobile-auth`.
   - At the top of the `POST` handler (before JSON parsing), add dual auth check following the pattern from `gps/report/route.ts`:
     ```ts
     const mobileAuth = await validateMobileToken(req);
     const session = mobileAuth ?? (await getSession());
     if (!session) {
       return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
     }
     ```

3. **Add rate limiting to geocoding endpoint** in the same file:
   - Import `applyRateLimit` from `@/lib/rate-limit` and import the new `geocodingLimiter` (see below).
   - After the auth check, add:
     ```ts
     const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
     const rateLimited = await applyRateLimit(geocodingLimiter, `geo:${session.userId ?? ip}`);
     if (rateLimited) return rateLimited;
     ```

4. **Add rate limiting to accept-invitation endpoint** in `apps/web/src/app/api/auth/accept-invitation/route.ts`:
   - Import `applyRateLimit` and `authLimiter` from `@/lib/rate-limit`.
   - At the top of the `POST` handler (before JSON parsing), add:
     ```ts
     const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
     const rateLimited = await applyRateLimit(authLimiter, `accept-inv:${ip}`);
     if (rateLimited) return rateLimited;
     ```
   - The GET handler does NOT need rate limiting (read-only, returns minimal data, UUID-gated).

5. **Add geocoding rate limiter** in `apps/web/src/lib/rate-limit.ts`:
   - Add a new exported limiter after `gpsLimiter`:
     ```ts
     export const geocodingLimiter = redis
       ? new Ratelimit({
           redis,
           limiter: Ratelimit.slidingWindow(30, '1 m'),
           prefix: 'rl:geo',
         })
       : null;
     ```
   - 30 requests/minute is generous for autocomplete but prevents abuse.
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` -- no type errors on modified files.
    Grep for `safeNext` in callback/route.ts to confirm open redirect fix.
    Grep for `getSession` in geocoding/autocomplete/route.ts to confirm auth added.
    Grep for `applyRateLimit` in both geocoding and accept-invitation routes.
  </verify>
  <done>
    Auth callback validates `next` param as relative path (no open redirect).
    Geocoding endpoint requires authentication (dual mobile/web auth).
    Geocoding and accept-invitation POST endpoints have rate limiting.
    New geocodingLimiter exported from rate-limit.ts.
  </done>
</task>

<task type="auto">
  <name>Task 2: Sanitize error messages, add security headers, document and audit</name>
  <files>
    apps/web/src/app/api/documents/upload/route.ts
    apps/web/src/app/api/documents/request-upload-url/route.ts
    apps/web/src/app/api/support/upload-attachment/route.ts
    apps/web/src/app/api/documents/complete-upload/route.ts
    apps/web/src/app/api/integrations/motive/sync/route.ts
    apps/web/src/app/api/integrations/samsara/sync/route.ts
    apps/web/next.config.ts
    apps/mobile/lib/storage.ts
    apps/web/src/middleware.ts
  </files>
  <action>
1. **Sanitize error messages** -- In each file below, keep the existing `console.error` / `logger.error` call that logs the full error server-side, but change the client-facing JSON response to return a generic message instead of `error.message`:

   - `apps/web/src/app/api/documents/upload/route.ts` (line ~129):
     Change `{ error: \`[upload:${step}] ${error instanceof Error ? error.message : String(error)}\` }` to:
     ```ts
     { error: 'Internal server error' }
     ```
     Ensure the detailed error is still logged via `console.error` or `logger.error` on the line above.

   - `apps/web/src/app/api/documents/request-upload-url/route.ts` (line ~61): Same pattern -- replace client response with `{ error: 'Internal server error' }`.

   - `apps/web/src/app/api/support/upload-attachment/route.ts` (line ~69): Same pattern.

   - `apps/web/src/app/api/documents/complete-upload/route.ts` (line ~67): Same pattern.

   - `apps/web/src/app/api/integrations/motive/sync/route.ts` (line ~91):
     Change `{ error: error instanceof Error ? error.message : 'Sync failed' }` to `{ error: 'Sync failed' }`.
     Ensure `logger.error` is present above with the full error.

   - `apps/web/src/app/api/integrations/samsara/sync/route.ts` (line ~91): Same as Motive.

2. **Add HTTP security headers** in `apps/web/next.config.ts`:
   - In the existing `headers()` function, add a SECOND entry to the returned array (keep the existing X-Accel-Buffering entry):
     ```ts
     {
       source: '/(.*)',
       headers: [
         { key: 'X-Frame-Options', value: 'DENY' },
         { key: 'X-Content-Type-Options', value: 'nosniff' },
         { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
         { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
         { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
       ],
     },
     ```
   - Do NOT add Content-Security-Policy.

3. **Audit MMKV session storage** in `apps/mobile/lib/storage.ts`:
   - `sessionStorage` IS actively used by `apps/mobile/lib/queue-flusher.ts` and `apps/mobile/lib/gps-task.ts` (confirmed via grep).
   - Add a JSDoc comment block above the `sessionStorage` object:
     ```ts
     /**
      * SECURITY NOTE: Session tokens (access_token, refresh_token) are stored in
      * MMKV's encrypted storage on-device. MMKV uses AES encryption on Android
      * and iOS Keychain-backed encryption. This is acceptable for mobile auth
      * tokens but should NOT store other sensitive PII. Tokens are short-lived
      * (access: 1h, refresh: 7d) and cleared on logout via sessionStorage.clear().
      *
      * Used by: queue-flusher.ts (offline queue auth), gps-task.ts (background GPS reporting)
      */
     ```

4. **Document public API routes in middleware** in `apps/web/src/middleware.ts`:
   - Add a comment block above the `PUBLIC_PATHS` array:
     ```ts
     /**
      * PUBLIC API ROUTES — Intentionally unauthenticated
      *
      * These paths bypass authentication in middleware. Each has a specific reason:
      *
      * Authentication flows (pre-auth by nature):
      *   /sign-in, /sign-up, /accept-invitation — login/registration pages
      *   /api/auth/login — POST login endpoint
      *   /api/auth/logout — POST logout endpoint
      *   /api/auth/accept-invitation — GET/POST invitation acceptance (pre-auth)
      *   /api/auth/callback — Supabase OAuth/email confirmation callback
      *
      * Infrastructure:
      *   /api/warmup — Health check / cold-start warmup (no sensitive data)
      *   /api/webhooks — Inbound webhooks (Stripe, etc.) — verified by signature, not session
      *
      * Public-facing:
      *   /track — Public shipment tracking page (token-gated, not session-gated)
      *
      * Static assets:
      *   /_next/static, /_next/image, /favicon.ico, /favicon.png, /site.webmanifest
      *
      * NOTE: /api/geocoding/autocomplete is NOT listed here — it requires authentication
      * (session or mobile Bearer token) enforced at the route handler level.
      * NOTE: /api/cron/* routes are protected by CRON_SECRET verification in each handler.
      * NOTE: /api/mobile/* routes use Bearer token auth, not middleware session cookies.
      *       Middleware passes them through (line ~91), and each handler calls validateMobileToken().
      */
     ```
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` -- no type errors.
    Grep for `error.message` in the 6 sanitized files -- should return no matches.
    Grep for `X-Frame-Options` in next.config.ts -- should match.
    Grep for `SECURITY NOTE` in apps/mobile/lib/storage.ts -- should match.
    Grep for `PUBLIC API ROUTES` in middleware.ts -- should match.
  </verify>
  <done>
    All 6 API routes return generic error messages to clients (detailed errors logged server-side only).
    Security headers (X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS) applied to all responses.
    MMKV session storage has security documentation comment.
    Middleware has comprehensive public route documentation.
    TypeScript compiles cleanly with `npx tsc --noEmit`.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes with zero errors
2. No `error.message` or `error instanceof Error ? error.message` patterns in client-facing responses of the 6 target files
3. `grep -r "safeNext" apps/web/src/app/api/auth/callback/` confirms open redirect fix
4. `grep -r "getSession\|validateMobileToken" apps/web/src/app/api/geocoding/` confirms auth on geocoding
5. `grep -r "applyRateLimit" apps/web/src/app/api/auth/accept-invitation/` confirms rate limiting
6. `grep -r "X-Frame-Options" apps/web/next.config.ts` confirms security headers
</verification>

<success_criteria>
- Auth callback redirect is safe (relative paths only, no protocol-relative bypass)
- Geocoding endpoint is authenticated and rate-limited
- Accept-invitation POST is rate-limited
- No error internals leak to API clients
- Security headers present on all responses
- MMKV storage and middleware public routes are documented
- TypeScript check passes cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/133-fix-security-audit-findings-open-redirec/133-SUMMARY.md`
</output>
