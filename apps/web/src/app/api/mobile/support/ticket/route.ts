import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { sendNewTicketNotification } from '@/lib/email/send-support-notifications';
import { getAppBaseUrl } from '@/lib/app-url';

// ─── Validation schema ───────────────────────────────────────────────────────

const createTicketSchema = z.object({
  category: z.enum(['BILLING', 'BUG', 'FEATURE', 'GENERAL']).default('GENERAL'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters')
    .max(200, 'Title must be at most 200 characters'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(2000, 'Description must be at most 2000 characters'),
  fromPage: z.string().min(1, 'Page path is required'),
});

// ─── Ticket number helper ────────────────────────────────────────────────────

async function generateTicketNumber(): Promise<string> {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.supportTicket.findFirst({
      orderBy: { ticketNumber: 'desc' },
      select: { ticketNumber: true },
    });
  }, TX_OPTIONS);

  if (!result) {
    return 'TKT-0001';
  }

  const match = result.ticketNumber.match(/^TKT-(\d+)$/);
  if (!match) {
    return 'TKT-0001';
  }

  const next = parseInt(match[1], 10) + 1;
  return `TKT-${String(next).padStart(4, '0')}`;
}

// ─── Route handler ───────────────────────────────────────────────────────────

/**
 * POST /api/mobile/support/ticket
 *
 * Creates a support ticket from a mobile user (driver or owner).
 * Platform is hardcoded as MOBILE — client does not send this field.
 *
 * Requires: Authorization: Bearer <token>
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const validation = createTicketSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: validation.error.issues[0].message },
      { status: 422 }
    );
  }

  const { category, priority, title, description, fromPage } = validation.data;

  try {
    const ticketNumber = await generateTicketNumber();

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      await tx.supportTicket.create({
        data: {
          ticketNumber,
          tenantId: auth.tenantId,
          submittedBy: auth.userId,
          fromPage,
          category,
          priority,
          title,
          description,
          platform: 'MOBILE',
          status: 'OPEN',
        },
      });
    }, TX_OPTIONS);

    // Fire-and-forget: notify DriveCommand team
    try {
      await sendNewTicketNotification({
        ticketNumber,
        title,
        category,
        priority,
        submitterEmail: auth.userId, // userId used as fallback — email not in mobile token
        tenantId: auth.tenantId ?? '',
        ticketUrl: `${getAppBaseUrl()}/admin-support`,
      });
    } catch (emailError) {
      console.error('[mobile/support/ticket] team notification email failed:', emailError);
    }

    return NextResponse.json({ ticketNumber }, { status: 201 });
  } catch (err) {
    console.error('[mobile/support/ticket] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
