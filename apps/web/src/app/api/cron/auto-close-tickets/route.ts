/**
 * Cron endpoint: auto-close RESOLVED support tickets after 7 days of inactivity.
 * Schedule: Daily at 02:00 UTC
 * Authentication: CRON_SECRET bearer token
 */
import { NextRequest } from 'next/server';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Find RESOLVED tickets where updatedAt is older than 7 days
    // AND no TicketMessage from OWNER in the last 7 days (owner hasn't replied)
    type RawTicket = { id: string; ticketNumber: string };
    const tickets = await prisma.$queryRaw<RawTicket[]>`
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

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      await tx.supportTicket.updateMany({
        where: { id: { in: ticketIds } },
        data: { status: 'CLOSED' },
      });
    }, TX_OPTIONS);

    console.log(`[CRON] auto-close-tickets: Closed ${tickets.length} ticket(s):`, tickets.map(t => t.ticketNumber));
    return Response.json({ success: true, closed: tickets.length, ticketNumbers: tickets.map(t => t.ticketNumber) });
  } catch (error) {
    console.error('[CRON] auto-close-tickets: error:', error);
    return Response.json({ success: false, error: String(error) }, { status: 500 });
  }
}
