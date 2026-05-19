import { after, NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { listClients, createClient } from '@/lib/carrier/clients';
import { recordActivationEvent } from '@/lib/onboarding/activation-tracker';

const ClientCreateSchema = z.object({
  name: z.string().min(1),
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

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get('status') ?? undefined;
    const search = searchParams.get('search') ?? undefined;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10);

    // Parse sort (format: "field:direction")
    const sortParam = searchParams.get('sort');
    let sort: { field: string; direction: 'asc' | 'desc' } | undefined;
    if (sortParam) {
      const [field, direction] = sortParam.split(':');
      if (field && (direction === 'asc' || direction === 'desc')) {
        sort = { field, direction };
      }
    }

    // Parse filters (JSON array)
    const filtersParam = searchParams.get('filters');
    let filters;
    if (filtersParam) {
      try {
        filters = JSON.parse(filtersParam);
      } catch {
        // Ignore parse errors
      }
    }

    const result = await listClients(orgId, { status, search, page, pageSize, sort, filters });

    return NextResponse.json({ data: { ...result, page, pageSize } });
  } catch (err) {
    logger.error('GET /api/v1/carrier/clients failed', err);
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
    const parsed = ClientCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.message, details: parsed.error.issues },
        { status: 400 }
      );
    }

    const client = await createClient(orgId, parsed.data);

    after(async () => {
      if (!client.isSample) {
        try {
          await recordActivationEvent(orgId, 'first_real_client');
        } catch (err) {
          logger.error('[carrier/clients] activation tracker failed', { clientId: client.id, err });
        }
      }
    });

    return NextResponse.json({ data: client }, { status: 201 });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error('POST /api/v1/carrier/clients failed', err);
    return NextResponse.json(
      { error: 'Internal server error', detail: process.env.NODE_ENV !== 'production' ? detail : undefined },
      { status: 500 }
    );
  }
}
