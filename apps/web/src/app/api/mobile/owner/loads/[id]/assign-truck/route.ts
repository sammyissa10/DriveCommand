import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

/**
 * PATCH /api/mobile/owner/loads/[id]/assign-truck
 *
 * Assigns or unassigns a truck on a load.
 * Body: { truckId: string | null }
 *
 * - If truckId is provided, verifies the truck exists and belongs to the same tenant.
 * - If truckId is null, unassigns the truck from the load.
 * - Returns 403 if not owner, 404 if load or truck not found.
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

  const { id } = await params;
  const { tenantId } = auth;

  let body: { truckId: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { truckId } = body;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Verify load exists and belongs to tenant
      const existingLoad = await tx.load.findUnique({
        where: { id, tenantId },
        select: { id: true },
      });

      if (!existingLoad) {
        return null;
      }

      // If truckId is provided, verify truck exists and belongs to same tenant
      if (truckId !== null && truckId !== undefined) {
        const truck = await tx.truck.findUnique({
          where: { id: truckId },
          select: { id: true, tenantId: true },
        });

        if (!truck || truck.tenantId !== tenantId) {
          return { truckNotFound: true };
        }
      }

      // Update the load
      const updatedLoad = await tx.load.update({
        where: { id, tenantId },
        data: { truckId: truckId ?? null },
        include: {
          truck: {
            select: { id: true, make: true, model: true, licensePlate: true },
          },
        },
      });

      return { load: updatedLoad };
    }, TX_OPTIONS);

    if (!result) {
      return NextResponse.json({ error: 'Load not found' }, { status: 404 });
    }

    if ('truckNotFound' in result) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, load: result.load });
  } catch (err) {
    console.error('[mobile/owner/loads/[id]/assign-truck] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
