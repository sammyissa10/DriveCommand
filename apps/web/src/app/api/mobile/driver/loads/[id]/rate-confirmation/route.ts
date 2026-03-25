import React from 'react';
import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { renderToBuffer } from '@react-pdf/renderer';
import { RateConfirmationDocument, type RateConfirmationData } from '@/lib/pdf/rate-confirmation';

/**
 * GET /api/mobile/driver/loads/[id]/rate-confirmation
 *
 * Generates a rate confirmation PDF for a load and returns it as base64.
 * Replicates the same PDF generation logic used by the owner portal action,
 * but protected by mobile driver auth instead of server-side session.
 *
 * Only available for loads in: DISPATCHED, PICKED_UP, IN_TRANSIT, DELIVERED
 *
 * Response: { pdf: base64String, filename: string }
 *
 * Requires: Authorization: Bearer <token>
 */

const ELIGIBLE_STATUSES = ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const { id } = await params;
  const { driverId, tenantId } = auth;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Fetch load with PDF generation includes
      const load = await tx.load.findUnique({
        where: { id, tenantId },
        include: {
          customer: true,
          driver: { select: { firstName: true, lastName: true } },
          truck: { select: { year: true, make: true, model: true, licensePlate: true } },
        },
      });

      if (!load) return { error: 'Load not found', status: 404 };

      // Security: verify load belongs to authenticated driver
      if (load.driverId !== driverId) return { error: 'Forbidden', status: 403 };

      // Validate status eligibility
      if (!ELIGIBLE_STATUSES.includes(load.status as string)) {
        return {
          error: `Rate confirmations are only available for loads in: ${ELIGIBLE_STATUSES.join(', ')}`,
          status: 400,
        };
      }

      return { load, status: 200 };
    }, TX_OPTIONS);

    if ('error' in result && result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const load = result.load!;

    // Build driver name
    const driverName =
      load.driver
        ? `${load.driver.firstName ?? ''} ${load.driver.lastName ?? ''}`.trim() || 'Unassigned'
        : 'Unassigned';

    // Build truck info
    const truckInfo =
      load.truck
        ? `${load.truck.year} ${load.truck.make} ${load.truck.model} - ${load.truck.licensePlate}`
        : 'Unassigned';

    // Format dates
    const formatDate = (d: Date | null | undefined): string => {
      if (!d) return '';
      return new Date(d).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    };

    const data: RateConfirmationData = {
      loadNumber: load.loadNumber,
      origin: load.origin,
      destination: load.destination,
      pickupDate: formatDate(load.pickupDate),
      deliveryDate: load.deliveryDate ? formatDate(load.deliveryDate) : undefined,
      commodity: load.commodity ?? undefined,
      rate: Number(load.rate).toFixed(2),
      driverName,
      truckInfo,
      customerName: load.customer.companyName,
      customerEmail: load.customer.email ?? undefined,
      documentDate: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    };

    // Render PDF to buffer. We use React.createElement to avoid JSX in a .ts file.
    // Cast through any to satisfy TypeScript's strict generic constraint on ReactElement<DocumentProps>.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = React.createElement(RateConfirmationDocument, { data }) as any;
    const buffer = await renderToBuffer(element);
    const base64 = Buffer.from(buffer).toString('base64');

    return NextResponse.json({
      pdf: base64,
      filename: `RateConfirmation-${load.loadNumber}.pdf`,
    });
  } catch (err) {
    console.error('[mobile/driver/loads/[id]/rate-confirmation] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
