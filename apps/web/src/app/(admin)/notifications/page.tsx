export const dynamic = 'force-dynamic';

import { requireAuth, isSystemAdmin } from '@/lib/auth/supabase';
import { redirect } from 'next/navigation';
import {
  listNotificationTemplates,
  getNotificationEmailConfig,
  listNotificationSendLog,
  getNotificationSendLogStats,
} from '@/app/(admin)/actions/notifications';
import { NotificationsTabs } from './notifications-tabs';

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------

async function requireAdminAccess() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) {
    redirect('/sign-in');
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface NotificationsPageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function NotificationsPage({ searchParams }: NotificationsPageProps) {
  await requireAdminAccess();

  const params = await searchParams;
  const validTabs = ['templates', 'email-config', 'send-log'];
  const tab = validTabs.includes(params.tab ?? '') ? (params.tab ?? 'templates') : 'templates';

  // Fetch all initial data in parallel — all tabs are cheap to load upfront
  const [templates, emailConfigResult, sendLogResult, sendLogStats] = await Promise.all([
    listNotificationTemplates(),
    getNotificationEmailConfig(),
    listNotificationSendLog({ page: 1 }),
    getNotificationSendLogStats(),
  ]);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Notification Management</h1>
          <p className="text-gray-600 mt-1">
            Manage email templates, delivery configuration, and send log audit.
          </p>
        </div>
        <div className="text-sm text-gray-500">
          {templates.length} templates
        </div>
      </div>

      {/* Tabs */}
      <NotificationsTabs
        initialTab={tab}
        templates={templates}
        emailConfig={emailConfigResult.config}
        resendConfigured={emailConfigResult.resendConfigured}
        sendLogStats={sendLogStats}
        sendLogRows={sendLogResult.rows}
        sendLogTotal={sendLogResult.total}
      />
    </div>
  );
}
