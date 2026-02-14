'use server';

/**
 * Server actions for driver management operations.
 * All actions enforce OWNER/MANAGER role authorization before any data access.
 */

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { driverInviteSchema, driverUpdateSchema } from '@/lib/validations/driver.schemas';
import { revalidatePath } from 'next/cache';
import { clerkClient } from '@clerk/nextjs/server';

/**
 * Invite a new driver via Clerk Invitations API.
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

    // Create Clerk invitation
    const clerk = await clerkClient();
    const invitation = await clerk.invitations.createInvitation({
      emailAddress: email,
      redirectUrl: (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000') + '/sign-up',
      publicMetadata: {
        role: UserRole.DRIVER,
        firstName,
        lastName,
        tenantId, // Pass tenantId in public metadata for webhook processing
      },
    });

    // Store DriverInvitation record
    await prisma.driverInvitation.create({
      data: {
        tenantId,
        email,
        firstName,
        lastName,
        licenseNumber: licenseNumber || null,
        clerkInvitationId: invitation.id,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        status: 'PENDING',
      },
    });

    // Revalidate
    revalidatePath('/drivers');

    return {
      success: true,
      message: `Invitation sent to ${email}`,
    };
  } catch (error) {
    console.error('Failed to send driver invitation:', error);
    return {
      error: 'Failed to send invitation. Please try again.',
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

  return { success: true };
}

/**
 * Deactivate a driver (soft delete).
 * Sets isActive=false and revokes all Clerk sessions.
 * Requires OWNER or MANAGER role.
 */
export async function deactivateDriver(id: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Update user via tenant-scoped Prisma client
  const prisma = await getTenantPrisma();
  const user = await prisma.user.update({
    where: { id },
    data: { isActive: false },
  });

  // Revoke all Clerk sessions for this user
  try {
    const clerk = await clerkClient();
    const sessions = await clerk.sessions.getSessionList({ userId: user.clerkUserId });

    // Revoke each session
    for (const session of sessions.data) {
      await clerk.sessions.revokeSession(session.id);
    }
  } catch (error) {
    console.error('Failed to revoke Clerk sessions for driver:', error);
    // Continue even if session revocation fails - user is already deactivated in DB
  }

  // Revalidate
  revalidatePath('/drivers');

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
