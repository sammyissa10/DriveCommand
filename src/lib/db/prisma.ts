import { PrismaClient } from '../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  pool: Pool;
};

// Create PostgreSQL connection pool (reuse across requests)
const pool = globalForPrisma.pool || new Pool({
  connectionString: process.env.DATABASE_URL,
});
if (process.env.NODE_ENV !== 'production') globalForPrisma.pool = pool;

// Create Prisma adapter for PostgreSQL
const adapter = new PrismaPg(pool);

// Initialize PrismaClient with adapter (Prisma 7 requirement)
export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Shared transaction options for all bypass_rls / tenant-context transactions.
 * Raised from defaults (maxWait: 2000, timeout: 5000) to handle bursts of
 * concurrent queries under parallel load (multiple page renders, Playwright tests).
 */
export const TX_OPTIONS = { maxWait: 15000, timeout: 30000 } as const;
