---
phase: quick-34
plan: 34
subsystem: infrastructure
tags: [cron, warmup, cold-start, vercel, middleware]
dependency_graph:
  requires: []
  provides: [warmup-cron-endpoint]
  affects: [vercel.json, src/middleware.ts]
tech_stack:
  added: []
  patterns: [cron-bearer-auth, force-dynamic, public-path-bypass]
key_files:
  created:
    - src/app/api/warmup/route.ts
  modified:
    - vercel.json
    - src/middleware.ts
decisions:
  - Use prisma.$queryRaw`SELECT 1` (not a full tenant query) — minimal DB round-trip that confirms connection without touching tenant data or requiring RLS context
  - Add /api/warmup to PUBLIC_PATHS before /api/webhooks — grouped with other /api/* public entries for readability
  - Schedule every 5 minutes (*/5 * * * *) — frequent enough to prevent cold starts on free-tier Vercel without wasting cron quota
metrics:
  duration: 73s
  completed: 2026-02-25
  tasks: 2
  files: 3
---

# Quick Task 34: Add Warmup Cron Job — Summary

**One-liner:** Vercel cron at */5 fires GET /api/warmup, which verifies CRON_SECRET Bearer token and runs SELECT 1 to keep the serverless function and DB connection warm.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create /api/warmup route | ed675f9 | src/app/api/warmup/route.ts |
| 2 | Add cron entry to vercel.json and warmup to middleware PUBLIC_PATHS | fdf3f06 | vercel.json, src/middleware.ts |

## What Was Built

### `src/app/api/warmup/route.ts`
Lightweight GET handler:
- `export const dynamic = 'force-dynamic'` prevents Next.js from caching the response
- Reads `Authorization` header and compares to `Bearer ${process.env.CRON_SECRET}` — returns 401 on mismatch
- Runs `prisma.$queryRaw\`SELECT 1\`` to confirm DB connection is alive without touching tenant data
- Logs `[WARMUP] Pinged successfully` for observability in Vercel function logs
- Returns `{ ok: true, timestamp: new Date().toISOString() }` with implicit 200

### `vercel.json`
Added second entry to the `crons` array:
```json
{
  "path": "/api/warmup",
  "schedule": "*/5 * * * *"
}
```
The existing `send-reminders` entry at `0 14 * * *` is unchanged.

### `src/middleware.ts`
Added `'/api/warmup'` to `PUBLIC_PATHS` array alongside other `/api/*` public entries. This ensures Vercel's cron caller (which has no session cookie) is not redirected to `/sign-in` when hitting the endpoint.

## Verification Results

1. TypeScript: `npx tsc --noEmit | grep warmup` — no errors
2. JSON validity: `node -e "JSON.parse(...vercel.json)"` — exits 0
3. Route file: `ls src/app/api/warmup/route.ts` — present
4. Cron entry: `grep "warmup" vercel.json` — `/api/warmup` path confirmed
5. Middleware entry: `grep "warmup" src/middleware.ts` — `'/api/warmup'` in PUBLIC_PATHS confirmed

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/app/api/warmup/route.ts | FOUND |
| vercel.json | FOUND |
| src/middleware.ts | FOUND |
| Commit ed675f9 (Task 1) | FOUND |
| Commit fdf3f06 (Task 2) | FOUND |
