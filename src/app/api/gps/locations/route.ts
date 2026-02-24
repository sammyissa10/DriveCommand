import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { UserRole } from '@/lib/auth/roles';
import { getLatestVehicleLocations } from '@/app/(owner)/live-map/actions';

/**
 * GET /api/gps/locations
 *
 * Authenticated endpoint returning current vehicle positions for the tenant.
 * Used by the live map for client-side 30-second polling.
 * Requires OWNER or MANAGER role.
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Authenticate
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 2. Require OWNER or MANAGER role
    if (session.role !== UserRole.OWNER && session.role !== UserRole.MANAGER) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 3. Read optional tagId filter
    const tagId = req.nextUrl.searchParams.get('tagId') ?? undefined;

    // 4. Fetch latest vehicle locations (calls requireRole + tenantRawQuery internally)
    const vehicles = await getLatestVehicleLocations(tagId);

    return NextResponse.json(vehicles);
  } catch (error) {
    console.error('GPS locations error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
