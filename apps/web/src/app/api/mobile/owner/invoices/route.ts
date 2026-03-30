import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/owner/invoices
 *
 * Returns invoice stats and recent invoices for the authenticated owner's tenant.
 * Invoice does not have a direct customer relation in the schema, so customer name
 * is resolved via a separate customer lookup by customerId.
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function GET(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     *        Driver endpoints additionally filter by driverId (= auth.userId for DRIVER role).
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const invoices = await tx.invoice.findMany({
        where: { tenantId, archivedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          totalAmount: true,
          customerId: true,
          dueDate: true,
          createdAt: true,
        },
      });

      // Collect unique customerIds and look them up
      const customerIds = [...new Set(invoices.map((i) => i.customerId).filter(Boolean))] as string[];
      const customers = customerIds.length > 0
        ? await tx.customer.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, companyName: true },
          })
        : [];
      const customerMap = new Map(customers.map((c) => [c.id, c.companyName]));

      // Stats — pull all invoices for accurate counts (not limited to 20)
      const allInvoices = await tx.invoice.findMany({
        where: { tenantId, archivedAt: null },
        select: { status: true, totalAmount: true },
      });

      const stats = {
        total: allInvoices.length,
        draft: allInvoices.filter((i) => i.status === 'DRAFT').length,
        overdue: allInvoices.filter((i) => i.status === 'OVERDUE').length,
        outstandingAmount: allInvoices
          .filter((i) => i.status === 'SENT' || i.status === 'OVERDUE')
          .reduce((sum, i) => sum + Number(i.totalAmount), 0),
        paidAmount: allInvoices
          .filter((i) => i.status === 'PAID')
          .reduce((sum, i) => sum + Number(i.totalAmount), 0),
      };

      const invoiceList = invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        totalAmount: Number(inv.totalAmount),
        customerName: inv.customerId ? (customerMap.get(inv.customerId) ?? 'Unknown Customer') : 'No Customer',
        dueDate: inv.dueDate ? inv.dueDate.toISOString() : null,
        createdAt: inv.createdAt.toISOString(),
      }));

      return { stats, invoices: invoiceList };
    }, TX_OPTIONS);

    return NextResponse.json(result);
  } catch (err) {
    logger.error('[mobile/owner/invoices] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/mobile/owner/invoices
 *
 * Creates a new draft invoice for the owner's tenant.
 *
 * Body: { customerId?, description, amount, dueDate? }
 * Returns: { invoice: { id, invoiceNumber } } with status 201
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId, userId } = auth;

  let body: { customerId?: string; description?: string; amount?: number; dueDate?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const description = body.description?.trim();
  if (!description) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: 'amount must be a number greater than 0' }, { status: 400 });
  }

  const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoiceData: any = {
        tenantId,
        invoiceNumber,
        status: 'DRAFT',
        amount,
        tax: 0,
        totalAmount: amount,
        issueDate: new Date(),
        createdById: userId,
        updatedById: userId,
        items: {
          create: [{ tenantId, description, quantity: 1, unitPrice: amount, amount }],
        },
      };
      if (body.customerId) invoiceData.customerId = body.customerId;
      if (body.dueDate) invoiceData.dueDate = new Date(body.dueDate);

      return tx.invoice.create({ data: invoiceData, select: { id: true, invoiceNumber: true } });
    }, TX_OPTIONS);

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (err) {
    logger.error('[mobile/owner/invoices POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
