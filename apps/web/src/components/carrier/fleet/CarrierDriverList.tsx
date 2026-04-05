'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Users, Plus, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface CarrierDriverItem {
  id: string;
  firstName: string;
  lastName: string;
  cdlClass: string | null;
  cdlExpiry: Date | string | null;
  payModel: string;
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

const PAY_MODEL_LABELS: Record<string, string> = {
  per_mile: 'Per Mile',
  percentage: 'Percentage',
  flat_rate: 'Flat Rate',
  per_stop: 'Per Stop',
};

const STATUS_CLASSES: Record<string, string> = {
  active: 'border-green-500 text-green-600 dark:text-green-400',
  inactive: 'border-slate-400 text-slate-500 dark:text-slate-400',
  suspended: 'border-red-500 text-red-600 dark:text-red-400',
};

const PAY_BADGE_CLASSES: Record<string, string> = {
  per_mile: 'border-blue-500 text-blue-600 dark:text-blue-400',
  percentage: 'border-purple-500 text-purple-600 dark:text-purple-400',
  flat_rate: 'border-orange-500 text-orange-600 dark:text-orange-400',
  per_stop: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
};

const DRIVER_STATUSES = ['active', 'inactive', 'suspended'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CarrierDriverList({ drivers }: { drivers: CarrierDriverItem[] }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = drivers.filter((d) => {
    const q = search.toLowerCase();
    const fullName = `${d.firstName} ${d.lastName}`.toLowerCase();
    const matchesSearch = !q || fullName.includes(q);
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {/* Filters + New button */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by name..."
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
          {DRIVER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <div className="sm:ml-auto">
          <Link
            href="/carrier/fleet/drivers/new"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Driver
          </Link>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No drivers found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {search || statusFilter !== 'all'
              ? 'Try adjusting your search or filter.'
              : 'Add your first carrier driver to get started.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Driver</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">CDL Class</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">CDL Expiry</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pay Model</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((d) => {
                  const days = daysUntil(d.cdlExpiry);
                  const isNearExpiry = days !== null && days < 30;

                  return (
                    <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isNearExpiry && (
                            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" />
                          )}
                          <Link
                            href={`/carrier/fleet/drivers/${d.id}`}
                            className="font-medium text-foreground hover:text-primary transition-colors"
                          >
                            {d.firstName} {d.lastName}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {d.cdlClass ? (
                          <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400">
                            Class {d.cdlClass}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {d.cdlExpiry ? (
                          <div className="flex flex-col">
                            <span className={`font-medium ${expiryColor(d.cdlExpiry)}`}>
                              {formatDate(d.cdlExpiry)}
                            </span>
                            {days !== null && (
                              <span className={`text-xs ${expiryColor(d.cdlExpiry)}`}>
                                {days < 0
                                  ? `${Math.abs(days)}d overdue`
                                  : days === 0
                                  ? 'Expires today'
                                  : `${days}d remaining`}
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
                          className={PAY_BADGE_CLASSES[d.payModel] ?? 'border-border text-muted-foreground'}
                        >
                          {PAY_MODEL_LABELS[d.payModel] ?? d.payModel}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={STATUS_CLASSES[d.status] ?? 'border-border text-muted-foreground'}
                        >
                          {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
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
