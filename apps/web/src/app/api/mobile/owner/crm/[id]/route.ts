import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/owner/crm/[id]
 *
 * Returns full detail for a single CRM customer belonging to the owner's tenant.
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
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

      const customer = await tx.customer.findFirst({
        where: { id, tenantId },
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          priority: true,
          status: true,
          notes: true,
          emailNotifications: true,
          totalLoads: true,
          totalRevenue: true,
          lastLoadDate: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!customer) return null;

      return {
        id: customer.id,
        companyName: customer.companyName,
        contactName: customer.contactName,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        zipCode: customer.zipCode,
        priority: customer.priority,
        status: customer.status,
        notes: customer.notes,
        emailNotifications: customer.emailNotifications,
        totalLoads: customer.totalLoads,
        totalRevenue: Number(customer.totalRevenue),
        lastLoadDate: customer.lastLoadDate?.toISOString() ?? null,
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
      };
    }, TX_OPTIONS);

    if (!result) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.error('[mobile/owner/crm/[id] GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/mobile/owner/crm/[id]
 *
 * Updates an existing CRM customer. Accepts partial updates — only provided fields are changed.
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function PATCH(
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

  let body: {
    companyName?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    priority?: string;
    status?: string;
    notes?: string;
    emailNotifications?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validation
  if (body.companyName !== undefined) {
    if (typeof body.companyName !== 'string' || !body.companyName.trim()) {
      return NextResponse.json({ error: 'companyName must be a non-empty string' }, { status: 400 });
    }
  }

  const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'VIP'];
  if (body.priority !== undefined && !validPriorities.includes(body.priority)) {
    return NextResponse.json({ error: `priority must be one of: ${validPriorities.join(', ')}` }, { status: 400 });
  }

  const validStatuses = ['ACTIVE', 'INACTIVE', 'PROSPECT'];
  if (body.status !== undefined && !validStatuses.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
  }

  // Build update data — only include fields that were provided
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {};
  if (body.companyName !== undefined) updateData.companyName = body.companyName.trim();
  if (body.contactName !== undefined) updateData.contactName = body.contactName;
  if (body.email !== undefined) updateData.email = body.email;
  if (body.phone !== undefined) updateData.phone = body.phone;
  if (body.address !== undefined) updateData.address = body.address;
  if (body.city !== undefined) updateData.city = body.city;
  if (body.state !== undefined) updateData.state = body.state;
  if (body.zipCode !== undefined) updateData.zipCode = body.zipCode;
  if (body.priority !== undefined) updateData.priority = body.priority;
  if (body.status !== undefined) updateData.status = body.status;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.emailNotifications !== undefined) updateData.emailNotifications = body.emailNotifications;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No fields provided to update' }, { status: 400 });
  }

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

      // First confirm the record belongs to this tenant
      const existing = await tx.customer.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!existing) return null;

      const customer = await tx.customer.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
          phone: true,
          address: true,
          city: true,
          state: true,
          zipCode: true,
          priority: true,
          status: true,
          notes: true,
          emailNotifications: true,
          totalLoads: true,
          totalRevenue: true,
          lastLoadDate: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        id: customer.id,
        companyName: customer.companyName,
        contactName: customer.contactName,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        state: customer.state,
        zipCode: customer.zipCode,
        priority: customer.priority,
        status: customer.status,
        notes: customer.notes,
        emailNotifications: customer.emailNotifications,
        totalLoads: customer.totalLoads,
        totalRevenue: Number(customer.totalRevenue),
        lastLoadDate: customer.lastLoadDate?.toISOString() ?? null,
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
      };
    }, TX_OPTIONS);

    if (!result) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.error('[mobile/owner/crm/[id] PATCH] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
