'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { NotificationsTab } from './notifications-tab';
import { SubscribersTab } from './subscribers-tab';
import { TenantSendLogTab } from './tenant-send-log-tab';
import type {
  TenantNotificationSettingRow,
  TenantSubscriberRow,
  SendLogPaginatedResult,
  SendLogStats,
  TenantUserRow,
  ActiveTemplateForTenant,
} from '@/app/(owner)/actions/tenant-notification-settings';

interface TenantNotificationsTabsProps {
  initialSettings: TenantNotificationSettingRow[];
  initialSubscribers: TenantSubscriberRow[];
  initialSendLog: SendLogPaginatedResult;
  initialStats: SendLogStats;
  users: TenantUserRow[];
  triggers: ActiveTemplateForTenant[];
}

export function TenantNotificationsTabs({
  initialSettings,
  initialSubscribers,
  initialSendLog,
  initialStats,
  users,
  triggers,
}: TenantNotificationsTabsProps) {
  const [tab, setTab] = useState('notifications');
  const failedAllTime = initialStats.failedAllTime ?? 0;

  return (
    <Tabs value={tab} onValueChange={setTab}>
      {/*
        quick-556: the failure count sits ABOVE the tabs, not inside the Send Log
        tab where it used to live as one KPI card among five.

        Six of the eight notification failures this system has ever had were this
        tenant's: driver invitations that were never delivered, in two different
        carriers, going back to 2026-05-26. Every one was recorded, with its
        reason, in a log the owner could open at any time — and none was ever
        seen, because seeing it required opening a tab nobody has a reason to
        open. A count that is only visible to somebody already looking for it is
        not a count.

        Clicking switches to the Send Log with the status filter set to FAILED,
        rather than linking to a URL: these tabs are local state, so a link would
        reload the page and land on the default tab. Same destination, one tap.
      */}
      {failedAllTime > 0 && (
        <button
          type="button"
          onClick={() => setTab('send-log')}
          className="mb-4 flex w-full items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-left text-sm text-red-800 transition-colors hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-950/50"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {/* One string per sentence — quick-517. A count split across JSX
                children is the whitespace trap that shipped "4 stopswill". */}
            <span className="font-medium">
              {failedAllTime === 1
                ? '1 notification failed to send.'
                : `${failedAllTime} notifications failed to send.`}
            </span>{' '}
            Someone may not have received something you sent. Open the send log to see who, when, and why.
          </span>
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        </button>
      )}

      <TabsList>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
        <TabsTrigger value="send-log">Send Log</TabsTrigger>
      </TabsList>

      <TabsContent value="notifications" className="mt-6">
        <NotificationsTab initialSettings={initialSettings} />
      </TabsContent>

      <TabsContent value="subscribers" className="mt-6">
        <SubscribersTab
          initialSubscribers={initialSubscribers}
          users={users}
          triggers={triggers}
        />
      </TabsContent>

      <TabsContent value="send-log" className="mt-6">
        <TenantSendLogTab
          initialSendLog={initialSendLog} initialStats={initialStats}
          initialStatus={failedAllTime > 0 ? 'FAILED' : undefined}
        />
      </TabsContent>
    </Tabs>
  );
}
