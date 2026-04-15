import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { getLatestVehicleLocations } from '@/app/(owner)/live-map/actions';
import { logger } from '@/lib/logger';

/**
 * GET /api/gps/locations
 *
 * Authenticated endpoint returning current vehicle positions for the tenant.
 * Used by legacy integrations. New code should use /api/v1/carrier/live-map/vehicles.
 * Requires OWNER or MANAGER role.
 */
export async function GET() {
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

    // 3. Fetch latest vehicle locations
    const vehicles = await getLatestVehicleLocations();

    return NextResponse.json(vehicles);
  } catch (error) {
    logger.error('GPS locations error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
