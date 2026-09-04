import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
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
     * quick-588: tenant-scoped client (getTenantPrismaForOrg — /api/mobile/*
     * sends no x-tenant-id header, per DEC-11, so the header-reading
     * getTenantPrisma() would throw). CarrierDriver, Trip and their nested
     * CarrierStop/CarrierDocument/CarrierExpense relations are all
     * EXEMPT_MODELS, so this swap is receiver-only and the emitted SQL is
     * unchanged. Scoping is still validateMobileToken()'s verified
     * auth.tenantId/auth.userId in every query's where clause, unchanged
     * from before this conversion.
     */
    const tenantPrisma = await getTenantPrismaForOrg(auth.tenantId, auth.userId);
    const result = await tenantPrisma.$transaction(async (tx) => {
      const carrierDriver = await tx.carrierDriver.findFirst({
        where: { userId: auth.userId, orgId: auth.tenantId },
      });

      if (!carrierDriver) {
        return { type: 'no_driver' as const };
      }

      const dispatch = await tx.trip.findFirst({
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
              paidBy: true,
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
        paidBy: exp.paidBy,
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
