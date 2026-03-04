'use server';

import { requireAuth, isSystemAdmin } from '@/lib/auth/server';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { sendOwnerInvitation } from '@/lib/email/send-owner-invitation';

/**
 * Helper function to enforce system admin authorization.
 * All admin actions MUST call this before any operations.
 */
async function requireSystemAdmin() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) {
    throw new Error('Unauthorized: System admin access required');
  }
}

/**
 * Get all tenants with resource counts.
 * Uses base Prisma client for cross-tenant access (NOT getTenantPrisma).
 */
export async function getAllTenants() {
  await requireSystemAdmin();

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
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return tenants;
}

/**
 * Create a new tenant with name, slug, and owner invitation.
 * Also creates a PENDING DriverInvitation with OWNER role and sends invitation email.
 */
export async function createTenant(formData: FormData) {
  await requireSystemAdmin();

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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const acceptUrl = `${appUrl}/accept-invitation?id=${invitation.id}`;

    try {
      await sendOwnerInvitation(validation.data.ownerEmail, {
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
      console.error('Failed to send owner invitation email:', emailError);
      return {
        success: true,
        emailWarning: `Tenant created but invitation email could not be sent to ${validation.data.ownerEmail}. Please check your email configuration and resend manually.`,
      };
    }

    return { success: true, tenant };
  } catch (error: any) {
    // Check for unique constraint violation on slug
    if (error.code === 'P2002' && error.meta?.target?.includes('slug')) {
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
 */
export async function suspendTenant(tenantId: string) {
  await requireSystemAdmin();

  if (!tenantId || tenantId.trim() === '') {
    throw new Error('Tenant ID is required');
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { isActive: false },
  });

  revalidatePath('/tenants');

  return { success: true };
}

/**
 * Reactivate a suspended tenant (set isActive to true).
 */
export async function reactivateTenant(tenantId: string) {
  await requireSystemAdmin();

  if (!tenantId || tenantId.trim() === '') {
    throw new Error('Tenant ID is required');
  }

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { isActive: true },
  });

  revalidatePath('/tenants');

  return { success: true };
}

/**
 * Delete a tenant (hard delete).
 * Will fail if tenant has associated users, trucks, or routes.
 */
export async function deleteTenant(tenantId: string) {
  await requireSystemAdmin();

  if (!tenantId || tenantId.trim() === '') {
    throw new Error('Tenant ID is required');
  }

  try {
    await prisma.tenant.delete({
      where: { id: tenantId },
    });

    revalidatePath('/tenants');

    return { success: true };
  } catch (error: any) {
    // Check for foreign key constraint violation
    if (error.code === 'P2003') {
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
