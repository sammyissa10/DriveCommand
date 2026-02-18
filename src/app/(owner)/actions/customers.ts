'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { customerCreateSchema, customerUpdateSchema, interactionCreateSchema } from '@/lib/validations/customer.schemas';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

/**
 * Create a new customer.
 */
export async function createCustomer(prevState: any, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    companyName: formData.get('companyName') as string,
    contactName: (formData.get('contactName') as string) || undefined,
    email: (formData.get('email') as string) || undefined,
    phone: (formData.get('phone') as string) || undefined,
    address: (formData.get('address') as string) || undefined,
    city: (formData.get('city') as string) || undefined,
    state: (formData.get('state') as string) || undefined,
    zipCode: (formData.get('zipCode') as string) || undefined,
    priority: (formData.get('priority') as string) || 'MEDIUM',
    status: (formData.get('status') as string) || 'ACTIVE',
    notes: (formData.get('notes') as string) || undefined,
  };

  const result = customerCreateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  let createdId: string;

  try {
    const customer = await prisma.customer.create({
      data: {
        ...result.data,
        contactName: result.data.contactName || null,
        email: result.data.email || null,
        phone: result.data.phone || null,
        address: result.data.address || null,
        city: result.data.city || null,
        state: result.data.state || null,
        zipCode: result.data.zipCode || null,
        notes: result.data.notes || null,
        tenantId,
      },
    });
    createdId = customer.id;
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return { error: { companyName: ['A customer with this name already exists'] } };
    }
    return { error: 'Failed to create customer. Please try again.' };
  }

  revalidatePath('/crm');
  redirect(`/crm/${createdId}`);
}

/**
 * Update a customer.
 */
export async function updateCustomer(id: string, prevState: any, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    companyName: formData.get('companyName') as string,
    contactName: (formData.get('contactName') as string) || undefined,
    email: (formData.get('email') as string) || undefined,
    phone: (formData.get('phone') as string) || undefined,
    address: (formData.get('address') as string) || undefined,
    city: (formData.get('city') as string) || undefined,
    state: (formData.get('state') as string) || undefined,
    zipCode: (formData.get('zipCode') as string) || undefined,
    priority: (formData.get('priority') as string) || 'MEDIUM',
    status: (formData.get('status') as string) || 'ACTIVE',
    notes: (formData.get('notes') as string) || undefined,
  };

  const result = customerUpdateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const prisma = await getTenantPrisma();

  try {
    await prisma.customer.update({
      where: { id },
      data: {
        ...result.data,
        contactName: result.data.contactName || null,
        email: result.data.email || null,
        phone: result.data.phone || null,
        address: result.data.address || null,
        city: result.data.city || null,
        state: result.data.state || null,
        zipCode: result.data.zipCode || null,
        notes: result.data.notes || null,
      },
    });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return { error: { companyName: ['A customer with this name already exists'] } };
    }
    if (error?.code === 'P2025') {
      return { error: 'Customer not found.' };
    }
    return { error: 'Failed to update customer. Please try again.' };
  }

  revalidatePath('/crm');
  redirect(`/crm/${id}`);
}

/**
 * Delete a customer.
 */
export async function deleteCustomer(id: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  try {
    await prisma.customer.delete({ where: { id } });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return { error: 'Customer not found.' };
    }
    return { error: 'Failed to delete customer.' };
  }

  revalidatePath('/crm');
  redirect('/crm');
}

/**
 * Add an interaction to a customer.
 */
export async function addInteraction(prevState: any, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    customerId: formData.get('customerId') as string,
    type: formData.get('type') as string,
    subject: formData.get('subject') as string,
    description: (formData.get('description') as string) || undefined,
  };

  const result = interactionCreateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const tenantId = await requireTenantId();
  const session = await getSession();
  const prisma = await getTenantPrisma();

  try {
    await prisma.customerInteraction.create({
      data: {
        ...result.data,
        description: result.data.description || null,
        tenantId,
        createdBy: session?.userId || null,
      },
    });
  } catch (error: any) {
    return { error: 'Failed to add interaction. Please try again.' };
  }

  revalidatePath(`/crm/${result.data.customerId}`);
  return { success: true };
}
