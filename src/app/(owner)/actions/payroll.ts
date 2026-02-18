'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { payrollCreateSchema, payrollUpdateSchema } from '@/lib/validations/payroll.schemas';
import { Prisma } from '@/generated/prisma';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const Decimal = Prisma.Decimal;

/**
 * Create a new payroll record.
 */
export async function createPayrollRecord(prevState: any, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    driverId: formData.get('driverId') as string,
    periodStart: formData.get('periodStart') as string,
    periodEnd: formData.get('periodEnd') as string,
    basePay: formData.get('basePay') as string,
    bonuses: (formData.get('bonuses') as string) || '0',
    deductions: (formData.get('deductions') as string) || '0',
    milesLogged: (formData.get('milesLogged') as string) || '0',
    loadsCompleted: (formData.get('loadsCompleted') as string) || '0',
    status: (formData.get('status') as string) || 'DRAFT',
    notes: (formData.get('notes') as string) || '',
  };

  const result = payrollCreateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // Calculate totalPay using Decimal.js (never floating point)
  const basePay = new Decimal(result.data.basePay);
  const bonuses = new Decimal(result.data.bonuses);
  const deductions = new Decimal(result.data.deductions);
  const totalPay = basePay.add(bonuses).sub(deductions);

  let createdId: string;

  try {
    const record = await prisma.payrollRecord.create({
      data: {
        tenantId,
        driverId: result.data.driverId,
        periodStart: new Date(result.data.periodStart),
        periodEnd: new Date(result.data.periodEnd),
        basePay,
        bonuses,
        deductions,
        totalPay,
        milesLogged: result.data.milesLogged,
        loadsCompleted: result.data.loadsCompleted,
        status: result.data.status as any,
        paidAt: result.data.status === 'PAID' ? new Date() : null,
        notes: result.data.notes || null,
      },
    });
    createdId = record.id;
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return { error: 'Driver not found.' };
    }
    return { error: 'Failed to create payroll record. Please try again.' };
  }

  revalidatePath('/payroll');
  redirect(`/payroll/${createdId}`);
}

/**
 * Update an existing payroll record.
 */
export async function updatePayrollRecord(id: string, prevState: any, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const rawData = {
    driverId: formData.get('driverId') as string,
    periodStart: formData.get('periodStart') as string,
    periodEnd: formData.get('periodEnd') as string,
    basePay: formData.get('basePay') as string,
    bonuses: (formData.get('bonuses') as string) || '0',
    deductions: (formData.get('deductions') as string) || '0',
    milesLogged: (formData.get('milesLogged') as string) || '0',
    loadsCompleted: (formData.get('loadsCompleted') as string) || '0',
    status: (formData.get('status') as string) || 'DRAFT',
    notes: (formData.get('notes') as string) || '',
  };

  const result = payrollUpdateSchema.safeParse(rawData);
  if (!result.success) {
    return { error: result.error.flatten().fieldErrors };
  }

  const prisma = await getTenantPrisma();

  const basePay = new Decimal(result.data.basePay);
  const bonuses = new Decimal(result.data.bonuses);
  const deductions = new Decimal(result.data.deductions);
  const totalPay = basePay.add(bonuses).sub(deductions);

  try {
    await prisma.payrollRecord.update({
      where: { id },
      data: {
        driverId: result.data.driverId,
        periodStart: new Date(result.data.periodStart),
        periodEnd: new Date(result.data.periodEnd),
        basePay,
        bonuses,
        deductions,
        totalPay,
        milesLogged: result.data.milesLogged,
        loadsCompleted: result.data.loadsCompleted,
        status: result.data.status as any,
        paidAt: result.data.status === 'PAID' ? new Date() : null,
        notes: result.data.notes || null,
      },
    });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return { error: 'Payroll record not found.' };
    }
    return { error: 'Failed to update payroll record. Please try again.' };
  }

  revalidatePath('/payroll');
  redirect(`/payroll/${id}`);
}

/**
 * Delete a draft payroll record.
 */
export async function deletePayrollRecord(id: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  try {
    const record = await prisma.payrollRecord.findUnique({ where: { id }, select: { status: true } });
    if (!record) {
      return { error: 'Payroll record not found.' };
    }
    if (record.status !== 'DRAFT') {
      return { error: 'Only draft payroll records can be deleted.' };
    }
    await prisma.payrollRecord.delete({ where: { id } });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return { error: 'Payroll record not found.' };
    }
    return { error: 'Failed to delete payroll record.' };
  }

  revalidatePath('/payroll');
  redirect('/payroll');
}
