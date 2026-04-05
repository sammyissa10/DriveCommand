import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/carrier/driver/dispatches/[id]
 *
 * Returns full detail for a single dispatch, including all stops with facility
 * addresses and documents, plus the driver's expenses for this dispatch.
 *
 * Only returns the dispatch if the authenticated driver is the primary or co-driver.
 *
 * Requires: Authorization: Bearer <token>
 */
export async function GET(
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

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     *        Filtered to a single dispatch where the user is primary or co-driver.
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const carrierDriver = await tx.carrierDriver.findFirst({
        where: { userId: auth.userId, orgId: auth.tenantId },
      });

      if (!carrierDriver) {
        return { type: 'no_driver' as const };
      }

      const dispatch = await tx.carrierDispatch.findFirst({
        where: {
          id,
          orgId: auth.tenantId,
          OR: [
            { primaryDriverId: carrierDriver.id },
            { coDriverId: carrierDriver.id },
          ],
        },
        include: {
          truck: {
            select: {
              id: true,
              unitNumber: true,
              make: true,
              model: true,
              year: true,
              licensePlate: true,
            },
          },
          trailer: { select: { id: true, unitNumber: true } },
          stops: {
            orderBy: { sequenceOrder: 'asc' },
            include: {
              facility: true,
              documents: {
                select: {
                  id: true,
                  documentType: true,
                  filename: true,
                  fileUrl: true,
                  createdAt: true,
                },
              },
            },
          },
          expenses: {
            where: { driverId: carrierDriver.id },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              expenseType: true,
              amount: true,
              currency: true,
              notes: true,
              createdAt: true,
              reimbursable: true,
            },
          },
        },
      });

      if (!dispatch) {
        return { type: 'not_found' as const };
      }

      return { type: 'found' as const, dispatch };
    }, TX_OPTIONS);

    if (result.type === 'no_driver') {
      return NextResponse.json({ error: 'No carrier driver profile found' }, { status: 404 });
    }

    if (result.type === 'not_found') {
      return NextResponse.json({ error: 'Dispatch not found' }, { status: 404 });
    }

    const { dispatch } = result;

    const mapped = {
      id: dispatch.id,
      dispatchNumber: 'DSP-' + dispatch.id.slice(0, 8).toUpperCase(),
      status: dispatch.status,
      scheduledDeparture: dispatch.scheduledDeparture,
      actualDeparture: dispatch.actualDeparture,
      scheduledArrival: dispatch.scheduledArrival,
      actualArrival: dispatch.actualArrival,
      plannedMiles: dispatch.plannedMiles,
      actualMiles: dispatch.actualMiles,
      notes: dispatch.notes,
      truck: {
        unitNumber: dispatch.truck.unitNumber,
        make: dispatch.truck.make,
        model: dispatch.truck.model,
        year: dispatch.truck.year,
        licensePlate: dispatch.truck.licensePlate,
      },
      trailer: dispatch.trailer
        ? { unitNumber: dispatch.trailer.unitNumber }
        : null,
      stops: dispatch.stops.map((stop) => {
        const uploadedDocTypes = stop.documents.map((d) =>
          d.documentType.toUpperCase()
        );
        return {
          id: stop.id,
          sequenceOrder: stop.sequenceOrder,
          stopType: stop.stopType,
          status: stop.status,
          appointmentStart: stop.appointmentStart,
          appointmentEnd: stop.appointmentEnd,
          arrivedAt: stop.arrivedAt,
          departedAt: stop.departedAt,
          contactName: stop.contactName,
          contactPhone: stop.contactPhone,
          specialInstructions: stop.specialInstructions,
          bolRequired: stop.bolRequired,
          bolUploaded: uploadedDocTypes.includes('BOL'),
          podRequired: stop.podRequired,
          podUploaded: uploadedDocTypes.includes('POD'),
          bolNumber: stop.bolNumber,
          podNumber: stop.podNumber,
          sealNumber: stop.sealNumber,
          facility: {
            name: stop.facility.name,
            addressLine1: stop.facility.addressLine1,
            city: stop.facility.city,
            state: stop.facility.state,
            zip: stop.facility.zip,
            latitude: stop.facility.latitude ?? null,
            longitude: stop.facility.longitude ?? null,
          },
          documents: stop.documents.map((doc) => ({
            id: doc.id,
            documentType: doc.documentType,
            filename: doc.filename,
            fileUrl: doc.fileUrl,
            createdAt: doc.createdAt,
          })),
        };
      }),
      expenses: dispatch.expenses.map((exp) => ({
        id: exp.id,
        expenseType: exp.expenseType,
        amount: exp.amount,
        currency: exp.currency,
        notes: exp.notes,
        createdAt: exp.createdAt,
        reimbursable: exp.reimbursable,
      })),
    };

    return NextResponse.json(mapped);
  } catch (err) {
    logger.error('[mobile/carrier/driver/dispatches/[id]] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
