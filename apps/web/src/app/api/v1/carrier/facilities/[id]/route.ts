import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { getFacility, updateFacility, softDeleteFacility } from '@/lib/carrier/facilities';
import { viewerFromSession } from '@/lib/carrier/facility-visibility';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';

const FacilityUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  facilityType: z.string().optional(),
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    // Section 9: a residence is not fetchable by id either, or the list filter
    // would only be a suggestion.
    const db = await getTenantPrismaForOrg(orgId, session.userId);
    const facility = await getFacility(orgId, id, await viewerFromSession(db, orgId, session));
    if (!facility) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: facility });
  } catch (err) {
    logger.error('GET /api/v1/carrier/facilities/[id] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = FacilityUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const db = await getTenantPrismaForOrg(orgId, session.userId);
    const facility = await updateFacility(
      orgId,
      id,
      parsed.data,
      await viewerFromSession(db, orgId, session),
    );
    if (!facility) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: facility });
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/facilities/[id] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const db = await getTenantPrismaForOrg(orgId, session.userId);
    const result = await softDeleteFacility(
      orgId,
      id,
      await viewerFromSession(db, orgId, session),
    );
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: { id: result.id, status: 'inactive' } });
  } catch (err) {
    logger.error('DELETE /api/v1/carrier/facilities/[id] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
