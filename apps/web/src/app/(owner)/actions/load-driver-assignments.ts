'use server';

import { Prisma } from '@/generated/prisma';
import { requireRole, requireAuth } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { revalidatePath } from 'next/cache';
import { snapshotActiveTemplate, computeIsOverride } from '@/lib/driver-pay/snapshot';
import {
  loadDriverAssignmentCreateSchema,
  loadDriverAssignmentUpdateSchema,
} from '@drivecommand/validation';
import { dispatchNotification } from '@/lib/notifications/dispatcher';

const Decimal = Prisma.Decimal;

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

function serializeDecimal(value: Prisma.Decimal | null | undefined): string | null {
  if (value == null) return null;
  return value.toString();
}

// Serialized shape returned to client components
export type SerializedAssignment = {
  id: string;
  tenantId: string;
  loadId: string;
  driverId: string;
  driverRole: string;
  templateId: string | null;
  payType: string;
  baseRate: string;
  rateUnit: string;
  currency: string;
  loadedMilesOnly: boolean;
  fuelSurchargeRate: string | null;
  perDiemEnabled: boolean;
  perDiemRate: string | null;
  estimatedMiles: string | null;
  actualMiles: string | null;
  mileageSource: string | null;
  overrideReason: string | null;
  payStatus: string;
  createdAt: string;
  deletedAt: string | null;
  driver: { id: string; firstName: string; lastName: string };
  template: {
    payType: string;
    baseRate: string;
    rateUnit: string;
    loadedMilesOnly: boolean;
    fuelSurchargeRate: string | null;
    perDiemEnabled: boolean;
    perDiemRate: string | null;
  } | null;
};

function serializeAssignment(a: {
  id: string;
  tenantId: string;
  loadId: string;
  driverId: string;
  driverRole: string;
  templateId: string | null;
  payType: string;
  baseRate: Prisma.Decimal;
  rateUnit: string;
  currency: string;
  loadedMilesOnly: boolean;
  fuelSurchargeRate: Prisma.Decimal | null;
  perDiemEnabled: boolean;
  perDiemRate: Prisma.Decimal | null;
  estimatedMiles: Prisma.Decimal | null;
  actualMiles: Prisma.Decimal | null;
  mileageSource: string | null;
  overrideReason: string | null;
  payStatus: string;
  createdAt: Date;
  deletedAt: Date | null;
  driver: { id: string; firstName: string; lastName: string };
  template: {
    payType: string;
    baseRate: Prisma.Decimal;
    rateUnit: string;
    loadedMilesOnly: boolean;
    fuelSurchargeRate: Prisma.Decimal | null;
    perDiemEnabled: boolean;
    perDiemRate: Prisma.Decimal | null;
  } | null;
}): SerializedAssignment {
  return {
    id: a.id,
    tenantId: a.tenantId,
    loadId: a.loadId,
    driverId: a.driverId,
    driverRole: a.driverRole,
    templateId: a.templateId,
    payType: a.payType,
    baseRate: a.baseRate.toString(),
    rateUnit: a.rateUnit,
    currency: a.currency,
    loadedMilesOnly: a.loadedMilesOnly,
    fuelSurchargeRate: serializeDecimal(a.fuelSurchargeRate),
    perDiemEnabled: a.perDiemEnabled,
    perDiemRate: serializeDecimal(a.perDiemRate),
    estimatedMiles: serializeDecimal(a.estimatedMiles),
    actualMiles: serializeDecimal(a.actualMiles),
    mileageSource: a.mileageSource ?? null,
    overrideReason: a.overrideReason,
    payStatus: a.payStatus,
    createdAt: a.createdAt.toISOString(),
    deletedAt: a.deletedAt ? a.deletedAt.toISOString() : null,
    driver: a.driver,
    template: a.template
      ? {
          payType: a.template.payType,
          baseRate: a.template.baseRate.toString(),
          rateUnit: a.template.rateUnit,
          loadedMilesOnly: a.template.loadedMilesOnly,
          fuelSurchargeRate: serializeDecimal(a.template.fuelSurchargeRate),
          perDiemEnabled: a.template.perDiemEnabled,
          perDiemRate: serializeDecimal(a.template.perDiemRate),
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// listAssignmentsForLoad
// ---------------------------------------------------------------------------

export async function listAssignmentsForLoad(
  loadId: string,
): Promise<{ data?: { assignments: SerializedAssignment[] }; error?: string }> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  const rows = await prisma.loadDriverAssignment.findMany({
    where: { loadId, deletedAt: null },
    include: {
      driver: { select: { id: true, firstName: true, lastName: true } },
      template: {
        select: {
          payType: true,
          baseRate: true,
          rateUnit: true,
          loadedMilesOnly: true,
          fuelSurchargeRate: true,
          perDiemEnabled: true,
          perDiemRate: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return { data: { assignments: rows.map(serializeAssignment) } };
}

// ---------------------------------------------------------------------------
// createAssignment
// ---------------------------------------------------------------------------

export async function createAssignment(
  loadId: string,
  input: unknown,
): Promise<{ data?: { id: string }; error?: string }> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const parseResult = loadDriverAssignmentCreateSchema.safeParse(input);
  if (!parseResult.success) {
    return { error: JSON.stringify(parseResult.error.flatten().fieldErrors) };
  }

  const { driverId, driverRole } = parseResult.data;

  const userId = await requireAuth();
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // CarrierDriver is NOT auto-scoped — must check orgId manually
  const cd = await prisma.carrierDriver.findFirst({ where: { id: driverId, orgId: tenantId } });
  if (!cd) {
    return { error: 'Driver not found.' };
  }

  // Enforce MAIN_DRIVER uniqueness per load
  if (driverRole === 'MAIN_DRIVER') {
    const existing = await prisma.loadDriverAssignment.findFirst({
      where: { loadId, driverRole: 'MAIN_DRIVER', deletedAt: null },
    });
    if (existing) {
      return {
        error:
          'Cannot assign a second main driver to this load. This load already has a primary driver assigned. Assign them as co-driver instead, or remove the existing main driver first.',
      };
    }
  }

  // Snapshot the active template
  let snap;
  try {
    snap = await snapshotActiveTemplate(driverId, tenantId, prisma);
  } catch (err) {
    if (err instanceof Error && err.message === 'NO_ACTIVE_TEMPLATE') {
      return {
        error:
          "Cannot assign this driver because they don't have an active pay template. Set up their compensation template first, then return here.",
      };
    }
    throw err;
  }

  const created = await prisma.loadDriverAssignment.create({
    data: {
      tenantId,
      loadId,
      driverId: cd.id,
      driverRole: driverRole as 'MAIN_DRIVER' | 'CO_DRIVER',
      templateId: snap.templateId,
      payType: snap.payType as 'CPM' | 'HOURLY' | 'FLAT_PER_LOAD' | 'PERCENTAGE' | 'DAILY' | 'SALARY',
      baseRate: snap.baseRate,
      rateUnit: snap.rateUnit as 'PER_MILE' | 'PER_HOUR' | 'PER_LOAD' | 'PERCENTAGE' | 'PER_DAY' | 'ANNUAL',
      loadedMilesOnly: snap.loadedMilesOnly,
      fuelSurchargeRate: snap.fuelSurchargeRate ?? null,
      perDiemEnabled: snap.perDiemEnabled,
      perDiemRate: snap.perDiemRate ?? null,
      currency: snap.currency,
      createdBy: userId,
    },
  });

  // Prefetch load/driver data needed for notification payload.
  const [load, driver] = await Promise.all([
    prisma.load.findUnique({
      where: { id: loadId },
      select: { loadNumber: true, origin: true, destination: true },
    }),
    prisma.carrierDriver.findUnique({
      where: { id: cd.id },
      select: { firstName: true, lastName: true },
    }),
  ]).catch((err) => {
    console.error('[notifications] createAssignment prefetch failed', err);
    return [null, null] as const;
  });

  if (load && driver) {
    console.log(`[notif-trace] caller:before-dispatch trigger=load.assigned load=${loadId} driver=${cd.id}`);
    // Synchronous await — quick-336 (waitUntil wrap) and quick-337 (prefetch outside waitUntil) both
    // failed in production with zero NotificationSendLog rows. The Vercel + Next.js Server Action
    // runtime silently drops background promises here. Accept the ~1-2s extra latency for guaranteed
    // delivery (quick-338).
    await dispatchNotification('load.assigned', {
      tenantId,
      payload: {
        loadId,
        loadNumber: load.loadNumber,
        driverId: cd.id,
        driverName: `${driver.firstName} ${driver.lastName}`,
        originCity: load.origin,
        destCity: load.destination,
      },
      relatedEntity: { type: 'Load', id: loadId },
    }).catch((err) => console.error('[notifications] load.assigned (createAssignment) dispatch failed', err));
    console.log(`[notif-trace] caller:after-dispatch trigger=load.assigned`);
  }

  revalidatePath(`/carrier/loads/${loadId}`);
  return { data: { id: created.id } };
}

// ---------------------------------------------------------------------------
// updateAssignment
// ---------------------------------------------------------------------------

export async function updateAssignment(
  assignmentId: string,
  input: unknown,
): Promise<{ data?: { id: string }; error?: string }> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const parseResult = loadDriverAssignmentUpdateSchema.safeParse(input);
  if (!parseResult.success) {
    return { error: JSON.stringify(parseResult.error.flatten().fieldErrors) };
  }

  const data = parseResult.data;

  const prisma = await getTenantPrisma();

  const existing = await prisma.loadDriverAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
    include: { template: true },
  });
  if (!existing) {
    return { error: 'Assignment not found.' };
  }

  // Build merged fields, overlaying defined data fields on existing values
  const mergedPayType = data.payType ?? existing.payType;
  const mergedBaseRate = data.baseRate !== undefined ? new Decimal(data.baseRate) : existing.baseRate;
  const mergedRateUnit = data.rateUnit ?? existing.rateUnit;
  const mergedLoadedMilesOnly =
    data.loadedMilesOnly !== undefined ? data.loadedMilesOnly : existing.loadedMilesOnly;
  const mergedFuelSurchargeRate =
    data.fuelSurchargeRate !== undefined
      ? data.fuelSurchargeRate != null
        ? new Decimal(data.fuelSurchargeRate)
        : null
      : existing.fuelSurchargeRate;
  const mergedPerDiemEnabled =
    data.perDiemEnabled !== undefined ? data.perDiemEnabled : existing.perDiemEnabled;
  const mergedPerDiemRate =
    data.perDiemRate !== undefined
      ? data.perDiemRate != null
        ? new Decimal(data.perDiemRate)
        : null
      : existing.perDiemRate;
  const mergedEstimatedMiles =
    data.estimatedMiles !== undefined
      ? data.estimatedMiles != null
        ? new Decimal(data.estimatedMiles)
        : null
      : existing.estimatedMiles;
  const mergedActualMiles =
    data.actualMiles !== undefined
      ? data.actualMiles != null && data.actualMiles !== ''
        ? new Decimal(data.actualMiles)
        : null
      : existing.actualMiles;
  const mergedMileageSource =
    data.mileageSource !== undefined ? data.mileageSource : existing.mileageSource;

  // Check whether any overrideable field was changed in this update
  const anyFieldDefined =
    data.payType !== undefined ||
    data.baseRate !== undefined ||
    data.rateUnit !== undefined ||
    data.loadedMilesOnly !== undefined ||
    data.fuelSurchargeRate !== undefined ||
    data.perDiemEnabled !== undefined ||
    data.perDiemRate !== undefined;

  if (anyFieldDefined && existing.template) {
    const mergedShape = {
      payType: mergedPayType,
      baseRate: mergedBaseRate,
      rateUnit: mergedRateUnit,
      loadedMilesOnly: mergedLoadedMilesOnly,
      fuelSurchargeRate: mergedFuelSurchargeRate,
      perDiemEnabled: mergedPerDiemEnabled,
      perDiemRate: mergedPerDiemRate,
    };

    if (
      computeIsOverride(mergedShape, existing.template) &&
      (!data.overrideReason || data.overrideReason.trim().length < 10)
    ) {
      return {
        error:
          'A reason is required when overriding pay terms. Please describe why this load needs different pay (minimum 10 characters).',
      };
    }
  }

  await prisma.loadDriverAssignment.update({
    where: { id: assignmentId },
    data: {
      payType: mergedPayType as 'CPM' | 'HOURLY' | 'FLAT_PER_LOAD' | 'PERCENTAGE' | 'DAILY' | 'SALARY',
      baseRate: mergedBaseRate,
      rateUnit: mergedRateUnit as 'PER_MILE' | 'PER_HOUR' | 'PER_LOAD' | 'PERCENTAGE' | 'PER_DAY' | 'ANNUAL',
      loadedMilesOnly: mergedLoadedMilesOnly,
      fuelSurchargeRate: mergedFuelSurchargeRate,
      perDiemEnabled: mergedPerDiemEnabled,
      perDiemRate: mergedPerDiemRate,
      estimatedMiles: mergedEstimatedMiles,
      actualMiles: mergedActualMiles,
      mileageSource: mergedMileageSource as
        | 'PCMILER'
        | 'GOOGLE'
        | 'ELD'
        | 'MANUAL'
        | 'RAND_MCNALLY'
        | null,
      overrideReason: data.overrideReason ?? existing.overrideReason,
    },
  });

  revalidatePath(`/carrier/loads/${existing.loadId}`);
  return { data: { id: assignmentId } };
}

// ---------------------------------------------------------------------------
// deleteAssignment
// ---------------------------------------------------------------------------

export async function deleteAssignment(
  assignmentId: string,
): Promise<{ data?: { ok: boolean }; error?: string }> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  const existing = await prisma.loadDriverAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
  });
  if (!existing) {
    return { error: 'Assignment not found.' };
  }

  if (existing.payStatus !== 'DRAFT') {
    return { error: 'Only draft assignments can be removed.' };
  }

  await prisma.loadDriverAssignment.update({
    where: { id: assignmentId },
    data: { deletedAt: new Date() },
  });

  revalidatePath(`/carrier/loads/${existing.loadId}`);
  return { data: { ok: true } };
}
