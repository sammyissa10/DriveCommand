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
import type { NotificationSendStatus } from '@/generated/prisma';

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
  searchParams: Promise<{ tab?: string; status?: string }>;
}

export default async function NotificationsPage({ searchParams }: NotificationsPageProps) {
  await requireAdminAccess();

  const params = await searchParams;
  const validTabs = ['templates', 'email-config', 'send-log'];
  const tab = validTabs.includes(params.tab ?? '') ? (params.tab ?? 'templates') : 'templates';

  // quick-556: the health tile links here as ?tab=send-log&status=FAILED, so
  // "something failed" lands on the list of what failed rather than on an
  // unfiltered log the reader then has to filter themselves. Validated against
  // the real status vocabulary rather than passed through — this value reaches
  // a Prisma where clause.
  const validStatuses = ['SENT', 'FAILED', 'PENDING', 'SKIPPED_DISABLED', 'SKIPPED_USER_PREF', 'SKIPPED_IDEMPOTENT'];
  const initialStatus = validStatuses.includes(params.status ?? '')
    ? (params.status as NotificationSendStatus)
    : undefined;

  // When the caller asked for a status, the FIRST page must already be that
  // status. Otherwise the tab renders unfiltered rows and then replaces them,
  // which reads as a flicker and briefly shows the wrong answer.
  const sendLogQuery = initialStatus ? { page: 1, status: initialStatus } : { page: 1 };

  // Fetch all initial data in parallel — all tabs are cheap to load upfront
  const [templates, emailConfigResult, sendLogResult, sendLogStats] = await Promise.all([
    listNotificationTemplates(),
    getNotificationEmailConfig(),
    listNotificationSendLog(sendLogQuery),
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
        initialSendLogStatus={initialStatus}
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
