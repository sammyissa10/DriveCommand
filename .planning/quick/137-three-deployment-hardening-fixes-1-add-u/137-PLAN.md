---
phase: quick-137
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/health/route.ts
  - apps/web/src/middleware.ts
  - apps/web/src/lib/rate-limit.ts
  - apps/mobile/.env.example
autonomous: true
must_haves:
  truths:
    - "GET /api/health returns 200 with { ok, ts, version } without authentication"
    - "Rate limiting logs a warning in production when Redis is unavailable"
    - "apps/mobile/.env.example exists with all required and optional vars documented"
  artifacts:
    - path: "apps/web/src/app/api/health/route.ts"
      provides: "Unauthenticated health check endpoint"
      exports: ["GET"]
    - path: "apps/mobile/.env.example"
      provides: "Mobile environment variable template"
      contains: "EXPO_PUBLIC_API_URL"
  key_links: []
---

<objective>
Three small deployment hardening fixes: a health endpoint for uptime monitors, a production warning when Redis-backed rate limiting is disabled, and a mobile .env.example template.

Purpose: Improve production observability and developer onboarding.
Output: 3 new/modified files ready to deploy.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/middleware.ts
@apps/web/src/lib/rate-limit.ts
@apps/web/.env.example
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add /api/health endpoint and register in PUBLIC_PATHS</name>
  <files>apps/web/src/app/api/health/route.ts, apps/web/src/middleware.ts</files>
  <action>
1. Create `apps/web/src/app/api/health/route.ts` with a single GET handler:
   - Return `NextResponse.json({ ok: true, ts: Date.now(), version: process.env.npm_package_version ?? 'unknown' })`
   - No DB calls, no auth checks — this must be as lightweight as possible for uptime monitors.
   - Set `export const dynamic = 'force-dynamic'` to prevent caching.

2. In `apps/web/src/middleware.ts`, add `'/api/health'` to the `PUBLIC_PATHS` array (after `'/api/warmup'`). This ensures the health endpoint skips Supabase session creation entirely, making it faster and truly zero-auth.
  </action>
  <verify>Run `npx tsx -e "console.log('compiles')"` is not needed — just verify `npx tsc --noEmit` passes from apps/web. Then `curl http://localhost:3000/api/health` should return `{ ok: true, ts: ..., version: ... }` (test manually if dev server is running).</verify>
  <done>GET /api/health returns 200 JSON with ok, ts, and version fields. Route is listed in PUBLIC_PATHS.</done>
</task>

<task type="auto">
  <name>Task 2: Add production warning for missing Redis config and create mobile .env.example</name>
  <files>apps/web/src/lib/rate-limit.ts, apps/mobile/.env.example</files>
  <action>
1. In `apps/web/src/lib/rate-limit.ts`, update the `createRedis()` function:
   - After the `if (!url || !token) return null;` check, but BEFORE returning null, add:
     ```
     if (process.env.NODE_ENV === 'production') {
       console.warn('[rate-limit] WARNING: Upstash Redis is not configured — rate limiting is DISABLED in production. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
     }
     ```
   - This warn will be captured by the existing logger/Sentry integration in production.

2. Create `apps/mobile/.env.example` matching the style of `apps/web/.env.example` (section headers with `# ---` dividers, comments explaining where to get each value). Include:

   **Required section:**
   - `EXPO_PUBLIC_API_URL` — Backend URL (use http://10.0.2.2:3000 for Android emulator, http://localhost:3000 for iOS simulator)
   - `EXPO_PUBLIC_SUPABASE_URL` — from Supabase Dashboard -> Settings -> API
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` — from Supabase Dashboard -> Settings -> API

   **Optional section:**
   - `EXPO_PUBLIC_SENTRY_DSN` — from Sentry project settings (error monitoring)
   - `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` — from Google Cloud Console (maps features)
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web to confirm rate-limit.ts still compiles. Verify `apps/mobile/.env.example` exists and has all 5 variables.</verify>
  <done>rate-limit.ts logs a warning in production when Redis is missing. apps/mobile/.env.example exists with documented sections for all required and optional env vars.</done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` — no type errors
- `apps/web/src/app/api/health/route.ts` exists and exports GET
- `apps/web/src/middleware.ts` PUBLIC_PATHS includes '/api/health'
- `apps/web/src/lib/rate-limit.ts` contains production console.warn for missing Redis
- `apps/mobile/.env.example` exists with 5 env vars
</verification>

<success_criteria>
All three fixes implemented: health endpoint accessible without auth, rate limit warns in production when Redis is missing, mobile .env.example provides clear setup instructions matching web app style.
</success_criteria>

<output>
After completion, create `.planning/quick/137-three-deployment-hardening-fixes-1-add-u/137-SUMMARY.md`
</output>
