import { redirect } from 'next/navigation';
import { Users } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { hasPermission } from '@/lib/auth/permissions';
import { listCarrierDrivers, getPendingInvitationEmails } from '@/lib/carrier/fleet-drivers';
import { computeDriverDuty, cdlCompliance } from '@/lib/carrier/driver-status';
import { computeHOSClocks } from '@/lib/hos/compute-hos-clocks';
import { DriversGrid } from './_grid/DriversGrid';
import { DriversMobile, type DriverMobileRow } from './DriversMobile';

type DriverItem = Awaited<ReturnType<typeof listCarrierDrivers>>['items'][number];

const PAY_MODEL_LABELS: Record<string, string> = {
  per_mile: 'Per mile',
  hourly: 'Hourly',
  salary: 'Salary',
  percentage: 'Percentage',
  per_load: 'Per load',
  flat: 'Flat rate',
};

function payModelLabel(model: string): string {
  return PAY_MODEL_LABELS[model] ?? model.replace(/_/g, ' ');
}

function monthYear(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function fullName(d: DriverItem): string {
  return `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() || 'Unnamed driver';
}

/** "6h 12m" / "45m" / "7h" from whole minutes (presentation only). */
function fmtHM(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Live subline — the active dispatch when working, else identity context. Never generic. */
function driverSubline(d: DriverItem, invited: boolean): string {
  const dispatch = d.primaryDispatches?.[0];
  if (dispatch) {
    const route = dispatch.routeTemplate?.templateName;
    if (route) return `On dispatch · ${route}`;
    const dep = dispatch.scheduledDeparture
      ? new Date(dispatch.scheduledDeparture).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null;
    return dep ? `On dispatch · departed ${dep}` : 'On active dispatch';
  }
  if ((d.coDispatches?.length ?? 0) > 0) return 'Co-driver · active dispatch';

  if (invited) return d.email ? `Invited · ${d.email}` : 'Invitation pending';

  const identity = [
    d.cdlClass ? `Class ${d.cdlClass}` : null,
    d.homeTerminal?.name ?? null,
  ].filter(Boolean);
  if (identity.length > 0) return identity.join(' · ');
  return `${payModelLabel(d.payModel)} pay`;
}

/**
 * Meta line — the HOS clock when the driver has logged duty time today
 * ("6h 12m today · 4h 48m left"), else the compliance fact that costs money
 * first (CDL), else a calm "valid through" reassurance, else the pay model.
 */
function driverMeta(
  d: DriverItem,
  clocks: ReturnType<typeof computeHOSClocks>,
  now: number,
): { meta: string; tone: 'muted' | 'warning' | 'danger' } {
  if (clocks.hasDutyToday) {
    const left =
      clocks.remainingMinutes <= 0 ? 'no time left' : `${fmtHM(clocks.remainingMinutes)} left`;
    const tone =
      clocks.remainingMinutes <= 0 ? 'danger' : clocks.isLow ? 'warning' : 'muted';
    return { meta: `${fmtHM(clocks.onDutyMinutesToday)} today · ${left}`, tone };
  }
  const cdl = cdlCompliance(d.cdlExpiry, now);
  if (cdl.fact) return { meta: cdl.fact, tone: cdl.tone ?? 'muted' };
  if (d.cdlExpiry) return { meta: `CDL valid · exp ${monthYear(d.cdlExpiry)}`, tone: 'muted' };
  return { meta: `${payModelLabel(d.payModel)} pay`, tone: 'muted' };
}

export default async function CarrierDriversPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const orgId = session.tenantId;
  const canCreate = hasPermission(session.permissions ?? null, 'carrierDrivers', session.role);

  let items: DriverItem[] = [];
  let total = 0;
  let pendingEmails = new Set<string>();

  try {
    const [result, pending] = await Promise.all([
      listCarrierDrivers(orgId),
      getPendingInvitationEmails(orgId),
    ]);
    items = result.items;
    total = result.total;
    pendingEmails = pending;
  } catch {
    // DB failure — render empty list
  }

  const now = Date.now();

  // Count by status (desktop stat row)
  const statusCounts: Record<string, number> = {};
  for (const d of items) {
    const s = d.status ?? 'unknown';
    statusCounts[s] = (statusCounts[s] ?? 0) + 1;
  }

  // Server-side derivation for the mobile-web rows (no client status logic).
  const mobileDrivers: DriverMobileRow[] = items.map((d) => {
    const hasActiveDispatch =
      (d.primaryDispatches?.length ?? 0) > 0 || (d.coDispatches?.length ?? 0) > 0;
    const accountActive = d.user?.isActive === true;
    const invited =
      !accountActive && !!d.email && pendingEmails.has(d.email.toLowerCase());

    const clocks = computeHOSClocks(d.user?.hosEntries ?? [], new Date(now));
    const duty = computeDriverDuty({
      openHosStatus: clocks.currentStatus,
      hasActiveDispatch,
      accountActive,
    });

    const cdl = cdlCompliance(d.cdlExpiry, now);
    const { meta, tone } = driverMeta(d, clocks, now);
    return {
      id: d.id,
      name: fullName(d),
      email: d.email ?? null,
      duty,
      invited,
      subline: driverSubline(d, invited),
      meta,
      metaTone: tone,
      complianceWarn: cdl.warn,
    };
  });

  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <DriversMobile drivers={mobileDrivers} canCreate={canCreate} />
      </div>

      {/* Desktop grid (lg and up) — unchanged */}
      <div className="hidden lg:block space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Carrier Drivers
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Showing {items.length} of {total} driver{total !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Stat row */}
        {total > 0 && (
          <div className="flex flex-wrap gap-3">
            <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm">
              <Users className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <span className="font-medium">{total}</span>
              <span className="text-muted-foreground">total</span>
            </div>
            {Object.entries(statusCounts).map(([status, count]) => (
              <div
                key={status}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <span className="font-medium">{count}</span>
                <span className="text-muted-foreground capitalize">{status}</span>
              </div>
            ))}
          </div>
        )}

        <DriversGrid
          drivers={items.map((d) => ({
            id: d.id,
            firstName: d.firstName,
            lastName: d.lastName,
            cdlClass: d.cdlClass,
            cdlExpiry: d.cdlExpiry,
            payModel: d.payModel,
            status: d.status,
            isSample: d.isSample,
          }))}
        />
      </div>
    </>
  );
}
