/**
 * POST /api/integrations/motive/sync
 *
 * Triggers a Motive (KeepTruckin) GPS location sync for a tenant.
 *
 * Auth: Either CRON_SECRET bearer token (for automated/cron use)
 * or a valid OWNER session (for manual "Sync Now" from UI).
 */

import { NextRequest, NextResponse } from 'next/server';
import { syncMotiveLocations } from '@/lib/integrations/motive';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { getSession } from '@/lib/auth/session';

export async function POST(request: NextRequest) {
  try {
    let tenantId: string | undefined;

    // Auth: check CRON_SECRET first, then fall back to session
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      // Cron mode: tenantId must be in request body
      const body = await request.json().catch(() => ({}));
      tenantId = body.tenantId;
      if (!tenantId) {
        return NextResponse.json(
          { error: 'tenantId required in body for cron-authenticated requests' },
          { status: 400 }
        );
      }
    } else {
      // Session mode: derive tenantId from user session
      const session = await getSession();
      if (!session || session.role !== 'OWNER') {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
      tenantId = session.tenantId;
    }

    // Look up enabled Motive integration for this tenant (bypass RLS)
    const integration = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.tenantIntegration.findFirst({
        where: {
          tenantId,
          provider: 'KEEP_TRUCKIN',
          enabled: true,
        },
      });
    }, TX_OPTIONS);

    if (!integration) {
      return NextResponse.json(
        { error: 'Motive integration not enabled' },
        { status: 404 }
      );
    }

    // Extract API token from configJson
    const configJson = integration.configJson as Record<string, string> | null;
    const apiToken = configJson?.apiToken;

    if (!apiToken) {
      return NextResponse.json(
        { error: 'Motive API token not configured' },
        { status: 400 }
      );
    }

    // Run sync
    const result = await syncMotiveLocations(tenantId, apiToken);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Motive Sync] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    );
  }
}
