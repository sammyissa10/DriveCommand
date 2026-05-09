'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, DollarSign, CreditCard, FileText } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtCurrency(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KPIData {
  loadsThisWeek: number | null;
  revenueThisWeek: number | null;
  pendingPayApprovals: number | null;
  openInvoices: number | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function KPIStrip() {
  const router = useRouter();
  const [data, setData] = useState<KPIData>({
    loadsThisWeek: null,
    revenueThisWeek: null,
    pendingPayApprovals: null,
    openInvoices: null,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/carrier/dashboard/kpi')
      .then((r) => (r.ok ? r.json() : null))
      .then((kpiJson) => {
        setData({
          loadsThisWeek: kpiJson?.loadsThisWeek ?? 0,
          revenueThisWeek: kpiJson?.revenueThisWeek ?? 0,
          pendingPayApprovals: kpiJson?.pendingPayApprovals ?? 0,
          openInvoices: kpiJson?.openInvoices ?? 0,
        });
      })
      .catch(() => {
        setData({ loadsThisWeek: 0, revenueThisWeek: 0, pendingPayApprovals: 0, openInvoices: 0 });
      })
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    {
      icon: Package,
      label: 'Loads This Week',
      value: loading ? null : data.loadsThisWeek,
      format: (v: number) => String(v),
      href: null,
    },
    {
      icon: DollarSign,
      label: 'Revenue This Week',
      value: loading ? null : data.revenueThisWeek,
      format: (v: number) => fmtCurrency(v),
      href: null,
    },
    {
      icon: CreditCard,
      label: 'Pending Pay',
      value: loading ? null : data.pendingPayApprovals,
      format: (v: number) => String(v),
      href: '/carrier/reports/driver-pay',
    },
    {
      icon: FileText,
      label: 'Open Invoices',
      value: loading ? null : data.openInvoices,
      format: (v: number) => String(v),
      href: '/carrier/loads?status=invoiced',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ icon: Icon, label, value, format, href }) => (
        <div
          key={label}
          className={`rounded-lg border border-border bg-card p-4 flex flex-col gap-2${href ? ' cursor-pointer active:scale-95 transition-transform' : ''}`}
          onClick={() => href && router.push(href)}
          role={href ? 'button' : undefined}
          tabIndex={href ? 0 : undefined}
          onKeyDown={(e) => href && e.key === 'Enter' && router.push(href)}
          aria-label={href ? `${label} — navigate to ${href}` : label}
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon className="h-4 w-4" />
            <span className="text-xs font-medium">{label}</span>
          </div>
          {loading ? (
            <div className="h-8 w-24 bg-muted rounded animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-foreground">
              {value == null ? '—' : format(value)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
