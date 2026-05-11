import type { PrismaClient } from '@/generated/prisma';
import { Prisma } from '@/generated/prisma';

export type AssignmentSnapshot = {
  templateId: string;
  payType: string;
  baseRate: Prisma.Decimal;
  rateUnit: string;
  loadedMilesOnly: boolean;
  fuelSurchargeRate: Prisma.Decimal | null;
  perDiemEnabled: boolean;
  perDiemRate: Prisma.Decimal | null;
  currency: string;
};

export async function snapshotActiveTemplate(
  driverId: string,
  tenantId: string,
  prisma: PrismaClient,
): Promise<AssignmentSnapshot> {
  const template = await prisma.driverCompensationTemplate.findFirst({
    where: { driverId, tenantId, effectiveTo: null, deletedAt: null },
  });

  if (!template) {
    throw new Error('NO_ACTIVE_TEMPLATE');
  }

  return {
    templateId: template.id,
    payType: template.payType,
    baseRate: template.baseRate,
    rateUnit: template.rateUnit,
    loadedMilesOnly: template.loadedMilesOnly,
    fuelSurchargeRate: template.fuelSurchargeRate,
    perDiemEnabled: template.perDiemEnabled,
    perDiemRate: template.perDiemRate,
    currency: template.currency,
  };
}

type ComparableFields = {
  payType: string;
  baseRate: { toString(): string };
  rateUnit: string;
  loadedMilesOnly: boolean;
  fuelSurchargeRate: { toString(): string } | null;
  perDiemEnabled: boolean;
  perDiemRate: { toString(): string } | null;
};

const s = (v: { toString(): string } | null): string | null => (v != null ? v.toString() : null);

export function computeIsOverride(
  assignment: ComparableFields,
  template: ComparableFields,
): boolean {
  if (assignment.payType !== template.payType) return true;
  if (s(assignment.baseRate) !== s(template.baseRate)) return true;
  if (assignment.rateUnit !== template.rateUnit) return true;
  if (assignment.loadedMilesOnly !== template.loadedMilesOnly) return true;
  if (s(assignment.fuelSurchargeRate) !== s(template.fuelSurchargeRate)) return true;
  if (assignment.perDiemEnabled !== template.perDiemEnabled) return true;
  if (s(assignment.perDiemRate) !== s(template.perDiemRate)) return true;
  return false;
}
