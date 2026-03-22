'use server';

/**
 * Server actions for expense CRUD operations.
 * All actions enforce OWNER/MANAGER/DRIVER role authorization before any data access.
 */

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { expenseCreateSchema, expenseUpdateSchema } from '@/lib/validations/expense.schemas';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@/generated/prisma';

const Decimal = Prisma.Decimal;

/**
 * Create a new expense.
 * Requires OWNER or MANAGER role.
 * Validates route exists and is not COMPLETED before creating.
 */
export async function createExpense(prevState: any, formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields
  const rawData = {
    routeId: formData.get('routeId') as string,
    categoryId: formData.get('categoryId') as string,
    amount: formData.get('amount') as string,
    description: formData.get('description') as string,
    notes: (formData.get('notes') as string) || undefined,
  };

  // Validate with Zod schema
  const result = expenseCreateSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
    };
  }

  const { routeId, categoryId, amount, description, notes } = result.data;

  // Get tenant ID and Prisma client
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  try {
    // Check route exists and status is not COMPLETED
    const route = await prisma.route.findUnique({
      where: { id: routeId },
    });

    if (!route) {
      return {
        error: 'Route not found',
      };
    }

    if (route.status === 'COMPLETED') {
      return {
        error: 'Cannot add expenses to a completed route',
      };
    }

    // Check category exists
    const category = await prisma.expenseCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      return {
        error: {
          categoryId: ['Category not found'],
        },
      };
    }

    // Create expense with Decimal amount
    await prisma.routeExpense.create({
      data: {
        tenantId,
        routeId,
        categoryId,
        amount: new Decimal(amount),
        description,
        notes,
      },
    });
  } catch (error) {
    console.error('Failed to create expense:', error);
    return { error: 'Failed to create expense. Please try again.' };
  }

  // Revalidate paths
  revalidatePath(`/routes/${routeId}`);
  revalidatePath('/routes');

  return { success: true };
}

/**
 * Update an existing expense.
 * Requires OWNER or MANAGER role.
 * Validates route is not COMPLETED and expense is not soft-deleted.
 */
export async function updateExpense(expenseId: string, prevState: any, formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields (only include non-empty ones)
  const rawData: any = {};

  const categoryId = formData.get('categoryId') as string;
  if (categoryId) rawData.categoryId = categoryId;

  const amount = formData.get('amount') as string;
  if (amount) rawData.amount = amount;

  const description = formData.get('description') as string;
  if (description) rawData.description = description;

  const notes = formData.get('notes') as string;
  if (notes !== null && notes !== undefined) rawData.notes = notes;

  // Validate with Zod schema
  const result = expenseUpdateSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
    };
  }

  const prisma = await getTenantPrisma();

  try {
    // Fetch existing expense to get routeId and check status
    const expense = await prisma.routeExpense.findUnique({
      where: { id: expenseId },
      include: {
        route: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!expense) {
      return {
        error: 'Expense not found',
      };
    }

    if (expense.deletedAt) {
      return {
        error: 'Cannot edit a deleted expense',
      };
    }

    if (expense.route.status === 'COMPLETED') {
      return {
        error: 'Cannot edit expenses on a completed route',
      };
    }

    // Validate category if provided
    if (result.data.categoryId) {
      const category = await prisma.expenseCategory.findUnique({
        where: { id: result.data.categoryId },
      });

      if (!category) {
        return {
          error: {
            categoryId: ['Category not found'],
          },
        };
      }
    }

    // Build update data object
    const updateData: any = {};
    if (result.data.categoryId) updateData.categoryId = result.data.categoryId;
    if (result.data.amount !== undefined) updateData.amount = new Decimal(result.data.amount);
    if (result.data.description) updateData.description = result.data.description;
    if (result.data.notes !== undefined) updateData.notes = result.data.notes;

    // Update expense
    await prisma.routeExpense.update({
      where: { id: expenseId },
      data: updateData,
    });

    // Revalidate paths
    revalidatePath(`/routes/${expense.route.id}`);
    revalidatePath('/routes');

    return { success: true };
  } catch (error) {
    console.error('Failed to update expense:', error);
    return { error: 'Failed to update expense. Please try again.' };
  }
}

/**
 * Delete an expense (soft delete).
 * Requires OWNER or MANAGER role.
 * Sets deletedAt timestamp instead of hard delete.
 */
export async function deleteExpense(expenseId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  try {
    // Fetch expense to get routeId and check route status
    const expense = await prisma.routeExpense.findUnique({
      where: { id: expenseId },
      include: {
        route: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!expense) {
      return {
        error: 'Expense not found',
      };
    }

    if (expense.route.status === 'COMPLETED') {
      return {
        error: 'Cannot delete expenses from a completed route',
      };
    }

    // Soft delete: update deletedAt
    await prisma.routeExpense.update({
      where: { id: expenseId },
      data: {
        deletedAt: new Date(),
      },
    });

    // Revalidate paths
    revalidatePath(`/routes/${expense.route.id}`);
    revalidatePath('/routes');

    return { success: true };
  } catch (error) {
    console.error('Failed to delete expense:', error);
    return { error: 'Failed to delete expense. Please try again.' };
  }
}

/**
 * List all expenses for a route.
 * Requires OWNER, MANAGER, or DRIVER role (read access).
 * Only returns non-deleted expenses.
 */
export async function listExpenses(routeId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  const prisma = await getTenantPrisma();
  return prisma.routeExpense.findMany({
    where: {
      routeId,
      deletedAt: null,
    },
    include: {
      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * List all expense categories for the tenant.
 * Requires OWNER, MANAGER, or DRIVER role (read access).
 * Returns system defaults first, then custom categories alphabetically.
 */
export async function listExpenseCategories() {
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
