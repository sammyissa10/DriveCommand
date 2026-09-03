import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const VALID_EXPENSE_TYPES = [
  'fuel',
  'tolls',
  'scales',
  'lumper',
  'parking',
  'maintenance_emergency',
  'driver_advance',
  'other',
] as const;

const VALID_PAID_BY = [
  'driver_cash',
  'company_card',
  'fuel_card',
  'driver_advance',
] as const;

/**
 * POST /api/mobile/carrier/driver/dispatches/[id]/expenses
 *
 * Creates a new CarrierExpense record for the authenticated driver on this dispatch.
 *
 * Body: { expenseType, amount, paidBy, stopId?, reimbursable, notes? }
 *
 * Requires: Authorization: Bearer <token>
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'DRIVER') {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    expenseType,
    amount,
    paidBy,
    stopId,
    reimbursable,
    notes,
  } = body as Record<string, unknown>;

  // Validate expenseType
  if (!expenseType || !VALID_EXPENSE_TYPES.includes(expenseType as typeof VALID_EXPENSE_TYPES[number])) {
    return NextResponse.json(
      { error: `expenseType must be one of: ${VALID_EXPENSE_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  // Validate amount
  const amountNum = Number(amount);
  if (!amount || isNaN(amountNum) || amountNum <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  // Validate paidBy
  if (!paidBy || !VALID_PAID_BY.includes(paidBy as typeof VALID_PAID_BY[number])) {
    return NextResponse.json(
      { error: `paidBy must be one of: ${VALID_PAID_BY.join(', ')}` },
      { status: 400 }
    );
  }

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     *        Filtered to a single dispatch where the user is primary or co-driver.
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const tenantPrisma = await getTenantPrismaForOrg(auth.tenantId, auth.userId);
    const result = await tenantPrisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const carrierDriver = await tx.carrierDriver.findFirst({
        where: { userId: auth.userId, orgId: auth.tenantId },
      });

      if (!carrierDriver) {
        return { type: 'no_driver' as const };
      }

      // Verify dispatch exists and belongs to this driver
      const dispatch = await tx.trip.findFirst({
        where: {
          id,
          orgId: auth.tenantId,
          OR: [
            { primaryDriverId: carrierDriver.id },
            { coDriverId: carrierDriver.id },
          ],
        },
        select: { id: true },
      });

      if (!dispatch) {
        return { type: 'not_found' as const };
      }

      // If stopId provided, verify stop belongs to this dispatch
      if (stopId) {
        const stop = await tx.carrierStop.findFirst({
          where: { id: stopId as string, dispatchId: id },
          select: { id: true },
        });
        if (!stop) {
          return { type: 'stop_not_found' as const };
        }
      }

      const expense = await tx.carrierExpense.create({
        data: {
          dispatchId: id,
          expenseType: expenseType as string,
          amount: amountNum,
          currency: 'USD',
          paidBy: paidBy as string,
          driverId: carrierDriver.id,
          reimbursable: Boolean(reimbursable),
          notes: notes ? (notes as string) : null,
          stopId: stopId ? (stopId as string) : null,
          orgId: auth.tenantId,
          submittedAt: new Date(),
        },
        select: {
          id: true,
          expenseType: true,
          amount: true,
          currency: true,
          notes: true,
          createdAt: true,
          reimbursable: true,
        },
      });

      return { type: 'created' as const, expense };
    }, TX_OPTIONS);

    if (result.type === 'no_driver') {
      return NextResponse.json({ error: 'No carrier driver profile found' }, { status: 404 });
    }

    if (result.type === 'not_found') {
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 });
    }

    if (result.type === 'stop_not_found') {
      return NextResponse.json({ error: 'Stop not found on this dispatch' }, { status: 404 });
    }

    return NextResponse.json(result.expense, { status: 201 });
  } catch (err) {
    logger.error('[mobile/carrier/driver/dispatches/[id]/expenses] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
