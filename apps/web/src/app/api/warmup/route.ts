import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';

export const dynamic = 'force-dynamic'; // Prevent Next.js caching

export async function GET(request: NextRequest) {
  // Verify CRON_SECRET bearer token (timing-safe comparison)
  if (!verifyCronSecret(request)) {
    return cronUnauthorizedResponse();
  }

  // Lightweight DB check — confirms connection is live without touching tenant data
  await prisma.$queryRaw`SELECT 1`;

  logger.info('[WARMUP] Pinged successfully');

  return Response.json({ ok: true, timestamp: new Date().toISOString() });
}
