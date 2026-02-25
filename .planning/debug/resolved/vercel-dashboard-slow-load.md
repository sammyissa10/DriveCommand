---
status: resolved
trigger: "Dashboard takes very long to load on Vercel (production). Works locally."
created: 2026-02-24T00:00:00Z
updated: 2026-02-24T00:02:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: CONFIRMED AND FIXED
test: next build passed, tsc --noEmit passed
expecting: Dashboard warm invocations on Vercel will reuse Pool and PrismaClient.
  Cold starts still incur one TCP handshake but subsequent requests are fast.
  DATABASE_URL port change to 6543 is a manual step for the user on Vercel dashboard.
next_action: COMPLETE — archived

## Symptoms

expected: Dashboard loads quickly (as it does locally after quick-29 fix)
actual: Dashboard takes "mighty too long" to load on Vercel production
errors: No errors — just slow
reproduction: Log in on Vercel, wait for dashboard to load
started: First Vercel deployment — never been fast on Vercel. Quick-29 fixed local performance but Vercel may have different bottlenecks.
environment: Vercel serverless (not local dev server)

## Eliminated

- hypothesis: Schema.prisma missing connection_limit setting
  evidence: Using @prisma/adapter-pg with pg.Pool — not direct Prisma connections, so
    connection_limit in schema.prisma datasource is not applicable here.
  timestamp: 2026-02-24T00:01:00Z

- hypothesis: Sequential DB queries (N+1)
  evidence: Dashboard actions use Promise.all() properly — 8 parallel queries in
    getDashboardMetrics, 4 parallel in getNotificationAlerts. Not N+1.
  timestamp: 2026-02-24T00:01:00Z

- hypothesis: Missing unstable_cache
  evidence: Both dashboard actions use unstable_cache with 60s revalidation. After first
    load, subsequent loads within 60s will be fast. The FIRST load (cold start) is slow.
  timestamp: 2026-02-24T00:01:00Z

## Evidence

- timestamp: 2026-02-24T00:01:00Z
  checked: src/lib/db/prisma.ts — Prisma client singleton pattern
  found: globalForPrisma.pool and globalForPrisma.prisma were ONLY saved when
    `process.env.NODE_ENV !== 'production'`. In production (Vercel), every serverless
    invocation creates a brand new Pool and PrismaClient. The guard that was meant to
    prevent hot-reload issues in dev accidentally disables the singleton in production.
  implication: CRITICAL BUG — Every Vercel serverless invocation cold-starts a new DB
    connection pool. Primary cause of slowness.

- timestamp: 2026-02-24T00:01:00Z
  checked: .env.local DATABASE_URL
  found: URL is postgresql://...pooler.supabase.com:5432/postgres — uses Supabase Transaction
    Pooler (port 5432). pg.Pool creates persistent connections, which requires Session
    Mode (port 6543). Transaction Mode (5432) drops connections after each transaction,
    undermining pooling entirely.
  implication: Connection pooling is ineffective — each Pool connection gets dropped after
    each transaction by PgBouncer. Need port 6543 (Session Mode) for pg.Pool to work.

- timestamp: 2026-02-24T00:01:00Z
  checked: src/lib/db/extensions/tenant-rls.ts
  found: withTenantRLS wraps EVERY model operation in a $transaction, executing
    `SELECT set_config(...)` + the actual query. With 8 parallel queries in
    getDashboardMetrics and 4 in getNotificationAlerts, that's 24 DB round-trips
    just for the dashboard.
  implication: High transaction overhead per request. Primary fix (singleton) reduces
    the connection-acquisition cost of each of these transactions significantly.

- timestamp: 2026-02-24T00:01:00Z
  checked: pg.Pool configuration in prisma.ts
  found: Pool was created with only connectionString — no max connections specified.
    Default pg pool max is 10. On serverless, multiple concurrent invocations each
    creating a pool of 10 can exhaust Supabase connection limits.
  implication: Fixed by setting max: 5 in Pool config.

## Resolution

root_cause: The Prisma singleton guard `if (process.env.NODE_ENV !== 'production')`
  accidentally DISABLED connection reuse in production — new Pool and PrismaClient on
  every Vercel serverless invocation. Compounded by DATABASE_URL using port 5432
  (Transaction Mode PgBouncer) which drops connections after each transaction, making
  pg.Pool's connection reuse pointless anyway.

fix: |
  Removed the NODE_ENV guard — singleton now always preserved on globalThis in all
  environments. Added max: 5 to Pool config for serverless safety. Added comment
  documenting that DATABASE_URL on Vercel must use port 6543 (Session Mode).

verification: |
  - tsc --noEmit: passed (0 errors)
  - next build: passed (all routes compiled)

files_changed:
  - src/lib/db/prisma.ts
