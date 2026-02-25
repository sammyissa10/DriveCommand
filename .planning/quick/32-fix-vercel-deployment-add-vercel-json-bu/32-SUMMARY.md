---
phase: quick-32
plan: 01
subsystem: infra
tags: [vercel, deployment, migrations, env-vars, prisma]

requires: []
provides:
  - vercel.json buildCommand running migrate.mjs + prisma generate + next build on every deploy
  - comprehensive .env.example with all 13 env vars documented with sources and required/optional labels
affects: [deployment, onboarding, vercel-setup]

tech-stack:
  added: []
  patterns:
    - "Vercel buildCommand pattern: migrate then generate then build"
    - ".env.example as comprehensive onboarding reference with category grouping and source links"

key-files:
  created: []
  modified:
    - vercel.json
    - .env.example

key-decisions:
  - "Use custom scripts/migrate.mjs (not prisma migrate deploy) — project uses manual SQL migration runner with atomic transactions and retry logic"
  - "buildCommand chains with && so Vercel build fails fast if migration fails (no partial deploys)"

duration: <1min
completed: 2026-02-25
---

# Quick Task 32: Fix Vercel Deployment — Add vercel.json buildCommand + Complete .env.example

**Vercel deployments now auto-run database migrations via custom migrate.mjs before every build, with all 13 env vars documented in .env.example with source links and required/optional labels.**

## Performance

- **Duration:** ~32 seconds
- **Started:** 2026-02-25T00:45:27Z
- **Completed:** 2026-02-25T00:45:59Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added `buildCommand` to vercel.json: `node scripts/migrate.mjs && prisma generate && next build` — migrations run atomically before every Vercel deploy
- Replaced partial `.env.example` (5 vars, no descriptions) with comprehensive version documenting all 13 env vars with category headers, source URLs, and required/optional labels
- Preserved existing crons configuration in vercel.json (0 14 * * * send-reminders)

## Task Commits

1. **Task 1: Add buildCommand to vercel.json and update .env.example** — `d8bf617` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `vercel.json` — Added `buildCommand: "node scripts/migrate.mjs && prisma generate && next build"` while preserving existing `crons` array
- `.env.example` — Replaced 5-var stub with 13-var comprehensive reference grouped into 7 categories (Database, Auth, App URL, Email, AI, Storage, Cron)

## Decisions Made

- Used `node scripts/migrate.mjs` not `prisma migrate deploy` — the project uses a custom migration runner at scripts/migrate.mjs that applies SQL files with atomic transactions, retry of failed migrations, and graceful error handling; prisma migrate deploy would conflict
- Chained commands with `&&` so if migration fails, the entire Vercel build fails fast (prevents deploying app against un-migrated schema)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

For Vercel deployment to work:
1. Add all required env vars in Vercel Dashboard -> Settings -> Environment Variables (reference `.env.example` for descriptions and source links)
2. Required vars: `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CRON_SECRET`
3. Optional vars: `ANTHROPIC_API_KEY` (AI features), S3 vars (document uploads), `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (address autocomplete)

## Next Phase Readiness

- Vercel deployment is now self-contained — push to main triggers migrations automatically before build
- New developers can use `.env.example` as a complete setup checklist

## Self-Check: PASSED

- `vercel.json` exists and contains `buildCommand` and 1 cron — VERIFIED
- `.env.example` contains all 13 env vars — VERIFIED
- Both files committed in `d8bf617` — VERIFIED

---
*Phase: quick-32*
*Completed: 2026-02-25*
