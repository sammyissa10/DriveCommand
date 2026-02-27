---
phase: quick-34
plan: 34
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/api/warmup/route.ts
  - vercel.json
  - src/middleware.ts
autonomous: true

must_haves:
  truths:
    - "GET /api/warmup returns 200 with { ok: true, timestamp } when called with valid CRON_SECRET"
    - "GET /api/warmup returns 401 when called without a valid CRON_SECRET"
    - "Vercel fires the warmup cron every 5 minutes"
    - "Middleware does not redirect /api/warmup to sign-in (it is a public path)"
  artifacts:
    - path: "src/app/api/warmup/route.ts"
      provides: "Warmup GET endpoint"
      exports: ["GET"]
    - path: "vercel.json"
      provides: "Cron schedule config"
      contains: '"/api/warmup"'
    - path: "src/middleware.ts"
      provides: "Middleware public path list"
      contains: "'/api/warmup'"
  key_links:
    - from: "vercel.json crons entry"
      to: "src/app/api/warmup/route.ts"
      via: "path: /api/warmup"
    - from: "src/middleware.ts PUBLIC_PATHS"
      to: "src/app/api/warmup/route.ts"
      via: "startsWith('/api/warmup')"
---

<objective>
Add a lightweight warmup cron job to prevent Vercel cold starts by pinging /api/warmup every 5 minutes.

Purpose: Vercel serverless functions go cold after inactivity. A frequent cron keeps the function warm so real users don't experience cold-start latency.
Output: /api/warmup route + vercel.json cron entry + middleware public path allowance.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/PROJECT.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create /api/warmup route</name>
  <files>src/app/api/warmup/route.ts</files>
  <action>
    Create a GET handler at src/app/api/warmup/route.ts following the exact pattern from src/app/api/cron/send-reminders/route.ts.

    Requirements:
    - `export const dynamic = 'force-dynamic'` at the top (prevent Next.js caching)
    - Verify Bearer token: read `Authorization` header, compare to `Bearer ${process.env.CRON_SECRET}`. Return `new Response('Unauthorized', { status: 401 })` on mismatch.
    - Run a lightweight DB check: `await prisma.$queryRaw\`SELECT 1\`` — confirms the DB connection is live without touching any tenant data. Import prisma from '@/lib/db/prisma'.
    - Return `Response.json({ ok: true, timestamp: new Date().toISOString() })` with implicit 200.
    - Add a console.log('[WARMUP] Pinged successfully') after the DB check for observability in Vercel logs.
    - Import only NextRequest from 'next/server' and prisma from '@/lib/db/prisma' — no other imports needed.
  </action>
  <verify>
    TypeScript compiles without errors for this file (check with: npx tsc --noEmit 2>&1 | grep warmup).
    File exists at src/app/api/warmup/route.ts.
  </verify>
  <done>
    File exists, exports GET, checks CRON_SECRET Bearer token, runs SELECT 1 via prisma, returns { ok: true, timestamp }.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add cron entry to vercel.json and warmup to middleware PUBLIC_PATHS</name>
  <files>vercel.json, src/middleware.ts</files>
  <action>
    **vercel.json** — The existing file already has a `crons` array with one entry. Append a second entry to that array:
    ```json
    {
      "path": "/api/warmup",
      "schedule": "*/5 * * * *"
    }
    ```
    Final crons array must have both entries: the existing send-reminders entry (unchanged) and the new warmup entry.

    **src/middleware.ts** — Add '/api/warmup' to the PUBLIC_PATHS array. Place it alongside the other /api/* entries for readability (after '/api/auth/accept-invitation' is fine). Do not change any other part of middleware.ts.
  </action>
  <verify>
    - `grep -n "warmup" vercel.json` shows the cron path entry.
    - `grep -n "warmup" src/middleware.ts` shows the PUBLIC_PATHS entry.
    - vercel.json is valid JSON (node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))" exits 0).
  </verify>
  <done>
    vercel.json crons array contains both send-reminders and warmup entries. src/middleware.ts PUBLIC_PATHS includes '/api/warmup'. Requests to /api/warmup bypass auth middleware.
  </done>
</task>

</tasks>

<verification>
1. TypeScript check: `npx tsc --noEmit 2>&1 | grep -i warmup` — should return no errors.
2. JSON validity: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"` — exits 0.
3. Route file exists: `ls src/app/api/warmup/route.ts`
4. Cron entry present: `grep "warmup" vercel.json`
5. Middleware entry present: `grep "warmup" src/middleware.ts`
</verification>

<success_criteria>
- /api/warmup route exists with CRON_SECRET auth guard and SELECT 1 DB check
- vercel.json crons has the warmup entry with "*/5 * * * *" schedule
- /api/warmup is in middleware PUBLIC_PATHS so Vercel's cron caller (no session) is not redirected to /sign-in
</success_criteria>

<output>
After completion, create `.planning/quick/34-add-warmup-cron-job-that-pings-api-warmu/34-SUMMARY.md`
</output>
