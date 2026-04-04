---
phase: quick-151
plan: 01
subsystem: database
tags: [prisma, postgres, supabase, pgbouncer, connection-pooling, serverless]

requires: []
provides:
  - pg.Pool with max=1 for pgbouncer-compatible serverless connection pooling
  - prisma.config.ts using DIRECT_URL for migrations to bypass pgbouncer DDL issues
  - .env.example documenting both pooled (port 6543) and direct (port 5432) connection strings
affects: [database, migrations, vercel-deployment]

tech-stack:
  added: []
  patterns:
    - "Serverless DB pooling: pg.Pool max=1 + pgbouncer handles server-side pooling (port 6543)"
    - "Migration URLs: DIRECT_URL (port 5432) for CLI/migrations, DATABASE_URL (port 6543) for runtime"

key-files:
  created: []
  modified:
    - apps/web/src/lib/db/prisma.ts
    - apps/web/prisma.config.ts
    - apps/web/.env.example

key-decisions:
  - "pg.Pool max=1: with pgbouncer as the actual pooler, each lambda only needs 1 connection slot — max=5 risks exhausting Supabase connection limits across concurrent lambdas"
  - "DIRECT_URL in prisma.config.ts: Prisma CLI/migrations need direct connections because pgbouncer doesn't support prepared statements or DDL well"
  - "Two-URL pattern: DATABASE_URL=pooled (6543, runtime), DIRECT_URL=direct (5432, migrations)"

duration: 2min
completed: 2026-04-04
---

# Quick-151: Fix Supabase Connection Pooling Summary

**pg.Pool max reduced from 5 to 1 for pgbouncer serverless compatibility; DIRECT_URL added to prisma.config.ts for migration safety; .env.example documents both pooled and direct connection strings**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-04T04:57:03Z
- **Completed:** 2026-04-04T04:59:06Z
- **Tasks:** 1 of 2 (Task 2 is a human-action checkpoint — requires Vercel env var verification)
- **Files modified:** 3

## Accomplishments
- Pool max reduced from 5 to 1: pgbouncer handles server-side pooling so each lambda instance only needs 1 slot, preventing connection exhaustion across concurrent Vercel lambdas
- prisma.config.ts now prefers DIRECT_URL for Prisma CLI operations (generate, migrate) — pgbouncer doesn't support DDL/prepared statements reliably
- .env.example now documents both the pooled connection (port 6543, pgbouncer=true) and direct connection (port 5432) with clear guidance on which to use where
- Fixed inaccurate comment in prisma.ts that labeled ports as "Session Mode/Transaction Mode" — corrected to "Pooled/Direct"

## Task Commits

1. **Task 1: Fix pool size and document connection strings** - `e0a15a2` (fix)

## Files Created/Modified
- `apps/web/src/lib/db/prisma.ts` - Pool max changed to 1, comment corrected
- `apps/web/prisma.config.ts` - Added DIRECT_URL fallback for migrations
- `apps/web/.env.example` - Replaced single DATABASE_URL with documented pooled + direct pair

## Decisions Made
- Pool max=1 because pgbouncer is the actual pooler — lambda instances don't need multiple connections
- DIRECT_URL preference in prisma.config.ts mirrors existing migrate.mjs behavior (consistency)
- Kept example URLs using `[ref]`/`[pass]`/`[region]` placeholders matching Supabase's actual URL format

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**Task 2 (human-action checkpoint) requires manual Vercel verification:**

1. Go to Vercel Dashboard -> DriveCommand -> Settings -> Environment Variables
2. Check `DATABASE_URL`: must contain `pooler.supabase.com:6543` and `?pgbouncer=true`
   - If it has port 5432, update it to the pooled URL from Supabase Dashboard -> Settings -> Database -> Connection string (URI, pooled)
3. Add `DIRECT_URL` if not present: the direct connection string (port 5432, no pgbouncer param)
4. Redeploy after changing env vars: `vercel --prod`

## Next Phase Readiness

Code changes are complete and committed. Once Vercel env vars are verified/updated and a redeploy is done, connection pooling will be properly configured for production serverless usage.

---
*Phase: quick-151*
*Completed: 2026-04-04*
