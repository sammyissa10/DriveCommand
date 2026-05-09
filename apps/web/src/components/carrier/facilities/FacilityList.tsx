'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Warehouse, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface FacilityItem {
  id: string;
  name: string;
  facilityType: string | null;
  city: string | null;
  state: string | null;
  contactName: string | null;
  contacts?: Array<{ name: string; phone?: string; email?: string; role?: string }>;
  notes: string | null;
}

const FACILITY_TYPES = [
  { value: 'shipper',   label: 'Shipper' },
  { value: 'receiver',  label: 'Receiver' },
  { value: 'terminal',  label: 'Terminal' },
  { value: 'fuel_stop', label: 'Fuel Stop' },
  { value: 'other',     label: 'Other' },
] as const;

const BADGE_CLASSES: Record<string, string> = {
  shipper:   'border-blue-500 text-blue-600 dark:text-blue-400',
  receiver:  'border-green-500 text-green-600 dark:text-green-400',
  terminal:  'border-purple-500 text-purple-600 dark:text-purple-400',
  fuel_stop: 'border-amber-500 text-amber-600 dark:text-amber-400',
  other:     'border-slate-500 text-slate-600 dark:text-slate-400',
};

function getFacilityTypeLabel(type: string | null): string {
  if (!type) return '—';
  const found = FACILITY_TYPES.find((t) => t.value === type);
  return found ? found.label : type.replace(/_/g, ' ');
}

export function FacilityList({ facilities }: { facilities: FacilityItem[] }) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const filtered = facilities.filter((f) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      f.name.toLowerCase().includes(q) ||
      (f.city ?? '').toLowerCase().includes(q);
    const matchesType =
      typeFilter === 'all' ||
      f.facilityType === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="space-y-4">
      {/* Filters + New button */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by name or city..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:max-w-xs"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-52"
        >
          <option value="all">All Types</option>
          {FACILITY_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <div className="sm:ml-auto">
          <Link
            href="/carrier/facilities/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Facility
          </Link>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Warehouse className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No facilities found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {search || typeFilter !== 'all'
              ? 'Try adjusting your search or filter.'
              : 'Add your first facility to get started.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Location</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((f) => (
                  <tr key={f.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/carrier/facilities/${f.id}`}
                        className="font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {f.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {f.facilityType ? (
                        <Badge
                          variant="outline"
                          className={BADGE_CLASSES[f.facilityType] ?? 'border-border text-muted-foreground'}
                        >
                          {getFacilityTypeLabel(f.facilityType)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {f.city && f.state
                        ? `${f.city}, ${f.state}`
                        : f.city ?? f.state ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {f.contacts && f.contacts.length > 0
                        ? f.contacts[0].name
                        : f.contactName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs">
                      {f.notes
                        ? f.notes.length > 60
                          ? f.notes.slice(0, 60) + '…'
                          : f.notes
                        : '—'}
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
