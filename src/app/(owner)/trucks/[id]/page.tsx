import Link from 'next/link';
import { ArrowLeft, Wrench, Pencil } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTruck, listTruckRoutes } from '@/app/(owner)/actions/trucks';
import { listDocuments } from '@/app/(owner)/actions/documents';
import { documentMetadataSchema } from '@/lib/validations/truck.schemas';
import { TruckDocumentsSection } from './truck-documents-section';
import { TruckRoutesHistory } from './truck-routes-history';
import { computeTruckStatus, type TruckWithRelations } from '@/lib/trucks/compute-truck-status';
import { MaintenanceToggleButton } from '@/components/trucks/maintenance-toggle-button';

interface TruckDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function TruckDetailPage({ params }: TruckDetailPageProps) {
  const { id } = await params;
  const truck = await getTruck(id);

  if (!truck) {
    notFound();
  }

  // Fetch documents for this truck (non-blocking - page renders even if this fails)
  let documents: any[] = [];
  try {
    documents = await listDocuments('truck', id);
  } catch (error) {
    console.error('Failed to load truck documents:', error);
  }

  // Fetch routes for this truck (non-blocking - page renders even if this fails)
  let truckRoutes: any[] = [];
  try {
    truckRoutes = await listTruckRoutes(id);
  } catch (error) {
    console.error('Failed to load truck routes:', error);
  }

  // Parse and validate document metadata
  let documentMetadata = null;
  if (truck.documentMetadata) {
    const parsed = documentMetadataSchema.safeParse(truck.documentMetadata);
    if (parsed.success) {
      documentMetadata = parsed.data;
    }
  }

  const { status: truckStatus, variant: truckStatusVariant } = computeTruckStatus(
    truck as unknown as TruckWithRelations
  );

  const statusDescriptions: Record<string, string> = {
    'In Use': 'This truck is assigned to an active dispatch',
    'In Maintenance': 'This truck has been manually marked as in maintenance or has an overdue scheduled service',
    'Expired Docs': 'This truck has at least one expired document',
    'Ready to Use': 'This truck is available for dispatch',
  };

  const statusVariantClasses = {
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return null;
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/trucks"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Trucks
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {truck.year} {truck.make} {truck.model}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${statusVariantClasses[truckStatusVariant]}`}
              title={statusDescriptions[truckStatus]}
            >
              {truckStatus}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <MaintenanceToggleButton
              truckId={truck.id}
              inMaintenance={(truck as any).inMaintenance ?? false}
            />
            <Link
              href={`/trucks/${truck.id}/maintenance`}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              <Wrench className="h-4 w-4" />
              Maintenance
            </Link>
            <Link
              href={`/trucks/${truck.id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Edit Truck
            </Link>
          </div>
        </div>
      </div>

      {/* Main Details */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4">Vehicle Information</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">VIN</dt>
            <dd className="mt-1 text-base font-mono text-card-foreground">{truck.vin}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">License Plate</dt>
            <dd className="mt-1">
              <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-0.5 text-sm font-medium">
                {truck.licensePlate}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Odometer</dt>
            <dd className="mt-1 text-base text-card-foreground">
              {truck.odometer.toLocaleString()} miles
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Created</dt>
            <dd className="mt-1 text-base text-card-foreground">
              {formatDate(truck.createdAt.toISOString())}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Last Updated</dt>
            <dd className="mt-1 text-base text-card-foreground">
              {formatDate(truck.updatedAt.toISOString())}
            </dd>
          </div>
        </div>
      </div>

      {/* Document Metadata */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4">Document Information</h2>
        {documentMetadata &&
        (documentMetadata.registrationNumber ||
          documentMetadata.registrationExpiry ||
          documentMetadata.insuranceNumber ||
          documentMetadata.insuranceExpiry) ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {documentMetadata.registrationNumber && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Registration Number</dt>
                <dd className="mt-1 text-base text-card-foreground">
                  {documentMetadata.registrationNumber}
                </dd>
              </div>
            )}
            {documentMetadata.registrationExpiry && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Registration Expiry</dt>
                <dd className="mt-1 text-base text-card-foreground">
                  {formatDate(documentMetadata.registrationExpiry)}
                </dd>
              </div>
            )}
            {documentMetadata.insuranceNumber && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Insurance Number</dt>
                <dd className="mt-1 text-base text-card-foreground">
                  {documentMetadata.insuranceNumber}
                </dd>
              </div>
            )}
            {documentMetadata.insuranceExpiry && (
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Insurance Expiry</dt>
                <dd className="mt-1 text-base text-card-foreground">
                  {formatDate(documentMetadata.insuranceExpiry)}
                </dd>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">No document information recorded</p>
        )}
      </div>

      {/* Files Section */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4">Files</h2>
        <TruckDocumentsSection truckId={truck.id} initialDocuments={documents} />
      </div>

      {/* Routes History */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4">Routes History</h2>
        <TruckRoutesHistory routes={truckRoutes} />
      </div>

      {/* Audit Trail */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4">Record History</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Created by</dt>
            <dd className="mt-1 text-sm text-card-foreground">
              {truck.createdBy
                ? `${truck.createdBy.firstName ?? ''} ${truck.createdBy.lastName ?? ''}`.trim() || truck.createdBy.email
                : 'System'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Created</dt>
            <dd className="mt-1 text-sm text-card-foreground">
              {new Date(truck.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Last changed by</dt>
            <dd className="mt-1 text-sm text-card-foreground">
              {truck.updatedBy
                ? `${truck.updatedBy.firstName ?? ''} ${truck.updatedBy.lastName ?? ''}`.trim() || truck.updatedBy.email
                : 'System'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Last changed</dt>
            <dd className="mt-1 text-sm text-card-foreground">
              {new Date(truck.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
