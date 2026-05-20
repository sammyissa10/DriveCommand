'use server';

import { getAppBaseUrl } from '@/lib/app-url';
import { Prisma } from '@/generated/prisma';
import { requireAuth, isSystemAdmin } from '@/lib/auth/supabase';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sendOwnerInvitation } from '@/lib/email/send-owner-invitation';
import { sendEmail } from '@/lib/email/gmail-client';
import React from 'react';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { seedStarterPlaybooks } from '@/server/services/workflows/seedStarterPlaybooks';

async function requireAdminAccess() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) {
    throw new Error('Unauthorized: Admin access required');
  }
}

/**
 * Get all tenants with resource counts.
 * Uses base Prisma client for cross-tenant access (NOT getTenantPrisma).
 */
export async function getAllTenants() {
  await requireAdminAccess();

  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          users: true,
          trucks: true,
          routes: true,
        },
      },
      users: {
        where: { role: 'OWNER' },
        select: { id: true },
        take: 1,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return tenants.map(({ users: ownerUsers, ...rest }) => ({
    ...rest,
    ownerSetupComplete: ownerUsers.length > 0,
  }));
}

/**
 * Create a new tenant with name, slug, and owner invitation.
 * Also creates a PENDING DriverInvitation with OWNER role and sends invitation email.
 */
export async function createTenant(formData: FormData) {
  await requireAdminAccess();

  // Extract and validate input
  const name = formData.get('name');
  const slug = formData.get('slug');
  const ownerFirstName = formData.get('ownerFirstName');
  const ownerLastName = formData.get('ownerLastName');
  const ownerEmail = formData.get('ownerEmail');

  const schema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must be at most 100 characters'),
    slug: z.string()
      .min(2, 'Slug must be at least 2 characters')
      .max(50, 'Slug must be at most 50 characters')
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
    ownerFirstName: z.string().min(1, 'Owner first name is required'),
    ownerLastName: z.string().min(1, 'Owner last name is required'),
    ownerEmail: z.string().email('Owner email must be a valid email address'),
  });

  const validation = schema.safeParse({ name, slug, ownerFirstName, ownerLastName, ownerEmail });
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0].message,
    };
  }

  try {
    // Create tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: validation.data.name,
        slug: validation.data.slug,
        isActive: true,
      },
    });

    // Seed starter playbooks for the new tenant (non-fatal — idempotent, can be re-run)
    try {
      await seedStarterPlaybooks(tenant.id);
      logger.info(`Seeded starter playbooks for new tenant ${tenant.name} (${tenant.id})`);
    } catch (seedError: unknown) {
      // Seeding failure is NON-FATAL — tenant creation succeeded. Log and continue so the
      // invitation email still sends. An admin can re-run seed-starter-playbooks.ts later (idempotent).
      logger.error('Failed to seed starter playbooks for new tenant:', {
        tenantId: tenant.id,
        error: seedError instanceof Error ? seedError.message : String(seedError),
      });
    }

    // Create owner invitation (7 days expiry)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitation = await prisma.driverInvitation.create({
      data: {
        tenantId: tenant.id,
        email: validation.data.ownerEmail.toLowerCase().trim(),
        firstName: validation.data.ownerFirstName,
        lastName: validation.data.ownerLastName,
        role: 'OWNER',
        status: 'PENDING',
        expiresAt,
      },
    });

    revalidatePath('/tenants');

    // Send owner invitation email (non-blocking — warning if fails)
    const appUrl = getAppBaseUrl();
    const acceptUrl = `${appUrl}/accept-invitation?id=${invitation.id}`;

    try {
      await sendOwnerInvitation(validation.data.ownerEmail, {
        tenantId: tenant.id,
        firstName: validation.data.ownerFirstName,
        lastName: validation.data.ownerLastName,
        organizationName: validation.data.name,
        acceptUrl,
        expiresAt: expiresAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      });
    } catch (emailError: any) {
      logger.error('Failed to send owner invitation email:', emailError);
      return {
        success: true,
        emailWarning: `Tenant created but invitation email could not be sent to ${validation.data.ownerEmail}. Please check your email configuration and resend manually.`,
      };
    }

    return { success: true, tenant };
  } catch (error: unknown) {
    // Check for unique constraint violation on slug
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && Array.isArray(error.meta?.target) && (error.meta.target as string[]).includes('slug')) {
      return {
        success: false,
        error: 'A tenant with this slug already exists',
      };
    }

    return {
      success: false,
      error: 'Failed to create tenant. Please try again.',
    };
  }
}

/**
 * Suspend a tenant (set isActive to false).
 * Also bans all tenant users in Supabase Auth and invalidates their sessions.
 */
export async function suspendTenant(tenantId: string) {
  await requireAdminAccess();

  if (!tenantId || tenantId.trim() === '') {
    throw new Error('Tenant ID is required');
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { isActive: false },
  });

  // Ban all tenant users in Supabase Auth and invalidate their sessions
  const tenantUsers = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true },
  });

  const supabaseAdmin = createAdminClient();
  await Promise.allSettled(
    tenantUsers.map(async (user) => {
      try {
        await supabaseAdmin.auth.admin.updateUserById(user.id, { ban_duration: '87600h' });
        await supabaseAdmin.auth.admin.signOut(user.id, 'global');
      } catch (err) {
        logger.error('[suspendTenant] Supabase ban/signOut failed for user:' + user.id, err);
      }
    })
  );

  revalidatePath('/tenants');

  return { success: true };
}

/**
 * Reactivate a suspended tenant (set isActive to true).
 * Also lifts the Supabase Auth ban for all tenant users.
 */
export async function reactivateTenant(tenantId: string) {
  await requireAdminAccess();

  if (!tenantId || tenantId.trim() === '') {
    throw new Error('Tenant ID is required');
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { isActive: true },
  });

  // Lift the Supabase Auth ban for all tenant users
  const tenantUsers = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true },
  });

  const supabaseAdmin = createAdminClient();
  await Promise.allSettled(
    tenantUsers.map(async (user) => {
      try {
        await supabaseAdmin.auth.admin.updateUserById(user.id, { ban_duration: 'none' });
      } catch (err) {
        logger.error('[reactivateTenant] Supabase unban failed for user:' + user.id, err);
      }
    })
  );

  revalidatePath('/tenants');

  return { success: true };
}

/**
 * Get platform-wide system metrics for the admin dashboard.
 * Uses base Prisma client (NOT getTenantPrisma) for cross-tenant queries.
 */
export async function getSystemMetrics() {
  await requireAdminAccess();

  const startOfDay = new Date(new Date().setUTCHours(0, 0, 0, 0));
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totalTenants, activeLoadsToday, newSignupsThisWeek, openTickets] = await Promise.all([
    prisma.tenant.count(),
    prisma.load.count({
      where: {
        status: { in: ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] },
        createdAt: { gte: startOfDay },
      },
    }),
    prisma.tenant.count({
      where: {
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.supportTicket.count({
      where: { status: 'OPEN' },
    }),
  ]);

  return { totalTenants, activeLoadsToday, newSignupsThisWeek, openTickets };
}

/**
 * Get a single tenant with full detail including owner info and resource counts.
 */
export async function getTenantById(tenantId: string) {
  await requireAdminAccess();

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      contactEmail: true,
      plan: true,
      isActive: true,
      profitMarginThreshold: true,
      fleetSizeBucket: true,
      manualTrial: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { users: true, trucks: true, routes: true } },
      users: {
        where: { role: 'OWNER' },
        select: { id: true, email: true, firstName: true, lastName: true, createdAt: true },
        take: 1,
      },
      driverInvitations: {
        where: { role: 'OWNER', status: { in: ['PENDING', 'EXPIRED'] } },
        select: { id: true, email: true, firstName: true, lastName: true, createdAt: true, expiresAt: true, status: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const { users, driverInvitations, ...rest } = tenant;

  const latestInvitation = driverInvitations[0] ?? null;

  return {
    ...rest,
    ownerSetupComplete: users.length > 0,
    ownerUser: users[0] ?? null,
    pendingOwnerInvitation: latestInvitation?.status === 'PENDING' ? latestInvitation : null,
    expiredOwnerInvitation: latestInvitation?.status === 'EXPIRED' ? latestInvitation : null,
  };
}

/**
 * Resend owner invitation — resets an expired or pending invitation to PENDING with a new 7-day expiry
 * and sends the invitation email again.
 */
export async function resendOwnerInvitation(tenantId: string) {
  await requireAdminAccess();

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    if (!tenant) {
      return { success: false, error: 'Tenant not found' };
    }

    const invitation = await prisma.driverInvitation.findFirst({
      where: { tenantId, role: 'OWNER', status: { in: ['PENDING', 'EXPIRED'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (!invitation) {
      return { success: false, error: 'No invitation found to resend' };
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.driverInvitation.update({
      where: { id: invitation.id },
      data: { status: 'PENDING', expiresAt },
    });

    const appUrl = getAppBaseUrl();
    const acceptUrl = `${appUrl}/accept-invitation?id=${invitation.id}`;

    try {
      await sendOwnerInvitation(invitation.email, {
        tenantId,
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        organizationName: tenant.name,
        acceptUrl,
        expiresAt: expiresAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      });
    } catch (emailError: any) {
      logger.error('[resendOwnerInvitation] email send failed:', emailError);
      revalidatePath('/tenants/' + tenantId);
      return {
        success: true,
        emailWarning: 'Invitation reset but email could not be sent. Please check your email configuration.',
      };
    }

    revalidatePath('/tenants/' + tenantId);
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: 'Failed to resend invitation. Please try again.' };
  }
}

/**
 * Update a tenant's name and/or slug.
 */
export async function updateTenant(
  tenantId: string,
  data: { name: string; slug: string }
): Promise<{ success: boolean; error?: string }> {
  await requireAdminAccess();

  const schema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name must be at most 100 characters'),
    slug: z.string()
      .min(2, 'Slug must be at least 2 characters')
      .max(50, 'Slug must be at most 50 characters')
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase letters, numbers, and hyphens only'),
  });

  const validation = schema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  try {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { name: validation.data.name, slug: validation.data.slug },
    });

    revalidatePath(`/tenants/${tenantId}`);
    revalidatePath('/tenants');

    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && Array.isArray(error.meta?.target) && (error.meta.target as string[]).includes('slug')) {
      return { success: false, error: 'A tenant with this slug already exists' };
    }
    return { success: false, error: 'Failed to update tenant. Please try again.' };
  }
}

/**
 * Update a tenant owner's email address.
 * Sends a notification to the OLD email address before changing.
 */
export async function updateOwnerEmail(
  userId: string,
  newEmail: string
): Promise<{ success: boolean; error?: string }> {
  await requireAdminAccess();

  const validation = z.string().email('Must be a valid email address').safeParse(newEmail.trim().toLowerCase());
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  try {
    // Get current email before updating
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true, lastName: true, tenantId: true },
    });
    if (!user) return { success: false, error: 'User not found' };

    const oldEmail = user.email;

    await prisma.user.update({
      where: { id: userId },
      data: { email: validation.data },
    });

    if (user.tenantId) {
      revalidatePath(`/tenants/${user.tenantId}`);
    }

    // Notify old email — fire and forget
    try {
      await sendEmail({
        to: oldEmail,
        subject: 'Your DriveCommand login email has been updated',
        react: React.createElement('div', null,
          React.createElement('p', null, `Hi ${user.firstName || 'there'},`),
          React.createElement('p', null, `Your DriveCommand account login email has been changed to ${validation.data} by a system administrator.`),
          React.createElement('p', null, 'If you did not request this change, please contact support immediately.'),
          React.createElement('p', null, '— The DriveCommand Team'),
        ),
      });
    } catch (emailError) {
      logger.error('[updateOwnerEmail] notification email failed:', emailError);
    }

    return { success: true };
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && Array.isArray(error.meta?.target) && (error.meta.target as string[]).includes('email')) {
      return { success: false, error: 'This email is already in use by another account' };
    }
    return { success: false, error: 'Failed to update email. Please try again.' };
  }
}

/**
 * Update tenant settings: contactEmail, timezone, plan, profitMarginThreshold, fleetSizeBucket, manualTrial.
 */
export async function updateTenantSettings(
  tenantId: string,
  data: {
    contactEmail?: string;
    timezone: string;
    plan: string;
    profitMarginThreshold: number;
    fleetSizeBucket: 'OWNER_OPERATOR' | 'SMALL' | 'MEDIUM' | 'LARGE';
    manualTrial: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  await requireAdminAccess();

  const schema = z.object({
    contactEmail: z.string().email('Must be a valid email address').optional().or(z.literal('')),
    timezone: z.string().min(1, 'Timezone is required'),
    plan: z.enum(['starter', 'pro', 'enterprise'] as const),
    profitMarginThreshold: z
      .number()
      .min(0, 'Profit margin threshold must be at least 0')
      .max(100, 'Profit margin threshold must be at most 100'),
    fleetSizeBucket: z.enum(['OWNER_OPERATOR', 'SMALL', 'MEDIUM', 'LARGE'] as const),
    manualTrial: z.boolean(),
  });

  const validation = schema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  try {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        contactEmail: validation.data.contactEmail || null,
        timezone: validation.data.timezone,
        plan: validation.data.plan,
        profitMarginThreshold: validation.data.profitMarginThreshold,
        fleetSizeBucket: validation.data.fleetSizeBucket,
        manualTrial: validation.data.manualTrial,
      },
    });

    revalidatePath(`/tenants/${tenantId}`);

    return { success: true };
  } catch {
    return { success: false, error: 'Failed to update settings. Please try again.' };
  }
}

/**
 * Extend a tenant's trial by N days.
 * Updates Subscription.trialEndsAt and writes a trial.extended AppEvent.
 */
export async function extendTrial(tenantId: string, additionalDays: number) {
  await requireAdminAccess();

  if (additionalDays < 1 || additionalDays > 365) {
    return { error: 'Days must be between 1 and 365' };
  }

  const subscription = await prisma.subscription.findUnique({
    where: { tenantId },
    select: { trialEndsAt: true },
  });

  if (!subscription) return { error: 'No subscription found for this tenant' };

  const newTrialEndsAt = new Date(
    Math.max(subscription.trialEndsAt.getTime(), Date.now()) + additionalDays * 24 * 60 * 60 * 1000,
  );

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      await tx.subscription.update({
        where: { tenantId },
        data: { trialEndsAt: newTrialEndsAt },
      });

      await tx.appEvent.create({
        data: {
          tenantId,
          eventType: 'trial.extended',
          properties: {
            additionalDays,
            newTrialEndsAt: newTrialEndsAt.toISOString(),
            previousTrialEndsAt: subscription.trialEndsAt.toISOString(),
          },
        },
      });
    }, TX_OPTIONS);

    revalidatePath(`/tenants/${tenantId}`);
    return { ok: true, newTrialEndsAt };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Delete a tenant (hard delete).
 * Will fail if tenant has associated users, trucks, or routes.
 */
export async function deleteTenant(tenantId: string) {
  await requireAdminAccess();

  if (!tenantId || tenantId.trim() === '') {
    throw new Error('Tenant ID is required');
  }

  try {
    await prisma.tenant.delete({
      where: { id: tenantId },
    });

    revalidatePath('/tenants');

    return { success: true };
  } catch (error: unknown) {
    // Check for foreign key constraint violation
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return {
        success: false,
        error: 'Cannot delete tenant with associated users, trucks, or routes. Please remove them first.',
      };
    }

    return {
      success: false,
      error: 'Failed to delete tenant. Please try again.',
    };
  }
}
