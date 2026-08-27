'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireRole, getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { createTenantClient } from '@/lib/db/tenant-client';
import type { VariableDef } from '@/lib/notifications/types';
import {
  NotificationSendStatus,
  NotificationChannel,
  Prisma,
} from '@/generated/prisma';

// ---------------------------------------------------------------------------
// Auth guard (private, not exported)
// ---------------------------------------------------------------------------

async function requireTenantAccess(): Promise<{ tenantId: string }> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  const session = await getSession();
  if (!session?.tenantId) {
    throw new Error('Tenant context is required');
  }
  return { tenantId: session.tenantId };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TenantNotificationSettingRow = {
  template: {
    id: string;
    triggerKey: string;
    category: string;
    displayName: string;
    description: string;
    defaultSubject: string;
    defaultBlockJson: unknown;
    defaultHtmlCache: string | null;
    availableVariables: VariableDef[];
    isActive: boolean;
    updatedAt: Date;
  };
  tenantSetting: {
    id: string;
    tenantId: string;
    triggerKey: string;
    isActive: boolean;
    customSubject: string | null;
    customBlockJson: unknown | null;
    customHtmlCache: string | null;
    updatedAt: Date;
  } | null;
  hasOverride: boolean;
  isActive: boolean;
};

export type TenantSubscriberRow = {
  id: string;
  tenantId: string;
  triggerKey: string;
  userId: string;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
  };
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

export type SendLogPaginatedResult = {
  rows: SendLogRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type SendLogStats = {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  pending: number;
  /**
   * FAILED rows for this tenant over the whole life of the log, ignoring the
   * 30-day window every other figure here uses.
   *
   * quick-556: six of the eight notification failures this system has ever had
   * were TENANT-scoped — driver invitations that were never delivered, in two
   * different carriers. Those are a carrier's problem to see, not a platform
   * administrator's, and the carrier could not see them: the `failed` count
   * above is 30 days wide and lives inside the Send Log tab, which an owner has
   * no reason to open. The oldest of those invitations is now three months
   * stale and would have expired out of a 30-day count long ago while the
   * person still had not been invited.
   */
  failedAllTime: number;
};

export type TenantUserRow = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
};

export type ActiveTemplateForTenant = {
  triggerKey: string;
  displayName: string;
  category: string;
};

// ---------------------------------------------------------------------------
// listTenantNotificationSettings
// ---------------------------------------------------------------------------

export async function listTenantNotificationSettings(): Promise<TenantNotificationSettingRow[]> {
  const { tenantId } = await requireTenantAccess();

  const templates = await prisma.notificationTemplate.findMany({
    orderBy: [{ category: 'asc' }, { displayName: 'asc' }],
  });

  const tenantDb = await getTenantPrisma();
  const tenantSettings = await tenantDb.tenantNotificationSettings.findMany({
    where: { tenantId },
  });

  const settingsByTrigger = new Map(tenantSettings.map((s) => [s.triggerKey, s]));

  return templates.map((t) => {
    const tenantSetting = settingsByTrigger.get(t.triggerKey) ?? null;
    const hasOverride =
      tenantSetting?.customBlockJson != null || tenantSetting?.customSubject != null;
    return {
      template: {
        ...t,
        availableVariables: t.availableVariables as VariableDef[],
      },
      tenantSetting: tenantSetting
        ? {
            ...tenantSetting,
            customBlockJson: tenantSetting.customBlockJson ?? null,
          }
        : null,
      hasOverride,
      isActive: tenantSetting?.isActive ?? t.isActive,
    };
  });
}

// ---------------------------------------------------------------------------
// getSettingForTrigger
// ---------------------------------------------------------------------------

export async function getSettingForTrigger(
  triggerKey: string,
): Promise<TenantNotificationSettingRow> {
  const { tenantId } = await requireTenantAccess();
  z.string().min(1).parse(triggerKey);

  const template = await prisma.notificationTemplate.findUniqueOrThrow({
    where: { triggerKey },
  });

  const tenantDb = await getTenantPrisma();
  const tenantSetting = await tenantDb.tenantNotificationSettings.findUnique({
    where: { tenantId_triggerKey: { tenantId, triggerKey } },
  });

  const hasOverride =
    tenantSetting?.customBlockJson != null || tenantSetting?.customSubject != null;

  return {
    template: {
      ...template,
      availableVariables: template.availableVariables as VariableDef[],
    },
    tenantSetting: tenantSetting
      ? {
          ...tenantSetting,
          customBlockJson: tenantSetting.customBlockJson ?? null,
        }
      : null,
    hasOverride,
    isActive: tenantSetting?.isActive ?? template.isActive,
  };
}

// ---------------------------------------------------------------------------
// customizeTemplate
// ---------------------------------------------------------------------------

export async function customizeTemplate(
  triggerKey: string,
  blockJson: unknown,
  subject: string,
  cachedHtml: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const { tenantId } = await requireTenantAccess();

  const schema = z.object({
    triggerKey: z.string().min(1),
    subject: z.string().min(1, 'Subject is required'),
  });

  const parsed = schema.safeParse({ triggerKey, subject });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' };
  }

  try {
    const tenantDb = await getTenantPrisma();
    await tenantDb.tenantNotificationSettings.upsert({
      where: { tenantId_triggerKey: { tenantId, triggerKey } },
      create: {
        tenantId,
        triggerKey,
        isActive: true,
        customSubject: subject,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        customBlockJson: blockJson as any,
        customHtmlCache: cachedHtml,
      },
      update: {
        customSubject: subject,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        customBlockJson: blockJson as any,
        customHtmlCache: cachedHtml,
      },
    });

    revalidatePath('/settings/notifications');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// restoreDefault
// ---------------------------------------------------------------------------

export async function restoreDefault(
  triggerKey: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const { tenantId } = await requireTenantAccess();
  z.string().min(1).parse(triggerKey);

  try {
    const tenantDb = await getTenantPrisma();
    await tenantDb.tenantNotificationSettings.updateMany({
      where: { tenantId, triggerKey },
      data: {
        customSubject: null,
        customBlockJson: Prisma.JsonNull,
        customHtmlCache: null,
      },
    });

    revalidatePath('/settings/notifications');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// toggleTenantNotificationActive
// ---------------------------------------------------------------------------

export async function toggleTenantNotificationActive(
  triggerKey: string,
  isActive: boolean,
): Promise<{ success: true } | { success: false; error: string }> {
  const { tenantId } = await requireTenantAccess();
  z.string().min(1).parse(triggerKey);

  try {
    const template = await prisma.notificationTemplate.findUniqueOrThrow({
      where: { triggerKey },
      select: { isActive: true },
    });

    if (!template.isActive && isActive) {
      return { success: false, error: 'Cannot enable: template is globally disabled by DriveCommand' };
    }

    const tenantDb = await getTenantPrisma();
    await tenantDb.tenantNotificationSettings.upsert({
      where: { tenantId_triggerKey: { tenantId, triggerKey } },
      create: { tenantId, triggerKey, isActive },
      update: { isActive },
    });

    revalidatePath('/settings/notifications');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// listTenantSubscribers
// ---------------------------------------------------------------------------

export async function listTenantSubscribers(): Promise<TenantSubscriberRow[]> {
  const { tenantId } = await requireTenantAccess();

  const tenantDb = await getTenantPrisma();
  const subscribers = await tenantDb.notificationSubscription.findMany({
    where: { tenantId },
    include: {
      user: {
        select: { id: true, email: true, firstName: true, lastName: true, role: true },
      },
    },
    orderBy: [{ triggerKey: 'asc' }, { user: { email: 'asc' } }],
  });

  return subscribers.map((s) => ({
    id: s.id,
    tenantId: s.tenantId,
    triggerKey: s.triggerKey,
    userId: s.userId,
    createdAt: s.createdAt,
    user: {
      id: s.user.id,
      email: s.user.email,
      firstName: s.user.firstName,
      lastName: s.user.lastName,
      role: s.user.role as string,
    },
  }));
}

// ---------------------------------------------------------------------------
// listTenantUsers
// ---------------------------------------------------------------------------

export async function listTenantUsers(): Promise<TenantUserRow[]> {
  const { tenantId } = await requireTenantAccess();

  // Use createTenantClient(tenantId) — session-bound, not header-bound — so the
  // RLS extension and the explicit where filter both use the same session tenantId.
  const tenantDb = createTenantClient(tenantId);
  const users = await tenantDb.user.findMany({
    where: { isActive: true },
    select: { id: true, email: true, firstName: true, lastName: true, role: true },
    orderBy: { email: 'asc' },
  });

  return users.map((u) => ({
    id: u.id,
    email: u.email,
    firstName: u.firstName,
    lastName: u.lastName,
    role: u.role as string,
  }));
}

// ---------------------------------------------------------------------------
// listActiveTemplatesForTenant
// ---------------------------------------------------------------------------

export async function listActiveTemplatesForTenant(): Promise<ActiveTemplateForTenant[]> {
  const { tenantId } = await requireTenantAccess();

  const templates = await prisma.notificationTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ category: 'asc' }, { displayName: 'asc' }],
    select: { triggerKey: true, displayName: true, category: true },
  });

  const tenantDb = await getTenantPrisma();
  const tenantSettings = await tenantDb.tenantNotificationSettings.findMany({
    where: { tenantId, isActive: false },
    select: { triggerKey: true },
  });

  const disabledByTenant = new Set(tenantSettings.map((s) => s.triggerKey));

  return templates
    .filter((t) => !disabledByTenant.has(t.triggerKey))
    .map((t) => ({
      triggerKey: t.triggerKey,
      displayName: t.displayName,
      category: t.category as string,
    }));
}

// ---------------------------------------------------------------------------
// addSubscriber
// ---------------------------------------------------------------------------

export async function addSubscriber(
  triggerKey: string,
  userId: string,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const { tenantId } = await requireTenantAccess();

  const schema = z.object({
    triggerKey: z.string().min(1),
    userId: z.string().uuid(),
  });

  const parsed = schema.safeParse({ triggerKey, userId });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Validation error' };
  }

  try {
    const tenantDb = await getTenantPrisma();
    const existing = await tenantDb.notificationSubscription.findUnique({
      where: { tenantId_triggerKey_userId: { tenantId, triggerKey, userId } },
    });

    if (existing) {
      return { success: false, error: 'Already subscribed' };
    }

    const created = await tenantDb.notificationSubscription.create({
      data: { tenantId, triggerKey, userId },
    });

    revalidatePath('/settings/notifications');
    return { success: true, id: created.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// removeSubscriber
// ---------------------------------------------------------------------------

export async function removeSubscriber(
  id: string,
): Promise<{ success: true } | { success: false; error: string }> {
  await requireTenantAccess();
  z.string().uuid().parse(id);

  try {
    const tenantDb = await getTenantPrisma();
    await tenantDb.notificationSubscription.delete({ where: { id } });

    revalidatePath('/settings/notifications');
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// listTenantSendLog
// ---------------------------------------------------------------------------

export async function listTenantSendLog(params: {
  page?: number;
  pageSize?: number;
  status?: NotificationSendStatus;
  triggerKey?: string;
  channel?: NotificationChannel;
}): Promise<SendLogPaginatedResult> {
  const { tenantId } = await requireTenantAccess();

  const pageSize = params.pageSize ?? 25;
  const page = Math.max(1, params.page ?? 1);
  const skip = (page - 1) * pageSize;

  // NotificationSendLog has no Postgres RLS. Use createTenantClient(tenantId) so the
  // extension injects tenantId, and keep explicit where: { tenantId } as defense-in-depth.
  // The postgres role has BYPASSRLS privilege so no bypass_rls SET is needed — removing
  // the array-form $transaction eliminates the P2028 deadlock risk with connection pool.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { tenantId };
  if (params.status) where.status = params.status;
  if (params.triggerKey?.trim()) {
    where.triggerKey = { contains: params.triggerKey.trim(), mode: 'insensitive' };
  }
  if (params.channel) where.channel = params.channel;

  const tenantDb = createTenantClient(tenantId);
  const [total, rows] = await Promise.all([
    tenantDb.notificationSendLog.count({ where }),
    tenantDb.notificationSendLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { rows: rows as SendLogRow[], total, page, pageSize, totalPages };
}

// ---------------------------------------------------------------------------
// getTenantSendLogStats
// ---------------------------------------------------------------------------

export async function getTenantSendLogStats(): Promise<SendLogStats> {
  const { tenantId } = await requireTenantAccess();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // NotificationSendLog has no Postgres RLS. Use createTenantClient(tenantId) so the
  // extension injects tenantId, and keep explicit where: { tenantId } as defense-in-depth.
  // The postgres role has BYPASSRLS privilege so no bypass_rls SET is needed — removing
  // the array-form $transaction eliminates the P2028 deadlock risk with connection pool.
  const where = { tenantId, createdAt: { gte: thirtyDaysAgo } };
  const tenantDb = createTenantClient(tenantId);

  const [total, sent, failed, pending, failedAllTime] = await Promise.all([
    tenantDb.notificationSendLog.count({ where }),
    tenantDb.notificationSendLog.count({ where: { ...where, status: NotificationSendStatus.SENT } }),
    tenantDb.notificationSendLog.count({ where: { ...where, status: NotificationSendStatus.FAILED } }),
    tenantDb.notificationSendLog.count({ where: { ...where, status: NotificationSendStatus.PENDING } }),
    // quick-556: deliberately NOT date-bounded. Same tenant scoping, no
    // `createdAt` — an undelivered invitation does not stop mattering on day 31.
    tenantDb.notificationSendLog.count({
      where: { tenantId, status: NotificationSendStatus.FAILED },
    }),
  ]);

  const skipped = total - sent - failed - pending;

  return { total, sent, failed, skipped: skipped > 0 ? skipped : 0, pending, failedAllTime };
}
