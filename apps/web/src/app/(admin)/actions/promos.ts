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

export async function getPromos() {
  await requireAdminAccess();
  return prisma.promo.findMany({ orderBy: { createdAt: 'desc' } });
}

const createPromoSchema = z.object({
  code: z.string().min(1).max(50).toUpperCase(),
  description: z.string().optional(),
  bonusTrialDays: z.number().int().min(0).max(365).default(0),
  discountPct: z.number().int().min(0).max(100).optional().nullable(),
  activeFrom: z.string().datetime(),
  activeTo: z.string().datetime(),
  maxRedemptions: z.number().int().min(1).optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function createPromo(data: unknown): Promise<{ success: boolean; error?: string }> {
  await requireAdminAccess();
  const validation = createPromoSchema.safeParse(data);
  if (!validation.success) return { success: false, error: validation.error.issues[0].message };
  try {
    await prisma.promo.create({
      data: {
        ...validation.data,
        activeFrom: new Date(validation.data.activeFrom),
        activeTo: new Date(validation.data.activeTo),
      },
    });
    revalidatePath('/promos');
    return { success: true };
  } catch {
    return { success: false, error: 'Failed to create promo. Code may already exist.' };
  }
}
