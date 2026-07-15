'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileText,
  MapPin,
  Package,
  Send,
  Truck,
  UserPlus,
} from 'lucide-react';
import {
  MobileScreen,
  LargeTitleHeader,
  KPIRow,
  KPICard,
  SectionHeader,
  DocumentRow,
  EmptyState,
  Skeleton,
  MonogramAvatar,
  type StatusTone,
} from '@/components/ui/ds';
import { SampleDataBanner } from '@/components/onboarding/sample-data-banner';

// ---------------------------------------------------------------------------
// Data shapes — mirror the desktop dashboard widgets (same endpoints)
// ---------------------------------------------------------------------------

interface KPIData {
  loadsThisWeek: number | null;
  revenueThisWeek: number | null;
  pendingPayApprovals: number | null;
  openInvoices: number | null;
}
interface AlertItem {
  id: string;
  label: string;
  count: number;
  href: string;
  severity: 'warning' | 'critical';
}
interface DriverStatus {
  id: string;
  firstName: string;
  lastName: string;
  hosStatus: 'DRIVING' | 'ON_DUTY' | 'OFF_DUTY' | 'SLEEPER_BERTH' | null;
  dispatchId: string | null;
  dispatchNumber: string | null;
}
interface DispatchItem {
  id: string;
  status: string;
  notes: string | null;
  scheduledDeparture: string | null;
  _count: { stops: number };
  completedStopsCount: number;
}
interface ActivityItem {
  type: string;
  description: string;
  timestamp: string;
  href: string;
}

// ---------------------------------------------------------------------------
// Formatting / mapping
// ---------------------------------------------------------------------------

function fmtCurrency(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function dispatchNumberFromNotes(notes: string | null): string {
  if (!notes) return 'Dispatch';
  const m = notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/);
  return m ? m[1] : 'Dispatch';
}

const DISPATCH_STATUS: Record<string, { tone: StatusTone; label: string }> = {
  planned: { tone: 'neutral', label: 'Planned' },
  in_progress: { tone: 'accent', label: 'In progress' },
  completed: { tone: 'success', label: 'Completed' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
  tonu: { tone: 'warning', label: 'TONU' },
};

/** Green when clocked in, accent when on a dispatch, muted otherwise. */
function driverDotTone(d: DriverStatus): StatusTone {
  if (d.hosStatus === 'DRIVING' || d.hosStatus === 'ON_DUTY') return 'success';
  if (d.dispatchId) return 'accent';
  return 'neutral';
}
const DOT_BG: Record<StatusTone, string> = {
  success: 'bg-ds-success',
  accent: 'bg-ds-accent',
  warning: 'bg-ds-warning',
  danger: 'bg-ds-danger',
  neutral: 'bg-ds-txt3',
  vip: 'bg-ds-vip',
};

const ACTIVITY_ICON: Record<string, typeof Truck> = {
  dispatch_update: Truck,
  stop_completed: MapPin,
  new_load: Package,
  pay_record: CreditCard,
  document_uploaded: FileText,
  new_dispatch: Send,
};

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Dashboard — mobile-web design system view (carrier)
// ---------------------------------------------------------------------------

export function DashboardMobile({
  showSampleBanner,
  tenantId,
}: {
  showSampleBanner: boolean;
  tenantId: string;
}) {
  const router = useRouter();

  const [kpi, setKpi] = useState<KPIData | null>(null);
  const [alerts, setAlerts] = useState<AlertItem[] | null>(null);
  const [drivers, setDrivers] = useState<DriverStatus[] | null>(null);
  const [dispatches, setDispatches] = useState<DispatchItem[] | null>(null);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const iso = today.toISOString().split('T')[0];
    const dispatchParams = new URLSearchParams({
      date_from: iso,
      date_to: `${iso}T23:59:59`,
      pageSize: '50',
    });

    getJson<KPIData>('/api/v1/carrier/dashboard/kpi').then((d) =>
      setKpi(
        d ?? { loadsThisWeek: 0, revenueThisWeek: 0, pendingPayApprovals: 0, openInvoices: 0 },
      ),
    );
    getJson<AlertItem[]>('/api/v1/carrier/dashboard/alerts').then((d) =>
      setAlerts(Array.isArray(d) ? d : []),
    );
    getJson<DriverStatus[]>('/api/v1/carrier/dashboard/drivers-status').then((d) =>
      setDrivers(Array.isArray(d) ? d : []),
    );
    getJson<{ data?: { items?: DispatchItem[] } }>(
      `/api/v1/carrier/dispatches?${dispatchParams.toString()}`,
    ).then((d) => setDispatches(d?.data?.items ?? []));
    getJson<ActivityItem[]>('/api/v1/carrier/dashboard/activity').then((d) =>
      setActivity(Array.isArray(d) ? d : []),
    );
  }, []);

  const kpiCards = kpi
    ? [
        { label: 'Loads this week', value: String(kpi.loadsThisWeek ?? 0), tone: 'neutral' as StatusTone },
        { label: 'Revenue this week', value: fmtCurrency(kpi.revenueThisWeek ?? 0), tone: 'success' as StatusTone },
        {
          label: 'Pending pay',
          value: String(kpi.pendingPayApprovals ?? 0),
          tone: (kpi.pendingPayApprovals ? 'warning' : 'neutral') as StatusTone,
          onClick: () => router.push('/carrier/reports/driver-pay'),
        },
        {
          label: 'Open invoices',
          value: String(kpi.openInvoices ?? 0),
          tone: (kpi.openInvoices ? 'accent' : 'neutral') as StatusTone,
          onClick: () => router.push('/carrier/loads?status=invoiced'),
        },
      ]
    : null;

  const activeDrivers = (drivers ?? []).filter(
    (d) => d.hosStatus === 'DRIVING' || d.hosStatus === 'ON_DUTY' || d.dispatchId,
  );

  return (
    <MobileScreen className="pb-6 pt-2">
      {showSampleBanner ? (
        <div className="pb-3">
          <SampleDataBanner tenantId={tenantId} />
        </div>
      ) : null}

      <LargeTitleHeader title="Dashboard" subtitle="Operations overview" />

      {/* KPIs — 2×2 */}
      {kpiCards ? (
        <div className="space-y-3">
          <KPIRow>
            {kpiCards.slice(0, 2).map((c) => (
              <KPICard key={c.label} value={c.value} label={c.label} tone={c.tone} onClick={c.onClick} />
            ))}
          </KPIRow>
          <KPIRow>
            {kpiCards.slice(2, 4).map((c) => (
              <KPICard key={c.label} value={c.value} label={c.label} tone={c.tone} onClick={c.onClick} />
            ))}
          </KPIRow>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-3">
            <Skeleton className="h-[74px] flex-1 rounded-[18px]" />
            <Skeleton className="h-[74px] flex-1 rounded-[18px]" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-[74px] flex-1 rounded-[18px]" />
            <Skeleton className="h-[74px] flex-1 rounded-[18px]" />
          </div>
        </div>
      )}

      {/* Compliance alerts */}
      <div className="mt-6">
        {alerts === null ? (
          <Skeleton className="h-14 w-full rounded-[20px]" />
        ) : alerts.length === 0 ? (
          <div className="flex items-center gap-2 rounded-[20px] bg-ds-success/[0.14] px-4 py-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-ds-success" />
            <span className="text-[15px] font-medium text-ds-success">All clear — no compliance alerts</span>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((a) => {
              const danger = a.severity === 'critical';
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => router.push(a.href)}
                  className={
                    'flex w-full items-center gap-3 rounded-[20px] p-4 text-left transition active:opacity-75 ' +
                    (danger ? 'bg-ds-danger/[0.14]' : 'bg-ds-warning/[0.14]')
                  }
                >
                  <AlertTriangle className={'h-5 w-5 shrink-0 ' + (danger ? 'text-ds-danger' : 'text-ds-warning')} />
                  <span className={'min-w-0 flex-1 text-[15px] font-semibold ' + (danger ? 'text-ds-danger' : 'text-ds-warning')}>
                    {a.label}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ds-txt3" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Drivers on duty — horizontal glance strip (only when there are any) */}
      {activeDrivers.length > 0 ? (
        <div className="mt-6">
          <SectionHeader title="On duty" action={{ label: 'All drivers', onClick: () => router.push('/carrier/fleet/drivers') }} />
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {activeDrivers.map((d) => {
              const tone = driverDotTone(d);
              const chip = (
                <div className="flex items-center gap-2 rounded-[16px] bg-ds-card px-3 py-2">
                  <MonogramAvatar name={`${d.firstName} ${d.lastName}`} size={28} />
                  <div className="min-w-0">
                    <div className="whitespace-nowrap text-[13px] font-medium text-ds-txt">{d.firstName}</div>
                    {d.dispatchNumber ? (
                      <div className="whitespace-nowrap text-[11px] text-ds-txt3">{d.dispatchNumber}</div>
                    ) : null}
                  </div>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_BG[tone]}`} />
                </div>
              );
              return d.dispatchId ? (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => router.push(`/carrier/dispatches/${d.dispatchId}`)}
                  className="shrink-0 transition active:opacity-75"
                  aria-label={`${d.firstName} ${d.lastName} — view dispatch`}
                >
                  {chip}
                </button>
              ) : (
                <div key={d.id} className="shrink-0">
                  {chip}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Today's dispatches */}
      <div className="mt-6">
        <SectionHeader title="Today's dispatches" action={{ label: 'See all', onClick: () => router.push('/carrier/dispatches') }} />
        {dispatches === null ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-[20px] bg-ds-card p-4">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-2 h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : dispatches.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Nothing scheduled today" message="Dispatches planned for today will appear here." />
        ) : (
          <div className="space-y-3">
            {dispatches.slice(0, 5).map((d) => {
              const s = DISPATCH_STATUS[d.status] ?? { tone: 'neutral' as StatusTone, label: d.status };
              const total = d._count?.stops ?? 0;
              const done = d.completedStopsCount ?? 0;
              return (
                <DocumentRow
                  key={d.id}
                  icon={ClipboardList}
                  title={dispatchNumberFromNotes(d.notes)}
                  meta={total > 0 ? `${done}/${total} stops` : undefined}
                  pill={{ label: s.label, tone: s.tone }}
                  onOpen={() => router.push(`/carrier/dispatches/${d.id}`)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div className="mt-6">
        <SectionHeader title="Recent activity" />
        {activity === null ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-[20px] bg-ds-card p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/4" />
              </div>
            ))}
          </div>
        ) : activity.length === 0 ? (
          <EmptyState icon={FileText} title="No recent activity" message="Fleet actions across your team will show up here." />
        ) : (
          <div className="space-y-3">
            {activity.slice(0, 4).map((item, idx) => (
              <DocumentRow
                key={`${item.type}-${idx}`}
                icon={ACTIVITY_ICON[item.type] ?? Truck}
                title={item.description}
                meta={relativeTime(item.timestamp)}
                onOpen={() => router.push(item.href)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="mt-6">
        <SectionHeader title="Quick actions" />
        <div className="space-y-2">
          {[
            { icon: Send, label: 'New dispatch', href: '/carrier/dispatches?new=true' },
            { icon: Package, label: 'New load', href: '/carrier/loads/new' },
            { icon: UserPlus, label: 'New client', href: '/carrier/clients/new' },
          ].map(({ icon: Icon, label, href }) => (
            <button
              key={label}
              type="button"
              onClick={() => router.push(href)}
              className="flex w-full items-center gap-3 rounded-[20px] bg-ds-card p-4 text-left transition active:opacity-75"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ds-accent/[0.16]">
                <Icon className="h-5 w-5 text-ds-accent" />
              </span>
              <span className="min-w-0 flex-1 text-[15px] font-medium text-ds-txt">{label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ds-txt3" />
            </button>
          ))}
        </div>
      </div>
    </MobileScreen>
  );
}
