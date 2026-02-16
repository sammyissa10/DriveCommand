'use server';

/**
 * Server actions for expense template management.
 * All actions enforce OWNER/MANAGER role authorization before any data access.
 */

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { templateCreateSchema } from '@/lib/validations/expense-template.schemas';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@/generated/prisma';

const Decimal = Prisma.Decimal;

/**
 * Create a new expense template with items.
 * Requires OWNER or MANAGER role.
 * Uses a transaction to create template and items atomically.
 */
export async function createTemplate(prevState: any, formData: FormData) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parse FormData fields
  const name = formData.get('name') as string;
  const itemsJson = formData.get('itemsJson') as string;

  let items;
  try {
    items = JSON.parse(itemsJson);
  } catch (error) {
    return {
      error: 'Invalid items data',
    };
  }

  const rawData = {
    name,
    items,
  };

  // Validate with Zod schema
  const result = templateCreateSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
    };
  }

  const validatedData = result.data;

  // Get tenant ID and Prisma client
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  try {
    // Use a transaction to create template and items atomically
    await prisma.$transaction(async (tx) => {
      // Create template
      const template = await tx.expenseTemplate.create({
        data: {
          tenantId,
          name: validatedData.name,
        },
      });

      // Create all items
      await tx.expenseTemplateItem.createMany({
        data: validatedData.items.map((item) => ({
          templateId: template.id,
          categoryId: item.categoryId,
          amount: new Decimal(item.amount),
          description: item.description,
        })),
      });
    });
  } catch (error: any) {
    console.error('Failed to create template:', error);

    // Check for unique constraint violation (duplicate name)
    if (error.code === 'P2002') {
      return {
        error: {
          name: ['A template with this name already exists'],
        },
      };
    }

    return { error: 'Failed to create template. Please try again.' };
  }

  // Revalidate paths
  revalidatePath('/settings/expense-templates');

  return { success: true };
}

/**
 * Delete an expense template.
 * Requires OWNER or MANAGER role.
 * Template items are cascade deleted automatically.
 */
export async function deleteTemplate(templateId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  try {
    // Hard delete is OK for templates (they're configuration, not financial records)
    // Items will cascade delete due to onDelete: Cascade in schema
    await prisma.expenseTemplate.delete({
      where: { id: templateId },
    });

    // Revalidate paths
    revalidatePath('/settings/expense-templates');

    return { success: true };
  } catch (error) {
    console.error('Failed to delete template:', error);
    return { error: 'Failed to delete template. Please try again.' };
  }
}

/**
 * List all expense templates with their items.
 * Requires OWNER, MANAGER, or DRIVER role (read access).
 * Includes category relation for each item.
 */
export async function listTemplates() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  const prisma = await getTenantPrisma();
  return prisma.expenseTemplate.findMany({
    include: {
      items: {
        include: {
          category: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          description: 'asc',
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });
}

/**
 * Apply an expense template to a route.
 * Requires OWNER or MANAGER role.
 * Creates multiple RouteExpense records from template items in a transaction.
 * Route must exist and not be COMPLETED.
 */
export async function applyTemplate(routeId: string, templateId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  try {
    // Check route exists and is not COMPLETED
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
        error: 'Cannot apply template to a completed route',
      };
    }

    // Use a transaction to create all expenses atomically
    const result = await prisma.$transaction(async (tx) => {
      // Fetch template with items
      const template = await tx.expenseTemplate.findUnique({
        where: { id: templateId },
        include: { items: true },
      });

      if (!template) {
        throw new Error('Template not found');
      }

      // Create all expense records from template items
      await tx.routeExpense.createMany({
        data: template.items.map((item) => ({
          tenantId,
          routeId,
          categoryId: item.categoryId,
          amount: item.amount,
          description: item.description,
        })),
      });

      return { count: template.items.length };
    });

    // Revalidate paths
    revalidatePath(`/routes/${routeId}`);
    revalidatePath('/routes');

    return {
      success: true,
      count: result.count,
    };
  } catch (error: any) {
    console.error('Failed to apply template:', error);

    if (error.message === 'Template not found') {
      return {
        error: 'Template not found',
      };
    }

    return { error: 'Failed to apply template. Please try again.' };
  }
}
