'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Package, ChevronRight } from 'lucide-react';
import { LoadStatusBadge } from './load-status-badge';
import { formatAddress } from '@/components/shared/address-autocomplete';

interface LoadItem {
  id: string;
  loadNumber: string;
  customer: { companyName: string };
  origin: string;
  destination: string;
  pickupDate: Date | string;
  rate: any;
  status: string;
  driver?: { firstName: string | null; lastName: string | null } | null;
  truck?: { make: string; model: string } | null;
}

const TABS = [
  { label: 'All', value: 'ALL' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Dispatched', value: 'DISPATCHED' },
  { label: 'In Transit', value: 'IN_TRANSIT' },
  { label: 'Delivered', value: 'DELIVERED' },
];

export function LoadList({ loads }: { loads: LoadItem[] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('ALL');

  const filtered =
    activeTab === 'ALL'
      ? loads
      : loads.filter((l) => {
          if (activeTab === 'IN_TRANSIT') return l.status === 'IN_TRANSIT' || l.status === 'PICKED_UP';
          return l.status === activeTab;
        });

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="overflow-x-auto border-b border-border">
        <div className="flex gap-1 flex-nowrap whitespace-nowrap">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.value
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {tab.label}
              {tab.value !== 'ALL' && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({loads.filter((l) => {
                    if (tab.value === 'IN_TRANSIT') return l.status === 'IN_TRANSIT' || l.status === 'PICKED_UP';
                    return l.status === tab.value;
                  }).length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table or empty state */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 text-lg font-semibold">No loads yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeTab === 'ALL'
              ? 'Create your first load to start dispatching.'
              : `No ${activeTab.toLowerCase().replace('_', ' ')} loads at the moment.`}
          </p>
          {activeTab === 'ALL' && (
            <Link
              href="/loads/new"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Create Load
            </Link>
          )}
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block rounded-xl border border-border bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Load #</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Customer</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Route</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Pickup Date</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Rate</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Driver</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((load) => (
                    <tr
                      key={load.id}
                      className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                      onDoubleClick={() => router.push(`/loads/${load.id}`)}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/loads/${load.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {load.loadNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-foreground">{load.customer.companyName}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatAddress(load.origin)} &rarr; {formatAddress(load.destination)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(load.pickupDate).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        ${Number(load.rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {load.driver
                          ? `${load.driver.firstName ?? ''} ${load.driver.lastName ?? ''}`.trim()
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <LoadStatusBadge status={load.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card List */}
          <div className="md:hidden divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
            {filtered.map((load) => (
              <div
                key={load.id}
                onClick={() => router.push(`/loads/${load.id}`)}
                className="flex items-center gap-3 px-4 py-3.5 active:bg-muted/50 cursor-pointer"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{load.loadNumber}</span>
                    <LoadStatusBadge status={load.status} />
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <span className="truncate">{load.customer.companyName}</span>
                    <span className="text-muted-foreground/40">&middot;</span>
                    <span className="font-medium text-foreground">
                      ${Number(load.rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm text-muted-foreground truncate">
                    {formatAddress(load.origin)} &rarr; {formatAddress(load.destination)}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {new Date(load.pickupDate).toLocaleDateString()}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
