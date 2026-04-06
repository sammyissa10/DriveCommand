import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { getClient, updateClient, softDeleteClient } from '@/lib/carrier/clients';

const ClientUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  dbaName: z.string().optional(),
  mcNumber: z.string().optional(),
  dotNumber: z.string().optional(),
  taxId: z.string().optional(),
  primaryContact: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  portalAccess: z.boolean().optional(),
  portalEmail: z.string().email().optional(),
  paymentTerms: z.number().int().optional(),
  creditLimit: z.union([z.string(), z.number()]).optional().nullable(),
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
    const client = await getClient(orgId, id);
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: client });
  } catch (err) {
    logger.error('GET /api/v1/carrier/clients/[id] failed', err);
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
    const parsed = ClientUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const client = await updateClient(orgId, id, parsed.data);
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: client });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error('PATCH /api/v1/carrier/clients/[id] failed', err);
    return NextResponse.json(
      { error: 'Internal server error', detail: process.env.NODE_ENV !== 'production' ? detail : undefined },
      { status: 500 }
    );
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
    const result = await softDeleteClient(orgId, id);
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: { id: result.id, status: 'inactive' } });
  } catch (err) {
    logger.error('DELETE /api/v1/carrier/clients/[id] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
