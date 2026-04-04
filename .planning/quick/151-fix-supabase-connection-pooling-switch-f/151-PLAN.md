---
phase: quick-151
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/db/prisma.ts
  - apps/web/prisma.config.ts
  - apps/web/.env.example
autonomous: true
must_haves:
  truths:
    - "PrismaClient pg.Pool max is 1 for serverless pgbouncer compatibility"
    - "prisma.config.ts uses DIRECT_URL for migrations (bypasses pooler)"
    - ".env.example documents both pooled and direct connection strings"
    - "migrate.mjs already uses DIRECT_URL fallback (no change needed)"
  artifacts:
    - path: "apps/web/src/lib/db/prisma.ts"
      provides: "Singleton PrismaClient with pg.Pool max=1"
      contains: "max: 1"
    - path: "apps/web/prisma.config.ts"
      provides: "Prisma config using DIRECT_URL for migrations"
      contains: "DIRECT_URL"
    - path: "apps/web/.env.example"
      provides: "Documented pooled + direct connection strings"
      contains: "6543"
  key_links:
    - from: "apps/web/src/lib/db/prisma.ts"
      to: "DATABASE_URL"
      via: "process.env.DATABASE_URL with pooled port 6543"
      pattern: "max: 1"
    - from: "apps/web/prisma.config.ts"
      to: "DIRECT_URL"
      via: "Prisma CLI migrations use direct connection"
      pattern: "DIRECT_URL.*DATABASE_URL"
---

<objective>
Fix Supabase connection pooling for serverless deployment.

Purpose: Prevent Postgres connection exhaustion on Vercel by ensuring the runtime uses the Supabase pooled connection (port 6543/pgbouncer) with pool max=1, while migrations use the direct connection (port 5432) for DDL compatibility.

Output: Updated prisma.ts (pool max=1), prisma.config.ts (DIRECT_URL preference for migrations), and .env.example (documents both URLs).
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/db/prisma.ts
@apps/web/prisma.config.ts
@apps/web/scripts/migrate.mjs
@apps/web/.env.example
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix pool size and document connection strings</name>
  <files>
    apps/web/src/lib/db/prisma.ts
    apps/web/prisma.config.ts
    apps/web/.env.example
  </files>
  <action>
    1. In `apps/web/src/lib/db/prisma.ts`:
       - Change `max: 5` to `max: 1` on the Pool constructor. With pgbouncer in front, each serverless function instance should hold at most 1 connection. pgbouncer handles the actual pooling. Having max=5 per lambda instance risks exhausting Supabase's connection limit (each Vercel lambda opens up to 5 connections, and there can be many concurrent lambdas).
       - Update the comment block to clarify: port 6543 is the **pooled** connection (pgbouncer), port 5432 is the **direct** connection (no pooler). Fix the current comment which incorrectly labels 6543 as "Session Mode" and 5432 as "Transaction Mode" — those are pgbouncer pool modes, not port descriptions. The correct framing: 6543 = pooled (goes through pgbouncer), 5432 = direct (bypasses pooler).

    2. In `apps/web/prisma.config.ts`:
       - Change `url: process.env["DATABASE_URL"]` to `url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"]`. Prisma CLI operations (generate, migrate) need direct connections because pgbouncer doesn't support prepared statements or DDL well. The migrate.mjs script already does this fallback — prisma.config.ts should match.

    3. In `apps/web/.env.example`:
       - Replace the single `DATABASE_URL` entry with two documented entries:
         ```
         # Pooled connection (for app runtime — goes through Supabase pgbouncer)
         # Get from: Supabase Dashboard -> Settings -> Database -> Connection string -> URI (pooled)
         # MUST use port 6543 with pgbouncer=true for serverless
         DATABASE_URL="postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"

         # Direct connection (for migrations/CLI only — bypasses pooler)
         # Get from: Supabase Dashboard -> Settings -> Database -> Connection string -> URI (direct)
         # Uses port 5432, no pgbouncer
         DIRECT_URL="postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:5432/postgres"
         ```

    Do NOT change migrate.mjs — it already correctly prefers DIRECT_URL over DATABASE_URL.
    Do NOT change seed.ts or test setup files — they run locally/CI where direct connections are fine.
  </action>
  <verify>
    - `grep "max: 1" apps/web/src/lib/db/prisma.ts` confirms pool size is 1
    - `grep "DIRECT_URL" apps/web/prisma.config.ts` confirms migration config uses direct URL
    - `grep "6543" apps/web/.env.example` confirms pooled port documented
    - `grep "DIRECT_URL" apps/web/.env.example` confirms direct URL documented
    - `cd apps/web && npx tsc --noEmit` passes (no type errors introduced)
  </verify>
  <done>
    Pool max is 1, prisma.config.ts prefers DIRECT_URL for CLI operations, .env.example documents both pooled (6543) and direct (5432) connection strings with clear guidance on which to use where.
  </done>
</task>

<task type="checkpoint:human-action">
  <name>Task 2: Verify Vercel environment variables</name>
  <what-built>Code changes ensure the app uses pooled connections correctly and migrations use direct connections. But the actual DATABASE_URL on Vercel must point to port 6543 with pgbouncer=true, and DIRECT_URL must be added for migrations.</what-built>
  <how-to-verify>
    1. Go to Vercel Dashboard -> DriveCommand -> Settings -> Environment Variables
    2. Check DATABASE_URL:
       - Must contain `pooler.supabase.com:6543` (NOT port 5432)
       - Must contain `?pgbouncer=true` at the end
       - If it has port 5432, update it to the pooled URL from Supabase Dashboard -> Settings -> Database -> Connection string (URI, pooled mode)
    3. Add DIRECT_URL if not present:
       - Value: the direct connection string from Supabase (port 5432, no pgbouncer param)
       - This is used by prisma.config.ts and migrate.mjs during builds
    4. Redeploy after changing env vars: `vercel --prod`
  </how-to-verify>
  <resume-signal>Confirm DATABASE_URL uses port 6543 and DIRECT_URL is set, or describe current state</resume-signal>
</task>

</tasks>

<verification>
- `apps/web/src/lib/db/prisma.ts` has `max: 1` on Pool
- `apps/web/prisma.config.ts` falls back from DIRECT_URL to DATABASE_URL
- `.env.example` documents both connection strings with correct ports
- TypeScript compiles cleanly
- Vercel env vars use correct URLs (human-verified)
</verification>

<success_criteria>
Runtime PrismaClient uses pooled connection (port 6543, pgbouncer=true) with max 1 connection per lambda. Migrations use direct connection (port 5432) via DIRECT_URL. Documentation in .env.example is clear and correct.
</success_criteria>

<output>
After completion, create `.planning/quick/151-fix-supabase-connection-pooling-switch-f/151-SUMMARY.md`
</output>
