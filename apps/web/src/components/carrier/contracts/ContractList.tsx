'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface ContractItem {
  id: string;
  contractNumber: string;
  contractType: string | null;
  rateType: string | null;
  baseRate: string | null;
  fuelSurchargeMethod: string | null;
  fuelSurchargeRate: string | null;
  status: string;
  effectiveDate: string | null;
  expirationDate: string | null;
  clientId: string;
  client: { name: string };
}

const CONTRACT_TYPE_CLASSES: Record<string, string> = {
  spot: 'border-slate-500 text-slate-600 dark:text-slate-400',
  dedicated: 'border-blue-500 text-blue-600 dark:text-blue-400',
  volume: 'border-purple-500 text-purple-600 dark:text-purple-400',
  brokerage: 'border-amber-500 text-amber-600 dark:text-amber-400',
};

const CONTRACT_STATUS_CLASSES: Record<string, string> = {
  active: 'border-green-500 text-green-600 dark:text-green-400',
  pending: 'border-yellow-500 text-yellow-600 dark:text-yellow-400',
  expired: 'border-red-500 text-red-600 dark:text-red-400',
  terminated: 'border-slate-500 text-slate-600 dark:text-slate-400',
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'expired', label: 'Expired' },
  { value: 'terminated', label: 'Terminated' },
];

function formatRateDisplay(rateType: string | null, baseRate: string | null): string {
  if (!baseRate) return '—';
  const n = parseFloat(baseRate);
  const formatted = n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  switch (rateType) {
    case 'per_mile': return `${formatted}/mi`;
    case 'flat': return `${formatted} flat`;
    case 'per_hour': return `${formatted}/hr`;
    case 'per_load': return `${formatted}/load`;
    case 'percentage': return `${n}%`;
    default: return formatted;
  }
}

function isExpiringSoon(expirationDate: string | null, status: string): boolean {
  if (!expirationDate) return false;
  if (status === 'terminated' || status === 'expired') return false;
  const exp = new Date(expirationDate);
  const now = new Date();
  const thirtyDaysOut = new Date(now);
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
  return exp <= thirtyDaysOut && exp > now;
}

export function ContractList({ contracts, role }: { contracts: ContractItem[]; role?: string }) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = contracts.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      c.contractNumber.toLowerCase().includes(q) ||
      c.client.name.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {/* Filters + New button */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by contract # or client..."
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
        {role !== 'MANAGER' && (
          <div className="sm:ml-auto">
            <Link
              href="/carrier/contracts/new"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New Contract
            </Link>
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No contracts found</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {search || statusFilter !== 'all'
              ? 'Try adjusting your search or filter.'
              : 'Create your first contract to get started.'}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Contract #</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Rate</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Expiration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => {
                  const expiring = isExpiringSoon(c.expirationDate, c.status);
                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-muted/30 transition-colors ${
                        expiring ? 'bg-amber-50 dark:bg-amber-950/30' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/carrier/contracts/${c.id}`}
                          className="font-medium text-foreground hover:text-primary transition-colors"
                        >
                          {c.contractNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/carrier/clients/${c.clientId}`}
                          className="text-muted-foreground hover:text-primary transition-colors"
                        >
                          {c.client.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {c.contractType ? (
                          <Badge
                            variant="outline"
                            className={CONTRACT_TYPE_CLASSES[c.contractType] ?? 'border-border text-muted-foreground'}
                          >
                            {c.contractType.charAt(0).toUpperCase() + c.contractType.slice(1)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatRateDisplay(c.rateType, c.baseRate)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={CONTRACT_STATUS_CLASSES[c.status] ?? 'border-border text-muted-foreground'}
                        >
                          {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.expirationDate
                          ? new Date(c.expirationDate).toLocaleDateString()
                          : '—'}
                        {expiring && (
                          <span className="ml-2 text-xs font-medium text-amber-600 dark:text-amber-400">
                            Expiring soon
                          </span>
                        )}
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
