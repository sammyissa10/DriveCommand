# QT-463 Summary — Diagnose /notifications 500 Post-QT-462

## Status: DIAGNOSIS COMPLETE — read-only, no code changes

## Verbatim Error (confirmed)

```
(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15
```

Confirmed via Vercel log search: querying `"EMAXCONNSESSION"` matches the error log entries at 20:32–20:35 UTC on the live deployment (`dpl_CGjxrChYNPKyWpbkxSB3PdorNZLt`, commit `3dd4de47`). Vercel MCP truncates message bodies in the table view but the search-index match is definitive.

## Classification: STILL CONNECTION/POOL — same class as QT-462

This is NOT a new notifications-specific bug.

## Evidence

### 1 — Multi-route simultaneous failure pattern
At 20:32–20:35 UTC, `/carrier/dispatches`, `/carrier/dashboard/messages`, `/messages/conversations`, AND `/carrier/notifications` all 500 within the same minute. Pool exhaustion (EMAXCONNSESSION) is the only error class that takes down all DB routes simultaneously.

### 2 — pg_stat_activity snapshot (taken at ~21:00 UTC)
```
state: idle   | count: 12 | max_idle_seconds: 2,739,019
state: null   | count: 2
```
12/15 slots occupied by idle connections. `max_idle_seconds = 2,739,019` (31+ days) proves **old Vercel instances from pre-QT-462 deployments are still alive**, holding connections that have no `idleTimeoutMillis`. They will never self-release. Only 3 pool slots remain free.

### 3 — Second deployment triggered the 20:32 burst
The QT-462 docs commit (`3dd4de47`) triggered deployment `dpl_CGjxrChYNPKyWpbkxSB3PdorNZLt` *after* the code fix deployment `dpl_C5oqpqLx2mp1YCvPyMjdQcA68qnx`. All new instances reconnected simultaneously at ~20:32, exhausting the 3 remaining slots.

### 4 — Why notifications appeared uniquely broken
Notifications is the only route that fires **two concurrent pool requests** via `Promise.all([findMany, count])`, requiring 2 slot acquisitions per request instead of 1. During partial recoveries (1–2 slots freed), single-query routes succeeded; notifications needed 2 slots and failed. This made it appear notifications-specific when the root cause is shared pool exhaustion.

## Secondary Issue (NOT causing 500s)
`[AuthApiError]: Too many requests` at 20:44 UTC (HTTP 200 responses) — Supabase Auth API rate-limiting concurrent `getSession()` calls during pool recovery. The library returns the cookie-cached session and logs at error level. Routes serve 200. Resolves as traffic normalizes.

## Additional Findings (not causing current 500s)

- **Enum drift**: `trip_change` is in Prisma schema (`InAppNotificationType`) but **missing from the live DB enum**. Safe today (no code inserts `trip_change`), but will cause `ERROR: invalid input value for enum` when first used. Needs a migration.
- **Working-tree local change**: The uncommitted local fix switching `/notifications` to `getTenantPrisma()` is in the right direction for GUC/RLS pattern consistency but does NOT fix pool exhaustion and adds one extra DB call per request.
- **postgres user has `rolbypassrls: true`** — RLS is fully bypassed for all raw `prisma` calls. RLS is NOT a factor.
- **`current_tenant_id()` uses NULLIF** — empty-string GUC returns NULL safely (no UUID cast error). Not a factor.
- **All indexes exist** on `in_app_notifications` — queries are properly indexed.

## Root Cause (one sentence)

> `/api/v1/carrier/notifications` continues 500ing because Supabase pool_size=15 is exhausted by 12 lingering idle connections from old (pre-QT-462) Vercel instances — the Required User Action from QT-462 SUMMARY (increase pool_size to 50+) was not completed.

## Proposed Fix (smallest)

**Supabase Dashboard → Project Settings → Database → Connection Pooling → set Pool Size from 15 → 50+**

**Same class as QT-462** — no code change required. The `idleTimeoutMillis: 10000` code fix is correct and working for new instances; it needs pool headroom to survive while old instances drain (~10–30 min after the pool_size increase).

## What Was Verified Read-Only
- Live Vercel runtime logs (both deployments)
- pg_stat_activity connection snapshot
- in_app_notifications table columns, indexes, enum values
- RLS policies and bypass status
- current_tenant_id() function definition
- postgres user rolbypassrls attribute
- statement_timeout configuration (120s, from configuration file)
- Git diff of deployed vs working-tree notifications route
