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
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { verifyCronSecret } from '@/lib/security/cron-auth';

export async function POST(request: NextRequest) {
  try {
    let tenantId: string | undefined;

    // Auth: check CRON_SECRET first (timing-safe), then fall back to session
    if (verifyCronSecret(request)) {
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
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     *        Driver endpoints additionally filter by driverId (= auth.userId for DRIVER role).
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
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
    logger.error('[Motive Sync] Error:', error);
    return NextResponse.json(
      { error: 'Sync failed' },
      { status: 500 }
    );
  }
}
