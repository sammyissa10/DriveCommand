'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TemplatesTab } from './templates-tab';
import { EmailConfigTab } from './email-config-tab';
import { SendLogTab } from './send-log-tab';
import type { SendLogStats, SendLogRow } from '@/app/(admin)/actions/notifications';
import type { NotificationCategory } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotificationTemplate = {
  id: string;
  triggerKey: string;
  category: NotificationCategory;
  displayName: string;
  isActive: boolean;
  updatedAt: Date;
  availableVariables: unknown;
  defaultBlockJson: unknown;
  defaultSubject: string;
};

type EmailConfig = {
  id: string;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  updatedAt: Date;
} | null;

interface NotificationsTabsProps {
  initialTab: string;
  templates: NotificationTemplate[];
  emailConfig: EmailConfig;
  resendConfigured: boolean;
  sendLogStats: SendLogStats;
  sendLogRows: SendLogRow[];
  sendLogTotal: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotificationsTabs({
  initialTab,
  templates,
  emailConfig,
  resendConfigured,
  sendLogStats,
  sendLogRows,
  sendLogTotal,
}: NotificationsTabsProps) {
  return (
    <Tabs defaultValue={initialTab}>
      <TabsList className="mb-6">
        <TabsTrigger value="templates">Templates</TabsTrigger>
        <TabsTrigger value="email-config">Email Config</TabsTrigger>
        <TabsTrigger value="send-log">Send Log</TabsTrigger>
      </TabsList>

      <TabsContent value="templates">
        <TemplatesTab templates={templates} />
      </TabsContent>

      <TabsContent value="email-config">
        <EmailConfigTab initialConfig={emailConfig} resendConfigured={resendConfigured} />
      </TabsContent>

      <TabsContent value="send-log">
        <SendLogTab
          initialStats={sendLogStats}
          initialRows={sendLogRows}
          initialTotal={sendLogTotal}
        />
      </TabsContent>
    </Tabs>
  );
}
