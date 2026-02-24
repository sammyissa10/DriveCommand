'use client';

/**
 * Dashboard unified notifications panel.
 * Displays aggregated alerts from expiring documents, overdue invoices, and safety events.
 */

import Link from 'next/link';
import { useState } from 'react';
import {
  Bell,
  AlertOctagon,
  AlertTriangle,
  Info,
  CheckCircle,
} from 'lucide-react';
import type { NotificationAlert } from '@/app/(owner)/actions/dashboard';

interface NotificationsPanelProps {
  alerts: NotificationAlert[];
}

/** Format a timestamp as relative time (e.g. "2d ago", "3h ago") */
function relativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  const months = Math.floor(diffDays / 30);
  return `${months}mo ago`;
}

function SeverityIcon({ severity }: { severity: NotificationAlert['severity'] }) {
  if (severity === 'critical') {
    return <AlertOctagon className="h-4 w-4 flex-shrink-0 text-status-danger-foreground" />;
  }
  if (severity === 'warning') {
    return <AlertTriangle className="h-4 w-4 flex-shrink-0 text-status-warning-foreground" />;
  }
  return <Info className="h-4 w-4 flex-shrink-0 text-status-info-foreground" />;
}

const INITIAL_SHOW = 10;

export function NotificationsPanel({ alerts }: NotificationsPanelProps) {
  const [showAll, setShowAll] = useState(false);

  const criticalCount = alerts.filter((a) => a.severity === 'critical').length;
  const displayAlerts = showAll ? alerts : alerts.slice(0, INITIAL_SHOW);
  const remainingCount = alerts.length - INITIAL_SHOW;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-status-warning-bg">
            <Bell className="h-4 w-4 text-status-warning-foreground" />
            {criticalCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-status-danger-foreground text-[10px] font-bold text-white">
                {criticalCount > 9 ? '9+' : criticalCount}
              </span>
            )}
          </div>
          <h2 className="text-lg font-semibold text-card-foreground">Alerts</h2>
        </div>
        {alerts.length > 0 && (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
              criticalCount > 0
                ? 'bg-status-danger-bg text-status-danger-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {alerts.length}
          </span>
        )}
      </div>

      {/* Content */}
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8">
          <CheckCircle className="mb-3 h-10 w-10 text-status-success-foreground/40" />
          <p className="text-sm text-muted-foreground">No active alerts</p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayAlerts.map((alert) => (
            <Link
              key={alert.id}
              href={alert.href}
              className="flex items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
            >
              <div className="mt-0.5">
                <SeverityIcon severity={alert.severity} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-card-foreground">{alert.title}</p>
                <p className="truncate text-xs text-muted-foreground">{alert.description}</p>
              </div>
              <span className="flex-shrink-0 text-xs text-muted-foreground">
                {relativeTime(alert.timestamp as Date | string)}
              </span>
            </Link>
          ))}

          {!showAll && remainingCount > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full rounded-lg border border-dashed border-border py-2 text-center text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary"
            >
              and {remainingCount} more...
            </button>
          )}
        </div>
      )}
    </div>
  );
}
