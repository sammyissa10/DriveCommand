'use server';

import { getTenantPrisma } from '@/lib/context/tenant-context';
import { renderToBuffer } from '@react-pdf/renderer';
import { RateConfirmationDocument, RateConfirmationData } from '@/lib/pdf/rate-confirmation';

const ELIGIBLE_STATUSES = ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'] as const;

/**
 * Generate a rate confirmation PDF for a load and return it as a base64-encoded string.
 *
 * @param loadId - UUID of the load to generate the PDF for
 * @returns { pdf: base64String, filename: string }
 * @throws If load not found or not in eligible status
 */
export async function generateRateConfirmationPDF(
  loadId: string
): Promise<{ pdf: string; filename: string }> {
  const prisma = await getTenantPrisma();

  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      customer: true,
      driver: { select: { firstName: true, lastName: true } },
      truck: { select: { year: true, make: true, model: true, licensePlate: true } },
    },
  });

  if (!load) {
    throw new Error('Load not found.');
  }

  if (!ELIGIBLE_STATUSES.includes(load.status as (typeof ELIGIBLE_STATUSES)[number])) {
    throw new Error(
      `Rate confirmations can only be generated for loads with status: ${ELIGIBLE_STATUSES.join(', ')}.`
    );
  }

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

  // RateConfirmationDocument returns a <Document> element which is what renderToBuffer expects.
  // We cast through unknown to satisfy TypeScript's strict generic constraint on ReactElement<DocumentProps>.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = <RateConfirmationDocument data={data} /> as any;
  const buffer = await renderToBuffer(element);
  const base64 = Buffer.from(buffer).toString('base64');

  return {
    pdf: base64,
    filename: `RateConfirmation-${load.loadNumber}.pdf`,
  };
}
