import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { getExpense, updateExpense, deleteExpense } from '@/lib/carrier/expenses';

const ExpenseUpdateSchema = z.object({
  dispatchId: z.string().uuid().optional(),
  loadId: z.string().uuid().optional(),
  stopId: z.string().uuid().optional(),
  driverId: z.string().uuid().optional(),
  expenseType: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  currency: z.string().optional(),
  paidBy: z.string().min(1).optional(),
  notes: z.string().optional(),
  receiptDocumentId: z.string().uuid().optional(),
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
    const expense = await getExpense(orgId, id);
    if (!expense) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: expense });
  } catch (err) {
    logger.error('GET /api/v1/carrier/expenses/[id] failed', err);
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
    const parsed = ExpenseUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const updated = await updateExpense(orgId, id, parsed.data);
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: updated });
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/expenses/[id] failed', err);
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
    const result = await deleteExpense(orgId, id);
    if (result === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ data: { deleted: true } });
  } catch (err) {
    logger.error('DELETE /api/v1/carrier/expenses/[id] failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
