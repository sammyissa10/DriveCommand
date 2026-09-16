/**
 * Cron endpoint: auto-close RESOLVED support tickets after 7 days of inactivity.
 * Schedule: Daily at 02:00 UTC
 * Authentication: CRON_SECRET bearer token (timing-safe comparison)
 */
import { NextRequest } from 'next/server';
// quick-615 — the `prisma` import is gone: a grep proves zero remaining
// `prisma.` usages. This route is no longer a two-mechanism file.
import { getAdminDb } from '@/lib/db/admin-prisma';
import { logger } from '@/lib/logger';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return cronUnauthorizedResponse();
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Find RESOLVED tickets where updatedAt is older than 7 days
    // AND no TicketMessage from OWNER in the last 7 days (owner hasn't replied)
    // quick-615 — ROUTE. The READ half of the two-mechanism file quick-602
    // MEASURED raising `TC001` at runtime: line 57's acquisition covers only
    // the write and is not in scope here. Same unit of work, so it REUSES that
    // reason and mints nothing. Left unrouted, the sweep finds no stale tickets
    // and reports `{success: true, closed: 0}` for ever.
    const adminDbScan = await getAdminDb('auto-close stale ticket sweep');
    type RawTicket = { id: string; ticketNumber: string };
    const tickets = await adminDbScan.$queryRaw<RawTicket[]>`
      SELECT st.id, st."ticketNumber"
      FROM "SupportTicket" st
      WHERE st.status = 'RESOLVED'
        AND st."updatedAt" < ${sevenDaysAgo}
        AND NOT EXISTS (
          SELECT 1 FROM "TicketMessage" tm
          WHERE tm."ticketId" = st.id
            AND tm."senderType" = 'OWNER'
            AND tm."createdAt" > ${sevenDaysAgo}
        )
    `;

    if (tickets.length === 0) {
      return Response.json({ success: true, closed: 0 });
    }

    const ticketIds = tickets.map((t) => t.id);

    /**
     * quick-600 (B5) — ROUTE. Genuinely cross-tenant: `ticketIds` can name
     * tickets belonging to DIFFERENT tenants in this ONE `updateMany`
     * statement (collected from the raw all-tenant scan above), so there is
     * no single tenant to set a GUC to — unlike a per-row loop, this is a
     * genuine batch and stays on the admin connection.
     * WHY: Cron job that closes stale support tickets across all tenants.
     *      No user session context — authenticated only by CRON_SECRET header.
     * SCOPE: Updates SupportTicket.status to CLOSED for specific ticket IDs
     *        identified in the raw query above.
     * SAFETY: Gated by CRON_SECRET header check at the top of this handler.
     *         Ticket IDs come from the preceding raw SQL query, not user input.
     */
    const adminDb = await getAdminDb('auto-close stale ticket sweep');
    await adminDb.supportTicket.updateMany({
      where: { id: { in: ticketIds } },
      data: { status: 'CLOSED' },
    });

    logger.info(`[CRON] auto-close-tickets: Closed ${tickets.length} ticket(s)`, { ticketNumbers: tickets.map(t => t.ticketNumber) });
    return Response.json({ success: true, closed: tickets.length, ticketNumbers: tickets.map(t => t.ticketNumber) });
  } catch (error) {
    logger.error('[CRON] auto-close-tickets: error:', error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
