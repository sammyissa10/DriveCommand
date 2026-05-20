'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Users, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SamplePill } from '@/components/onboarding/sample-pill';

export interface ClientItem {
  id: string;
  name: string;
  status: string;
  email: string | null;
  phone: string | null;
  primaryContact: string | null;
  city: string | null;
  state: string | null;
  portalAccess: boolean;
  isSample: boolean;
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  active: 'border-green-500 text-green-600 dark:text-green-400',
  inactive: 'border-yellow-500 text-yellow-600 dark:text-yellow-400',
  blocked: 'border-red-500 text-red-600 dark:text-red-400',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'blocked', label: 'Blocked' },
];

export function ClientList({ clients, role, canCreate }: { clients: ClientItem[]; role?: string; canCreate?: boolean }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = clients.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.primaryContact ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {/* Filters + New button */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by name, contact, or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:w-44"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {canCreate && (
          <div className="sm:ml-auto">
            <Link
              href="/carrier/clients/new"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Client
            </Link>
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No clients found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {search || statusFilter !== 'all'
              ? 'Try adjusting your search or filter.'
              : 'Add your first client to get started.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Primary Contact</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/carrier/clients/${c.id}`}
                          className="font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {c.name}
                        </Link>
                        {c.isSample && <SamplePill />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={STATUS_BADGE_CLASSES[c.status] ?? 'border-border text-muted-foreground'}
                      >
                        {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.primaryContact ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.city && c.state
                        ? `${c.city}, ${c.state}`
                        : c.city ?? c.state ?? '—'}
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
