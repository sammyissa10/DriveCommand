import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getAdminDb } from '@/lib/db/admin-prisma';
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

  /**
   * quick-606 — the PAGE now takes the decision its own API twin took, for the
   * byte-identical query, three files away.
   *
   * WHY IT CANNOT BE TENANT-SCOPED. The caller is an anonymous member of the
   * public: there is no session, and therefore no tenant, until the token
   * resolves one. **The token IS the capability.** So `getTenantPrisma()` cannot
   * serve this page — it would have to throw before the lookup that would tell it
   * which tenant to be.
   *
   * WHY NOT A `SECURITY DEFINER` token→tenant resolver instead. It is the more
   * principled shape and it was rejected: it is DDL, therefore a migration,
   * therefore drift this task would own — and it would create a SECOND mechanism
   * for a lookup that already has an approved, reviewed one in
   * `api/track/[token]/route.ts:26`, with `app_admin` already granted SELECT on
   * exactly `Load`, `GPSLocation`, `Truck` and `User` for this path (verified
   * against `role_table_grants`, not assumed). Leaving the page and its twin
   * disagreeing is itself a defect.
   *
   * THE COST, STATED RATHER THAN BURIED. `app_admin` bypasses RLS, so
   * `unmigrated-path-tripwire.md` §8 item 2 applies: routing this path removes it
   * from the tripwire's reach. That is not a loss here — the tripwire could never
   * have passed on a page with no tenant to set, so what it actually offered was
   * a guaranteed raise. Measured: as `app_user` with the tripwire armed and ONE
   * seeded token, this page answered **HTTP 500 with 2 TC001**
   * (`.planning/quick/606-…/evidence/08-track-probe.json`).
   *
   * Production carries **ZERO** legacy `"Load"` rows with a `trackingToken`
   * (`08-track-liveness.json`), so the feature is not live and nobody is affected
   * today. That makes this change low-risk, not unnecessary: the 500 above is
   * what the first customer-facing tracking link would have produced.
   *
   * It needs an `ADMIN_ALLOWLIST` entry with a call count — rule 2 of the three
   * deliberate edits — and no new `AdminReason`: the existing
   * `'public shipment tracking lookup'` is exactly this path.
   */
  const adminDb = await getAdminDb('public shipment tracking lookup');
  const load = await adminDb.load.findUnique({
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
    // quick-606 — the page's SECOND read moves with the first. Leaving one of
    // the two on the bare client would leave the page raising TC001 on any load
    // that actually has a truck assigned, which is every load worth tracking.
    // `app_admin` already holds SELECT on `GPSLocation` for this path.
    const gps = await adminDb.gPSLocation.findFirst({
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
