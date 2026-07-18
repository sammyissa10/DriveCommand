import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { getCarrierDriver, getLatestInvitationStatus } from '@/lib/carrier/fleet-drivers';
import { listFacilities } from '@/lib/carrier/facilities';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { CarrierDriverForm } from '@/components/carrier/fleet/CarrierDriverForm';
import { DriverDetailActions } from '@/components/carrier/fleet/DriverDetailActions';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BonusesTab } from '@/components/driver-pay/bonuses/bonuses-tab';
import { DeductionsTab } from '@/components/driver-pay/deductions/deductions-tab';
import { AuditTrailFooter } from '@/components/audit-trail-footer';
import type { HOSDutyStatusLike } from '@/lib/hos/compute-hos-clocks';
import { DriverDetailMobile } from './DriverDetailMobile';

interface Props {
  params: Promise<{ id: string }>;
}

function daysUntil(date: Date | string | null): number | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = d.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function expiryColorClass(date: Date | string | null): string {
  const days = daysUntil(date);
  if (days === null) return 'text-muted-foreground';
  if (days < 30) return 'text-red-600 dark:text-red-400';
  if (days < 90) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

const PAY_MODEL_LABELS: Record<string, string> = {
  per_mile: 'Per Mile',
  percentage_gross: 'Percentage of Gross',
  hourly: 'Hourly',
  flat_rate: 'Flat Rate',
  team_split: 'Team Split',
};

const DISPATCH_STATUS_CLASSES: Record<string, string> = {
  planned: 'border-blue-500 text-blue-600 dark:text-blue-400',
  in_transit: 'border-amber-500 text-amber-600 dark:text-amber-400',
  completed: 'border-green-500 text-green-600 dark:text-green-400',
  cancelled: 'border-red-500 text-red-600 dark:text-red-400',
};

export default async function CarrierDriverDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const orgId = session.tenantId;

  const role = (session.role ?? '').toUpperCase();
  const canEdit = role === 'SYSTEM_ADMIN' || role === 'OWNER';
  const canMarkPaid = role === 'SYSTEM_ADMIN' || role === 'OWNER' || role === 'MANAGER';
  const canManageAccess = role === 'OWNER' || role === 'MANAGER' || role === 'SYSTEM_ADMIN';

  const [driver, facilitiesResult] = await Promise.all([
    getCarrierDriver(orgId, id),
    listFacilities(orgId),
  ]);

  if (!driver) notFound();

  // Fetch peer drivers for the REFERRAL picker (same tenant)
  const prisma = await getTenantPrisma();
  const [tenantDriversRaw, driverAudit] = await Promise.all([
    prisma.carrierDriver.findMany({
      where: { id: { not: id } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
    prisma.carrierDriver.findUnique({
      where: { id },
      select: {
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        updatedBy: { select: { firstName: true, lastName: true, email: true } },
        createdAt: true,
        updatedAt: true,
      },
    }).catch(() => null),
  ]);
  const tenantDrivers = tenantDriversRaw.map((d) => ({
    id: d.id,
    name: `${d.firstName} ${d.lastName}`,
  }));

  const invitationStatus = driver.email
    ? await getLatestInvitationStatus(orgId, driver.email)
    : null;

  const cdlDays = daysUntil(driver.cdlExpiry);

  // Combine dispatches with role labels
  const allDispatches = [
    ...(driver.primaryDispatches ?? []).map((d) => ({ ...d, role: 'Primary' as const })),
    ...(driver.coDispatches ?? []).map((d) => ({ ...d, role: 'Co-Driver' as const })),
  ].sort((a, b) => {
    const aDate = a.scheduledDeparture ? new Date(a.scheduledDeparture).getTime() : 0;
    const bDate = b.scheduledDeparture ? new Date(b.scheduledDeparture).getTime() : 0;
    return bDate - aDate;
  });

  // ---- Mobile-web (ds) data: tenant tz, HOS window, active dispatch, trips ----
  const nowMs = Date.now();
  const tenant = await prisma.tenant
    .findUnique({ where: { id: orgId }, select: { timezone: true } })
    .catch(() => null);
  const timezone = tenant?.timezone || 'UTC';

  const hosRaw = driver.userId
    ? await prisma.driverHOSEntry
        .findMany({
          where: {
            driverId: driver.userId,
            OR: [{ startTime: { gte: new Date(nowMs - 14 * 86_400_000) } }, { endTime: null }],
          },
          orderBy: { startTime: 'asc' },
          select: { status: true, startTime: true, endTime: true },
        })
        .catch(() => [])
    : [];
  const hosEntries = hosRaw.map((e) => ({
    status: e.status,
    startTime: e.startTime.toISOString(),
    endTime: e.endTime ? e.endTime.toISOString() : null,
  }));
  const openEntry = [...hosRaw].reverse().find((e) => e.endTime == null);
  const dutyStatus = (openEntry?.status ?? 'OFF_DUTY') as HOSDutyStatusLike;

  const activeTrip = await prisma.trip
    .findFirst({
      where: { OR: [{ primaryDriverId: id }, { coDriverId: id }], status: 'in_progress', deletedAt: null },
      orderBy: { scheduledDeparture: 'desc' },
      select: {
        id: true,
        truck: { select: { id: true, unitNumber: true } },
        carrierLoads: { select: { id: true, referenceNumber: true }, take: 1 },
      },
    })
    .catch(() => null);
  const activeLoad = activeTrip?.carrierLoads[0] ?? null;
  const parent = activeTrip
    ? {
        trip: {
          id: activeTrip.id,
          label: activeLoad?.referenceNumber ? `Load ${activeLoad.referenceNumber}` : 'Active trip',
        },
        truck: activeTrip.truck ? { id: activeTrip.truck.id, label: `Unit ${activeTrip.truck.unitNumber}` } : null,
      }
    : null;

  const mobileTrips = allDispatches.map((d) => ({
    id: d.id,
    status: d.status,
    scheduledDeparture: d.scheduledDeparture ? new Date(d.scheduledDeparture).toISOString() : null,
    miles: d.actualMiles != null ? Number(d.actualMiles) : d.plannedMiles != null ? Number(d.plannedMiles) : null,
    role: d.role,
    netPay: d.driverPayRecords?.length
      ? d.driverPayRecords.reduce((s, r) => s + Number(r.netPay ?? 0), 0)
      : null,
  }));

  const invited = invitationStatus === 'PENDING' && driver.user?.isActive !== true;

  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <DriverDetailMobile
          driver={{
            id: driver.id,
            firstName: driver.firstName,
            lastName: driver.lastName,
            email: driver.email,
            phone: driver.phone,
            cdlNumberLast4: driver.cdlNumberLast4 ?? null,
            cdlClass: driver.cdlClass,
            cdlState: driver.cdlState,
            cdlExpiry: driver.cdlExpiry ? new Date(driver.cdlExpiry).toISOString() : null,
            homeTerminalId: driver.homeTerminalId,
            homeTerminalName: driver.homeTerminal?.name ?? null,
            payModel: driver.payModel,
            payRate: driver.payRate != null ? Number(driver.payRate) : null,
            payPeriod: driver.payPeriod,
            status: driver.status,
            notes: driver.notes,
            dutyStatus,
            invited,
          }}
          trips={mobileTrips}
          parent={parent}
          facilities={facilitiesResult.items.map((f) => ({ id: f.id, name: f.name }))}
          hosEntries={hosEntries}
          timezone={timezone}
          nowMs={nowMs}
          canEdit={canEdit}
        />
      </div>

      {/* Desktop view (lg and up) — unchanged */}
      <div className="hidden lg:block space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/carrier/fleet/drivers"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Carrier Drivers
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              {driver.firstName} {driver.lastName}
            </h1>
            {driver.email && (
              <p className="mt-1 text-sm text-muted-foreground">{driver.email}</p>
            )}
          </div>
          <DriverDetailActions
            driverId={driver.id}
            driverName={`${driver.firstName} ${driver.lastName}`}
            driverEmail={driver.email ?? null}
            invitationStatus={invitationStatus}
            userId={driver.userId ?? null}
            userIsActive={driver.user?.isActive ?? null}
            canManageAccess={canManageAccess}
          />
        </div>
      </div>

      {/* Compliance card */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">CDL &amp; Compliance</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">CDL Number</p>
            <p className="text-sm font-medium font-mono">{driver.cdlNumber ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">CDL Class</p>
            {driver.cdlClass ? (
              <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400">
                Class {driver.cdlClass}
              </Badge>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">CDL State</p>
            <p className="text-sm font-medium">{driver.cdlState ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">CDL Expiry</p>
            {driver.cdlExpiry ? (
              <div>
                <p className={`text-sm font-semibold ${expiryColorClass(driver.cdlExpiry)}`}>
                  {formatDate(driver.cdlExpiry)}
                </p>
                {cdlDays !== null && (
                  <p className={`text-xs ${expiryColorClass(driver.cdlExpiry)}`}>
                    {cdlDays < 0
                      ? `${Math.abs(cdlDays)} days overdue`
                      : cdlDays === 0
                      ? 'Expires today'
                      : `${cdlDays} days remaining`}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">—</p>
            )}
          </div>
        </div>
      </div>

      {/* Pay configuration card */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Pay Configuration</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Pay Model</p>
            <Badge variant="outline" className="border-purple-500 text-purple-600 dark:text-purple-400">
              {PAY_MODEL_LABELS[driver.payModel] ?? driver.payModel}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Pay Rate</p>
            <p className="text-sm font-medium">
              {driver.payRate != null ? `$${Number(driver.payRate).toFixed(4)}` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Pay Period</p>
            <p className="text-sm font-medium capitalize">
              {driver.payPeriod.replace('biweekly', 'bi-weekly')}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Home Terminal</p>
            <p className="text-sm font-medium">
              {driver.homeTerminal?.name ?? '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Compensation card */}
      <Link
        href={`/carrier/fleet/drivers/${id}/compensation`}
        className="block rounded-lg border border-border bg-card p-6 hover:bg-muted/30 transition-colors group"
      >
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Compensation</h2>
            <p className="text-sm text-muted-foreground">
              Manage pay templates and compensation history for this driver.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
        </div>
      </Link>

      {/* Edit form */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-base font-semibold text-foreground mb-4">Edit Driver</h2>
        <CarrierDriverForm
          driver={{
            id: driver.id,
            firstName: driver.firstName,
            lastName: driver.lastName,
            email: driver.email,
            phone: driver.phone,
            cdlNumber: driver.cdlNumber,
            cdlState: driver.cdlState,
            cdlClass: driver.cdlClass,
            cdlExpiry: driver.cdlExpiry,
            homeTerminalId: driver.homeTerminalId,
            payModel: driver.payModel,
            payRate: driver.payRate != null ? Number(driver.payRate) : null,
            payPeriod: driver.payPeriod,
            userId: driver.userId,
            status: driver.status,
            notes: driver.notes,
          }}
          facilities={facilitiesResult.items.map((f) => ({ id: f.id, name: f.name }))}
        />
      </div>

      {/* Bonuses & Deductions tabs */}
      <Tabs defaultValue="bonuses" className="mt-8">
        <TabsList>
          <TabsTrigger value="bonuses">Bonuses</TabsTrigger>
          <TabsTrigger value="deductions">Deductions</TabsTrigger>
        </TabsList>
        <TabsContent value="bonuses" className="mt-4">
          <BonusesTab
            driverId={id}
            driverName={`${driver.firstName} ${driver.lastName}`}
            canEdit={canEdit}
            canMarkPaid={canMarkPaid}
            tenantDrivers={tenantDrivers}
          />
        </TabsContent>
        <TabsContent value="deductions" className="mt-4">
          <DeductionsTab
            driverId={id}
            driverName={`${driver.firstName} ${driver.lastName}`}
            canEdit={canEdit}
          />
        </TabsContent>
      </Tabs>

      {/* Dispatch history */}
      {allDispatches.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Dispatch History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Dispatch #</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Miles</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allDispatches.map((d) => {
                  const miles = d.actualMiles ?? d.plannedMiles;
                  return (
                    <tr key={`${d.id}-${d.role}`} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3">
                        <Link
                          href={`/carrier/dispatches/${d.id}`}
                          className="font-mono text-xs text-foreground hover:text-primary transition-colors"
                        >
                          {d.id.slice(0, 8).toUpperCase()}
                        </Link>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {d.scheduledDeparture
                          ? new Date(d.scheduledDeparture).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="py-2 px-3">
                        <Badge
                          variant="outline"
                          className={DISPATCH_STATUS_CLASSES[d.status] ?? 'border-border text-muted-foreground'}
                        >
                          {d.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {miles != null ? `${Number(miles).toLocaleString()} mi` : '—'}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`text-xs font-medium ${
                            d.role === 'Primary'
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {d.role}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {driverAudit && (
        <AuditTrailFooter
          createdAt={driverAudit.createdAt}
          createdByName={driverAudit.createdBy ? `${driverAudit.createdBy.firstName ?? ''} ${driverAudit.createdBy.lastName ?? ''}`.trim() || null : null}
          createdByEmail={driverAudit.createdBy?.email ?? null}
          updatedAt={driverAudit.updatedAt}
          updatedByName={driverAudit.updatedBy ? `${driverAudit.updatedBy.firstName ?? ''} ${driverAudit.updatedBy.lastName ?? ''}`.trim() || null : null}
          updatedByEmail={driverAudit.updatedBy?.email ?? null}
        />
      )}
      </div>
    </>
  );
}
