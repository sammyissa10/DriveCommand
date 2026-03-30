'use server';

import { getAppBaseUrl } from '@/lib/app-url';
import { requireAuth, isSystemAdmin } from '@/lib/auth/server';
import { requireTenantId } from '@/lib/context/tenant-context';
import { getSession } from '@/lib/auth/session';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { SupportTicketStatus, SupportTicketCategory, SupportTicketPriority } from '@/generated/prisma';
import { sendNewTicketNotification, sendOwnerReplyNotification, sendAdminReplyNotification } from '@/lib/email/send-support-notifications';
import { nanoid } from 'nanoid';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';
// ─── Validation schemas ──────────────────────────────────────

const createTicketSchema = z.object({
  category: z.nativeEnum(SupportTicketCategory).default(SupportTicketCategory.GENERAL),
  priority: z.nativeEnum(SupportTicketPriority).default(SupportTicketPriority.NORMAL),
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title must be at most 200 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000, 'Description must be at most 2000 characters'),
  fromPage: z.string().min(1, 'Page path is required'),
  platform: z.enum(['MOBILE', 'DESKTOP']).optional(),
  attachmentUrl: z.string().url().optional(),
  attachmentKey: z.string().optional(),
  screenshotKey: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(SupportTicketStatus),
  resolution: z.string().max(2000, 'Resolution must be at most 2000 characters').optional(),
});

// ─── Admin auth helper ────────────────────────────────────

async function requireAdminAccess() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) {
    throw new Error('Unauthorized: Admin access required');
  }
}

// ─── Upload screenshot server-side (avoids browser→R2 CORS) ─

/**
 * Upload an auto-captured support ticket screenshot directly from the server.
 * Returns { s3Key } on success or { error } on failure.
 */
export async function uploadSupportScreenshot(formData: FormData): Promise<{ s3Key: string } | { error: string }> {
  try {
    await requireAuth();
    const tenantId = await requireTenantId();

    const file = formData.get('screenshot') as File | null;
    if (!file || file.size === 0) {
      return { error: 'No screenshot provided' };
    }

    if (file.size > 10 * 1024 * 1024) {
      return { error: 'Screenshot exceeds 10MB limit' };
    }

    const fileId = nanoid();
    const bucket = process.env.S3_BUCKET || 'driver-documents';
    const s3Key = `tenant-${tenantId}/support/${fileId}-screenshot.png`;
    const body = Buffer.from(await file.arrayBuffer());

    const supabase = createAdminClient();
    const { error } = await supabase.storage.from(bucket).upload(s3Key, body, {
      contentType: 'image/png',
      upsert: false,
    });

    if (error) {
      logger.error('[uploadSupportScreenshot] Supabase upload failed:', error);
      return { error: 'Failed to upload screenshot' };
    }

    return { s3Key };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Upload failed' };
  }
}

// ─── Helper to generate ticket number ──────────────────────

async function generateTicketNumber(): Promise<string> {
  /**
   * @bypass_rls reason: cross-tenant
   * WHY: Ticket numbers (TKT-NNNN) must be globally unique across all tenants.
   *      Checking the latest ticket number requires querying the SupportTicket table
   *      across all tenants to find the highest sequential number.
   * SCOPE: Read-only query on SupportTicket.ticketNumber — no tenant data accessed.
   * SAFETY: Returns only the ticketNumber field (select: { ticketNumber: true }),
   *         no sensitive tenant data is exposed.
   */
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
  category?: string;
  priority?: string;
  title: string;
  description: string;
  fromPage: string;
  platform?: string;
  attachmentUrl?: string;
  attachmentKey?: string;
  screenshotKey?: string;
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

  const { category, priority, title, description, fromPage, platform, attachmentUrl, attachmentKey, screenshotKey } = validation.data;
  const tenantId = session.tenantId || null;

  try {
    const ticketNumber = await generateTicketNumber();

    /**
     * @bypass_rls reason: cross-tenant
     * WHY: SupportTickets span tenants — a ticket may be submitted by a user in any
     *      tenant, and system admins need to see all tickets across all tenants.
     *      RLS would prevent inserting a ticket that references a different tenant context.
     * SCOPE: Writes a single SupportTicket record for the authenticated user's session.
     * SAFETY: Gated by requireAuth() above — only runs for authenticated users.
     *         tenantId is derived from the verified session cookie, not from user input.
     */
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      await tx.supportTicket.create({
        data: {
          ticketNumber,
          tenantId,
          submittedBy: userId,
          fromPage,
          category,
          priority,
          title,
          description,
          platform: platform ?? null,
          attachmentUrl: attachmentUrl ?? null,
          attachmentKey: attachmentKey ?? null,
          screenshotKey: screenshotKey ?? null,
        },
      });
    }, TX_OPTIONS);

    // Fire-and-forget: notify DriveCommand team of new ticket
    try {
      await sendNewTicketNotification({
        ticketNumber,
        title,
        category: validation.data.category,
        priority: validation.data.priority,
        submitterEmail: session.email,
        tenantId: tenantId ?? '',
        ticketUrl: `${getAppBaseUrl()}/admin-support`,
      });
    } catch (emailError) {
      logger.error('[createSupportTicket] team notification email failed:', emailError);
    }

    return { success: true, ticketNumber };
  } catch (error) {
    logger.error('[createSupportTicket] error:', error);
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
 * Optional filters are additive — if omitted, behavior is identical to before.
 */
export async function getAllTickets(filters?: {
  status?: string;
  priority?: string;
  tenantId?: string;
}) {
  await requireAdminAccess();

  // Use $queryRaw — raw SQL bypasses RLS entirely, no set_config needed.
  // SupportTicket has no RLS so this is safe for cross-tenant admin access.
  type RawTicket = {
    id: string; ticketNumber: string; tenantId: string; submittedBy: string;
    fromPage: string; category: SupportTicketCategory; priority: SupportTicketPriority;
    title: string; description: string;
    platform: string | null; attachmentUrl: string | null; attachmentKey: string | null; screenshotKey: string | null;
    status: string; resolution: string | null; resolvedAt: Date | null;
    createdAt: Date; updatedAt: Date;
  };

  // Build WHERE clauses for optional server-side filters
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(filters.status);
  }
  if (filters?.priority) {
    conditions.push(`priority = $${paramIndex++}`);
    params.push(filters.priority);
  }
  if (filters?.tenantId) {
    conditions.push(`"tenantId" = $${paramIndex++}::uuid`);
    params.push(filters.tenantId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const tickets = await prisma.$queryRawUnsafe<RawTicket[]>(
    `SELECT * FROM "SupportTicket" ${whereClause} ORDER BY "createdAt" DESC`,
    ...params
  );

  if (tickets.length === 0) return [];

  const userIds = [...new Set(tickets.map((t) => t.submittedBy))];
  const tenantIds = [...new Set(tickets.map((t) => t.tenantId).filter(Boolean))] as string[];

  type RawUser = { id: string; email: string; firstName: string | null; lastName: string | null };
  type RawTenant = { id: string; name: string };
  type RawAuthUser = { id: string; email: string; raw_user_meta_data: { firstName?: string; lastName?: string } };

  const [users, tenants, authUsers] = await Promise.all([
    prisma.$queryRaw<RawUser[]>`
      SELECT id, email, "firstName", "lastName" FROM "User" WHERE id = ANY(${userIds}::uuid[])
    `,
    tenantIds.length > 0
      ? prisma.$queryRaw<RawTenant[]>`SELECT id, name FROM "Tenant" WHERE id = ANY(${tenantIds}::uuid[])`
      : Promise.resolve([] as RawTenant[]),
    prisma.$queryRaw<RawAuthUser[]>`
      SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = ANY(${userIds}::uuid[])
    `,
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));
  const tenantMap = new Map(tenants.map((t) => [t.id, t]));
  const authUserMap = new Map(authUsers.map((u) => [u.id, u]));

  return tickets.map((ticket) => {
    const user = userMap.get(ticket.submittedBy);
    const authUser = authUserMap.get(ticket.submittedBy);
    const tenant = ticket.tenantId ? tenantMap.get(ticket.tenantId) : null;
    const meta = authUser?.raw_user_meta_data ?? {};
    const nameFromAuth = [meta.firstName, meta.lastName].filter(Boolean).join(' ') || authUser?.email;
    return {
      ...ticket,
      submitterEmail: user?.email ?? authUser?.email ?? 'Unknown',
      submitterName: user
        ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
        : nameFromAuth ?? 'Unknown',
      tenantName: tenant?.name ?? (ticket.tenantId ? 'Unknown' : 'DriveCommand (Admin)'),
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
  await requireAdminAccess();

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
    logger.error('[updateTicketStatus] error:', error);
    return { success: false, error: 'Failed to update ticket status.' };
  }
}

/**
 * Get a single ticket by ID, scoped to the current authenticated user's tenant.
 * Returns ticket + messages (owner can only see their own tickets).
 */
export async function getTicketById(ticketId: string) {
  const userId = await requireAuth();
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    const ticket = await tx.supportTicket.findFirst({
      where: {
        id: ticketId,
        tenantId: session.tenantId ?? undefined,
        submittedBy: userId,
      },
    });
    if (!ticket) return { ticket: null, messages: [] };
    const messages = await tx.ticketMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
    });
    return { ticket, messages };
  }, TX_OPTIONS);

  return result;
}

/**
 * Add an owner reply to an existing ticket.
 * Creates a TicketMessage with senderType=OWNER. Does not auto-change ticket status.
 */
export async function addOwnerReply(
  ticketId: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  const userId = await requireAuth();
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const trimmedBody = body.trim();
  if (trimmedBody.length < 1) return { success: false, error: 'Reply cannot be empty' };
  if (trimmedBody.length > 4000) return { success: false, error: 'Reply too long (max 4000 chars)' };

  try {
    let ticketNumber = '';
    let ticketTitle = '';
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      // Verify ticket belongs to this user's tenant
      const ticket = await tx.supportTicket.findFirst({
        where: { id: ticketId, tenantId: session.tenantId ?? undefined, submittedBy: userId },
        select: { id: true, ticketNumber: true, title: true },
      });
      if (!ticket) throw new Error('Ticket not found');
      ticketNumber = ticket.ticketNumber;
      ticketTitle = ticket.title;

      // Create message
      const senderLabel = [session.firstName, session.lastName].filter(Boolean).join(' ') || session.email;
      await tx.ticketMessage.create({
        data: {
          ticketId,
          senderType: 'OWNER',
          senderLabel,
          body: trimmedBody,
        },
      });
    }, TX_OPTIONS);

    revalidatePath(`/support/${ticketId}`);

    // Fire-and-forget: notify DriveCommand team of owner reply
    try {
      await sendOwnerReplyNotification({
        ticketNumber,
        title: ticketTitle,
        body: trimmedBody,
        submitterEmail: session.email,
        ticketUrl: `${getAppBaseUrl()}/admin-support`,
      });
    } catch (emailError) {
      logger.error('[addOwnerReply] team notification email failed:', emailError);
    }

    return { success: true };
  } catch (error) {
    logger.error('[addOwnerReply] error:', error);
    return { success: false, error: 'Failed to submit reply. Please try again.' };
  }
}

/**
 * Add an admin reply to a support ticket (admin only).
 * Creates a TicketMessage with senderType=ADMIN and sets ticket status to IN_PROGRESS.
 * Sends owner an email notification (fire-and-forget).
 */
export async function addAdminReply(
  ticketId: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  try { await requireAdminAccess(); } catch { return { success: false, error: 'Unauthorized' }; }

  const trimmedBody = body.trim();
  if (trimmedBody.length < 1) return { success: false, error: 'Reply cannot be empty' };
  if (trimmedBody.length > 4000) return { success: false, error: 'Reply too long (max 4000 chars)' };

  try {
    let ownerEmail = '';
    let ticketNumber = '';
    let ticketTitle = '';

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      const ticket = await tx.supportTicket.findFirst({
        where: { id: ticketId },
        select: { id: true, ticketNumber: true, title: true, submittedBy: true, status: true },
      });
      if (!ticket) throw new Error('Ticket not found');
      ticketNumber = ticket.ticketNumber;
      ticketTitle = ticket.title;

      // Look up owner email via raw query (no Prisma relation)
      type RawUser = { email: string };
      const users = await tx.$queryRaw<RawUser[]>`
        SELECT email FROM "User" WHERE id = ${ticket.submittedBy}::uuid LIMIT 1
      `;
      ownerEmail = users[0]?.email ?? '';

      // Create message
      await tx.ticketMessage.create({
        data: {
          ticketId,
          senderType: 'ADMIN',
          senderLabel: 'Support Team',
          body: trimmedBody,
        },
      });

      // Set status to IN_PROGRESS (opens the conversation for owner)
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'IN_PROGRESS' },
      });
    }, TX_OPTIONS);

    revalidatePath('/admin-support');

    // Fire-and-forget: notify owner
    if (ownerEmail) {
      try {
        await sendAdminReplyNotification({
          ticketNumber,
          title: ticketTitle,
          body: trimmedBody,
          ownerEmail,
          ticketUrl: `${getAppBaseUrl()}/support/${ticketId}`,
        });
      } catch (emailError) {
        logger.error('[addAdminReply] owner notification email failed:', emailError);
      }
    } else {
      logger.warn('[addAdminReply] No email found for ticket submitter, skipping notification', { ticketNumber });
    }

    return { success: true };
  } catch (error) {
    logger.error('[addAdminReply] error:', error);
    return { success: false, error: 'Failed to submit reply.' };
  }
}

/**
 * Get all messages for a ticket (admin only).
 * Used to load thread when expanding a ticket in the admin dashboard.
 */
export async function getTicketMessages(ticketId: string) {
  await requireAdminAccess();

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.ticketMessage.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'asc' },
    });
  }, TX_OPTIONS);
}

/**
 * Count of tickets where the most recent TicketMessage is from ADMIN
 * and the ticket status is not WAITING_ON_CUSTOMER (owner hasn't replied yet).
 * Used for the sidebar unread badge in the owner portal.
 */
export async function getUnreadAdminReplyCount(): Promise<number> {
  const userId = await requireAuth();
  const session = await getSession();
  if (!session || !session.tenantId) return 0;

  try {
    type RawResult = { count: bigint };
    const result = await prisma.$queryRaw<RawResult[]>`
      SELECT COUNT(DISTINCT st.id) as count
      FROM "SupportTicket" st
      INNER JOIN "TicketMessage" tm ON tm."ticketId" = st.id
      WHERE st."submittedBy" = ${userId}::uuid
        AND st."tenantId" = ${session.tenantId}::uuid
        AND st.status != 'WAITING_ON_CUSTOMER'
        AND st.status NOT IN ('RESOLVED', 'CLOSED')
        AND tm."senderType" = 'ADMIN'
        AND tm."createdAt" = (
          SELECT MAX(tm2."createdAt")
          FROM "TicketMessage" tm2
          WHERE tm2."ticketId" = st.id
        )
    `;
    return Number(result[0]?.count ?? 0);
  } catch {
    return 0; // Non-blocking — badge simply won't show
  }
}

/**
 * Returns a URL to view a support ticket screenshot or attachment.
 * Uses the admin proxy route (/api/admin/support/screenshot) which fetches
 * the file server-side from Supabase Storage — no signed URL quirks,
 * no CORS issues, works with any Supabase key format.
 */
export async function getAttachmentDownloadUrl(s3Key: string): Promise<string> {
  await requireAuth();
  return `/api/admin/support/screenshot?key=${encodeURIComponent(s3Key)}`;
}

