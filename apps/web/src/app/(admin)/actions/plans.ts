'use server';

import { requireAuth, isSystemAdmin } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

async function requireAdminAccess() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) throw new Error('Unauthorized: Admin access required');
}

export async function getPlans() {
  await requireAdminAccess();
  return prisma.plan.findMany({ orderBy: { sortOrder: 'asc' } });
}

export async function getPlanById(id: string) {
  await requireAdminAccess();
  const plan = await prisma.plan.findUnique({ where: { id } });
  if (!plan) throw new Error('Plan not found');
  return plan;
}

const createPlanSchema = z.object({
  key: z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/, 'Key must be lowercase letters, numbers, hyphens, or underscores'),
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  defaultTrialDays: z.number().int().min(0).max(365),
  monthlyPriceCents: z.number().int().min(0),
  yearlyPriceCents: z.number().int().min(0).optional().nullable(),
  maxTrucks: z.number().int().min(1).optional().nullable(),
  maxUsers: z.number().int().min(1).optional().nullable(),
  storageGbLimit: z.number().int().min(1).optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export async function createPlan(data: unknown): Promise<{ success: boolean; error?: string }> {
  await requireAdminAccess();
  const validation = createPlanSchema.safeParse(data);
  if (!validation.success) return { success: false, error: validation.error.issues[0].message };
  try {
    await prisma.plan.create({ data: validation.data });
    revalidatePath('/plans');
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to create plan. Key may already exist.' };
  }
}

const updatePlanSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  defaultTrialDays: z.number().int().min(0).max(365).optional(),
  monthlyPriceCents: z.number().int().min(0).optional(),
  yearlyPriceCents: z.number().int().min(0).optional().nullable(),
  maxTrucks: z.number().int().min(1).optional().nullable(),
  maxUsers: z.number().int().min(1).optional().nullable(),
  storageGbLimit: z.number().int().min(1).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function updatePlan(id: string, data: unknown): Promise<{ success: boolean; error?: string }> {
  await requireAdminAccess();
  const validation = updatePlanSchema.safeParse(data);
  if (!validation.success) return { success: false, error: validation.error.issues[0].message };
  try {
    await prisma.plan.update({ where: { id }, data: validation.data });
    revalidatePath('/plans');
    revalidatePath(`/plans/${id}`);
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to update plan.' };
  }
}
