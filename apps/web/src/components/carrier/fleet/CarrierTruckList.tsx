'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Truck, Plus, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface CarrierTruckItem {
  id: string;
  unitNumber: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  truckType: string;
  currentOdometerMiles: number | null;
  registrationExpiry: Date | string | null;
  licenseExpiry: Date | string | null;
  status: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntil(date: Date | string | null): number | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = d.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function expiryColor(date: Date | string | null): string {
  const days = daysUntil(date);
  if (days === null) return 'text-muted-foreground';
  if (days < 30) return 'text-red-600 dark:text-red-400';
  if (days < 90) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatOdometer(miles: number | null): string {
  if (miles == null) return '—';
  return miles.toLocaleString() + ' mi';
}

const TRUCK_TYPE_LABELS: Record<string, string> = {
  semi: 'Semi',
  box_truck: 'Box Truck',
  flatbed: 'Flatbed',
  reefer: 'Reefer',
  tanker: 'Tanker',
  day_cab: 'Day Cab',
  straight_truck: 'Straight Truck',
};

const TRUCK_TYPE_BADGE_CLASSES: Record<string, string> = {
  semi: 'border-blue-500 text-blue-600 dark:text-blue-400',
  box_truck: 'border-orange-500 text-orange-600 dark:text-orange-400',
  flatbed: 'border-amber-500 text-amber-600 dark:text-amber-400',
  reefer: 'border-cyan-500 text-cyan-600 dark:text-cyan-400',
  tanker: 'border-purple-500 text-purple-600 dark:text-purple-400',
  day_cab: 'border-green-500 text-green-600 dark:text-green-400',
  straight_truck: 'border-slate-500 text-slate-600 dark:text-slate-400',
};

const STATUS_CLASSES: Record<string, string> = {
  active: 'border-green-500 text-green-600 dark:text-green-400',
  inactive: 'border-slate-400 text-slate-500 dark:text-slate-400',
  maintenance: 'border-amber-500 text-amber-600 dark:text-amber-400',
  out_of_service: 'border-red-500 text-red-600 dark:text-red-400',
};

const TRUCK_TYPES = ['semi', 'box_truck', 'flatbed', 'reefer', 'tanker', 'day_cab', 'straight_truck'];
const TRUCK_STATUSES = ['active', 'inactive', 'maintenance', 'out_of_service'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CarrierTruckList({ trucks }: { trucks: CarrierTruckItem[] }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const filtered = trucks.filter((t) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      t.unitNumber.toLowerCase().includes(q) ||
      (t.vin ?? '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchesType = typeFilter === 'all' || t.truckType === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  return (
    <div className="space-y-4">
      {/* Filters + New button */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search by unit # or VIN..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-44"
        >
          <option value="all">All Statuses</option>
          {TRUCK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-44"
        >
          <option value="all">All Types</option>
          {TRUCK_TYPES.map((t) => (
            <option key={t} value={t}>
              {TRUCK_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <div className="sm:ml-auto">
          <Link
            href="/carrier/fleet/trucks/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Truck
          </Link>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Truck className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No trucks found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {search || statusFilter !== 'all' || typeFilter !== 'all'
              ? 'Try adjusting your search or filters.'
              : 'Add your first carrier truck to get started.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Unit #</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">VIN</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Year / Make / Model</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Odometer</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Reg. Expiry</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">License Expiry</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((t) => {
                  const regDays = daysUntil(t.registrationExpiry);
                  const licDays = daysUntil(t.licenseExpiry);
                  const hasAlert =
                    (regDays !== null && regDays < 30) ||
                    (licDays !== null && licDays < 30);

                  return (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {hasAlert && (
                            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" />
                          )}
                          <Link
                            href={`/carrier/fleet/trucks/${t.id}`}
                            className="font-medium text-foreground hover:text-primary transition-colors"
                          >
                            {t.unitNumber}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {t.vin ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {[t.year, t.make, t.model].filter(Boolean).join(' ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={TRUCK_TYPE_BADGE_CLASSES[t.truckType] ?? 'border-border text-muted-foreground'}
                        >
                          {TRUCK_TYPE_LABELS[t.truckType] ?? t.truckType}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatOdometer(t.currentOdometerMiles)}
                      </td>
                      <td className="px-4 py-3">
                        {t.registrationExpiry ? (
                          <div className="flex flex-col">
                            <span className={`font-medium ${expiryColor(t.registrationExpiry)}`}>
                              {formatDate(t.registrationExpiry)}
                            </span>
                            {regDays !== null && (
                              <span className={`text-xs ${expiryColor(t.registrationExpiry)}`}>
                                {regDays < 0
                                  ? `${Math.abs(regDays)}d overdue`
                                  : regDays === 0
                                  ? 'Expires today'
                                  : `${regDays}d remaining`}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {t.licenseExpiry ? (
                          <div className="flex flex-col">
                            <span className={`font-medium ${expiryColor(t.licenseExpiry)}`}>
                              {formatDate(t.licenseExpiry)}
                            </span>
                            {licDays !== null && (
                              <span className={`text-xs ${expiryColor(t.licenseExpiry)}`}>
                                {licDays < 0
                                  ? `${Math.abs(licDays)}d overdue`
                                  : licDays === 0
                                  ? 'Expires today'
                                  : `${licDays}d remaining`}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={STATUS_CLASSES[t.status] ?? 'border-border text-muted-foreground'}
                        >
                          {t.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
