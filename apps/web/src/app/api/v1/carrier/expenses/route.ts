import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { listExpenses, createExpense } from '@/lib/carrier/expenses';

const ExpenseCreateSchema = z
  .object({
    dispatchId: z.string().uuid().optional(),
    loadId: z.string().uuid().optional(),
    stopId: z.string().uuid().optional(),
    driverId: z.string().uuid().optional(),
    expenseType: z.string().min(1),
    amount: z.number().positive(),
    currency: z.string().optional().default('USD'),
    paidBy: z.string().min(1),
    notes: z.string().optional(),
    receiptDocumentId: z.string().uuid().optional(),
  })
  .refine((data) => !!data.dispatchId || !!data.loadId, {
    message: 'At least one of dispatchId or loadId is required',
  });

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { searchParams } = req.nextUrl;
    const dispatchId = searchParams.get('dispatch_id') ?? undefined;
    const loadId = searchParams.get('load_id') ?? undefined;
    const stopId = searchParams.get('stop_id') ?? undefined;
    const driverId = searchParams.get('driver_id') ?? undefined;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10);

    const result = await listExpenses(orgId, { dispatchId, loadId, stopId, driverId, page, pageSize });
    return NextResponse.json({ data: { ...result, page, pageSize } });
  } catch (err) {
    logger.error('GET /api/v1/carrier/expenses failed', err);
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
    const parsed = ExpenseCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const result = await createExpense(orgId, parsed.data);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    logger.error('POST /api/v1/carrier/expenses failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
