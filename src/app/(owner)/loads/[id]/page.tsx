import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil, Package, MapPin, Calendar, Weight, Truck, User } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { dispatchLoad, deleteLoad, updateLoadStatus, revertLoadStatus } from '@/app/(owner)/actions/loads';
import { LoadStatusBadge } from '@/components/loads/load-status-badge';
import { DispatchModal } from '@/components/loads/dispatch-modal';
import { StatusUpdateButton } from '@/components/loads/status-update-button';
import { DeleteLoadButton } from '@/components/loads/delete-load-button';
import { CopyTrackingLinkButton } from '@/components/loads/copy-tracking-link';
import { DownloadRateConfirmationButton } from '@/components/loads/download-rate-confirmation-button';

const STATUS_LIFECYCLE = [
  'PENDING',
  'DISPATCHED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'INVOICED',
];

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  DISPATCHED: 'Dispatched',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  INVOICED: 'Invoiced',
  CANCELLED: 'Cancelled',
};

export default async function LoadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const prisma = await getTenantPrisma();

  let load;
  try {
    load = await prisma.load.findUnique({
      where: { id },
      include: {
        customer: true,
        driver: { select: { id: true, firstName: true, lastName: true, email: true } },
        truck: { select: { id: true, make: true, model: true, year: true, licensePlate: true } },
      },
    });
  } catch {
    notFound();
  }

  if (!load) {
    notFound();
  }

  // Fetch drivers and trucks for dispatch modal if PENDING
  let availableDrivers: Array<{ id: string; firstName: string | null; lastName: string | null }> = [];
  let availableTrucks: Array<{ id: string; make: string; model: string; licensePlate: string }> = [];

  if (load.status === 'PENDING') {
    [availableDrivers, availableTrucks] = await Promise.all([
      prisma.user.findMany({
        where: { role: 'DRIVER', isActive: true },
        select: { id: true, firstName: true, lastName: true },
        orderBy: { firstName: 'asc' },
      }).catch(() => []),
      prisma.truck.findMany({
        select: { id: true, make: true, model: true, licensePlate: true },
        orderBy: { make: 'asc' },
      }).catch(() => []),
    ]);
  }

  const boundDispatchLoad = dispatchLoad.bind(null, id);
  const canEdit = !['INVOICED', 'CANCELLED'].includes(load.status);
  const canDelete = ['PENDING', 'CANCELLED'].includes(load.status);

  // Determine status timeline — show normal lifecycle or append CANCELLED
  const isCancelled = load.status === 'CANCELLED';
  const currentIndex = STATUS_LIFECYCLE.indexOf(load.status);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/loads"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Loads
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Load #{load.loadNumber}
            </h1>
            <LoadStatusBadge status={load.status} />
          </div>
          <p className="mt-1 text-muted-foreground">
            {load.origin} &rarr; {load.destination}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {load.status === 'PENDING' && (
            <DispatchModal
              loadId={id}
              dispatchAction={boundDispatchLoad}
              drivers={availableDrivers}
              trucks={availableTrucks}
            />
          )}
          {['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'INVOICED'].includes(load.status) && (
            <StatusUpdateButton
              loadId={id}
              currentStatus={load.status}
              updateStatusAction={updateLoadStatus}
              revertStatusAction={revertLoadStatus}
            />
          )}
          {load.trackingToken && (
            <CopyTrackingLinkButton token={load.trackingToken} />
          )}
          {['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(load.status) && (
            <DownloadRateConfirmationButton loadId={id} />
          )}
          {canEdit && (
            <Link
              href={`/loads/${id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm hover:bg-accent transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          )}
          {canDelete && (
            <DeleteLoadButton loadId={id} deleteAction={deleteLoad} />
          )}
        </div>
      </div>

      {/* Info grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Load Details card */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
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
            {load.notes && (
              <div>
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="mt-0.5 text-muted-foreground whitespace-pre-wrap">{load.notes}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Customer card */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Customer
          </h3>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">Company</dt>
              <dd className="font-medium mt-0.5">
                <Link
                  href={`/crm/${load.customerId}`}
                  className="text-primary hover:underline"
                >
                  {load.customer.companyName}
                </Link>
              </dd>
            </div>
            {load.customer.contactName && (
              <div>
                <dt className="text-muted-foreground">Contact</dt>
                <dd className="font-medium mt-0.5">{load.customer.contactName}</dd>
              </div>
            )}
            {load.customer.email && (
              <div>
                <dt className="text-muted-foreground">Email</dt>
                <dd className="font-medium mt-0.5">{load.customer.email}</dd>
              </div>
            )}
            {load.customer.phone && (
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd className="font-medium mt-0.5">{load.customer.phone}</dd>
              </div>
            )}
            {(load.customer.city || load.customer.state) && (
              <div>
                <dt className="text-muted-foreground">Location</dt>
                <dd className="font-medium mt-0.5">
                  {[load.customer.city, load.customer.state].filter(Boolean).join(', ')}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Assignment card */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Assignment
          </h3>
          {load.driver || load.truck ? (
            <dl className="space-y-4 text-sm">
              {load.driver && (
                <div>
                  <dt className="text-muted-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" /> Driver
                  </dt>
                  <dd className="font-medium mt-0.5">
                    {`${load.driver.firstName ?? ''} ${load.driver.lastName ?? ''}`.trim()}
                  </dd>
                  {load.driver.email && (
                    <dd className="text-muted-foreground">{load.driver.email}</dd>
                  )}
                </div>
              )}
              {load.truck && (
                <div>
                  <dt className="text-muted-foreground flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5" /> Truck
                  </dt>
                  <dd className="font-medium mt-0.5">
                    {load.truck.year} {load.truck.make} {load.truck.model}
                  </dd>
                  <dd className="text-muted-foreground">{load.truck.licensePlate}</dd>
                </div>
              )}
            </dl>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Truck className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Not yet dispatched</p>
              <p className="text-xs text-muted-foreground mt-1">
                Use the Dispatch button to assign a driver and truck.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Status timeline */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-5">
          Status Timeline
        </h3>
        {isCancelled ? (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-500">
              <span className="text-xs font-bold">X</span>
            </div>
            <span className="text-sm font-medium text-gray-600">Cancelled</span>
          </div>
        ) : (
          <div className="flex items-start gap-0 overflow-x-auto pb-2">
            {STATUS_LIFECYCLE.map((status, index) => {
              const isCompleted = currentIndex > index;
              const isCurrent = currentIndex === index;
              const isFuture = currentIndex < index;

              return (
                <div key={status} className="flex items-center">
                  <div className="flex flex-col items-center min-w-[80px]">
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
                  {index < STATUS_LIFECYCLE.length - 1 && (
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
        )}
      </div>
    </div>
  );
}
