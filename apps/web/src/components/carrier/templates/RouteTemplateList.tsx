'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Route } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RouteTemplateItem {
  id: string;
  templateName: string;
  clientId: string;
  contractId: string | null;
  scheduleType: string;
  recurrenceRule: string | null;
  recurrenceTimezone: string;
  scheduledDepartureTime: string | null;
  equipmentType: string;
  active: boolean;
  nextDispatchDate: string | null;
  _count: { stops: number };
}

interface ClientItem {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  dry_van: 'Dry Van',
  reefer: 'Reefer',
  flatbed: 'Flatbed',
  step_deck: 'Step Deck',
  tanker: 'Tanker',
  intermodal: 'Intermodal',
  power_only: 'Power Only',
};

const EQUIPMENT_BADGE_CLASSES: Record<string, string> = {
  dry_van: 'border-blue-500 text-blue-600 dark:text-blue-400',
  reefer: 'border-cyan-500 text-cyan-600 dark:text-cyan-400',
  flatbed: 'border-orange-500 text-orange-600 dark:text-orange-400',
  step_deck: 'border-amber-500 text-amber-600 dark:text-amber-400',
  tanker: 'border-purple-500 text-purple-600 dark:text-purple-400',
  intermodal: 'border-indigo-500 text-indigo-600 dark:text-indigo-400',
  power_only: 'border-slate-500 text-slate-600 dark:text-slate-400',
};

/**
 * Converts an RRULE string + departure time + tz to a human-readable string.
 * Examples: "MWF 06:00 CT", "Daily 08:00 ET", "Monthly 1st,15th"
 */
function formatRecurrenceRule(
  rule: string | null,
  time?: string | null,
  tz?: string
): string {
  if (!rule) return '—';
  try {
    const parts: Record<string, string> = {};
    for (const segment of rule.split(';')) {
      const eq = segment.indexOf('=');
      if (eq === -1) continue;
      parts[segment.slice(0, eq).toUpperCase()] = segment.slice(eq + 1);
    }
    const freq = parts['FREQ'];
    if (!freq) return rule;

    const TZ_ABBR: Record<string, string> = {
      'America/New_York': 'ET',
      'America/Chicago': 'CT',
      'America/Denver': 'MT',
      'America/Los_Angeles': 'PT',
      'America/Phoenix': 'AZ',
      'America/Anchorage': 'AKT',
      'Pacific/Honolulu': 'HT',
      UTC: 'UTC',
    };
    const tzAbbr = tz ? (TZ_ABBR[tz] ?? tz.split('/').pop() ?? '') : '';
    const timeSuffix = time ? ` ${time}${tzAbbr ? ` ${tzAbbr}` : ''}` : '';

    if (freq === 'DAILY') {
      return `Daily${timeSuffix}`;
    }
    if (freq === 'WEEKLY') {
      const byday = parts['BYDAY'];
      if (byday) {
        // MO,TU,WE → MWF style abbreviation
        const days = byday
          .split(',')
          .map((d) => d.trim().toUpperCase().slice(0, 1) + d.trim().slice(1, 2).toUpperCase())
          .map((d) => {
            const MAP: Record<string, string> = {
              MO: 'M', TU: 'T', WE: 'W', TH: 'Th', FR: 'F', SA: 'Sa', SU: 'Su',
            };
            return MAP[d] ?? d;
          })
          .join('');
        return `${days}${timeSuffix}`;
      }
      return `Weekly${timeSuffix}`;
    }
    if (freq === 'MONTHLY') {
      const bymonthday = parts['BYMONTHDAY'];
      if (bymonthday) {
        const days = bymonthday.split(',').map((d) => {
          const n = parseInt(d.trim(), 10);
          if (isNaN(n)) return d;
          const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
          return `${n}${suffix}`;
        });
        return `Monthly ${days.join(',')}${timeSuffix}`;
      }
      return `Monthly${timeSuffix}`;
    }
    return rule;
  } catch {
    return rule;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RouteTemplateList() {
  const [templates, setTemplates] = useState<RouteTemplateItem[]>([]);
  const [clientMap, setClientMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Fetch templates (active or inactive)
  async function fetchTemplates(includeInactive: boolean) {
    try {
      const [activeRes, inactiveRes] = await Promise.all([
        fetch('/api/v1/carrier/route-templates?active=true&pageSize=200'),
        includeInactive
          ? fetch('/api/v1/carrier/route-templates?active=false&pageSize=200')
          : Promise.resolve(null),
      ]);

      const activeData = activeRes.ok ? await activeRes.json() : { data: { items: [] } };
      const inactiveData =
        inactiveRes && inactiveRes.ok
          ? await inactiveRes.json()
          : { data: { items: [] } };

      const all = [
        ...(activeData.data?.items ?? []),
        ...(inactiveData.data?.items ?? []),
      ] as RouteTemplateItem[];

      setTemplates(all);
    } catch {
      toast.error('Failed to load templates');
    } finally {
      setLoading(false);
    }
  }

  // Fetch clients for name lookup
  async function fetchClients() {
    try {
      const res = await fetch('/api/v1/carrier/clients?pageSize=200');
      if (!res.ok) return;
      const data = await res.json();
      const items = (data.data?.items ?? []) as ClientItem[];
      const map: Record<string, string> = {};
      for (const c of items) map[c.id] = c.name;
      setClientMap(map);
    } catch {
      // Silently ignore — will show clientId as fallback
    }
  }

  useEffect(() => {
    fetchTemplates(showInactive);
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  async function handleToggleActive(id: string, currentActive: boolean) {
    setTogglingId(id);
    try {
      const res = await fetch(`/api/v1/carrier/route-templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive }),
      });
      if (!res.ok) throw new Error('Failed to update');

      // Optimistic update
      setTemplates((prev) =>
        prev.map((t) => (t.id === id ? { ...t, active: !currentActive } : t))
      );
      toast.success(currentActive ? 'Template deactivated' : 'Template activated');
    } catch {
      toast.error('Failed to update template status');
    } finally {
      setTogglingId(null);
    }
  }

  const filtered = templates.filter((t) => {
    const q = search.toLowerCase();
    return !q || t.templateName.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Filters + New button */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <input
          type="text"
          placeholder="Search by template name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => {
              setLoading(true);
              setShowInactive(e.target.checked);
            }}
            className="rounded border-input"
          />
          Show inactive
        </label>
        <div className="sm:ml-auto">
          <Link
            href="/carrier/templates/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Template
          </Link>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Template Name', 'Client', 'Contract', 'Schedule', 'Equipment', 'Stops', 'Active', 'Next Dispatch'].map(
                    (h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground">
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {[1, 2, 3].map((i) => (
                  <tr key={i} className="border-b border-border">
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 rounded bg-muted animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Route className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No route templates found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {search
              ? 'Try adjusting your search.'
              : 'Create your first route template to get started.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Template Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contract</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Schedule</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Equipment</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Stops</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Active</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Next Dispatch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((t) => (
                  <tr
                    key={t.id}
                    className={`hover:bg-muted/30 transition-colors ${!t.active ? 'opacity-60' : ''}`}
                  >
                    {/* Template Name */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/carrier/templates/${t.id}`}
                        className="font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {t.templateName}
                      </Link>
                    </td>

                    {/* Client */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {clientMap[t.clientId] ?? (
                        <span className="text-xs font-mono opacity-60">{t.clientId.slice(0, 8)}…</span>
                      )}
                    </td>

                    {/* Contract */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.contractId ? (
                        <span className="text-xs font-mono opacity-60">{t.contractId.slice(0, 8)}…</span>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Schedule */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {(t.scheduleType === 'fixed_days' || t.scheduleType === 'frequency') ? (
                        <span className="whitespace-nowrap">
                          {formatRecurrenceRule(
                            t.recurrenceRule,
                            t.scheduledDepartureTime,
                            t.recurrenceTimezone
                          )}
                        </span>
                      ) : (
                        <span className="capitalize">{t.scheduleType.replace(/_/g, ' ')}</span>
                      )}
                    </td>

                    {/* Equipment */}
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={
                          EQUIPMENT_BADGE_CLASSES[t.equipmentType] ??
                          'border-border text-muted-foreground'
                        }
                      >
                        {EQUIPMENT_TYPE_LABELS[t.equipmentType] ?? t.equipmentType}
                      </Badge>
                    </td>

                    {/* Stops */}
                    <td className="px-4 py-3 text-muted-foreground">
                      {t._count.stops}
                    </td>

                    {/* Active toggle */}
                    <td className="px-4 py-3">
                      <Switch
                        checked={t.active}
                        disabled={togglingId === t.id}
                        onCheckedChange={() => handleToggleActive(t.id, t.active)}
                        aria-label={`Toggle active for ${t.templateName}`}
                      />
                    </td>

                    {/* Next Dispatch */}
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(t.nextDispatchDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
