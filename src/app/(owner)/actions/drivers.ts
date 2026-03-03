'use server';

/**
 * Server actions for driver management operations.
 * All actions enforce OWNER/MANAGER role authorization before any data access.
 */

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { driverInviteSchema, driverUpdateSchema } from '@/lib/validations/driver.schemas';
import { revalidatePath, revalidateTag } from 'next/cache';
import { sendDriverInvitation } from '@/lib/email/send-driver-invitation';

/**
 * Invite a new driver.
 * Creates a DriverInvitation record in the database with PENDING status.
 * Requires OWNER or MANAGER role.
 */
export async function inviteDriver(prevState: any, formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields
  const rawData = {
    email: formData.get('email') as string,
    firstName: formData.get('firstName') as string,
    lastName: formData.get('lastName') as string,
    licenseNumber: (formData.get('licenseNumber') as string) || '',
  };

  // Validate with Zod schema
  const result = driverInviteSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
    };
  }

  const { email, firstName, lastName, licenseNumber } = result.data;

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
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        status: 'PENDING',
      },
    });

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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const acceptUrl = `${baseUrl}/accept-invitation?id=${invitation.id}`;

    let emailSent = false;
    try {
      await sendDriverInvitation(email, {
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
      console.error('Failed to send invitation email:', emailError);
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
    console.error('Failed to create driver invitation:', error);
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
export async function updateDriver(id: string, prevState: any, formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields
  const rawData = {
    firstName: formData.get('firstName') as string,
    lastName: formData.get('lastName') as string,
    licenseNumber: (formData.get('licenseNumber') as string) || '',
  };

  // Validate with Zod schema
  const result = driverUpdateSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
    };
  }

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
 * Sets isActive=false.
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

  // Revalidate
  revalidatePath('/drivers');
  revalidateTag('dashboard-metrics', 'max');

  return { success: true };
}

/**
 * Reactivate a driver.
 * Sets isActive=true.
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
