import Link from 'next/link';
import { ArrowLeft, Pencil } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getDriver, deactivateDriver, reactivateDriver } from '@/app/(owner)/actions/drivers';
import { listDriverDocuments } from '@/app/(owner)/actions/driver-documents';
import { listDriverRouteJoinsByDriver, listDriverPrimaryRoutes } from '@/app/(owner)/actions/driver-route-joins';
import { DriverDocumentsSection } from './driver-documents-section';
import { DriverStatusButton } from './driver-status-button';
import { DriverRouteAssignmentsSection } from './driver-route-assignments-section';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';

interface DriverDetailPageProps {
  params: Promise<{ id: string }>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    NOT_STARTED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    IN_PROGRESS: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    BLOCKED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  }
  const labels: Record<string, string> = {
    NOT_STARTED: 'Not Started',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed',
    BLOCKED: 'Blocked',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {labels[status] ?? status}
    </span>
  )
}

export default async function DriverDetailPage({ params }: DriverDetailPageProps) {
  const { id } = await params;

  const tenantId = await requireTenantId().catch(() => null);
  const prisma = tenantId ? await getTenantPrisma() : null;

  const [driver, documents, routeAssignments, primaryRoutes, instances] = await Promise.all([
    getDriver(id).catch(() => null),
    listDriverDocuments(id).catch(() => [] as any[]),
    listDriverRouteJoinsByDriver(id).catch(() => [] as any[]),
    listDriverPrimaryRoutes(id).catch(() => [] as any[]),
    prisma
      ? prisma.playbookInstance.findMany({
          where: { entityType: 'DRIVER', entityId: id, tenantId: tenantId! },
          orderBy: { createdAt: 'desc' },
          include: { stepInstances: { select: { id: true, status: true } } },
        }).catch(() => [] as any[])
      : Promise.resolve([] as any[]),
  ]);

  if (!driver) {
    notFound();
  }

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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground min-w-0">
              {driver.firstName} {driver.lastName}
            </h1>
            {instances.length > 0 && (
              driver.isDispatchReady ? (
                <span className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 px-2 py-0.5 rounded-full text-xs font-medium">
                  Dispatch Ready
                </span>
              ) : (
                <span className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 px-2 py-0.5 rounded-full text-xs font-medium">
                  Not Dispatch Ready
                </span>
              )
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
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

      {/* Route Assignments */}
      <DriverRouteAssignmentsSection driverId={id} initialAssignments={routeAssignments} primaryRoutes={primaryRoutes} />

      {/* Driver Documents */}
      <DriverDocumentsSection driverId={id} initialDocuments={documents} />

      {/* Checklists */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4">Checklists</h2>
        {instances.length === 0 ? (
          <p className="text-muted-foreground text-sm">No checklists started for this driver yet.</p>
        ) : (
          <div className="space-y-2">
            {instances.map((instance: any) => {
              const snap = instance.playbookSnapshot as { name?: string }
              const completed = instance.stepInstances.filter(
                (s: any) => s.status === 'COMPLETE' || s.status === 'SKIPPED'
              ).length
              const total = instance.stepInstances.length
              return (
                <a
                  key={instance.id}
                  href={`/checklists/instances/${instance.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent transition-colors"
                >
                  <div>
                    <p className="font-medium text-sm">{snap.name ?? 'Checklist'}</p>
                    <p className="text-xs text-muted-foreground">{completed}/{total} tasks complete</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={instance.status} />
                    <span className="text-xs text-muted-foreground">{Math.round(instance.completionPercent)}%</span>
                  </div>
                </a>
              )
            })}
          </div>
        )}
      </div>

      {/* Audit Trail */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-card-foreground mb-4">Record History</h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Created by</dt>
            <dd className="mt-1 text-sm text-card-foreground">System</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Created</dt>
            <dd className="mt-1 text-sm text-card-foreground">
              {new Date(driver.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Last changed by</dt>
            <dd className="mt-1 text-sm text-card-foreground">System</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Last changed</dt>
            <dd className="mt-1 text-sm text-card-foreground">
              {new Date(driver.updatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
