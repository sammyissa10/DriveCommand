'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComplianceAlert {
  type: string;
  severity: 'critical' | 'warning';
  message: string;
  entityId: string;
  entityType: string;
  link: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AlertBar() {
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/carrier/compliance-alerts')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((json) => setAlerts(json.data ?? []))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-7 w-48 flex-shrink-0 rounded-full bg-muted animate-pulse"
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
      {alerts.map((alert, idx) => {
        const isCritical = alert.severity === 'critical';
        const chipClass = isCritical
          ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';

        return (
          <Link
            key={`${alert.entityId}-${alert.type}-${idx}`}
            href={alert.link}
            className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80 ${chipClass}`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {alert.message}
          </Link>
        );
      })}
    </div>
  );
}
