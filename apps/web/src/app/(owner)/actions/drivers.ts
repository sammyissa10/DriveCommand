'use server';

import type { ActionState } from '@drivecommand/types';

/**
 * Server actions for driver management operations.
 * All actions enforce OWNER/MANAGER role authorization before any data access.
 */

import { getAppBaseUrl } from '@/lib/app-url';
import { requireRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { driverInviteSchema, driverUpdateSchema } from '@drivecommand/validation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { sendDriverInvitation } from '@/lib/email/send-driver-invitation';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { fireEvent } from '@/server/services/workflows/fireEvent';

/**
 * Invite a new driver.
 * Creates a DriverInvitation record in the database with PENDING status.
 * Requires OWNER or MANAGER role.
 */
export async function inviteDriver(prevState: ActionState | null, formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields
  const rawData = {
    email: formData.get('email') as string,
    firstName: formData.get('firstName') as string,
    lastName: formData.get('lastName') as string,
    licenseNumber: (formData.get('licenseNumber') as string) || '',
    middleName: (formData.get('middleName') as string) || '',
    dateOfBirth: (formData.get('dateOfBirth') as string) || '',
    phoneNumber: (formData.get('phoneNumber') as string) || '',
    address: (formData.get('address') as string) || '',
    licenseExpirationDate: (formData.get('licenseExpirationDate') as string) || '',
  };

  // Validate with Zod schema
  const result = driverInviteSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
    };
  }

  const { email, firstName, lastName, licenseNumber, middleName, dateOfBirth, phoneNumber, address, licenseExpirationDate } = result.data;

  // Compute full name from name parts
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');

  // Get tenant ID and Prisma client
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  try {
    // Check for existing user with same email in tenant
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        tenantId,
      },
    });

    if (existingUser) {
      return {
        error: {
          email: ['A user with this email already exists in your organization'],
        },
      };
    }

    // Cancel any pending invitations for same email
    await prisma.driverInvitation.updateMany({
      where: {
        email,
        tenantId,
        status: 'PENDING',
      },
      data: {
        status: 'CANCELLED',
      },
    });

    // Create DriverInvitation record in the database
    const invitation = await prisma.driverInvitation.create({
      data: {
        tenantId,
        email,
        firstName,
        lastName,
        licenseNumber: licenseNumber || null,
        middleName: middleName || null,
        fullName,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
        phoneNumber: phoneNumber || null,
        address: address || null,
        licenseExpirationDate: licenseExpirationDate ? new Date(licenseExpirationDate) : null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        status: 'PENDING',
      },
    });
    // Post-commit automation — runs outside the main transaction scope per spec Section 6.5
    // Note: DriverInvitation has no driverType field, so entityData includes only id + email.
    // CDL/NON_CDL/OWNER_OP recipe conditions will not match without driverType — this is a known
    // limitation documented in research Open Question 1. The ON_DRIVER_CREATE event fires; only
    // the blanket (no-condition) triggers will activate until driverType is added to invitation flow.
    try {
      await fireEvent({
        event: 'ON_DRIVER_CREATE',
        entityData: {
          id: invitation.id, // DriverInvitation.id — entity the checklist will attach to
          email: invitation.email,
        },
        tenantId,
      });
    } catch (err) {
      logger.error('[inviteDriver] fireEvent failed', { invitationId: invitation.id, err });
      // Do not throw — the invitation is already created successfully
    }

    // Fetch tenant name for the invitation email
    let organizationName = 'your fleet';
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      });
      organizationName = tenant?.name || 'your fleet';
    } catch {
      // Fall back to generic name — non-critical
    }

    // Send invitation email (failure does NOT roll back the invitation record)
    const baseUrl = getAppBaseUrl();
    const acceptUrl = `${baseUrl}/accept-invitation?id=${invitation.id}`;

    let emailSent = false;
    try {
      await sendDriverInvitation(email, {
        tenantId,
        firstName,
        lastName,
        organizationName,
        acceptUrl,
        expiresAt: invitation.expiresAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      });
      emailSent = true;
    } catch (emailError) {
      logger.error('Failed to send invitation email:', emailError);
      // Invitation record exists; email can be resent later
    }

    // Revalidate
    revalidatePath('/drivers');
    revalidateTag('dashboard-metrics', 'max');

    if (!emailSent) {
      return {
        success: true,
        warning: `Invitation created for ${email}, but the email could not be sent. Check that RESEND_API_KEY is configured in your environment variables.`,
      };
    }

    return {
      success: true,
      message: `Invitation sent to ${email}`,
    };
  } catch (error) {
    logger.error('Failed to create driver invitation:', error);
    return {
      error: 'Failed to create invitation. Please try again.',
    };
  }
}

/**
 * List all drivers for the current tenant.
 * Requires OWNER or MANAGER role.
 */
export async function listDrivers() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  return prisma.user.findMany({
    take: 100,
    where: {
      role: 'DRIVER',
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Get a single driver by ID.
 * Requires OWNER or MANAGER role.
 * Returns null if not found or belongs to different tenant (RLS).
 */
export async function getDriver(id: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  return prisma.user.findUnique({
    where: { id },
  });
}

/**
 * Update an existing driver.
 * Requires OWNER or MANAGER role.
 */
export async function updateDriver(id: string, prevState: ActionState | null, formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields
  const rawData = {
    firstName: formData.get('firstName') as string,
    lastName: formData.get('lastName') as string,
    licenseNumber: (formData.get('licenseNumber') as string) || '',
    middleName: (formData.get('middleName') as string) || '',
    dateOfBirth: (formData.get('dateOfBirth') as string) || '',
    phoneNumber: (formData.get('phoneNumber') as string) || '',
    address: (formData.get('address') as string) || '',
    licenseExpirationDate: (formData.get('licenseExpirationDate') as string) || '',
  };

  // Validate with Zod schema
  const result = driverUpdateSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
    };
  }

  // New fields validated but not yet persisted to User model — User model will need
  // middleName, dateOfBirth, phoneNumber, address, licenseExpirationDate columns added
  // before full edit-form support is available.

  // Clean licenseNumber: if empty string, set to null
  const updateData = {
    firstName: result.data.firstName,
    lastName: result.data.lastName,
    licenseNumber: result.data.licenseNumber || null,
  };

  // Update driver via tenant-scoped Prisma client
  const prisma = await getTenantPrisma();
  await prisma.user.update({
    where: { id },
    data: updateData,
  });

  // Revalidate
  revalidatePath('/drivers');
  revalidatePath(`/drivers/${id}`);
  revalidateTag('dashboard-metrics', 'max');

  return { success: true };
}

/**
 * Deactivate a driver (soft delete).
 * Sets isActive=false and bans the user in Supabase Auth.
 * Requires OWNER or MANAGER role.
 */
export async function deactivateDriver(id: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Update user via tenant-scoped Prisma client
  const prisma = await getTenantPrisma();
  await prisma.user.update({
    where: { id },
    data: { isActive: false },
  });

  // Ban in Supabase Auth and invalidate existing sessions
  try {
    const supabaseAdmin = createAdminClient();
    await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: '87600h' });
    await supabaseAdmin.auth.admin.signOut(id, 'global');
  } catch (err) {
    logger.error('[deactivateDriver] Supabase ban failed for user:' + id, err);
  }

  // Revalidate
  revalidatePath('/drivers');
  revalidateTag('dashboard-metrics', 'max');

  return { success: true };
}

/**
 * Reactivate a driver.
 * Sets isActive=true and lifts the Supabase Auth ban.
 * Requires OWNER or MANAGER role.
 */
export async function reactivateDriver(id: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Update user via tenant-scoped Prisma client
  const prisma = await getTenantPrisma();
  await prisma.user.update({
    where: { id },
    data: { isActive: true },
  });

  // Lift the Supabase Auth ban
  try {
    const supabaseAdmin = createAdminClient();
    await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: 'none' });
  } catch (err) {
    logger.error('[reactivateDriver] Supabase unban failed for user:' + id, err);
  }

  // Revalidate
  revalidatePath('/drivers');
  revalidateTag('dashboard-metrics', 'max');

  return { success: true };
}

/**
 * List all driver invitations for the current tenant.
 * Requires OWNER or MANAGER role.
 */
export async function listInvitations() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  return prisma.driverInvitation.findMany({
    orderBy: {
      createdAt: 'desc',
    },
  });
}
