'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle, ChevronRight } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlertItem {
  id: string;
  label: string;
  count: number;
  href: string;
  severity: 'warning' | 'critical';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AlertBar() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/carrier/dashboard/alerts')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((json) => setAlerts(Array.isArray(json) ? json : []))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-9 w-52 flex-shrink-0 rounded-lg bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 w-fit">
        <CheckCircle className="h-4 w-4" />
        All clear — no compliance alerts
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {alerts.map((alert) => {
        const isCritical = alert.severity === 'critical';
        const cardClass = isCritical
          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800';

        return (
          <Link
            key={alert.id}
            href={alert.href}
            className={`inline-flex flex-shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-opacity hover:opacity-80 ${cardClass}`}
          >
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>{alert.label}</span>
            <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
          </Link>
        );
      })}
    </div>
  );
}
