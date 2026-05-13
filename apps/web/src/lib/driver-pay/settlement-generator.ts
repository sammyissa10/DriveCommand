/**
 * Settlement Generator — spec section 10.4
 *
 * Converts APPROVED LoadDriverAssignments + scheduled DriverBonuses minus
 * capped DriverDeductions into a DriverSettlement (DRAFT status).
 *
 * All money operations use decimal.js — never native floats.
 * Runs inside a Serializable transaction with SELECT ... FOR UPDATE to prevent
 * double-settling the same load assignment.
 */

import Decimal from 'decimal.js';
import type { PrismaClient } from '@/generated/prisma';
import { Prisma } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class SettlementOverlapError extends Error {
  constructor(
    public driverId: string,
    public conflictingSettlementId: string,
  ) {
    super(
      `Driver ${driverId} already has overlapping settlement ${conflictingSettlementId}`,
    );
    this.name = 'SettlementOverlapError';
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GenerateInput {
  tenantId: string;
  driverId: string;
  periodStart: Date;
  periodEnd: Date;
  actorUserId: string;
}

export interface DeductionApplied {
  deductionId: string;
  appliedAmount: Decimal;
  requestedAmount: Decimal;
  carryover: Decimal;
}

export interface GenerateResult {
  settlement: {
    id: string;
    tenantId: string;
    driverId: string;
    periodStart: Date;
    periodEnd: Date;
    status: string;
    grossTaxable: Decimal;
    grossNonTaxable: Decimal;
    totalDeductions: Decimal;
    netPay: Decimal;
    settlementReference: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    createdBy: string;
  };
  assignmentCount: number;
  bonusCount: number;
  deductionCount: number;
  carryoverApplied: Decimal;
}

export interface BatchInput {
  tenantId: string;
  driverIds: string[];
  periodStart: Date;
  periodEnd: Date;
  actorUserId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function formatDateCompact(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

// ---------------------------------------------------------------------------
// Core generator
// ---------------------------------------------------------------------------

/**
 * Generate a single DRAFT settlement for one driver + period.
 * Must run inside a Serializable transaction.
 */
export async function generateSettlementForDriver(
  prisma: PrismaClient,
  input: GenerateInput,
): Promise<GenerateResult> {
  const { tenantId, driverId, periodStart, periodEnd, actorUserId } = input;

  return prisma.$transaction(
    async (tx) => {
      // ── Step 1: Pre-check for overlapping FINALIZED/PAID settlement ──────

      const overlapping = await (tx as unknown as PrismaClient).driverSettlement.findFirst({
        where: {
          tenantId,
          driverId,
          status: { in: ['FINALIZED', 'PAID'] },
          periodStart: { lte: periodEnd },
          periodEnd: { gte: periodStart },
        },
        select: { id: true },
      });

      if (overlapping) {
        throw new SettlementOverlapError(driverId, overlapping.id);
      }

      // ── Step 2: Lock approved-and-unsettled assignments ──────────────────
      // Use $queryRaw with FOR UPDATE for row-level locking.
      // Note: The RLS extension wraps each query in set_config, so raw queries
      // bypass model-level RLS. We explicitly filter by tenantId to maintain
      // tenant isolation for raw queries.
      const lockedRows = await (tx as unknown as { $queryRaw: PrismaClient['$queryRaw'] }).$queryRaw<
        Array<{ id: string }>
      >`
        SELECT id FROM load_driver_assignments
        WHERE tenant_id = ${tenantId}::uuid
          AND driver_id = ${driverId}::uuid
          AND pay_status = 'APPROVED'
          AND settlement_id IS NULL
          AND approved_at IS NOT NULL
          AND approved_at <= ${periodEnd}
          AND deleted_at IS NULL
        FOR UPDATE
      `;

      const assignmentIds = lockedRows.map((r) => r.id);

      const assignments = await (tx as unknown as PrismaClient).loadDriverAssignment.findMany({
        where: { id: { in: assignmentIds } },
        include: {
          payComponents: { where: { deletedAt: null } },
          load: {
            select: {
              id: true,
              referenceNumber: true,
              status: true,
            },
          },
        },
      });

      // ── Step 3: Sum pay components ───────────────────────────────────────

      let grossTaxable = new Decimal(0);
      let grossNonTaxable = new Decimal(0);
      let componentDeductions = new Decimal(0); // deduction components embedded in assignments

      for (const assignment of assignments) {
        for (const c of assignment.payComponents) {
          const amount = new Decimal(c.grossAmount.toString());
          const cat = c.category as string;

          if (cat === 'DEDUCTION') {
            // Deduction components stored as negative in DB; take abs value
            componentDeductions = componentDeductions.plus(amount.abs());
          } else if (
            cat === 'EARNING' ||
            cat === 'BONUS' ||
            cat === 'ACCESSORIAL' ||
            cat === 'ADJUSTMENT' ||
            cat === 'BASE_PAY' ||
            cat === 'ALLOWANCE' ||
            cat === 'REIMBURSEMENT'
          ) {
            if (c.isTaxable) {
              grossTaxable = grossTaxable.plus(amount);
            } else {
              grossNonTaxable = grossNonTaxable.plus(amount);
            }
          }
        }
      }

      // ── Step 4: Pull scheduled standalone bonuses ────────────────────────

      const bonuses = await (tx as unknown as PrismaClient).driverBonus.findMany({
        where: {
          tenantId,
          driverId,
          paidAt: null,
          settlementId: null,
          scheduledPayDate: { lte: periodEnd },
          deletedAt: null,
        },
      });

      for (const bonus of bonuses) {
        const amount = new Decimal(bonus.amount.toString());
        if (bonus.isTaxable) {
          grossTaxable = grossTaxable.plus(amount);
        } else {
          grossNonTaxable = grossNonTaxable.plus(amount);
        }
      }

      // ── Step 5: Compute standalone deductions ────────────────────────────

      const deductions = await (tx as unknown as PrismaClient).driverDeduction.findMany({
        where: {
          tenantId,
          driverId,
          paused: false,
          deletedAt: null,
        },
      });

      // ── Step 6: Apply garnishment cap ────────────────────────────────────

      const deductionsApplied: DeductionApplied[] = [];
      let totalDeductions = componentDeductions; // start with embedded component deductions
      let carryoverApplied = new Decimal(0);

      // Net before standalone deductions (for cap calculation)
      const grossTotal = grossTaxable.plus(grossNonTaxable);

      for (const ded of deductions) {
        const schedule = ded.schedule as string;
        const amountCollected = new Decimal(ded.amountCollected.toString());
        const amountPerPeriod = new Decimal(ded.amountPerPeriod.toString());
        const totalAmount = ded.totalAmount ? new Decimal(ded.totalAmount.toString()) : null;

        // Determine requested amount for this period
        let requested: Decimal;

        if (schedule === 'EVERY_SETTLEMENT') {
          requested = amountPerPeriod;
        } else if (schedule === 'FIXED_INSTALLMENTS' || schedule === 'ONE_TIME') {
          if (totalAmount === null) {
            requested = amountPerPeriod;
          } else {
            const remaining = totalAmount.minus(amountCollected);
            if (remaining.lte(0)) {
              // Fully collected — skip
              continue;
            }
            requested = Decimal.min(amountPerPeriod, remaining);
          }
        } else {
          // Unknown schedule — skip
          continue;
        }

        // Apply garnishment cap if maxPercentageOfNet is set
        let applied = requested;

        if (ded.maxPercentageOfNet !== null) {
          const maxPct = new Decimal(ded.maxPercentageOfNet.toString());
          // Net before THIS deduction = grossTotal - totalDeductions already accumulated
          const netBeforeThis = grossTotal.minus(totalDeductions);
          if (netBeforeThis.lte(0)) {
            applied = new Decimal(0);
          } else {
            const cap = netBeforeThis.mul(maxPct).div(100).toDecimalPlaces(2);
            applied = Decimal.min(requested, cap);
          }
          const carryover = requested.minus(applied);
          if (carryover.gt(0)) {
            carryoverApplied = carryoverApplied.plus(carryover);
          }
        }

        if (applied.lte(0)) continue;

        totalDeductions = totalDeductions.plus(applied);
        deductionsApplied.push({
          deductionId: ded.id,
          appliedAmount: applied,
          requestedAmount: requested,
          carryover: requested.minus(applied),
        });
      }

      // ── Step 7: Final totals ─────────────────────────────────────────────

      let netPay = grossTaxable.plus(grossNonTaxable).minus(totalDeductions);
      if (netPay.lt(0)) {
        // Clamp net pay to 0 — don't let the driver owe money on this settlement
        netPay = new Decimal(0);
      }

      // ── Step 8: Insert DriverSettlement row ──────────────────────────────

      const ref = `SET-${formatDateCompact(periodStart)}-${driverId.slice(0, 6).toUpperCase()}-${randomSuffix()}`;

      // Encode deductions snapshot in notes for the detail endpoint
      const deductionsSnapshot = JSON.stringify({
        _deductionsApplied: deductionsApplied.map((d) => ({
          deductionId: d.deductionId,
          appliedAmount: d.appliedAmount.toFixed(2),
          requestedAmount: d.requestedAmount.toFixed(2),
          carryover: d.carryover.toFixed(2),
        })),
      });

      const settlement = await (tx as unknown as PrismaClient).driverSettlement.create({
        data: {
          tenantId,
          driverId,
          periodStart,
          periodEnd,
          status: 'DRAFT',
          grossTaxable: new Prisma.Decimal(grossTaxable.toFixed(2)),
          grossNonTaxable: new Prisma.Decimal(grossNonTaxable.toFixed(2)),
          totalDeductions: new Prisma.Decimal(totalDeductions.toFixed(2)),
          netPay: new Prisma.Decimal(netPay.toFixed(2)),
          settlementReference: ref,
          notes: deductionsSnapshot,
          createdBy: actorUserId,
        },
      });

      // ── Step 9: Update linked rows ───────────────────────────────────────

      if (assignmentIds.length > 0) {
        await (tx as unknown as PrismaClient).loadDriverAssignment.updateMany({
          where: { id: { in: assignmentIds } },
          data: { settlementId: settlement.id },
        });
      }

      if (bonuses.length > 0) {
        await (tx as unknown as PrismaClient).driverBonus.updateMany({
          where: { id: { in: bonuses.map((b) => b.id) } },
          data: { settlementId: settlement.id },
        });
      }

      for (const da of deductionsApplied) {
        await (tx as unknown as PrismaClient).driverDeduction.update({
          where: { id: da.deductionId },
          data: {
            amountCollected: {
              increment: new Prisma.Decimal(da.appliedAmount.toFixed(2)),
            },
          },
        });
      }

      // ── Step 10: Write audit log ─────────────────────────────────────────

      await (tx as unknown as PrismaClient).driverPayAuditLog.create({
        data: {
          tenantId,
          entityType: 'DriverSettlement',
          entityId: settlement.id,
          action: 'settlement:generated',
          previousValue: Prisma.JsonNull,
          newValue: {
            settlementReference: ref,
            status: 'DRAFT',
            grossTaxable: grossTaxable.toFixed(2),
            grossNonTaxable: grossNonTaxable.toFixed(2),
            totalDeductions: totalDeductions.toFixed(2),
            netPay: netPay.toFixed(2),
            assignmentCount: assignmentIds.length,
            bonusCount: bonuses.length,
            deductionCount: deductionsApplied.length,
            carryoverApplied: carryoverApplied.toFixed(2),
          },
          actorId: actorUserId,
          createdBy: actorUserId,
        },
      });

      return {
        settlement: {
          id: settlement.id,
          tenantId: settlement.tenantId,
          driverId: settlement.driverId,
          periodStart: settlement.periodStart,
          periodEnd: settlement.periodEnd,
          status: settlement.status as string,
          grossTaxable,
          grossNonTaxable,
          totalDeductions,
          netPay,
          settlementReference: ref,
          notes: settlement.notes,
          createdAt: settlement.createdAt,
          updatedAt: settlement.updatedAt,
          createdBy: settlement.createdBy,
        },
        assignmentCount: assignmentIds.length,
        bonusCount: bonuses.length,
        deductionCount: deductionsApplied.length,
        carryoverApplied,
      };
    },
    { isolationLevel: 'Serializable', timeout: 30000 },
  );
}

// ---------------------------------------------------------------------------
// Batch generator
// ---------------------------------------------------------------------------

export async function generateSettlementsBatch(
  prisma: PrismaClient,
  input: BatchInput,
): Promise<{
  results: GenerateResult[];
  conflicts: { driverId: string; reason: string; conflictingSettlementId?: string }[];
}> {
  const results: GenerateResult[] = [];
  const conflicts: { driverId: string; reason: string; conflictingSettlementId?: string }[] = [];

  for (const driverId of input.driverIds) {
    try {
      const result = await generateSettlementForDriver(prisma, {
        tenantId: input.tenantId,
        driverId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        actorUserId: input.actorUserId,
      });
      results.push(result);
    } catch (err) {
      if (err instanceof SettlementOverlapError) {
        conflicts.push({
          driverId,
          reason: err.message,
          conflictingSettlementId: err.conflictingSettlementId,
        });
      } else {
        // Unexpected error — rethrow to surface to caller
        throw err;
      }
    }
  }

  return { results, conflicts };
}
