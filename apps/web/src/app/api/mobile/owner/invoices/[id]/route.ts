import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;
  const { id } = await params;

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

      const invoice = await tx.invoice.findFirst({
        where: { id, tenantId, archivedAt: null },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          amount: true,
          tax: true,
          totalAmount: true,
          issueDate: true,
          dueDate: true,
          paidDate: true,
          notes: true,
          customerId: true,
          createdAt: true,
          updatedAt: true,
          createdBy: { select: { firstName: true, lastName: true } },
          updatedBy: { select: { firstName: true, lastName: true } },
          items: {
            select: {
              id: true,
              description: true,
              quantity: true,
              unitPrice: true,
              amount: true,
            },
          },
        },
      });

      if (!invoice) return null;

      const customerName = invoice.customerId
        ? (await tx.customer.findUnique({
            where: { id: invoice.customerId },
            select: { companyName: true },
          }))?.companyName ?? 'Unknown Customer'
        : 'No Customer';

      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        customerName,
        issueDate: invoice.issueDate.toISOString(),
        dueDate: invoice.dueDate.toISOString(),
        paidDate: invoice.paidDate?.toISOString() ?? null,
        notes: invoice.notes ?? null,
        subtotal: Number(invoice.amount),
        tax: Number(invoice.tax),
        totalAmount: Number(invoice.totalAmount),
        items: invoice.items.map((item) => ({
          id: item.id,
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          amount: Number(item.amount),
        })),
        createdByName: invoice.createdBy ? `${invoice.createdBy.firstName ?? ''} ${invoice.createdBy.lastName ?? ''}`.trim() || null : null,
        createdAt: invoice.createdAt.toISOString(),
        updatedByName: invoice.updatedBy ? `${invoice.updatedBy.firstName ?? ''} ${invoice.updatedBy.lastName ?? ''}`.trim() || null : null,
        updatedAt: invoice.updatedAt.toISOString(),
      };
    }, TX_OPTIONS);

    if (!result) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.error('[mobile/owner/invoices/[id]] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
