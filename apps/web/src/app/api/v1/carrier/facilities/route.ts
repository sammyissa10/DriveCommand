import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { listFacilities, createFacility } from '@/lib/carrier/facilities';
import { viewerFromSession } from '@/lib/carrier/facility-visibility';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';

const FacilityCreateSchema = z.object({
  name: z.string().min(1),
  facilityType: z.enum(['terminal', 'yard', 'warehouse', 'drop_yard', 'customer_site']).optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional(),
  lumperRequired: z.boolean().optional(),
  appointmentRequired: z.boolean().optional(),
  contacts: z.array(z.object({
    name: z.string(),
    phone: z.string().optional(),
    email: z.string().optional(),
    role: z.string().optional(),
  })).optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { searchParams } = req.nextUrl;
    const facilityType = searchParams.get('facility_type') ?? undefined;
    const search = searchParams.get('search') ?? undefined;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10);

    const latRaw = searchParams.get('lat');
    const lngRaw = searchParams.get('lng');
    const radiusRaw = searchParams.get('radius_miles');
    const lat = latRaw != null ? parseFloat(latRaw) : undefined;
    const lng = lngRaw != null ? parseFloat(lngRaw) : undefined;
    const radiusMiles = radiusRaw != null ? parseFloat(radiusRaw) : undefined;

    // The driver-residence rule is applied in the query, not in whatever renders
    // this (spec Section 9). Testing it means calling THIS endpoint as another
    // driver, which is the phase's stated verification.
    const db = await getTenantPrismaForOrg(orgId, session.userId);
    const viewer = await viewerFromSession(db, orgId, session);

    const result = await listFacilities(
      orgId,
      { facilityType, search, lat, lng, radiusMiles, page, pageSize },
      viewer,
    );

    return NextResponse.json({ data: { ...result, page, pageSize } });
  } catch (err) {
    logger.error('GET /api/v1/carrier/facilities failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const body = await req.json();
    const parsed = FacilityCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const facility = await createFacility(orgId, parsed.data);
    return NextResponse.json({ data: facility }, { status: 201 });
  } catch (err) {
    logger.error('POST /api/v1/carrier/facilities failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
