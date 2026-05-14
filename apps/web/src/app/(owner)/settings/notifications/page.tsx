export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import {
  listTenantNotificationSettings,
  listTenantSubscribers,
  listTenantSendLog,
  getTenantSendLogStats,
  listTenantUsers,
  listActiveTemplatesForTenant,
} from '@/app/(owner)/actions/tenant-notification-settings';
import { TenantNotificationsTabs } from './tenant-notifications-tabs';

export default async function NotificationsSettingsPage() {
  try {
    await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  } catch {
    redirect('/unauthorized');
  }

  const [settings, subscribers, sendLog, stats, users, triggers] = await Promise.all([
    listTenantNotificationSettings(),
    listTenantSubscribers(),
    listTenantSendLog({ page: 1, pageSize: 25 }),
    getTenantSendLogStats(),
    listTenantUsers(),
    listActiveTemplatesForTenant(),
  ]);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
        <p className="mt-1 text-sm text-gray-500">
          Customize notification templates, manage subscribers, and view delivery logs for your
          team.
        </p>
      </div>

      <TenantNotificationsTabs
        initialSettings={settings}
        initialSubscribers={subscribers}
        initialSendLog={sendLog}
        initialStats={stats}
        users={users}
        triggers={triggers}
      />
    </div>
  );
}
