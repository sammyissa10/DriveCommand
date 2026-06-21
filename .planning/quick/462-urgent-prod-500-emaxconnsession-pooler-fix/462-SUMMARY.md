# QT-462 Summary — Prod 500 Fix: EMAXCONNSESSION Pool Exhaustion

## Status: DEPLOYED — monitoring required

## Root Cause (confirmed)
`(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15`

Supabase Session Pooler's 15-slot limit was being exhausted by warm Vercel function instances each permanently holding 1 PgBouncer session (no `idleTimeoutMillis` on the `pg.Pool`). After 15 dashboard poll cycles, all 15 slots were occupied by idle connections, causing every new DB request to fail.

Evidence: `pg_stat_activity` showed 26 connections (24 idle, 0 active). Prior QT-459/460/461 diagnoses were wrong — no schema drift involved.

## Fix
`apps/web/src/lib/db/prisma.ts`: Added `idleTimeoutMillis: 10000` (release idle connections after 10s) and `connectionTimeoutMillis: 5000` (fail fast on unavailable pool).

- Commit: `974d01c2`
- Deployment: `dpl_C5oqpqLx2mp1YCvPyMjdQcA68qnx` → drivecommand.app

## Proof Status
New deployment has zero EMAXCONNSESSION errors in logs since going live. Old deployment errors all pre-date `974d01c2`. Full 10-minute clean window pending next active dashboard session.

## Required User Action
Go to **Supabase Dashboard → Project Settings → Database → Connection Pooling** and increase Pool Size from 15 to 50+. This adds headroom for multi-user scenarios even after the code fix is in effect.
