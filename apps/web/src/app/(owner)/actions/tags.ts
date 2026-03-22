'use server';

/**
 * Server actions for tag CRUD and assignment operations.
 * All actions enforce OWNER/MANAGER role authorization before any data access.
 */

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { createTagSchema, assignTagSchema } from '@/lib/validations/tag.schemas';
import { revalidatePath } from 'next/cache';

/**
 * Create a new tag.
 * Requires OWNER or MANAGER role.
 */
export async function createTag(formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields
  const rawData = {
    name: formData.get('name') as string,
    color: formData.get('color') as string,
  };

  // Validate with Zod schema
  const result = createTagSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
    };
  }

  // Get tenant ID and create tag via tenant-scoped Prisma client
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  try {
    // @ts-ignore - Prisma 7 withTenantRLS extension type issue
    const tag = await prisma.tag.create({
      data: {
        ...result.data,
        tenantId,
      },
    });

    // Revalidate
    revalidatePath('/tags');

    return { success: true, tag };
  } catch (error: any) {
    // Handle unique constraint violation (duplicate tag name)
    if (error.code === 'P2002') {
      return {
        error: {
          name: ['A tag with this name already exists'],
        },
      };
    }
    throw error;
  }
}

/**
 * Delete a tag.
 * Cascade deletes all tag assignments.
 * Requires OWNER or MANAGER role.
 */
export async function deleteTag(tagId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Delete tag via tenant-scoped Prisma client
  const prisma = await getTenantPrisma();
  // @ts-ignore - Prisma 7 withTenantRLS extension type issue
  await prisma.tag.delete({
    where: { id: tagId },
  });

  // Revalidate
  revalidatePath('/tags');

  return { success: true };
}

/**
 * List all tags for the current tenant.
 * Requires OWNER or MANAGER role.
 */
export async function listTags() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  // @ts-ignore - Prisma 7 withTenantRLS extension type issue
  return prisma.tag.findMany({
    orderBy: { name: 'asc' },
  });
}

/**
 * List all tags with their assignments (including truck and user details).
 * Requires OWNER or MANAGER role.
 */
export async function listTagsWithAssignments() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  // @ts-ignore - Prisma 7 withTenantRLS extension type issue
  return prisma.tag.findMany({
    orderBy: { name: 'asc' },
    include: {
      assignments: {
        include: {
          truck: {
            select: {
              id: true,
              make: true,
              model: true,
              licensePlate: true,
            },
          },
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      },
    },
  });
}

/**
 * Assign a tag to a truck or user.
 * Requires OWNER or MANAGER role.
 */
export async function assignTag(formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields
  const rawData = {
    tagId: formData.get('tagId') as string,
    truckId: (formData.get('truckId') as string) || undefined,
    userId: (formData.get('userId') as string) || undefined,
  };

  // Validate with Zod schema
  const result = assignTagSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
    };
  }

  // Get tenant ID and create assignment via tenant-scoped Prisma client
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  try {
    // @ts-ignore - Prisma 7 withTenantRLS extension type issue
    const assignment = await prisma.tagAssignment.create({
      data: {
        tagId: result.data.tagId,
        truckId: result.data.truckId || null,
        userId: result.data.userId || null,
        tenantId,
      },
    });

    // Revalidate
    revalidatePath('/tags');

    return { success: true, assignment };
  } catch (error: any) {
    // Handle unique constraint violation (tag already assigned)
    if (error.code === 'P2002') {
      return {
        error: 'This tag is already assigned to the selected truck or user',
      };
    }
    throw error;
  }
}

/**
 * Unassign a tag (delete tag assignment).
 * Requires OWNER or MANAGER role.
 */
export async function unassignTag(assignmentId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Delete assignment via tenant-scoped Prisma client
  const prisma = await getTenantPrisma();
  // @ts-ignore - Prisma 7 withTenantRLS extension type issue
  await prisma.tagAssignment.delete({
    where: { id: assignmentId },
  });

  // Revalidate
  revalidatePath('/tags');

  return { success: true };
}

/**
 * Get tags assigned to a specific truck or user.
 * Requires OWNER or MANAGER role.
 */
export async function getTagsForEntity(
  entityType: 'truck' | 'user',
  entityId: string
) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  const whereClause =
    entityType === 'truck' ? { truckId: entityId } : { userId: entityId };

  // @ts-ignore - Prisma 7 withTenantRLS extension type issue
  return prisma.tagAssignment.findMany({
    where: whereClause,
    include: {
      tag: true,
    },
  });
}
