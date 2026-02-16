'use server';

/**
 * Server actions for expense category management.
 * All actions enforce OWNER/MANAGER role authorization before any data access.
 */

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { categoryCreateSchema } from '@/lib/validations/expense-category.schemas';
import { revalidatePath } from 'next/cache';

/**
 * Create a new custom expense category.
 * Requires OWNER or MANAGER role.
 * Categories are created with isSystemDefault: false.
 */
export async function createCategory(prevState: any, formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields
  const rawData = {
    name: formData.get('name') as string,
  };

  // Validate with Zod schema
  const result = categoryCreateSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
    };
  }

  const { name } = result.data;

  // Get tenant ID and Prisma client
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  try {
    // Create category with isSystemDefault: false
    await prisma.expenseCategory.create({
      data: {
        tenantId,
        name,
        isSystemDefault: false,
      },
    });
  } catch (error: any) {
    console.error('Failed to create category:', error);

    // Check for unique constraint violation (duplicate name)
    if (error.code === 'P2002') {
      return {
        error: {
          name: ['A category with this name already exists'],
        },
      };
    }

    return { error: 'Failed to create category. Please try again.' };
  }

  // Revalidate paths
  revalidatePath('/settings/expense-categories');

  return { success: true };
}

/**
 * Delete a custom expense category.
 * Requires OWNER or MANAGER role.
 * System default categories cannot be deleted.
 * Categories in use by existing expenses cannot be deleted.
 */
export async function deleteCategory(categoryId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  try {
    // Fetch category to check if it's a system default
    const category = await prisma.expenseCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return {
        error: 'Category not found',
      };
    }

    if (category.isSystemDefault) {
      return {
        error: 'Cannot delete system default categories',
      };
    }

    // Check if any non-deleted expenses use this category
    const expenseCount = await prisma.routeExpense.count({
      where: {
        categoryId,
        deletedAt: null,
      },
    });

    if (expenseCount > 0) {
      return {
        error: 'Cannot delete category in use by existing expenses',
      };
    }

    // Hard delete is OK for categories (they're configuration, not financial records)
    await prisma.expenseCategory.delete({
      where: { id: categoryId },
    });

    // Revalidate paths
    revalidatePath('/settings/expense-categories');

    return { success: true };
  } catch (error) {
    console.error('Failed to delete category:', error);
    return { error: 'Failed to delete category. Please try again.' };
  }
}

/**
 * List all expense categories for the tenant.
 * Requires OWNER, MANAGER, or DRIVER role (read access).
 * Returns system defaults first, then custom categories alphabetically.
 */
export async function listCategories() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  const prisma = await getTenantPrisma();
  return prisma.expenseCategory.findMany({
    orderBy: [
      { isSystemDefault: 'desc' }, // System defaults first
      { name: 'asc' },            // Then alphabetically
    ],
  });
}
