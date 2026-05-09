import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { getContract, updateContract, softDeleteContract } from '@/lib/carrier/contracts';

const ContractUpdateSchema = z.object({
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
  status: z.enum(['active', 'expired', 'cancelled', 'draft']).optional(),
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
    const contract = await getContract(orgId, id);
    if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: contract });
  } catch (err) {
    logger.error('GET /api/v1/carrier/contracts/[id] failed', err);
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
    const parsed = ContractUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const contract = await updateContract(orgId, id, parsed.data);
    if (!contract) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: contract });
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/contracts/[id] failed', err);
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
    const result = await softDeleteContract(orgId, id);
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: { id: result.id, status: 'cancelled' } });
  } catch (err) {
    logger.error('DELETE /api/v1/carrier/contracts/[id] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
