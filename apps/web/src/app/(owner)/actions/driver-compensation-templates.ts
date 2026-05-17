'use server';

import {
  driverCompensationTemplateCreateSchema,
  type DriverCompensationTemplateCreateInput,
} from '@drivecommand/validation';
import { requireRole, requireAuth } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { Prisma } from '@/generated/prisma';
import { revalidatePath } from 'next/cache';

const Decimal = Prisma.Decimal;

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

function serializeDecimal(value: Prisma.Decimal | null | undefined): string | null {
  if (value == null) return null;
  return value.toString();
}

// Serialized shape returned to client components
export type SerializedTemplate = {
  id: string;
  tenantId: string;
  driverId: string;
  employmentType: string;
  payType: string;
  baseRate: string;
  rateUnit: string;
  loadedMilesOnly: boolean;
  fuelSurchargeRate: string | null;
  perDiemEnabled: boolean;
  perDiemRate: string | null;
  overtimeEligible: boolean;
  overtimeThresholdHours: string | null;
  overtimeMultiplier: string | null;
  dailyOvertimeThreshold: string | null;
  weeklyEarningGoal: string | null;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  deletedAt: string | null;
};

function serializeTemplate(t: {
  id: string;
  tenantId: string;
  driverId: string;
  employmentType: string;
  payType: string;
  baseRate: Prisma.Decimal;
  rateUnit: string;
  loadedMilesOnly: boolean;
  fuelSurchargeRate: Prisma.Decimal | null;
  perDiemEnabled: boolean;
  perDiemRate: Prisma.Decimal | null;
  overtimeEligible: boolean;
  overtimeThresholdHours: Prisma.Decimal | null;
  overtimeMultiplier: Prisma.Decimal | null;
  dailyOvertimeThreshold: Prisma.Decimal | null;
  weeklyEarningGoal: Prisma.Decimal | null;
  currency: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  deletedAt: Date | null;
}): SerializedTemplate {
  return {
    id: t.id,
    tenantId: t.tenantId,
    driverId: t.driverId,
    employmentType: t.employmentType,
    payType: t.payType,
    baseRate: t.baseRate.toString(),
    rateUnit: t.rateUnit,
    loadedMilesOnly: t.loadedMilesOnly,
    fuelSurchargeRate: serializeDecimal(t.fuelSurchargeRate),
    perDiemEnabled: t.perDiemEnabled,
    perDiemRate: serializeDecimal(t.perDiemRate),
    overtimeEligible: t.overtimeEligible,
    overtimeThresholdHours: serializeDecimal(t.overtimeThresholdHours),
    overtimeMultiplier: serializeDecimal(t.overtimeMultiplier),
    dailyOvertimeThreshold: serializeDecimal(t.dailyOvertimeThreshold),
    weeklyEarningGoal: serializeDecimal(t.weeklyEarningGoal),
    currency: t.currency,
    effectiveFrom: t.effectiveFrom.toISOString(),
    effectiveTo: t.effectiveTo ? t.effectiveTo.toISOString() : null,
    notes: t.notes,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    createdBy: t.createdBy,
    deletedAt: t.deletedAt ? t.deletedAt.toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// listTemplatesForDriver
// ---------------------------------------------------------------------------

export async function listTemplatesForDriver(
  driverId: string,
): Promise<{ data?: { templates: SerializedTemplate[] }; error?: string }> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // CarrierDriver is NOT auto-tenant-scoped — always add orgId manually
  const cd = await prisma.carrierDriver.findFirst({
    where: { id: driverId, orgId: tenantId },
  });
  if (!cd) {
    return { data: { templates: [] } };
  }

  const templates = await prisma.driverCompensationTemplate.findMany({
    where: { driverId: cd.id },
    orderBy: { effectiveFrom: 'desc' },
  });

  return { data: { templates: templates.map(serializeTemplate) } };
}

// ---------------------------------------------------------------------------
// getActiveTemplate
// ---------------------------------------------------------------------------

export async function getActiveTemplate(
  driverId: string,
): Promise<{ data?: { template: SerializedTemplate | null }; error?: string }> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // CarrierDriver is NOT auto-tenant-scoped — always add orgId manually
  const cd = await prisma.carrierDriver.findFirst({
    where: { id: driverId, orgId: tenantId },
  });
  if (!cd) {
    return { data: { template: null } };
  }

  const template = await prisma.driverCompensationTemplate.findFirst({
    where: { driverId: cd.id, effectiveTo: null, deletedAt: null },
  });

  return { data: { template: template ? serializeTemplate(template) : null } };
}

// ---------------------------------------------------------------------------
// createTemplate
// ---------------------------------------------------------------------------

export async function createTemplate(
  driverId: string,
  input: DriverCompensationTemplateCreateInput,
): Promise<{ data?: { id: string }; error?: string }> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const parseResult = driverCompensationTemplateCreateSchema.safeParse(input);
  if (!parseResult.success) {
    return { error: JSON.stringify(parseResult.error.flatten().fieldErrors) };
  }

  const data = parseResult.data;
  const userId = await requireAuth();
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // CarrierDriver is NOT auto-tenant-scoped — always add orgId manually
  const cd = await prisma.carrierDriver.findFirst({
    where: { id: driverId, orgId: tenantId },
  });
  if (!cd) {
    return { error: 'Driver not found.' };
  }

  const effectiveFromDate = new Date(data.effectiveFrom);

  // Reject same-day or backdated replacement before touching the DB.
  // "End and replace" is for rate changes over time — corrections belong in Edit.
  const currentTemplate = await prisma.driverCompensationTemplate.findFirst({
    where: { driverId: cd.id, effectiveTo: null, deletedAt: null },
  });
  if (currentTemplate) {
    const prevDay = Date.UTC(
      currentTemplate.effectiveFrom.getUTCFullYear(),
      currentTemplate.effectiveFrom.getUTCMonth(),
      currentTemplate.effectiveFrom.getUTCDate(),
    );
    const newDay = Date.UTC(
      effectiveFromDate.getUTCFullYear(),
      effectiveFromDate.getUTCMonth(),
      effectiveFromDate.getUTCDate(),
    );
    if (prevDay >= newDay) {
      return {
        error:
          "Cannot replace this template on the same day it became effective. Choose a date at least one day after the current template's effective date, or end the current template manually first.",
      };
    }
  }

  const oneDayBefore = new Date(effectiveFromDate.getTime() - 86400000);

  let newId: string;

  try {
    const txResult = await prisma.$transaction(async (tx) => {
      // Close the current active template if one exists
      const prev = await tx.driverCompensationTemplate.findFirst({
        where: { driverId: cd.id, effectiveTo: null, deletedAt: null },
      });

      if (prev) {
        await tx.driverCompensationTemplate.update({
          where: { id: prev.id },
          data: { effectiveTo: oneDayBefore },
        });
      }

      // Create the new template
      const created = await tx.driverCompensationTemplate.create({
        data: {
          tenantId,
          driverId: cd.id,
          employmentType: data.employmentType,
          payType: data.payType,
          baseRate: new Decimal(data.baseRate),
          rateUnit: data.rateUnit,
          loadedMilesOnly: data.loadedMilesOnly ?? false,
          fuelSurchargeRate:
            data.fuelSurchargeRate != null ? new Decimal(data.fuelSurchargeRate) : null,
          perDiemEnabled: data.perDiemEnabled ?? false,
          perDiemRate: data.perDiemRate != null ? new Decimal(data.perDiemRate) : null,
          overtimeEligible: data.overtimeEligible ?? false,
          overtimeThresholdHours:
            data.overtimeThresholdHours != null
              ? new Decimal(data.overtimeThresholdHours)
              : null,
          overtimeMultiplier:
            data.overtimeMultiplier != null ? new Decimal(data.overtimeMultiplier) : null,
          dailyOvertimeThreshold:
            data.dailyOvertimeThreshold != null
              ? new Decimal(data.dailyOvertimeThreshold)
              : null,
          weeklyEarningGoal:
            data.weeklyEarningGoal != null ? new Decimal(data.weeklyEarningGoal) : null,
          currency: data.currency,
          effectiveFrom: effectiveFromDate,
          notes: data.notes ?? null,
          createdBy: userId,
        },
      });

      return created;
    });

    newId = txResult.id;
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return { error: 'Failed to create template.' };
    }
    throw err;
  }

  revalidatePath(`/drivers/${driverId}/compensation`);
  return { data: { id: newId } };
}

// ---------------------------------------------------------------------------
// getCopyableTemplates
// ---------------------------------------------------------------------------

export type CopyableTemplate = {
  id: string;
  driverName: string;
  payType: string;
  baseRate: string;
  rateUnit: string;
};

export async function getCopyableTemplates(): Promise<{
  data?: { templates: CopyableTemplate[] };
  error?: string;
}> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  const templates = await prisma.driverCompensationTemplate.findMany({
    where: { effectiveTo: null, deletedAt: null },
    include: {
      driver: {
        select: {
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const mapped: CopyableTemplate[] = templates.map((t) => ({
    id: t.id,
    driverName: `${t.driver.firstName} ${t.driver.lastName}`,
    payType: t.payType,
    baseRate: t.baseRate.toString(),
    rateUnit: t.rateUnit,
  }));

  return { data: { templates: mapped } };
}
