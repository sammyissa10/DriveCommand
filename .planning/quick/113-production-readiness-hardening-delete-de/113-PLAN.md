---
phase: quick-113
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/debug/route.ts
  - apps/web/src/lib/rate-limit.ts
  - apps/web/src/app/api/auth/login/route.ts
  - apps/web/src/app/api/gps/report/route.ts
  - apps/web/src/app/api/mobile/driver/dashboard/route.ts
  - apps/web/src/app/api/mobile/owner/dashboard/route.ts
  - apps/web/sentry.client.config.ts
  - apps/web/sentry.server.config.ts
  - apps/web/sentry.edge.config.ts
  - apps/web/next.config.ts
  - apps/web/.env.example
  - apps/mobile/app/_layout.tsx
  - apps/mobile/app.json
autonomous: true
user_setup:
  - service: upstash
    why: "Rate limiting via Redis"
    env_vars:
      - name: UPSTASH_REDIS_REST_URL
        source: "Upstash Console -> Database -> REST API -> URL"
      - name: UPSTASH_REDIS_REST_TOKEN
        source: "Upstash Console -> Database -> REST API -> Token"
  - service: sentry
    why: "Error monitoring for web and mobile"
    env_vars:
      - name: SENTRY_DSN
        source: "Sentry -> Project Settings -> Client Keys (DSN)"
      - name: SENTRY_AUTH_TOKEN
        source: "Sentry -> Settings -> Auth Tokens -> Create New Token"
      - name: EXPO_PUBLIC_SENTRY_DSN
        source: "Sentry -> Project Settings -> Client Keys (DSN) (mobile project)"
must_haves:
  truths:
    - "Debug route no longer accessible at /api/debug"
    - "Login endpoint rejects after 5 attempts in 15 minutes"
    - "GPS report endpoint throttles to 1 per 5 seconds per driver"
    - "Mobile API endpoints limited to 60 req/min per user"
    - "Web app errors are captured by Sentry"
    - "Mobile app errors are captured by Sentry"
    - "Mobile app checks for OTA updates on launch"
  artifacts:
    - path: "apps/web/src/lib/rate-limit.ts"
      provides: "Shared rate limiting utility"
    - path: "apps/web/sentry.client.config.ts"
      provides: "Sentry browser-side config"
    - path: "apps/web/sentry.server.config.ts"
      provides: "Sentry server-side config"
    - path: "apps/web/sentry.edge.config.ts"
      provides: "Sentry edge runtime config"
  key_links:
    - from: "apps/web/src/app/api/auth/login/route.ts"
      to: "apps/web/src/lib/rate-limit.ts"
      via: "import rateLimit helper"
    - from: "apps/web/next.config.ts"
      to: "@sentry/nextjs"
      via: "withSentryConfig wrapper"
    - from: "apps/mobile/app/_layout.tsx"
      to: "@sentry/react-native"
      via: "Sentry.init and Sentry.wrap"
---

<objective>
Production readiness hardening: remove the debug route exposing tenant data, add rate limiting to auth and sensitive API routes, integrate Sentry error monitoring for web and mobile, and configure EAS Update for OTA updates.

Purpose: Close security gaps and add observability before production launch.
Output: Hardened API routes, Sentry integration, EAS Update config.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/app/api/debug/route.ts
@apps/web/src/app/api/auth/login/route.ts
@apps/web/src/app/api/gps/report/route.ts
@apps/web/next.config.ts
@apps/mobile/app/_layout.tsx
@apps/mobile/app.json
@apps/web/.env.example
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete debug route and add rate limiting</name>
  <files>
    apps/web/src/app/api/debug/route.ts
    apps/web/src/lib/rate-limit.ts
    apps/web/src/app/api/auth/login/route.ts
    apps/web/src/app/api/gps/report/route.ts
    apps/web/src/app/api/mobile/driver/dashboard/route.ts
    apps/web/src/app/api/mobile/owner/dashboard/route.ts
    apps/web/.env.example
    apps/web/package.json
  </files>
  <action>
    1. **Delete** `apps/web/src/app/api/debug/route.ts` entirely (rm the file). Also delete the `debug` directory if it becomes empty.

    2. **Install dependencies** in apps/web:
       ```
       cd apps/web && npm install @upstash/ratelimit @upstash/redis
       ```

    3. **Create `apps/web/src/lib/rate-limit.ts`** — shared rate limiting utility:
       - Import `Ratelimit` from `@upstash/ratelimit` and `Redis` from `@upstash/redis`
       - Create a Redis client from env vars (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)
       - Export three pre-configured limiters:
         - `authLimiter` — sliding window, 5 requests per 15 minutes (prefix: "rl:auth")
         - `gpsLimiter` — fixed window, 1 request per 5 seconds (prefix: "rl:gps")
         - `mobileLimiter` — fixed window, 60 requests per 1 minute (prefix: "rl:mobile")
       - Export a helper function `applyRateLimit(limiter, identifier, response?)` that:
         - If env vars are missing (local dev), returns `{ success: true }` (skip limiting in dev)
         - Calls `limiter.limit(identifier)`
         - If `!success`, returns a NextResponse with 429 status, `Retry-After` header (from `reset` field), and JSON `{ error: "Too many requests" }`
         - If `success`, returns `null` (caller proceeds normally)

    4. **Add rate limiting to `/api/auth/login`** — At the top of the POST handler, before any logic:
       - Extract IP from `req.headers.get('x-forwarded-for')` or `req.headers.get('x-real-ip')` or `'unknown'`
       - Call `const limited = await applyRateLimit(authLimiter, ip)`
       - If `limited` is not null, return `limited` (the 429 response)

    5. **Add rate limiting to `/api/gps/report`** — After authentication resolves the driver's userId but before any DB writes:
       - Call `const limited = await applyRateLimit(gpsLimiter, userId)`
       - If `limited`, return `limited`

    6. **Add rate limiting to mobile API routes** — Pick ONE representative driver route (`apps/web/src/app/api/mobile/driver/dashboard/route.ts`) and ONE representative owner route (`apps/web/src/app/api/mobile/owner/dashboard/route.ts`). After auth resolves the userId:
       - Call `const limited = await applyRateLimit(mobileLimiter, userId)`
       - If `limited`, return `limited`
       - Add a code comment: `// TODO: Apply mobileLimiter to all /api/mobile/* routes`

    7. **Update `.env.example`** — Add under a new "Rate Limiting" section:
       ```
       # Rate Limiting — Upstash Redis (required for production rate limiting)
       # Get from: https://console.upstash.com -> Database -> REST API
       UPSTASH_REDIS_REST_URL=
       UPSTASH_REDIS_REST_TOKEN=
       ```
  </action>
  <verify>
    - `ls apps/web/src/app/api/debug/` should fail (directory deleted)
    - `cat apps/web/src/lib/rate-limit.ts` shows the three limiters and helper
    - `grep -r "applyRateLimit" apps/web/src/app/api/auth/login/route.ts` shows import and usage
    - `grep -r "applyRateLimit" apps/web/src/app/api/gps/report/route.ts` shows import and usage
    - `grep "UPSTASH" apps/web/.env.example` shows both env vars
    - `cd apps/web && npx tsc --noEmit` passes (or at minimum, no new errors from rate-limit files)
  </verify>
  <done>Debug route is deleted. Rate limiting utility exists with three limiters. Auth login is limited to 5 req/15min per IP. GPS report is limited to 1 req/5s per driver. Two representative mobile routes have rate limiting applied. Env vars documented.</done>
</task>

<task type="auto">
  <name>Task 2: Sentry integration for web and mobile</name>
  <files>
    apps/web/package.json
    apps/web/sentry.client.config.ts
    apps/web/sentry.server.config.ts
    apps/web/sentry.edge.config.ts
    apps/web/next.config.ts
    apps/web/.env.example
    apps/mobile/package.json
    apps/mobile/app/_layout.tsx
  </files>
  <action>
    1. **Install Sentry for web:**
       ```
       cd apps/web && npx @sentry/wizard@latest -i nextjs --uninstall && npm install @sentry/nextjs
       ```
       Do NOT use the wizard (it may prompt). Just install the package directly:
       ```
       cd apps/web && npm install @sentry/nextjs
       ```

    2. **Create `apps/web/sentry.client.config.ts`:**
       ```ts
       import * as Sentry from "@sentry/nextjs";

       Sentry.init({
         dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
         tracesSampleRate: 0.1,
         replaysSessionSampleRate: 0,
         replaysOnErrorSampleRate: 1.0,
         enabled: process.env.NODE_ENV === "production",
       });
       ```

    3. **Create `apps/web/sentry.server.config.ts`:**
       ```ts
       import * as Sentry from "@sentry/nextjs";

       Sentry.init({
         dsn: process.env.SENTRY_DSN,
         tracesSampleRate: 0.1,
         enabled: process.env.NODE_ENV === "production",
       });
       ```

    4. **Create `apps/web/sentry.edge.config.ts`:**
       ```ts
       import * as Sentry from "@sentry/nextjs";

       Sentry.init({
         dsn: process.env.SENTRY_DSN,
         tracesSampleRate: 0.1,
         enabled: process.env.NODE_ENV === "production",
       });
       ```

    5. **Update `apps/web/next.config.ts`** — Wrap the existing config with `withSentryConfig`:
       ```ts
       import { withSentryConfig } from "@sentry/nextjs";
       ```
       At the bottom, replace `export default nextConfig` with:
       ```ts
       export default withSentryConfig(nextConfig, {
         org: "onesquad-drivecommand",
         project: "drivecommand-web",
         silent: !process.env.CI,
         widenClientFileUpload: true,
         disableLogger: true,
       });
       ```
       Keep ALL existing config (headers, experimental) untouched.

    6. **Install Sentry for mobile:**
       ```
       cd apps/mobile && npx expo install @sentry/react-native
       ```

    7. **Update `apps/mobile/app/_layout.tsx`:**
       - Import `* as Sentry from '@sentry/react-native'` at the top
       - Add `Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN, tracesSampleRate: 0.1, enabled: !__DEV__ })` BEFORE the `SplashScreen.preventAutoHideAsync()` call
       - Find the default export (the root layout component) and wrap it with `Sentry.wrap()`. For example if it's `export default function RootLayout() {...}`, change to:
         ```ts
         function RootLayout() { ... }
         export default Sentry.wrap(RootLayout);
         ```
       - Keep ALL existing code (AuthProvider, QueryProvider, Toast, notifications, etc.) intact

    8. **Update `.env.example`** — Add under a new "Error Monitoring" section:
       ```
       # Error Monitoring — Sentry (optional — enables error tracking)
       # Get from: https://sentry.io -> Project Settings -> Client Keys (DSN)
       NEXT_PUBLIC_SENTRY_DSN=
       SENTRY_DSN=
       SENTRY_AUTH_TOKEN=
       ```
       Note: `NEXT_PUBLIC_SENTRY_DSN` is for client-side, `SENTRY_DSN` is for server-side. They can be the same DSN value.
       Note: Mobile uses `EXPO_PUBLIC_SENTRY_DSN` — add a comment noting this is set in apps/mobile/.env.local
  </action>
  <verify>
    - `ls apps/web/sentry.client.config.ts apps/web/sentry.server.config.ts apps/web/sentry.edge.config.ts` all exist
    - `grep "withSentryConfig" apps/web/next.config.ts` shows Sentry wrapper
    - `grep "Sentry" apps/mobile/app/_layout.tsx` shows init and wrap
    - `grep "SENTRY" apps/web/.env.example` shows DSN and auth token vars
    - `cd apps/web && npx tsc --noEmit` passes (or no new errors from Sentry files)
  </verify>
  <done>Sentry is integrated in web (client, server, edge configs + Next.js plugin) and mobile (init + wrap in root layout). Environment variables documented in .env.example.</done>
</task>

<task type="auto">
  <name>Task 3: EAS Update configuration for OTA updates</name>
  <files>
    apps/mobile/app.json
    apps/mobile/app/_layout.tsx
  </files>
  <action>
    1. **Update `apps/mobile/app.json`** — Add `updates` config inside `expo`:
       ```json
       "updates": {
         "url": "https://u.expo.dev/010aaae1-a5ad-455a-bb42-a1d6637e4cf7",
         "enabled": true,
         "checkAutomatically": "ON_LOAD",
         "fallbackToCacheTimeout": 5000
       },
       "runtimeVersion": {
         "policy": "appVersion"
       }
       ```
       Place `updates` after the existing `scheme` field. Place `runtimeVersion` at the same level (inside `expo`).
       Use the existing projectId `010aaae1-a5ad-455a-bb42-a1d6637e4cf7` from `extra.eas.projectId`.

    2. **Add OTA update check in `apps/mobile/app/_layout.tsx`** — Inside the root layout component (the one that renders), add a useEffect that checks for updates on mount:
       ```ts
       import * as Updates from 'expo-updates';
       ```
       In the component body (e.g., inside `RootLayout` or wherever the main layout is rendered):
       ```ts
       useEffect(() => {
         async function checkForOTAUpdate() {
           if (__DEV__) return; // skip in development
           try {
             const update = await Updates.checkForUpdateAsync();
             if (update.isAvailable) {
               await Updates.fetchUpdateAsync();
               await Updates.reloadAsync();
             }
           } catch (e) {
             // Silently fail — don't block app launch
             console.warn('OTA update check failed:', e);
           }
         }
         checkForOTAUpdate();
       }, []);
       ```
       Place this useEffect in the main rendered component (likely `RootLayout` or the inner component that has all the providers). Do NOT place it in `AuthGuard` — it should run regardless of auth state.
  </action>
  <verify>
    - `node -e "const d=require('./apps/mobile/app.json').expo; console.log(d.updates, d.runtimeVersion)"` shows updates config with correct URL and runtimeVersion policy
    - `grep "checkForUpdateAsync" apps/mobile/app/_layout.tsx` shows OTA check
    - `grep "expo-updates" apps/mobile/app/_layout.tsx` shows import
  </verify>
  <done>EAS Update is configured in app.json with the correct project URL. The app checks for OTA updates on launch and silently applies them. Runtime version uses appVersion policy.</done>
</task>

</tasks>

<verification>
- Debug route deleted: `curl` or direct access to `/api/debug` returns 404
- Rate limiting utility created with three pre-configured limiters
- Auth, GPS, and sample mobile routes have rate limiting applied
- Sentry configs exist for web (client/server/edge) and mobile (init + wrap)
- Next.js config wraps with `withSentryConfig`
- EAS Update configured in app.json with correct project ID
- OTA update check runs on app launch
- All new env vars documented in .env.example
- TypeScript compilation passes without new errors
</verification>

<success_criteria>
- /api/debug route no longer exists
- Rate limiting is functional (gracefully skipped in dev without Redis)
- Sentry SDK installed and configured for both web and mobile
- EAS Update URL set to correct project, update check on app launch
- All env vars documented for user to fill in
</success_criteria>

<output>
After completion, create `.planning/quick/113-production-readiness-hardening-delete-de/113-SUMMARY.md`
</output>
