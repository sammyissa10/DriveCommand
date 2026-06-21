# QT-462: URGENT — Fix Prod 500s on /api/v1/carrier/dispatches and related routes

## Problem Statement
4 routes actively returning HTTP 500 on drivecommand.app:
- `/api/v1/carrier/dispatches`
- `/api/v1/messages/conversations`
- `/api/v1/carrier/notifications`
- `/api/v1/carrier/dashboard/messages`

Prior diagnostics (QT-459/460/461) gave three different root causes, none confirmed by live evidence.

## Investigation Approach
Trust ONLY live evidence: Vercel runtime logs + Supabase SQL.

## Root Cause Discovery (Phase 1)

### How the error was found
Vercel CLI `npx vercel logs --level error` returned untruncated error messages (MCP tool was 403-ing).

### Confirmed error (verbatim)
```
Error [DriverAdapterError]: (EMAXCONNSESSION) max clients reached in session mode 
- max clients are limited to pool_size: 15

clientVersion: '7.6.0',
cause: {
  originalCode: 'XX000',
  originalMessage: '(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15',
  kind: 'postgres',
  code: 'XX000',
  severity: 'FATAL',
}
```

This appeared on ALL 4 routes. NOT schema drift. NOT missing columns. NOT import errors.

### Root cause (one sentence)
Supabase Session Pooler's pool_size=15 was permanently exhausted by warm Vercel function instances, each holding a `pg.Pool` connection indefinitely because no `idleTimeoutMillis` was set.

### Evidence
- `pg_stat_activity` showed 26 connections (24 idle, 0 active) to Postgres
- Supabase Session Pooler capped at 15 simultaneous client sessions
- `prisma.ts` pool config had `max: 1` but NO `idleTimeoutMillis`
- Dashboard polls 4 routes every 60s; over time, 15+ warm Vercel instances each permanently hold 1 PgBouncer slot
- `pool.idleTimeoutMillis` was missing → connections held for lifetime of warm process (5-15+ min)

### What was NOT the cause
- Schema drift (columns all exist, SQL queries run clean)
- Missing Prisma models (build succeeded)
- RLS policy errors (DATABASE_URL uses superuser, RLS bypassed)
- Import chain failures (modules all resolve correctly)

## Fix Applied (Phase 2)

**File:** `apps/web/src/lib/db/prisma.ts`

Added `idleTimeoutMillis: 10000` and `connectionTimeoutMillis: 5000` to the `pg.Pool` constructor:

```typescript
pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 10000,    // Release idle PgBouncer slots after 10s
  connectionTimeoutMillis: 5000, // Fail fast instead of hanging
});
```

**Why this fixes it:** With a 60s dashboard polling interval and requests completing in <1s, connections idle out every 10 seconds between polls. At most 1 connection is held at any instant. Pool never reaches 15.

## Deployment
- Commit: `974d01c2`
- Deployment: `dpl_C5oqpqLx2mp1YCvPyMjdQcA68qnx`
- Live on: `drivecommand.app`

## Recommended Follow-Up (Required)
1. **Supabase Dashboard → Project Settings → Database → Connection Pooling → Pool Size:** Increase from 15 to 50+ as a buffer. (User action, cannot be done via code)
2. **Long-term:** Evaluate switching to Transaction mode pooler for all serverless routes. Transaction mode doesn't dedicate a backend connection per client session, making it inherently suited for serverless.
