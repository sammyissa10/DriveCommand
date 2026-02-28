import Link from 'next/link';
import { ArrowLeft, Pencil } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getDriver, deactivateDriver, reactivateDriver } from '@/app/(owner)/actions/drivers';
import { listDriverDocuments } from '@/app/(owner)/actions/driver-documents';
import { DriverDocumentsSection } from './driver-documents-section';
import { DriverStatusButton } from './driver-status-button';

interface DriverDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function DriverDetailPage({ params }: DriverDetailPageProps) {
  const { id } = await params;
  const driver = await getDriver(id);

  if (!driver) {
    notFound();
  }

  // Fetch driver documents
  const documents = await listDriverDocuments(id).catch(() => []);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/drivers"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Drivers
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {driver.firstName} {driver.lastName}
          </h1>
          <div className="flex items-center gap-2">
            <DriverStatusButton
              driverId={id}
              driverName={`${driver.firstName} ${driver.lastName}`}
              isActive={driver.isActive}
              deactivateAction={deactivateDriver}
              reactivateAction={reactivateDriver}
            />
            <Link
              href={`/drivers/${id}/edit`}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </div>
        </div>
      </div>

      {/* Driver Information */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4">Driver Information</h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <dt className="text-sm font-medium text-muted-foreground mb-1">Email</dt>
            <dd className="text-base text-card-foreground">{driver.email}</dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-muted-foreground mb-1">License Number</dt>
            <dd className="text-base text-card-foreground">
              {driver.licenseNumber ? (
                <span className="font-mono">{driver.licenseNumber}</span>
              ) : (
                <span className="text-muted-foreground">Not provided</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-muted-foreground mb-1">Status</dt>
            <dd>
              {driver.isActive ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  Deactivated
                </span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-muted-foreground mb-1">Member Since</dt>
            <dd className="text-base text-card-foreground">
              {new Date(driver.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-muted-foreground mb-1">Last Updated</dt>
            <dd className="text-base text-card-foreground">
              {new Date(driver.updatedAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </dd>
          </div>
        </div>
      </div>

      {/* Driver Documents */}
      <DriverDocumentsSection driverId={id} initialDocuments={documents} />
    </div>
  );
}
