import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { loadBoardFacts } from '@/lib/carrier/board-lookup';
import { liveBoardPayload } from '@/lib/carrier/board-view';
import { staffViewer } from '@/lib/carrier/facility-visibility';

/**
 * GET /api/v1/carrier/live-board
 *
 * Both board views in ONE response. Section 13: *"Both views share ONE data
 * source"* — so the Drivers/Trucks toggle is a state change on an array the
 * client already holds, and Phase 11 verify check 1 (toggle with the network
 * tab open → no refetch) passes by construction rather than by a cache setting
 * someone could tune away.
 *
 * This is NOT `/api/v1/carrier/live-map/trips`, which is named "carrier" and
 * queries the legacy `Route` model. The board reads `dispatches` — the tables
 * Document Import actually commits to.
 */
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    // Section 9: a trip's stops can include a DRIVER_RESIDENCE end stop, so the
    // viewer is required. `staffViewer` is correct here because this route is
    // owner-portal only — see its own note on why it skips the driver lookup.
    const facts = await loadBoardFacts(orgId, staffViewer(session));
    return NextResponse.json({ data: liveBoardPayload(facts) });
  } catch (err) {
    logger.error('GET /api/v1/carrier/live-board failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
