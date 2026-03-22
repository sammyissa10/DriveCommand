/**
 * Cron endpoint: mark SENT SysAdminInvoices as OVERDUE when past due date.
 * Schedule: Daily at 03:00 UTC
 * Authentication: CRON_SECRET bearer token
 */
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const now = new Date();

  try {
    const result = await prisma.sysAdminInvoice.updateMany({
      where: {
        status: 'SENT',
        dueDate: { lt: now },
        archivedAt: null,
      },
      data: { status: 'OVERDUE' },
    });

    console.log(`[CRON] mark-overdue-invoices: Marked ${result.count} invoice(s) overdue`);
    return Response.json({ success: true, markedOverdue: result.count });
  } catch (error) {
    console.error('[CRON] mark-overdue-invoices: error:', error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
