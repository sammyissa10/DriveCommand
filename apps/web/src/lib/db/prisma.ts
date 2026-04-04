import { setDefaultResultOrder } from 'dns';
// Force IPv4 DNS resolution — Vercel iad1 can't reach Supabase via IPv6
setDefaultResultOrder('ipv4first');

import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  pool: Pool;
};

/**
 * PostgreSQL connection pool.
 *
 * SINGLETON: preserved on globalThis in ALL environments (dev + production).
 * Vercel serverless functions reuse the module between warm invocations, so
 * globalThis persists within the same worker process lifetime. Without this,
 * every cold-start creates a new Pool causing a slow TCP handshake to Supabase.
 *
 * max: 1 — DATABASE_URL points to Supabase's pgbouncer pooler (port 6543).
 * pgbouncer handles actual connection pooling server-side, so each serverless
 * lambda instance only needs 1 connection slot. With max=5 and many concurrent
 * Vercel lambdas, we risk exhausting Supabase's connection limit.
 *
 * DATABASE_URL (Vercel env var) must use Supabase's pooled connection string:
 *   Port 6543 → Pooled (goes through pgbouncer — use for app runtime)
 *   Port 5432 → Direct (bypasses pooler — use for migrations/CLI only)
 * Example: postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true
 */
const pool = globalForPrisma.pool || new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

globalForPrisma.pool = pool;

// Create Prisma adapter for PostgreSQL
const adapter = new PrismaPg(pool);

// Initialize PrismaClient with adapter (Prisma 7 requirement)
// SINGLETON: same as pool — always preserved on globalThis.
export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

globalForPrisma.prisma = prisma;

/**
 * Shared transaction options for all bypass_rls / tenant-context transactions.
 * Raised from defaults (maxWait: 2000, timeout: 5000) to handle bursts of
 * concurrent queries under parallel load (multiple page renders, Playwright tests).
 */
export const TX_OPTIONS = { maxWait: 15000, timeout: 30000 } as const;
