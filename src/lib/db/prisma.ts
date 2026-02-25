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
 * max: 5 — Vercel can run many concurrent lambdas; keeping the per-instance pool
 * small prevents exhausting Supabase's connection limit across invocations.
 *
 * DATABASE_URL (Vercel env var) should use Supabase's Session Mode pooler:
 *   Port 6543 → Session Mode (persistent connections, compatible with pg.Pool)
 *   Port 5432 → Transaction Mode (drops connection after each tx — defeats pooling)
 * Example: postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres
 */
const pool = globalForPrisma.pool || new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
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
