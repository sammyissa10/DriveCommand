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
import { SettingsHeader } from "@/components/settings/SettingsHeader"
import { SETTINGS_PAGE_META } from "@/components/settings/settings.config"

const meta = SETTINGS_PAGE_META.notifications

/**
 * Notifications Settings Page
 *
 * Configure notification preferences, templates, and subscribers.
 * This page uses the existing TenantNotificationsTabs component which handles
 * the full notification management UI.
 */
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
    <div>
      <SettingsHeader title={meta.title} subtitle={meta.subtitle} />

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
