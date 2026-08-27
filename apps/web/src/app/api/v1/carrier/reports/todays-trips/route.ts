import { NextRequest, NextResponse } from 'next/server';
import { resolveReportAccess } from '@/lib/carrier/report-access';
import { logger } from '@/lib/logger';
import { loadBoardFacts } from '@/lib/carrier/board-lookup';
import {
  applyReportFilters,
  reportFilterOptions,
  todaysTripsReport,
} from '@/lib/carrier/board-view';
import { staffViewer } from '@/lib/carrier/facility-visibility';

/**
 * GET /api/v1/carrier/reports/todays-trips
 *   ?status=&driver_id=&client=&inspection=
 *
 * The same `loadBoardFacts` the live board reads, projected into Section 13's
 * report. Rows arrive pre-sorted by `attentionRank` — failed inspection first —
 * and carry that rank as a plain number so the grid's stock ascending sorter
 * reproduces the default order without a custom comparator.
 *
 * Filter options are derived from the unfiltered rows and returned alongside, so
 * the pickers only ever offer values that exist in this tenant's day.
 */
export async function GET(req: NextRequest) {
  // quick-554: 401 no session / 403 wrong role or missing permission / 403 no tenant.
  // Middleware gates the PAGE at /carrier/reports/...; it never sees this path.
  const access = await resolveReportAccess('performanceReport');
  if (!access.ok) return access.response;
  const { orgId, session } = access;

  try {
    const { searchParams } = req.nextUrl;
    const facts = await loadBoardFacts(orgId, staffViewer(session));
    const all = todaysTripsReport(facts);

    const rows = applyReportFilters(all, {
      status: searchParams.get('status'),
      driverId: searchParams.get('driver_id'),
      clientName: searchParams.get('client'),
      inspection: searchParams.get('inspection'),
    });

    return NextResponse.json({
      data: {
        rows,
        options: reportFilterOptions(all),
        computedAt: facts.now.toISOString(),
      },
    });
  } catch (err) {
    logger.error('GET /api/v1/carrier/reports/todays-trips failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
