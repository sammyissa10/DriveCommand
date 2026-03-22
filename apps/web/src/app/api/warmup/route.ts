import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic'; // Prevent Next.js caching

export async function GET(request: NextRequest) {
  // Verify CRON_SECRET bearer token
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedAuth) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Lightweight DB check — confirms connection is live without touching tenant data
  await prisma.$queryRaw`SELECT 1`;

  console.log('[WARMUP] Pinged successfully');

  return Response.json({ ok: true, timestamp: new Date().toISOString() });
}
