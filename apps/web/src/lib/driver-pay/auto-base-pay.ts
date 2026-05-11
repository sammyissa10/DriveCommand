import type { PrismaClient } from '@/generated/prisma';
import { Prisma } from '@/generated/prisma';
import { computeGrossAmount } from './calculator';
import Decimal from 'decimal.js';

const PAY_TYPE_TO_COMPONENT: Record<string, string> = {
  CPM: 'BASE_PAY_MILEAGE',
  HOURLY: 'BASE_PAY_HOURLY',
  FLAT_PER_LOAD: 'BASE_PAY_FLAT',
  PERCENTAGE: 'BASE_PAY_PERCENTAGE',
  DAILY: 'BASE_PAY_DAILY',
  SALARY: 'BASE_PAY_FLAT',
};

const UNIT_MAP: Record<string, string> = {
  CPM: 'MILES',
  HOURLY: 'HOURS',
  FLAT_PER_LOAD: 'FLAT',
  PERCENTAGE: 'PERCENTAGE',
  DAILY: 'DAYS',
  SALARY: 'FLAT',
};

const DESCRIPTION_MAP: Record<string, string> = {
  CPM: 'Base pay — mileage',
  HOURLY: 'Base pay — hourly',
  FLAT_PER_LOAD: 'Base pay — flat rate',
  PERCENTAGE: 'Base pay — percentage of load revenue',
  DAILY: 'Base pay — daily rate',
  SALARY: 'Base pay — salary',
};

export async function ensureBasePayComponent(
  assignmentId: string,
  tenantId: string,
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  // 1. Idempotency check — return early if any BASE_PAY_* component already exists
  const existing = await prisma.loadPayComponent.findFirst({
    where: {
      assignmentId,
      deletedAt: null,
      category: 'EARNING',
      componentType: {
        in: [
          'BASE_PAY_MILEAGE',
          'BASE_PAY_HOURLY',
          'BASE_PAY_FLAT',
          'BASE_PAY_PERCENTAGE',
          'BASE_PAY_DAILY',
        ] as any[],
      },
    },
  });
  if (existing) return; // Already has base pay — idempotent

  // 2. Fetch assignment
  const assignment = await prisma.loadDriverAssignment.findFirst({
    where: { id: assignmentId, deletedAt: null },
  });
  if (!assignment) return; // Assignment not found — silently no-op

  // 3. Map payType → componentType
  const componentType = PAY_TYPE_TO_COMPONENT[assignment.payType] ?? 'BASE_PAY_FLAT';

  // 4. Determine unit and quantity — actuals preferred over estimates
  const unit = UNIT_MAP[assignment.payType] ?? 'FLAT';

  let quantity: Decimal;
  if (assignment.payType === 'CPM') {
    quantity = assignment.actualMiles ?? assignment.estimatedMiles ?? new Decimal(0);
  } else if (assignment.payType === 'HOURLY') {
    quantity = assignment.actualHours ?? assignment.estimatedHours ?? new Decimal(0);
  } else if (assignment.payType === 'DAILY') {
    quantity = assignment.actualHours
      ? assignment.actualHours.div(new Decimal(24))
      : assignment.estimatedHours
        ? assignment.estimatedHours.div(new Decimal(24))
        : new Decimal(1);
  } else {
    quantity = new Decimal(1);
  }

  // 5. Compute grossAmount via calculator — never hardcoded
  const grossAmount = computeGrossAmount({
    componentType,
    quantity,
    rate: assignment.baseRate,
    multiplier: new Decimal(1),
    loadRevenue: assignment.loadRevenue ?? undefined,
  });

  // 6. Build description
  const description = DESCRIPTION_MAP[assignment.payType] ?? 'Base pay';

  // 7. Insert the base pay component
  await prisma.loadPayComponent.create({
    data: {
      tenantId,
      assignmentId,
      loadId: assignment.loadId,
      driverId: assignment.driverId,
      componentType: componentType as any,
      category: 'EARNING' as any,
      description,
      quantity,
      unit: unit as any,
      rate: assignment.baseRate,
      multiplier: new Decimal(1),
      grossAmount,
      isTaxable: true,
      isReimbursement: false,
      visibleToDriver: true,
      enteredBy: userId,
      createdBy: userId,
    },
  });
}
