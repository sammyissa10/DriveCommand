'use client';

/**
 * ReportTabNav — Horizontal tab strip for the driver-pay reports page.
 * Preserves period + filter querystring when switching tabs.
 */

import React from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

type TabKey =
  | 'overview'
  | 'accessorial'
  | 'profitability'
  | 'components'
  | 'overtime'
  | 'override-audit'
  | 'deduction-balances'
  | 'settlement-history';

interface Tab {
  key: TabKey;
  label: string;
}

const TABS: Tab[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'accessorial', label: 'Accessorial Spend' },
  { key: 'profitability', label: 'Load Profitability' },
  { key: 'components', label: 'Components' },
  { key: 'overtime', label: 'Overtime' },
  { key: 'override-audit', label: 'Override Audit' },
  { key: 'deduction-balances', label: 'Deduction Balances' },
  { key: 'settlement-history', label: 'Settlement History' },
];

interface Props {
  active: TabKey;
}

export function ReportTabNav({ active }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function buildHref(key: TabKey): string {
    const params = new URLSearchParams();

    // Preserve these params across tab switches
    const preserve = ['period', 'customStart', 'customEnd', 'driverIds'];
    for (const key of preserve) {
      const val = searchParams.get(key);
      if (val) params.set(key, val);
    }

    params.set('tab', key);
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="overflow-x-auto -mx-6 px-6 border-b">
      <nav className="flex items-end gap-0 min-w-max">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={buildHref(tab.key)}
              className={[
                'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                'border-b-2 -mb-px',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
              ].join(' ')}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
