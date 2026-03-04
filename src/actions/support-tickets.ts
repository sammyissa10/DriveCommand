'use server';

import { requireAuth, isSystemAdmin } from '@/lib/auth/server';
import { getSession } from '@/lib/auth/session';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupportTicketStatus, SupportTicketType } from '@/generated/prisma';

// ─── Validation schemas ──────────────────────────────────────

const createTicketSchema = z.object({
  type: z.nativeEnum(SupportTicketType),
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title must be at most 200 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000, 'Description must be at most 2000 characters'),
  fromPage: z.string().min(1, 'Page path is required'),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(SupportTicketStatus),
  resolution: z.string().max(2000, 'Resolution must be at most 2000 characters').optional(),
});

// ─── Helper to generate ticket number ──────────────────────

async function generateTicketNumber(): Promise<string> {
  // Use bypass_rls transaction to query across tenants for uniqueness
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    // Find latest ticket number
    const latest = await tx.supportTicket.findFirst({
      orderBy: { ticketNumber: 'desc' },
      select: { ticketNumber: true },
    });
    return latest;
  }, TX_OPTIONS);

  if (!result) {
    return 'TKT-0001';
  }

  // Parse number from "TKT-NNNN" format
  const match = result.ticketNumber.match(/^TKT-(\d+)$/);
  if (!match) {
    return 'TKT-0001';
  }

  const next = parseInt(match[1], 10) + 1;
  return `TKT-${String(next).padStart(4, '0')}`;
}

// ─── Server Actions ──────────────────────────────────────────

/**
 * Create a support ticket.
 * Any authenticated user (OWNER, MANAGER, DRIVER) can submit.
 */
export async function createSupportTicket(data: {
  type: string;
  title: string;
  description: string;
  fromPage: string;
}): Promise<{ success: boolean; ticketNumber?: string; error?: string }> {
  const userId = await requireAuth();
  const session = await getSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  // Validate input
  const validation = createTicketSchema.safeParse(data);
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0].message,
    };
  }

  const { type, title, description, fromPage } = validation.data;
  const tenantId = session.tenantId;

  try {
    const ticketNumber = await generateTicketNumber();

    // Insert using bypass_rls (no RLS on SupportTicket)
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      await tx.supportTicket.create({
        data: {
          ticketNumber,
          tenantId,
          submittedBy: userId,
          fromPage,
          type,
          title,
          description,
        },
      });
    }, TX_OPTIONS);

    return { success: true, ticketNumber };
  } catch (error) {
    console.error('[createSupportTicket] error:', error);
    return { success: false, error: 'Failed to create ticket. Please try again.' };
  }
}

/**
 * Get tickets submitted by the current user.
 */
export async function getMyTickets() {
  const userId = await requireAuth();

  const tickets = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.supportTicket.findMany({
      where: { submittedBy: userId },
      orderBy: { createdAt: 'desc' },
    });
  }, TX_OPTIONS);

  return tickets;
}

/**
 * Get all tickets across all tenants (admin only).
 * Returns tickets enriched with submitter email and tenant name.
 */
export async function getAllTickets() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) {
    throw new Error('Unauthorized: System admin access required');
  }

  // Use $queryRaw — raw SQL bypasses RLS entirely, no set_config needed.
  // SupportTicket has no RLS so this is safe for cross-tenant admin access.
  type RawTicket = {
    id: string; ticketNumber: string; tenantId: string; submittedBy: string;
    fromPage: string; type: string; title: string; description: string;
    status: string; resolution: string | null; resolvedAt: Date | null;
    createdAt: Date; updatedAt: Date;
  };
  const tickets = await prisma.$queryRaw<RawTicket[]>`
    SELECT * FROM "SupportTicket" ORDER BY "createdAt" DESC
  `;

  if (tickets.length === 0) return [];

  const userIds = [...new Set(tickets.map((t) => t.submittedBy))];
  const tenantIds = [...new Set(tickets.map((t) => t.tenantId))];

  type RawUser = { id: string; email: string; firstName: string | null; lastName: string | null };
  type RawTenant = { id: string; name: string };

  const [users, tenants] = await Promise.all([
    prisma.$queryRaw<RawUser[]>`
      SELECT id, email, "firstName", "lastName" FROM "User" WHERE id = ANY(${userIds}::uuid[])
    `,
    prisma.$queryRaw<RawTenant[]>`
      SELECT id, name FROM "Tenant" WHERE id = ANY(${tenantIds}::uuid[])
    `,
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));

  return tickets.map((ticket) => {
    const user = userMap.get(ticket.submittedBy);
    const tenant = tenantMap.get(ticket.tenantId);
    return {
      ...ticket,
      submitterEmail: user?.email ?? 'Unknown',
      submitterName: user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email : 'Unknown',
      tenantName: tenant?.name ?? 'Unknown',
    };
  });
}

export type TicketWithDetails = Awaited<ReturnType<typeof getAllTickets>>[number];

/**
 * Update ticket status and optional resolution notes (admin only).
 */
export async function updateTicketStatus(
  ticketId: string,
  data: { status: string; resolution?: string }
): Promise<{ success: boolean; error?: string }> {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) {
    throw new Error('Unauthorized: System admin access required');
  }

  const validation = updateStatusSchema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  const { status, resolution } = validation.data;

  // Set resolvedAt based on status
  const isResolved = status === SupportTicketStatus.RESOLVED || status === SupportTicketStatus.CLOSED;
  const resolvedAt = isResolved ? new Date() : null;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          status,
          resolution: resolution ?? null,
          resolvedAt,
        },
      });
    }, TX_OPTIONS);

    revalidatePath('/admin-support');

    return { success: true };
  } catch (error) {
    console.error('[updateTicketStatus] error:', error);
    return { success: false, error: 'Failed to update ticket status.' };
  }
}
