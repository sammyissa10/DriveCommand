'use client';

import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { formatDistanceToNow } from 'date-fns';
import { Activity } from 'lucide-react';

// Friendly labels for trigger events — keep aligned with TriggerEvent enum.
const EVENT_LABEL: Record<string, string> = {
  ON_DRIVER_CREATE: 'Driver created',
  ON_VEHICLE_CREATE: 'Vehicle created',
  ON_DISPATCH_CREATE: 'Dispatch created',
  ON_DISPATCH_DEPART: 'Dispatch departed',
  ON_DISPATCH_DELIVER: 'Dispatch delivered',
  ON_PARTNER_CREATE: 'Partner created',
};

export function AutomationActivityLog() {
  const trpc = useTRPC();
  const { data: entries = [], isLoading } = useQuery(
    trpc.workflows.trigger.listActivityLog.queryOptions(),
  );

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Activity</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          The 50 most recent checklists started automatically by your rules.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-md border border-border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center">
          <Activity className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No automation activity yet. When a rule fires, it will show up here.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {entries.map((e) => (
            <li key={e.id} className="px-4 py-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {e.playbookName}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {EVENT_LABEL[e.triggerEvent ?? ''] ?? e.triggerEvent ?? 'Triggered'} &middot;{' '}
                  <span className="text-foreground">{e.entityName}</span>
                </div>
              </div>
              <time
                className="text-xs text-muted-foreground whitespace-nowrap"
                dateTime={new Date(e.createdAt).toISOString()}
                title={new Date(e.createdAt).toLocaleString()}
              >
                {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
