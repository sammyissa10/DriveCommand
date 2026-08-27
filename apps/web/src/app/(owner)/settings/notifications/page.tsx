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
import type { NotificationSendStatus } from '@/generated/prisma';
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

  // quick-556: stats first, because whether this tenant has undelivered
  // notifications decides which page of the send log is worth fetching.
  const stats = await getTenantSendLogStats();
  const hasFailures = (stats.failedAllTime ?? 0) > 0;

  const [settings, subscribers, sendLog, users, triggers] = await Promise.all([
    listTenantNotificationSettings(),
    listTenantSubscribers(),
    // When something failed to send, the log's most useful first page is the
    // failures — and the banner above the tabs points straight at them, so the
    // rows and the status dropdown must already agree. Fetching unfiltered here
    // and letting the client re-filter on mount would show the wrong answer
    // first and then correct itself, which reads as a glitch and is exactly the
    // "not loaded yet vs nothing to show" conflation this codebase keeps hitting.
    // The dropdown is visible and one click clears it.
    listTenantSendLog(
      hasFailures
        ? { page: 1, pageSize: 25, status: 'FAILED' as NotificationSendStatus }
        : { page: 1, pageSize: 25 }
    ),
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
