/**
 * Cron endpoint: mark SENT SysAdminInvoices as OVERDUE when past due date.
 * Schedule: Daily at 03:00 UTC
 * Authentication: CRON_SECRET bearer token (timing-safe comparison)
 */
import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/db/admin-prisma';
import { logger } from '@/lib/logger';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return cronUnauthorizedResponse();
  }

  const now = new Date();

  try {
    // quick-600 (B5) — ROUTE. Batch across every tenant's SENT invoices in
    // one statement — same shape as auto-close-tickets, cannot hang a single
    // tenant GUC off it.
    const adminDb = await getAdminDb('overdue invoice sweep');
    const result = await adminDb.sysAdminInvoice.updateMany({
      where: {
        status: 'SENT',
        dueDate: { lt: now },
        archivedAt: null,
      },
      data: { status: 'OVERDUE' },
    });

    logger.info(`[CRON] mark-overdue-invoices: Marked ${result.count} invoice(s) overdue`);
    return Response.json({ success: true, markedOverdue: result.count });
  } catch (error) {
    logger.error('[CRON] mark-overdue-invoices: error:', error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
