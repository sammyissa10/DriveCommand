import { getMyActiveLoad, advanceLoadStatus } from '@/app/(driver)/actions/driver-load';
import { LoadStatusButton } from '@/components/driver/load-status-button';
import { Package, MapPin, Calendar, Weight } from 'lucide-react';

const DRIVER_STATUS_LIFECYCLE = [
  'PENDING',
  'DISPATCHED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
];

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  DISPATCHED: 'Dispatched',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
};

/**
 * Driver My Load page.
 * Shows the driver's currently assigned active load with status timeline and forward-only status buttons.
 *
 * SECURITY: All data fetched through driver-scoped server actions that verify driverId ownership.
 */
export default async function MyLoadPage() {
  // Fetch the driver's active load
  let load = null;
  try {
    load = await getMyActiveLoad();
  } catch (err) {
    console.error('[MyLoadPage] Failed to fetch active load:', err);
  }

  // No active load — show empty state
  if (!load) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <Package className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">No active load assigned</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You don&apos;t have an active load right now. Check back later or contact your dispatcher.
        </p>
      </div>
    );
  }

  const currentIndex = DRIVER_STATUS_LIFECYCLE.indexOf(load.status);

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">My Load</h1>
        <p className="mt-1 text-muted-foreground">
          Load #{load.loadNumber} &mdash; {load.origin} to {load.destination}
        </p>
      </div>

      {/* Load details card */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Package className="h-4 w-4" />
          Load Details
        </h3>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Origin
            </dt>
            <dd className="font-medium mt-0.5">{load.origin}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Destination
            </dt>
            <dd className="font-medium mt-0.5">{load.destination}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Pickup Date
            </dt>
            <dd className="font-medium mt-0.5">{new Date(load.pickupDate).toLocaleDateString()}</dd>
          </div>
          {load.deliveryDate && (
            <div>
              <dt className="text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" /> Delivery Date
              </dt>
              <dd className="font-medium mt-0.5">{new Date(load.deliveryDate).toLocaleDateString()}</dd>
            </div>
          )}
          {load.weight && (
            <div>
              <dt className="text-muted-foreground flex items-center gap-1.5">
                <Weight className="h-3.5 w-3.5" /> Weight
              </dt>
              <dd className="font-medium mt-0.5">{load.weight.toLocaleString()} lbs</dd>
            </div>
          )}
          {load.commodity && (
            <div>
              <dt className="text-muted-foreground">Commodity</dt>
              <dd className="font-medium mt-0.5">{load.commodity}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted-foreground">Rate</dt>
            <dd className="text-xl font-bold mt-0.5 text-green-600">
              ${Number(load.rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Customer</dt>
            <dd className="font-medium mt-0.5">{load.customer.companyName}</dd>
          </div>
        </dl>
      </div>

      {/* Status timeline */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-5 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Status Timeline
        </h3>
        <div className="flex items-start gap-0 overflow-x-auto pb-2">
          {DRIVER_STATUS_LIFECYCLE.map((status, index) => {
            const isCompleted = currentIndex > index;
            const isCurrent = currentIndex === index;

            return (
              <div key={status} className="flex items-center">
                <div className="flex flex-col items-center min-w-[72px]">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      isCompleted
                        ? 'bg-green-500 text-white'
                        : isCurrent
                        ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isCompleted ? '✓' : index + 1}
                  </div>
                  <span
                    className={`mt-2 text-xs text-center font-medium ${
                      isCurrent
                        ? 'text-primary'
                        : isCompleted
                        ? 'text-green-600'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {STATUS_LABELS[status]}
                  </span>
                </div>
                {index < DRIVER_STATUS_LIFECYCLE.length - 1 && (
                  <div
                    className={`h-0.5 w-8 flex-shrink-0 mt-[-1rem] transition-colors ${
                      currentIndex > index ? 'bg-green-400' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Status action button */}
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Update Status
        </h3>
        <LoadStatusButton
          loadId={load.id}
          currentStatus={load.status}
          advanceAction={advanceLoadStatus}
        />
      </div>
    </div>
  );
}
