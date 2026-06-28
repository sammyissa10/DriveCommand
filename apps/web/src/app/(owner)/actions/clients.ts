'use server';

import type { ActionState } from '@drivecommand/types';
import { z } from 'zod';

/**
 * Server actions for client (CarrierClient) CRUD operations.
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
 * Zod schemas for client validation.
 */
const createClientSchema = z.object({
  name: z.string().min(1, 'Company name is required').max(255),
  dbaName: z.string().max(255).nullable().optional(),
  mcNumber: z.string().max(20).nullable().optional(),
  dotNumber: z.string().max(20).nullable().optional(),
  primaryContact: z.string().max(255).nullable().optional(),
  email: z
    .string()
    .email('Invalid email address')
    .nullable()
    .optional()
    .or(z.literal('')),
  phone: z.string().max(30).nullable().optional(),
  website: z
    .string()
    .url('Invalid URL')
    .nullable()
    .optional()
    .or(z.literal('')),
  addressLine1: z.string().max(255).nullable().optional(),
  addressLine2: z.string().max(255).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(50).nullable().optional(),
  zip: z.string().max(20).nullable().optional(),
  paymentTerms: z.coerce.number().int().min(0).max(365).default(30),
  creditLimit: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

const updateClientSchema = createClientSchema.extend({
  status: z.enum(['active', 'inactive', 'on_hold', 'prospect']).default('active'),
  portalAccess: z.coerce.boolean().default(false),
  portalEmail: z
    .string()
    .email('Invalid portal email')
    .nullable()
    .optional()
    .or(z.literal('')),
  taxId: z.string().max(20).nullable().optional(),
});

/**
 * Create a new client.
 * Requires OWNER or MANAGER role.
 */
export async function createClient(
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    name: formString(formData, 'name'),
    dbaName: formStringOrNull(formData, 'dbaName'),
    mcNumber: formStringOrNull(formData, 'mcNumber'),
    dotNumber: formStringOrNull(formData, 'dotNumber'),
    primaryContact: formStringOrNull(formData, 'primaryContact'),
    email: formStringOrNull(formData, 'email'),
    phone: formStringOrNull(formData, 'phone'),
    website: formStringOrNull(formData, 'website'),
    addressLine1: formStringOrNull(formData, 'addressLine1'),
    addressLine2: formStringOrNull(formData, 'addressLine2'),
    city: formStringOrNull(formData, 'city'),
    state: formStringOrNull(formData, 'state'),
    zip: formStringOrNull(formData, 'zip'),
    paymentTerms: formString(formData, 'paymentTerms') || '30',
    creditLimit: formStringOrNull(formData, 'creditLimit'),
    notes: formStringOrNull(formData, 'notes'),
  };

  // Validate with Zod schema
  const result = createClientSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
      values: rawData,
    };
  }

  // Create client via tenant-scoped Prisma client
  let clientId: string;
  try {
    const tenantId = await requireTenantId();
    const userId = await requireAuth();
    const prisma = await getTenantPrisma();

    const client = await prisma.carrierClient.create({
      data: {
        orgId: tenantId,
        name: result.data.name,
        dbaName: result.data.dbaName ?? null,
        mcNumber: result.data.mcNumber ?? null,
        dotNumber: result.data.dotNumber ?? null,
        primaryContact: result.data.primaryContact ?? null,
        email: result.data.email || null,
        phone: result.data.phone ?? null,
        website: result.data.website || null,
        addressLine1: result.data.addressLine1 ?? null,
        addressLine2: result.data.addressLine2 ?? null,
        city: result.data.city ?? null,
        state: result.data.state ?? null,
        zip: result.data.zip ?? null,
        paymentTerms: result.data.paymentTerms,
        creditLimit: result.data.creditLimit ?? null,
        notes: result.data.notes ?? null,
        createdById: userId,
        updatedById: userId,
      },
    });

    clientId = client.id;
  } catch (error: unknown) {
    logger.error('Failed to create client:', error);
    return { error: 'Failed to create client. Please try again.' };
  }

  // Revalidate and redirect OUTSIDE try/catch
  revalidatePath('/clients');
  redirect(`/clients/${clientId}`);
}

/**
 * Update an existing client.
 * Requires OWNER or MANAGER role.
 */
export async function updateClient(
  id: string,
  prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    name: formString(formData, 'name'),
    dbaName: formStringOrNull(formData, 'dbaName'),
    mcNumber: formStringOrNull(formData, 'mcNumber'),
    dotNumber: formStringOrNull(formData, 'dotNumber'),
    taxId: formStringOrNull(formData, 'taxId'),
    primaryContact: formStringOrNull(formData, 'primaryContact'),
    email: formStringOrNull(formData, 'email'),
    phone: formStringOrNull(formData, 'phone'),
    website: formStringOrNull(formData, 'website'),
    addressLine1: formStringOrNull(formData, 'addressLine1'),
    addressLine2: formStringOrNull(formData, 'addressLine2'),
    city: formStringOrNull(formData, 'city'),
    state: formStringOrNull(formData, 'state'),
    zip: formStringOrNull(formData, 'zip'),
    status: formString(formData, 'status') || 'active',
    paymentTerms: formString(formData, 'paymentTerms') || '30',
    creditLimit: formStringOrNull(formData, 'creditLimit'),
    portalAccess: formData.get('portalAccess') === 'true',
    portalEmail: formStringOrNull(formData, 'portalEmail'),
    notes: formStringOrNull(formData, 'notes'),
  };

  // Validate with Zod schema
  const result = updateClientSchema.safeParse(rawData);

  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
      values: rawData,
    };
  }

  // Update client via tenant-scoped Prisma client
  let updatedClientId: string;
  try {
    const userId = await requireAuth();
    const prisma = await getTenantPrisma();

    const client = await prisma.carrierClient.update({
      where: { id },
      data: {
        name: result.data.name,
        dbaName: result.data.dbaName ?? null,
        mcNumber: result.data.mcNumber ?? null,
        dotNumber: result.data.dotNumber ?? null,
        taxId: result.data.taxId ?? null,
        primaryContact: result.data.primaryContact ?? null,
        email: result.data.email || null,
        phone: result.data.phone ?? null,
        website: result.data.website || null,
        addressLine1: result.data.addressLine1 ?? null,
        addressLine2: result.data.addressLine2 ?? null,
        city: result.data.city ?? null,
        state: result.data.state ?? null,
        zip: result.data.zip ?? null,
        status: result.data.status,
        paymentTerms: result.data.paymentTerms,
        creditLimit: result.data.creditLimit ?? null,
        portalAccess: result.data.portalAccess,
        portalEmail: result.data.portalEmail || null,
        notes: result.data.notes ?? null,
        updatedById: userId,
      },
    });

    updatedClientId = client.id;
  } catch (error: unknown) {
    logger.error('Failed to update client:', error);
    return { error: 'Failed to update client. Please try again.' };
  }

  // Revalidate and redirect OUTSIDE try/catch
  revalidatePath('/clients');
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${updatedClientId}`);
}

/**
 * Delete (soft-delete) a client.
 * Requires OWNER or MANAGER role.
 */
export async function deleteClient(id: string): Promise<{ success: boolean }> {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const userId = await requireAuth();
  const prisma = await getTenantPrisma();

  await prisma.carrierClient.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      deletedById: userId,
    },
  });

  revalidatePath('/clients');

  return { success: true };
}

/**
 * List all clients for the current tenant.
 * Requires OWNER, MANAGER, or DRIVER role (read access).
 */
export async function listClients() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  const prisma = await getTenantPrisma();
  return prisma.carrierClient.findMany({
    where: { deletedAt: null },
    take: 100,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { carrierLoads: true },
      },
    },
  });
}

/**
 * Get a single client by ID.
 * Requires OWNER, MANAGER, or DRIVER role (read access).
 * Returns null if not found or belongs to different tenant (RLS).
 */
export async function getClient(id: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  const prisma = await getTenantPrisma();
  return prisma.carrierClient.findUnique({
    where: { id },
    include: {
      createdBy: { select: { firstName: true, lastName: true, email: true } },
      updatedBy: { select: { firstName: true, lastName: true, email: true } },
      _count: {
        select: { carrierLoads: true },
      },
    },
  });
}
