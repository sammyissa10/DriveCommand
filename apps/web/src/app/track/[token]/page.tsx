import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import TrackingPoller, { type TrackingData } from '@/components/tracking/tracking-poller';

export const metadata: Metadata = {
  title: 'Track Shipment | DriveCommand',
};

export default async function TrackShipmentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Query load directly — no auth, no RLS, no tenant context
  const load = await prisma.load.findUnique({
    where: { trackingToken: token },
    include: {
      truck: {
        select: { id: true, make: true, model: true, licensePlate: true },
      },
      driver: {
        select: { firstName: true, lastName: true },
      },
    },
  });

  if (!load) {
    notFound();
  }

  // Fetch latest GPS for the assigned truck
  let latestGPS: TrackingData['latestGPS'] = null;

  if (load.truckId) {
    const gps = await prisma.gPSLocation.findFirst({
      where: { truckId: load.truckId },
      orderBy: { timestamp: 'desc' },
    });
    if (gps) {
      latestGPS = {
        latitude: Number(gps.latitude),
        longitude: Number(gps.longitude),
        speed: gps.speed,
        heading: gps.heading,
        timestamp: gps.timestamp.toISOString(),
      };
    }
  }

  const initialData: TrackingData = {
    status: load.status,
    latestGPS,
    loadNumber: load.loadNumber,
    origin: load.origin,
    destination: load.destination,
    pickupDate: load.pickupDate?.toISOString() ?? null,
    deliveryDate: load.deliveryDate?.toISOString() ?? null,
    truck: load.truck
      ? {
          make: load.truck.make,
          model: load.truck.model,
          licensePlate: load.truck.licensePlate,
        }
      : null,
    driverFirstName: load.driver?.firstName ?? null,
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="text-xl font-bold text-foreground">DriveCommand</span>
          <span className="text-muted-foreground text-sm">/ Shipment Tracking</span>
        </div>
      </header>

      {/* Main content — polling client component handles all live updates */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <TrackingPoller token={token} initialData={initialData} />
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-4 pt-4 pb-8 text-center">
        <p className="text-sm text-muted-foreground">
          Powered by DriveCommand
        </p>
      </footer>
    </div>
  );
}
