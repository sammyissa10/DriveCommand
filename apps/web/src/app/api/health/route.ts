import { NextResponse } from 'next/server';

// Force dynamic so this is never statically cached — uptime monitors need live responses
export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * Lightweight health check for uptime monitors (Better Uptime, UptimeRobot, etc.).
 * No DB calls, no auth checks. Listed in PUBLIC_PATHS so middleware skips
 * Supabase session creation entirely — keeps cold-start latency minimal.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    ts: Date.now(),
    version: process.env.npm_package_version ?? 'unknown',
  });
}
