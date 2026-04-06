import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { listContracts, createContract } from '@/lib/carrier/contracts';

const ContractCreateSchema = z.object({
  clientId: z.string().uuid(),
  contractName: z.string().optional(),
  contractType: z.enum(['spot', 'contract', 'dedicated']).optional(),
  effectiveDate: z.string().optional(),
  expirationDate: z.string().optional(),
  rateType: z.enum(['per_mile', 'flat', 'per_load', 'hourly']).optional(),
  baseRate: z.string().optional(),
  fuelSurchargeRate: z.string().optional(),
  fuelSurchargeMethod: z.enum(['none', 'percentage', 'per_mile', 'table']).optional(),
  detentionFreeMinutes: z.coerce.number().int().optional(),
  detentionRatePerHour: z.string().optional(),
  tonuRate: z.string().optional(),
  layoverRatePerDay: z.string().optional(),
  paymentTermsOverride: z.enum(['net_15', 'net_30', 'net_45', 'net_60', 'net_90', 'due_on_receipt']).optional(),
  autoRenew: z.boolean().optional(),
  notes: z.string().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { searchParams } = req.nextUrl;
    const clientId = searchParams.get('client_id') ?? undefined;
    const status = searchParams.get('status') ?? undefined;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10);

    const result = await listContracts(orgId, { clientId, status, page, pageSize });

    return NextResponse.json({ data: { ...result, page, pageSize } });
  } catch (err) {
    logger.error('GET /api/v1/carrier/contracts failed', err);
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
    const parsed = ContractCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { clientId, ...contractData } = parsed.data;
    const contract = await createContract(orgId, clientId, contractData);

    return NextResponse.json({ data: contract }, { status: 201 });
  } catch (err) {
    logger.error('POST /api/v1/carrier/contracts failed', err);
    const detail = process.env.NODE_ENV === 'development'
      ? (err instanceof Error ? err.message : String(err))
      : 'Internal server error';
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}
