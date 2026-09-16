import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/owner/customers
 *
 * Returns all active customers for the owner's tenant.
 * Used by create-load form for the customer picker dropdown.
 *
 * Returns: Array<{ id: string; name: string }>
 * Sorted by name asc.
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
    /*
     * quick-617: tenant-scoped client. /api/mobile/* sends no x-tenant-id
     * (DEC-11), so the header-reading getTenantPrisma() would throw.
     * userId is deliberately NOT passed — it would make the audit-columns
     * extension start writing createdById/updatedById, a behaviour change
     * this routing task declines to make. Every where clause is unchanged:
     * RLS is the second layer, not a replacement for the first.
     */
    const tenantPrisma = await getTenantPrismaForOrg(tenantId);
    const customers = await tenantPrisma.$transaction(async (tx) => {
      return tx.customer.findMany({
        where: { tenantId },
        select: { id: true, companyName: true },
        orderBy: { companyName: 'asc' },
      });
    }, TX_OPTIONS);

    return NextResponse.json(
      customers.map((c) => ({ id: c.id, name: c.companyName }))
    );
  } catch (err) {
    logger.error('[mobile/owner/customers] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/mobile/owner/customers
 *
 * Creates a new customer for the owner's tenant.
 *
 * Body: { companyName, contactName?, email?, phone? }
 * Returns: { customer: { id, companyName } } with status 201
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

  const { tenantId } = auth;

  let body: { companyName?: string; contactName?: string; email?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const companyName = body.companyName?.trim();
  if (!companyName) {
    return NextResponse.json({ error: 'companyName is required' }, { status: 400 });
  }

  try {
    // quick-617: tenant-scoped client — see the first handler in this file.
    const tenantPrisma = await getTenantPrismaForOrg(tenantId);
    const customer = await tenantPrisma.$transaction(async (tx) => {
      return tx.customer.create({
        data: {
          tenantId,
          companyName,
          contactName: body.contactName?.trim() || null,
          email: body.email?.trim() || null,
          phone: body.phone?.trim() || null,
          status: 'ACTIVE',
          priority: 'MEDIUM',
        },
        select: { id: true, companyName: true },
      });
    }, TX_OPTIONS);

    return NextResponse.json({ customer }, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'A customer with this name already exists' }, { status: 409 });
    }
    logger.error('[mobile/owner/customers POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
