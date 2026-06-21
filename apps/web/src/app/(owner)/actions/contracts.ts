'use server';

import type { ActionState } from '@drivecommand/types';
import { z } from 'zod';

/**
 * Server actions for contract (CarrierContract) CRUD operations.
 * All actions enforce OWNER/MANAGER role authorization before any data access.
 */

import { requireRole, requireAuth } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { logger } from '@/lib/logger';

/**
 * Null-safe FormData string extraction helpers.
 */
function formString(fd: FormData, key: string): string {
  const val = fd.get(key);
  return typeof val === 'string' ? val : '';
}

function formStringOrNull(fd: FormData, key: string): string | null {
  const val = fd.get(key);
  if (typeof val !== 'string' || val.trim() === '') return null;
  return val.trim();
}

/**
 * Zod schemas for contract validation.
 */
const createContractSchema = z.object({
  contractNumber: z.string().min(1, 'Contract number is required').max(50),
  contractName: z.string().max(255).nullable().optional(),
  clientId: z.string().uuid('Valid client is required'),
  contractType: z.enum(['spot', 'dedicated', 'volume', 'broker']).default('spot'),
  effectiveDate: z.string().nullable().optional(),
  expirationDate: z.string().nullable().optional(),
  rateType: z.enum(['per_mile', 'flat', 'percentage', 'hourly']).default('per_mile'),
  baseRate: z.coerce.number().min(0).nullable().optional(),
  autoRenew: z.coerce.boolean().default(false),
  notes: z.string().max(2000).nullable().optional(),
});

const updateContractSchema = createContractSchema
  .omit({ contractNumber: true })
  .extend({
    contractName: z.string().max(255).nullable().optional(),
    status: z.enum(['draft', 'active', 'expired', 'terminated']).default('active'),
    fuelSurchargeMethod: z.enum(['none', 'percentage', 'flat']).default('none'),
    fuelSurchargeRate: z.coerce.number().min(0).nullable().optional(),
    detentionFreeMinutes: z.coerce.number().int().min(0).default(120),
    detentionRatePerHour: z.coerce.number().min(0).nullable().optional(),
    tonuRate: z.coerce.number().min(0).nullable().optional(),
    layoverRatePerDay: z.coerce.number().min(0).nullable().optional(),
    paymentTermsOverride: z.string().max(100).nullable().optional(),
    defaultFreeTimeMinutes: z.coerce.number().int().min(0).nullable().optional(),
  });

/**
 * Create a new contract.
 * Requires OWNER or MANAGER role.
 */
export async function createContract(
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    contractNumber: formString(formData, 'contractNumber'),
    contractName: formStringOrNull(formData, 'contractName'),
    clientId: formString(formData, 'clientId'),
    contractType: formString(formData, 'contractType') || 'spot',
    effectiveDate: formStringOrNull(formData, 'effectiveDate'),
    expirationDate: formStringOrNull(formData, 'expirationDate'),
    rateType: formString(formData, 'rateType') || 'per_mile',
    baseRate: formStringOrNull(formData, 'baseRate'),
    autoRenew: formData.get('autoRenew') === 'true',
    notes: formStringOrNull(formData, 'notes'),
  };

  // Validate with Zod schema
  const result = createContractSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
      values: rawData,
    };
  }

  // Create contract via tenant-scoped Prisma client
  let contractId: string;
  try {
    const tenantId = await requireTenantId();
    const userId = await requireAuth();
    const prisma = await getTenantPrisma();

    const contract = await prisma.carrierContract.create({
      data: {
        orgId: tenantId,
        contractNumber: result.data.contractNumber,
        contractName: result.data.contractName ?? null,
        clientId: result.data.clientId,
        contractType: result.data.contractType,
        effectiveDate: result.data.effectiveDate ? new Date(result.data.effectiveDate) : null,
        expirationDate: result.data.expirationDate ? new Date(result.data.expirationDate) : null,
        rateType: result.data.rateType,
        baseRate: result.data.baseRate ?? null,
        autoRenew: result.data.autoRenew,
        notes: result.data.notes ?? null,
        createdById: userId,
        updatedById: userId,
      },
    });

    contractId = contract.id;
  } catch (error: unknown) {
    logger.error('Failed to create contract:', error);
    return { error: 'Failed to create contract. Please try again.' };
  }

  // Revalidate and redirect OUTSIDE try/catch
  revalidatePath('/contracts');
  redirect(`/contracts/${contractId}`);
}

/**
 * Update an existing contract.
 * Requires OWNER or MANAGER role.
 */
export async function updateContract(
  id: string,
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    contractName: formStringOrNull(formData, 'contractName'),
    clientId: formString(formData, 'clientId'),
    contractType: formString(formData, 'contractType') || 'spot',
    effectiveDate: formStringOrNull(formData, 'effectiveDate'),
    expirationDate: formStringOrNull(formData, 'expirationDate'),
    rateType: formString(formData, 'rateType') || 'per_mile',
    baseRate: formStringOrNull(formData, 'baseRate'),
    autoRenew: formData.get('autoRenew') === 'true',
    status: formString(formData, 'status') || 'active',
    fuelSurchargeMethod: formString(formData, 'fuelSurchargeMethod') || 'none',
    fuelSurchargeRate: formStringOrNull(formData, 'fuelSurchargeRate'),
    detentionFreeMinutes: formString(formData, 'detentionFreeMinutes') || '120',
    detentionRatePerHour: formStringOrNull(formData, 'detentionRatePerHour'),
    tonuRate: formStringOrNull(formData, 'tonuRate'),
    layoverRatePerDay: formStringOrNull(formData, 'layoverRatePerDay'),
    paymentTermsOverride: formStringOrNull(formData, 'paymentTermsOverride'),
    defaultFreeTimeMinutes: formStringOrNull(formData, 'defaultFreeTimeMinutes'),
    notes: formStringOrNull(formData, 'notes'),
  };

  // Validate with Zod schema
  const result = updateContractSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
      values: rawData,
    };
  }

  // Update contract via tenant-scoped Prisma client
  let updatedContractId: string;
  try {
    const userId = await requireAuth();
    const prisma = await getTenantPrisma();

    const contract = await prisma.carrierContract.update({
      where: { id },
      data: {
        contractName: result.data.contractName ?? null,
        clientId: result.data.clientId,
        contractType: result.data.contractType,
        effectiveDate: result.data.effectiveDate ? new Date(result.data.effectiveDate) : null,
        expirationDate: result.data.expirationDate ? new Date(result.data.expirationDate) : null,
        rateType: result.data.rateType,
        baseRate: result.data.baseRate ?? null,
        autoRenew: result.data.autoRenew,
        status: result.data.status,
        fuelSurchargeMethod: result.data.fuelSurchargeMethod,
        fuelSurchargeRate: result.data.fuelSurchargeRate ?? null,
        detentionFreeMinutes: result.data.detentionFreeMinutes,
        detentionRatePerHour: result.data.detentionRatePerHour ?? null,
        tonuRate: result.data.tonuRate ?? null,
        layoverRatePerDay: result.data.layoverRatePerDay ?? null,
        paymentTermsOverride: result.data.paymentTermsOverride ?? null,
        defaultFreeTimeMinutes: result.data.defaultFreeTimeMinutes ?? null,
        notes: result.data.notes ?? null,
        updatedById: userId,
      },
    });

    updatedContractId = contract.id;
  } catch (error: unknown) {
    logger.error('Failed to update contract:', error);
    return { error: 'Failed to update contract. Please try again.' };
  }

  // Revalidate and redirect OUTSIDE try/catch
  revalidatePath('/contracts');
  revalidatePath(`/contracts/${id}`);
  redirect(`/contracts/${updatedContractId}`);
}

/**
 * Delete (soft-delete) a contract.
 * Requires OWNER or MANAGER role.
 */
export async function deleteContract(id: string): Promise<{ success: boolean }> {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const userId = await requireAuth();
  const prisma = await getTenantPrisma();

  await prisma.carrierContract.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedById: userId,
    },
  });

  revalidatePath('/contracts');

  return { success: true };
}

/**
 * List all contracts for the current tenant.
 * Requires OWNER, MANAGER, or DRIVER role (read access).
 */
export async function listContracts(params?: { clientId?: string }) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  const prisma = await getTenantPrisma();
  return prisma.carrierContract.findMany({
    where: {
      deletedAt: null,
      ...(params?.clientId ? { clientId: params.clientId } : {}),
    },
    take: 100,
    orderBy: { createdAt: 'desc' },
    include: {
      client: { select: { id: true, name: true } },
      _count: {
        select: { carrierLoads: true, routeTemplates: true },
      },
    },
  });
}

/**
 * Get a single contract by ID.
 * Requires OWNER, MANAGER, or DRIVER role (read access).
 * Returns null if not found or belongs to different tenant (RLS).
 */
export async function getContract(id: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  const prisma = await getTenantPrisma();
  return prisma.carrierContract.findUnique({
    where: { id },
    include: {
      createdBy: { select: { firstName: true, lastName: true, email: true } },
      updatedBy: { select: { firstName: true, lastName: true, email: true } },
      client: { select: { id: true, name: true } },
      _count: {
        select: { carrierLoads: true, routeTemplates: true },
      },
    },
  });
}

/**
 * Generate a unique contract number.
 * Format: CNT-YYYYMMDD-XXXX (4 random alphanumeric characters).
 */
export async function generateContractNumber(): Promise<string> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  // Generate 4 random alphanumeric characters
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let random = '';
  for (let i = 0; i < 4; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return `CNT-${year}${month}${day}-${random}`;
}
