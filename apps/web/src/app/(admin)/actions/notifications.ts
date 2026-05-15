'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAuth, isSystemAdmin } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { NotificationSendStatus } from '@/generated/prisma';
import type { VariableDef } from '@/lib/notifications/types';

// ---------------------------------------------------------------------------
// Auth guard (private, not exported)
// ---------------------------------------------------------------------------

async function requireAdminAccess() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) {
    throw new Error('Unauthorized: Admin access required');
  }
}

// ---------------------------------------------------------------------------
// Template actions
// ---------------------------------------------------------------------------

/**
 * Return all notification templates ordered by category then displayName.
 * Casts availableVariables as VariableDef[] for type safety.
 */
export async function listNotificationTemplates() {
  await requireAdminAccess();

  const templates = await prisma.notificationTemplate.findMany({
    orderBy: [{ category: 'asc' }, { displayName: 'asc' }],
  });

  return templates.map((t) => ({
    ...t,
    availableVariables: t.availableVariables as VariableDef[],
  }));
}

/**
 * Return a single notification template by id.
 */
export async function getNotificationTemplate(id: string) {
  await requireAdminAccess();

  const template = await prisma.notificationTemplate.findUniqueOrThrow({
    where: { id },
  });

  return {
    ...template,
    availableVariables: template.availableVariables as VariableDef[],
  };
}

/**
 * Update a template's subject, blockJson, and pre-rendered HTML cache.
 *
 * The cachedHtml is produced in the browser by editor.getHTML() at save time
 * (quick-task-335 — Tiptap no longer runs on the server).
 */
export async function updateNotificationTemplate(
  id: string,
  data: { defaultSubject: string; defaultBlockJson: unknown; cachedHtml: string },
): Promise<{ success: true } | { success: false; error: string }> {
  await requireAdminAccess();

  try {
    await prisma.notificationTemplate.update({
      where: { id },
      data: {
        defaultSubject: data.defaultSubject,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        defaultBlockJson: data.defaultBlockJson as any,
        defaultHtmlCache: data.cachedHtml,
      },
    });

    revalidatePath('/notifications');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Toggle a template's isActive flag.
 */
export async function toggleNotificationTemplateActive(
  id: string,
  isActive: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  await requireAdminAccess();

  try {
    await prisma.notificationTemplate.update({
      where: { id },
      data: { isActive },
    });

    revalidatePath('/notifications');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Email config actions
// ---------------------------------------------------------------------------

export type NotificationEmailConfigData = {
  fromName: string;
  fromEmail: string;
  replyTo?: string | null;
};

/**
 * Return the singleton email config row and whether Resend is configured.
 * NEVER returns the actual RESEND_API_KEY value.
 */
export async function getNotificationEmailConfig() {
  await requireAdminAccess();

  const config = await prisma.notificationEmailConfig.findFirst({
    where: { singletonKey: 'singleton' },
  });

  return {
    config: config
      ? {
          id: config.id,
          fromName: config.fromName,
          fromEmail: config.fromEmail,
          replyTo: config.replyTo,
          updatedAt: config.updatedAt,
        }
      : null,
    // NEVER expose the RESEND_API_KEY value itself
    resendConfigured: !!process.env.RESEND_API_KEY,
  };
}

/**
 * Upsert the singleton email config row.
 */
export async function updateNotificationEmailConfig(
  data: NotificationEmailConfigData,
): Promise<{ success: true } | { success: false; error: string }> {
  await requireAdminAccess();

  const schema = z.object({
    fromName: z.string().min(1, 'From name is required'),
    fromEmail: z.string().email('Must be a valid email'),
    replyTo: z.string().email('Must be a valid email').optional().or(z.literal('')).nullable(),
  });

  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' };
  }

  try {
    const existing = await prisma.notificationEmailConfig.findFirst({
      where: { singletonKey: 'singleton' },
    });

    const replyToValue = parsed.data.replyTo || null;

    if (existing) {
      await prisma.notificationEmailConfig.update({
        where: { id: existing.id },
        data: {
          fromName: parsed.data.fromName,
          fromEmail: parsed.data.fromEmail,
          replyTo: replyToValue,
        },
      });
    } else {
      await prisma.notificationEmailConfig.create({
        data: {
          singletonKey: 'singleton',
          fromName: parsed.data.fromName,
          fromEmail: parsed.data.fromEmail,
          replyTo: replyToValue,
        },
      });
    }

    revalidatePath('/notifications');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Send log actions
// ---------------------------------------------------------------------------

export type SendLogFilters = {
  tenantId?: string;
  triggerKey?: string;
  status?: NotificationSendStatus;
  from?: string;   // ISO date string
  to?: string;     // ISO date string
  recipient?: string;
  page?: number;
};

export type SendLogRow = {
  id: string;
  tenantId: string;
  triggerKey: string;
  recipientUserId: string | null;
  recipientEmail: string | null;
  channel: string;
  subject: string | null;
  status: string;
  errorMessage: string | null;
  idempotencyKey: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  sentAt: Date | null;
  createdAt: Date;
};

const PAGE_SIZE = 25;

/**
 * Paginated, filtered send log — cross-tenant.
 */
export async function listNotificationSendLog(
  params: SendLogFilters,
): Promise<{ rows: SendLogRow[]; total: number; page: number }> {
  await requireAdminAccess();

  const page = Math.max(1, params.page ?? 1);
  const skip = (page - 1) * PAGE_SIZE;

  const where = buildSendLogWhere(params);

  const [rows, total] = await Promise.all([
    prisma.notificationSendLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: PAGE_SIZE,
    }),
    prisma.notificationSendLog.count({ where }),
  ]);

  return { rows, total, page };
}

function buildSendLogWhere(params: SendLogFilters) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {};

  if (params.tenantId?.trim()) {
    where.tenantId = params.tenantId.trim();
  }
  if (params.triggerKey?.trim()) {
    where.triggerKey = { contains: params.triggerKey.trim(), mode: 'insensitive' };
  }
  if (params.status) {
    where.status = params.status;
  }
  if (params.recipient?.trim()) {
    where.recipientEmail = { contains: params.recipient.trim(), mode: 'insensitive' };
  }
  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) where.createdAt.gte = new Date(params.from);
    if (params.to) {
      const toDate = new Date(params.to);
      toDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = toDate;
    }
  }

  return where;
}

export type SendLogStats = {
  sentToday: number;
  failedToday: number;
  sent30d: number;
  failureRate: number;
  /**
   * The triggerKey with the most FAILED rows in the last 24 hours.
   * Only populated when at least one failure exists; null otherwise.
   * Used by the HealthTile to surface the top failing trigger when failure rate > 5%.
   */
  topFailingTrigger: string | null;
};

/**
 * KPI stats for the send log dashboard.
 * Extended in Phase 41 Plan 05 to include topFailingTrigger for the HealthTile.
 */
export async function getNotificationSendLogStats(): Promise<SendLogStats> {
  await requireAdminAccess();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);

  const [sentToday, failedToday, sent30d, failed30d, failedByTrigger] = await Promise.all([
    prisma.notificationSendLog.count({
      where: { status: 'SENT', createdAt: { gte: todayStart } },
    }),
    prisma.notificationSendLog.count({
      where: { status: 'FAILED', createdAt: { gte: todayStart } },
    }),
    prisma.notificationSendLog.count({
      where: { status: 'SENT', createdAt: { gte: thirtyDaysAgo } },
    }),
    prisma.notificationSendLog.count({
      where: { status: 'FAILED', createdAt: { gte: thirtyDaysAgo } },
    }),
    // Group FAILED rows by triggerKey in the last 24h to find the top offender
    prisma.notificationSendLog.groupBy({
      by: ['triggerKey'],
      where: { status: 'FAILED', createdAt: { gte: last24h } },
      _count: { triggerKey: true },
      orderBy: { _count: { triggerKey: 'desc' } },
      take: 1,
    }),
  ]);

  const total30d = sent30d + failed30d;
  const failureRate = total30d > 0 ? Math.round((failed30d / total30d) * 100) : 0;

  const topFailingTrigger =
    failedByTrigger.length > 0 ? failedByTrigger[0].triggerKey : null;

  return { sentToday, failedToday, sent30d, failureRate, topFailingTrigger };
}

