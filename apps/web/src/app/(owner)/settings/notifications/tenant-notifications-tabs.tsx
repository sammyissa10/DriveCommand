'use client';

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
  return (
    <Tabs defaultValue="notifications">
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
        <TenantSendLogTab initialSendLog={initialSendLog} initialStats={initialStats} />
      </TabsContent>
    </Tabs>
  );
}
