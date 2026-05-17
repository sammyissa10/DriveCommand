'use client';

import Link from 'next/link';
import { ListChecks, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useChecklistStatus } from '@/hooks/useChecklistStatus';
import { ChecklistStatusCard } from './ChecklistStatusCard';

/**
 * Checklist Status Widget for the Carrier Dashboard.
 *
 * Provides operational triage at a glance:
 * - What's overdue (red flag)
 * - What's due today (amber)
 * - What's expiring soon (informational)
 *
 * Designed for a 5-second morning scan to surface compliance gaps.
 * Detail lives at /checklists — this widget is the gateway.
 */
export function ChecklistStatusWidget() {
  const { data, loading } = useChecklistStatus();

  const allClear =
    data.overdueCount === 0 &&
    data.dueTodayCount === 0 &&
    data.expiringCount === 0;

  if (loading) {
    return (
      <section aria-label="Compliance & Checklists loading">
        {/* Header skeleton */}
        <div className="mb-4 flex items-center justify-between">
          <div className="h-5 w-44 rounded bg-muted animate-pulse" />
          <div className="h-4 w-16 rounded bg-muted animate-pulse" />
        </div>
        {/* Cards skeleton */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 rounded-xl border border-border bg-card animate-pulse"
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Compliance & Checklists">
      {/* Widget header */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">
          Compliance &amp; Checklists
        </h2>
        <Link
          href="/checklists"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View all →
        </Link>
      </div>

      {/* Status cards grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ChecklistStatusCard
          title="Overdue"
          count={data.overdueCount}
          subtitle={data.overdueContext}
          status="overdue"
          href="/checklists?filter=overdue"
          icon={ListChecks}
        />
        <ChecklistStatusCard
          title="Due Today"
          count={data.dueTodayCount}
          subtitle={data.dueTodayContext}
          status="dueToday"
          href="/checklists?filter=due-today"
          icon={ListChecks}
        />
        <ChecklistStatusCard
          title="Expiring Soon"
          count={data.expiringCount}
          subtitle={data.expiringContext}
          status="expiring"
          href="/checklists?filter=expiring"
          icon={ShieldCheck}
        />
      </div>

      {/* All-clear affordance — shown when all counts are zero */}
      {allClear && (
        <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground/70">
          <CheckCircle2 className="h-4 w-4 text-green-500 dark:text-green-400" />
          <span>Everything is up to date</span>
        </div>
      )}
    </section>
  );
}
