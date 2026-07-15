'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import {
  MobileScreen,
  LargeTitleHeader,
  SearchField,
  SegmentedControl,
  EntityRow,
  StatusPill,
  EmptyState,
  Skeleton,
} from '@/components/ui/ds';

// ---------------------------------------------------------------------------
// Data — same endpoints the desktop RouteTemplateList uses
// ---------------------------------------------------------------------------

interface RouteTemplateItem {
  id: string;
  templateName: string;
  clientId: string;
  recurrenceRule: string | null;
  recurrenceTimezone: string;
  scheduledDepartureTime: string | null;
  active: boolean;
  nextDispatchDate: string | null;
  _count: { stops: number };
}

/** iCal RRULE → human summary (same vocabulary as the trip detail). */
export function formatRecurrence(rule: string | null, tz: string | null, departureTime: string | null): string {
  if (!rule) return 'On call';
  try {
    const parts: Record<string, string> = {};
    for (const seg of rule.split(';')) {
      const eq = seg.indexOf('=');
      if (eq === -1) continue;
      parts[seg.slice(0, eq).toUpperCase()] = seg.slice(eq + 1);
    }
    const freq = parts['FREQ'];
    const byDay = parts['BYDAY'];
    const interval = parseInt(parts['INTERVAL'] ?? '1', 10);
    const DAY_LABELS: Record<string, string> = {
      MO: 'Mon', TU: 'Tue', WE: 'Wed', TH: 'Thu', FR: 'Fri', SA: 'Sat', SU: 'Sun',
    };
    let schedule = '';
    if (freq === 'DAILY') {
      schedule = interval === 1 ? 'Daily' : `Every ${interval} days`;
    } else if (freq === 'WEEKLY') {
      schedule = byDay
        ? byDay.split(',').map((d) => DAY_LABELS[d] ?? d).join(', ')
        : 'Weekly';
    } else if (freq === 'MONTHLY') {
      schedule = parts['BYMONTHDAY'] ? `Monthly on ${parts['BYMONTHDAY']}` : 'Monthly';
    } else {
      schedule = rule;
    }
    if (departureTime) {
      const [h, m] = departureTime.split(':').map(Number);
      const ampm = (h ?? 0) >= 12 ? 'PM' : 'AM';
      const hour12 = ((h ?? 0) % 12) || 12;
      const min = String(m ?? 0).padStart(2, '0');
      const tzAbbr = tz ? tz.split('/').pop()?.replace(/_/g, ' ') ?? tz : '';
      schedule += ` · ${hour12}:${min} ${ampm}${tzAbbr ? ` ${tzAbbr}` : ''}`;
    }
    return schedule;
  } catch {
    return rule;
  }
}

type Scope = 'all' | 'active' | 'inactive';
const SCOPE_OPTIONS: { label: string; value: Scope }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
];

/** Square tile — a template is a "thing", not a person. */
function TemplateTile() {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-ds-avatar">
      <RefreshCw className="h-5 w-5 text-ds-txt2" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route Templates overview — mobile-web design system view (carrier)
// ---------------------------------------------------------------------------

export function TemplatesMobile({ canCreate }: { canCreate: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState<RouteTemplateItem[] | null>(null);
  const [clientMap, setClientMap] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('active');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [activeRes, inactiveRes] = await Promise.all([
          fetch('/api/v1/carrier/route-templates?active=true&pageSize=200'),
          fetch('/api/v1/carrier/route-templates?active=false&pageSize=200'),
        ]);
        const activeData = activeRes.ok ? await activeRes.json() : { data: { items: [] } };
        const inactiveData = inactiveRes.ok ? await inactiveRes.json() : { data: { items: [] } };
        if (cancelled) return;
        setRows([...(activeData.data?.items ?? []), ...(inactiveData.data?.items ?? [])] as RouteTemplateItem[]);
      } catch {
        if (!cancelled) setRows([]);
      }
    }
    async function loadClients() {
      try {
        const res = await fetch('/api/v1/carrier/clients?pageSize=200');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const c of (data.data?.items ?? []) as { id: string; name: string }[]) map[c.id] = c.name;
        setClientMap(map);
      } catch {
        /* names are a nicety — the row still reads without them */
      }
    }
    void load();
    void loadClients();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    let list = rows ?? [];
    if (scope === 'active') list = list.filter((t) => t.active);
    else if (scope === 'inactive') list = list.filter((t) => !t.active);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.templateName.toLowerCase().includes(q) ||
          (clientMap[t.clientId]?.toLowerCase().includes(q) ?? false),
      );
    }
    return [...list].sort((a, b) => a.templateName.localeCompare(b.templateName, undefined, { numeric: true }));
  }, [rows, scope, query, clientMap]);

  // Any narrowing counts — 'active' is the default but it still hides rows, so a
  // fleet whose templates are all deactivated must not read as "none yet".
  const isFiltering = query.trim().length > 0 || scope !== 'all';
  const hasAny = (rows?.length ?? 0) > 0;
  const countLabel = rows === null ? ' ' : `${rows.length} template${rows.length === 1 ? '' : 's'}`;

  return (
    <MobileScreen className="pb-6 pt-2">
      <LargeTitleHeader
        title="Route Templates"
        subtitle={countLabel}
        onAdd={canCreate ? () => router.push('/carrier/templates/new') : undefined}
        addLabel="New route template"
      />

      {hasAny ? (
        <div className="space-y-3">
          <SearchField value={query} onChange={setQuery} placeholder="Search template or client" />
          <SegmentedControl options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
        </div>
      ) : null}

      {rows === null ? (
        <div className="mt-3 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="min-h-[92px] rounded-[20px] bg-ds-card p-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-2 h-3 w-1/3" />
              <Skeleton className="mt-2 h-3 w-1/4" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        isFiltering ? (
          <EmptyState icon={RefreshCw} title="No matching templates" message="Try a different search or filter." />
        ) : (
          <EmptyState
            icon={RefreshCw}
            title="No route templates yet"
            message={
              canCreate
                ? 'Tap + in the top right to set up a recurring route.'
                : 'Recurring route templates will appear here.'
            }
          />
        )
      ) : (
        <div className="mt-3 space-y-3">
          {visible.map((t) => {
            const client = clientMap[t.clientId];
            const stops = t._count?.stops ?? 0;
            const meta = [
              formatRecurrence(t.recurrenceRule, t.recurrenceTimezone, t.scheduledDepartureTime),
              stops > 0 ? `${stops} stop${stops === 1 ? '' : 's'}` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <EntityRow
                key={t.id}
                leading={<TemplateTile />}
                title={t.templateName}
                subline={client ?? undefined}
                meta={meta || undefined}
                pill={t.active ? undefined : <StatusPill label="Inactive" tone="neutral" />}
                onClick={() => router.push(`/carrier/templates/${t.id}`)}
                ariaLabel={`${t.templateName}${t.active ? '' : ', inactive'}`}
              />
            );
          })}
        </div>
      )}
    </MobileScreen>
  );
}
