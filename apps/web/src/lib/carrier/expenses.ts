import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import { recalculatePayRecordReimbursements } from './pay-calculator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExpenseCreateInput {
  dispatchId?: string;
  loadId?: string;
  stopId?: string;
  driverId?: string;
  expenseType: string;
  amount: number;
  currency?: string;
  paidBy: string;
  notes?: string;
  receiptDocumentId?: string;
}

export interface ListExpensesFilters {
  dispatchId?: string;
  loadId?: string;
  stopId?: string;
  driverId?: string;
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// listExpenses
// ---------------------------------------------------------------------------

export async function listExpenses(orgId: string, filters: ListExpensesFilters = {}) {
  const tenantPrisma = await getTenantPrisma();
  const { dispatchId, loadId, stopId, driverId, page = 1, pageSize = 50 } = filters;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {
    orgId,
    ...(dispatchId ? { dispatchId } : {}),
    ...(loadId ? { loadId } : {}),
    ...(stopId ? { stopId } : {}),
    ...(driverId ? { driverId } : {}),
  };

  const [items, total] = await Promise.all([
    tenantPrisma.carrierExpense.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: {
        driver: { select: { firstName: true, lastName: true } },
      },
    }),
    tenantPrisma.carrierExpense.count({ where }),
  ]);

  return { items, total };
}

// ---------------------------------------------------------------------------
// getExpense
// ---------------------------------------------------------------------------

export async function getExpense(orgId: string, id: string) {
  const tenantPrisma = await getTenantPrisma();
  const expense = await tenantPrisma.carrierExpense.findFirst({
    where: { id, orgId },
    include: {
      driver: { select: { firstName: true, lastName: true } },
      dispatch: { select: { id: true, status: true, scheduledDeparture: true } },
      load: { select: { id: true, referenceNumber: true, status: true } },
    },
  });
  return expense ?? null;
}

// ---------------------------------------------------------------------------
// createExpense
// ---------------------------------------------------------------------------

export async function createExpense(
  orgId: string,
  data: ExpenseCreateInput
): Promise<
  | { error: string; status: number }
  | import('@/generated/prisma').CarrierExpense
> {
  const tenantPrisma = await getTenantPrisma();
  // Validate: at least one of dispatchId or loadId must be provided
  if (!data.dispatchId && !data.loadId) {
    return { error: 'At least one of dispatchId or loadId is required', status: 400 };
  }

  // Verify dispatchId belongs to this org
  if (data.dispatchId) {
    const dispatch = await tenantPrisma.trip.findFirst({
      where: { id: data.dispatchId, orgId },
      select: { id: true },
    });
    if (!dispatch) {
      return { error: 'Invalid dispatch — does not belong to this organization', status: 400 };
    }
  }

  // Verify stopId belongs to this org (stop's dispatch must belong to this org)
  if (data.stopId) {
    const stop = await tenantPrisma.carrierStop.findFirst({
      where: { id: data.stopId, dispatch: { orgId } },
      select: { id: true },
    });
    if (!stop) {
      return { error: 'Invalid stop — does not belong to this organization', status: 400 };
    }
  }

  // Verify driverId belongs to this org
  if (data.driverId) {
    const driver = await tenantPrisma.carrierDriver.findFirst({
      where: { id: data.driverId, orgId },
      select: { id: true },
    });
    if (!driver) {
      return { error: 'Invalid driver — does not belong to this organization', status: 400 };
    }
  }

  // Propagate clientId from load if loadId provided
  let clientId: string | null = null;
  if (data.loadId) {
    const load = await tenantPrisma.carrierLoad.findFirst({
      where: { id: data.loadId, orgId },
      select: { clientId: true },
    });
    clientId = load?.clientId ?? null;
  }

  // Auto-set reimbursable when driver pays out of pocket
  const reimbursable = data.paidBy === 'driver_cash';

  const expense = await tenantPrisma.carrierExpense.create({
    data: {
      orgId,
      dispatchId: data.dispatchId ?? null,
      loadId: data.loadId ?? null,
      stopId: data.stopId ?? null,
      driverId: data.driverId ?? null,
      expenseType: data.expenseType,
      amount: data.amount,
      currency: data.currency ?? 'USD',
      paidBy: data.paidBy,
      notes: data.notes ?? null,
      receiptDocumentId: data.receiptDocumentId ?? null,
      clientId,
      reimbursable,
      submittedAt: new Date(),
    },
  });

  logger.info('createExpense: created', { orgId, expenseId: expense.id });
  return expense;
}

// ---------------------------------------------------------------------------
// updateExpense
// ---------------------------------------------------------------------------

export async function updateExpense(
  orgId: string,
  id: string,
  data: Partial<ExpenseCreateInput>
): Promise<import('@/generated/prisma').CarrierExpense | null> {
  const tenantPrisma = await getTenantPrisma();
  const existing = await tenantPrisma.carrierExpense.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  const updated = await tenantPrisma.carrierExpense.update({
    where: { id },
    data: {
      ...(data.dispatchId !== undefined ? { dispatchId: data.dispatchId } : {}),
      ...(data.loadId !== undefined ? { loadId: data.loadId } : {}),
      ...(data.stopId !== undefined ? { stopId: data.stopId } : {}),
      ...(data.driverId !== undefined ? { driverId: data.driverId } : {}),
      ...(data.expenseType !== undefined ? { expenseType: data.expenseType } : {}),
      ...(data.amount !== undefined ? { amount: data.amount } : {}),
      ...(data.currency !== undefined ? { currency: data.currency } : {}),
      ...(data.paidBy !== undefined ? {
        paidBy: data.paidBy,
        reimbursable: data.paidBy === 'driver_cash',
      } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.receiptDocumentId !== undefined ? { receiptDocumentId: data.receiptDocumentId } : {}),
    },
  });

  logger.info('updateExpense: updated', { orgId, expenseId: id });
  return updated;
}

// ---------------------------------------------------------------------------
// deleteExpense
// ---------------------------------------------------------------------------

export async function deleteExpense(orgId: string, id: string): Promise<boolean | null> {
  const tenantPrisma = await getTenantPrisma();
  const existing = await tenantPrisma.carrierExpense.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  await tenantPrisma.carrierExpense.delete({ where: { id } });
  logger.info('deleteExpense: deleted', { orgId, expenseId: id });
  return true;
}

// ---------------------------------------------------------------------------
// approveExpense
// ---------------------------------------------------------------------------

export async function approveExpense(
  orgId: string,
  id: string,
  userId: string
): Promise<import('@/generated/prisma').CarrierExpense | null> {
  const tenantPrisma = await getTenantPrisma();
  const existing = await tenantPrisma.carrierExpense.findFirst({ where: { id, orgId } });
  if (!existing) return null;

  const updated = await tenantPrisma.carrierExpense.update({
    where: { id },
    data: { approvedBy: userId, approvedAt: new Date() },
  });

  logger.info('approveExpense: approved', { orgId, expenseId: id, approvedBy: userId });

  // Propagate reimbursement to existing non-paid pay records (best-effort)
  if (updated.reimbursable && updated.dispatchId && updated.driverId) {
    try {
      const affectedRecords = await tenantPrisma.driverPayRecord.findMany({
        where: {
          orgId,
          dispatchId: updated.dispatchId,
          driverId: updated.driverId,
          status: { not: 'paid' },
        },
        select: { id: true },
      });

      for (const record of affectedRecords) {
        const result = await recalculatePayRecordReimbursements(orgId, record.id);
        if ('error' in result) {
          logger.warn('approveExpense: recalculation skipped', {
            orgId,
            payRecordId: record.id,
            reason: result.error,
          });
        } else {
          logger.info('approveExpense: pay record reimbursements updated', {
            orgId,
            payRecordId: record.id,
            reimbursements: result.data.reimbursements,
            netPay: result.data.netPay,
          });
        }
      }
    } catch (err) {
      logger.warn('approveExpense: failed to propagate reimbursements to pay records', {
        orgId,
        expenseId: id,
        err,
      });
    }
  }

  return updated;
}
