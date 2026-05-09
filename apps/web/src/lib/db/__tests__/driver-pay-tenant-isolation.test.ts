/**
 * Driver Pay — Tenant Isolation Tests
 *
 * Verifies that all 9 new Driver Pay tables enforce tenant isolation via
 * the withTenantRLS Prisma extension (application-layer tenantId injection +
 * PostgreSQL set_config belt-and-suspenders).
 *
 * One isolation test per tenant-scoped table:
 *   driver_compensation_templates, driver_settlements,
 *   load_driver_assignments,       load_pay_components,
 *   driver_bonuses,                driver_deductions,
 *   pay_component_attachments,     driver_disputes,
 *   driver_pay_audit_logs
 *
 * Requires a real PostgreSQL database with all migrations applied.
 * Automatically skipped when DATABASE_URL is not set.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withTenantRLS } from '@/lib/db/extensions/tenant-rls';

const hasDatabase = !!process.env.DATABASE_URL;
const describeWithDb = hasDatabase ? describe : describe.skip;

describeWithDb('Driver Pay — Tenant Isolation', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: any;

  // IDs created during setup
  let tenantAId: string;
  let tenantBId: string;
  let driverAId: string;
  let driverBId: string;
  let loadAId: string;
  let loadBId: string;
  let templateAId: string;
  let templateBId: string;
  let settlementAId: string;
  let settlementBId: string;
  let assignmentAId: string;
  let assignmentBId: string;
  let componentAId: string;
  let componentBId: string;
  const marker = `dp-iso-${Date.now()}`;

  beforeAll(async () => {
    const { PrismaClient } = await import('../../../generated/prisma/client');
    const { PrismaPg } = await import('@prisma/adapter-pg');
    const { Pool } = await import('pg');

    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
    const adapter = new PrismaPg(pool);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma = new (PrismaClient as any)({ adapter });

    // Helper: run queries bypassing all RLS policies
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function bypass(fn: (tx: any) => Promise<any>): Promise<any> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return fn(tx);
      });
    }

    // ── Tenants ───────────────────────────────────────────────────────────────
    tenantAId = (await bypass((tx) =>
      tx.tenant.create({ data: { name: `${marker}-A`, timezone: 'UTC', slug: `${marker}-a` } })
    )).id;

    tenantBId = (await bypass((tx) =>
      tx.tenant.create({ data: { name: `${marker}-B`, timezone: 'UTC', slug: `${marker}-b` } })
    )).id;

    // ── Carrier drivers (orgId = tenantId for carrier tables) ─────────────────
    driverAId = (await bypass((tx) =>
      tx.carrierDriver.create({
        data: { orgId: tenantAId, firstName: 'Driver', lastName: 'A', payModel: 'per_mile', payRate: '0.50' },
      })
    )).id;

    driverBId = (await bypass((tx) =>
      tx.carrierDriver.create({
        data: { orgId: tenantBId, firstName: 'Driver', lastName: 'B', payModel: 'per_mile', payRate: '0.50' },
      })
    )).id;

    // ── Carrier clients (needed for loads FK) ─────────────────────────────────
    const clientAId = (await bypass((tx) =>
      tx.carrierClient.create({ data: { orgId: tenantAId, name: `${marker}-ClientA` } })
    )).id;

    const clientBId = (await bypass((tx) =>
      tx.carrierClient.create({ data: { orgId: tenantBId, name: `${marker}-ClientB` } })
    )).id;

    // ── Loads (orgId + clientId required; other fields optional) ─────────────
    loadAId = (await bypass((tx) =>
      tx.carrierLoad.create({
        data: { orgId: tenantAId, clientId: clientAId, loadType: 'ftl' },
      })
    )).id;

    loadBId = (await bypass((tx) =>
      tx.carrierLoad.create({
        data: { orgId: tenantBId, clientId: clientBId, loadType: 'ftl' },
      })
    )).id;

    // ── driver_compensation_templates ─────────────────────────────────────────
    const dummyDate = new Date('2026-01-01');

    templateAId = (await bypass((tx) =>
      tx.driverCompensationTemplate.create({
        data: {
          tenantId: tenantAId,
          driverId: driverAId,
          employmentType: 'W2_EMPLOYEE',
          payType: 'CPM',
          baseRate: 0.55,
          rateUnit: 'PER_MILE',
          loadedMilesOnly: false,
          perDiemEnabled: false,
          overtimeEligible: false,
          effectiveFrom: dummyDate,
          createdBy: tenantAId,
        },
      })
    )).id;

    templateBId = (await bypass((tx) =>
      tx.driverCompensationTemplate.create({
        data: {
          tenantId: tenantBId,
          driverId: driverBId,
          employmentType: 'W2_EMPLOYEE',
          payType: 'CPM',
          baseRate: 0.60,
          rateUnit: 'PER_MILE',
          loadedMilesOnly: false,
          perDiemEnabled: false,
          overtimeEligible: false,
          effectiveFrom: dummyDate,
          createdBy: tenantBId,
        },
      })
    )).id;

    // ── driver_settlements ────────────────────────────────────────────────────
    const periodStart = new Date('2026-01-01');
    const periodEnd   = new Date('2026-01-14');

    settlementAId = (await bypass((tx) =>
      tx.driverSettlement.create({
        data: {
          tenantId: tenantAId,
          driverId: driverAId,
          periodStart,
          periodEnd,
          grossTaxable: 1000,
          grossNonTaxable: 200,
          totalDeductions: 50,
          netPay: 1150,
          createdBy: tenantAId,
        },
      })
    )).id;

    settlementBId = (await bypass((tx) =>
      tx.driverSettlement.create({
        data: {
          tenantId: tenantBId,
          driverId: driverBId,
          periodStart,
          periodEnd,
          grossTaxable: 900,
          grossNonTaxable: 100,
          totalDeductions: 30,
          netPay: 970,
          createdBy: tenantBId,
        },
      })
    )).id;

    // ── load_driver_assignments ───────────────────────────────────────────────
    assignmentAId = (await bypass((tx) =>
      tx.loadDriverAssignment.create({
        data: {
          tenantId: tenantAId,
          loadId: loadAId,
          driverId: driverAId,
          driverRole: 'MAIN_DRIVER',
          templateId: templateAId,
          payType: 'CPM',
          baseRate: 0.55,
          rateUnit: 'PER_MILE',
          loadedMilesOnly: false,
          perDiemEnabled: false,
          createdBy: tenantAId,
        },
      })
    )).id;

    assignmentBId = (await bypass((tx) =>
      tx.loadDriverAssignment.create({
        data: {
          tenantId: tenantBId,
          loadId: loadBId,
          driverId: driverBId,
          driverRole: 'MAIN_DRIVER',
          templateId: templateBId,
          payType: 'CPM',
          baseRate: 0.60,
          rateUnit: 'PER_MILE',
          loadedMilesOnly: false,
          perDiemEnabled: false,
          createdBy: tenantBId,
        },
      })
    )).id;

    // ── load_pay_components ───────────────────────────────────────────────────
    componentAId = (await bypass((tx) =>
      tx.loadPayComponent.create({
        data: {
          tenantId: tenantAId,
          assignmentId: assignmentAId,
          loadId: loadAId,
          driverId: driverAId,
          componentType: 'BASE_PAY_MILEAGE',
          category: 'EARNING',
          description: 'Base CPM pay',
          quantity: 500,
          unit: 'MILES',
          rate: 0.55,
          grossAmount: 275,
          isTaxable: true,
          isReimbursement: false,
          enteredBy: tenantAId,
          createdBy: tenantAId,
        },
      })
    )).id;

    componentBId = (await bypass((tx) =>
      tx.loadPayComponent.create({
        data: {
          tenantId: tenantBId,
          assignmentId: assignmentBId,
          loadId: loadBId,
          driverId: driverBId,
          componentType: 'BASE_PAY_MILEAGE',
          category: 'EARNING',
          description: 'Base CPM pay',
          quantity: 400,
          unit: 'MILES',
          rate: 0.60,
          grossAmount: 240,
          isTaxable: true,
          isReimbursement: false,
          enteredBy: tenantBId,
          createdBy: tenantBId,
        },
      })
    )).id;

    // ── driver_bonuses ────────────────────────────────────────────────────────
    await bypass((tx) =>
      tx.driverBonus.create({
        data: {
          tenantId: tenantAId,
          driverId: driverAId,
          bonusType: 'SAFETY',
          amount: 100,
          description: 'Safety bonus A',
          triggerDate: dummyDate,
          isTaxable: true,
          createdBy: tenantAId,
        },
      })
    );

    await bypass((tx) =>
      tx.driverBonus.create({
        data: {
          tenantId: tenantBId,
          driverId: driverBId,
          bonusType: 'SAFETY',
          amount: 150,
          description: 'Safety bonus B',
          triggerDate: dummyDate,
          isTaxable: true,
          createdBy: tenantBId,
        },
      })
    );

    // ── driver_deductions ─────────────────────────────────────────────────────
    await bypass((tx) =>
      tx.driverDeduction.create({
        data: {
          tenantId: tenantAId,
          driverId: driverAId,
          deductionType: 'ADVANCE',
          schedule: 'ONE_TIME',
          amountPerPeriod: 50,
          startsOn: dummyDate,
          createdBy: tenantAId,
        },
      })
    );

    await bypass((tx) =>
      tx.driverDeduction.create({
        data: {
          tenantId: tenantBId,
          driverId: driverBId,
          deductionType: 'ADVANCE',
          schedule: 'ONE_TIME',
          amountPerPeriod: 75,
          startsOn: dummyDate,
          createdBy: tenantBId,
        },
      })
    );

    // ── pay_component_attachments ─────────────────────────────────────────────
    await bypass((tx) =>
      tx.payComponentAttachment.create({
        data: {
          tenantId: tenantAId,
          componentId: componentAId,
          assignmentId: assignmentAId,
          storageKey: `${marker}-A/receipt.pdf`,
          filename: 'receipt-a.pdf',
          uploadedBy: tenantAId,
          createdBy: tenantAId,
        },
      })
    );

    await bypass((tx) =>
      tx.payComponentAttachment.create({
        data: {
          tenantId: tenantBId,
          componentId: componentBId,
          assignmentId: assignmentBId,
          storageKey: `${marker}-B/receipt.pdf`,
          filename: 'receipt-b.pdf',
          uploadedBy: tenantBId,
          createdBy: tenantBId,
        },
      })
    );

    // ── driver_disputes ───────────────────────────────────────────────────────
    await bypass((tx) =>
      tx.driverDispute.create({
        data: {
          tenantId: tenantAId,
          driverId: driverAId,
          targetType: 'LOAD_PAY',
          targetId: assignmentAId,
          issueCategory: 'WRONG_MILES',
          driverMessage: 'Miles look wrong on A',
          createdBy: tenantAId,
        },
      })
    );

    await bypass((tx) =>
      tx.driverDispute.create({
        data: {
          tenantId: tenantBId,
          driverId: driverBId,
          targetType: 'LOAD_PAY',
          targetId: assignmentBId,
          issueCategory: 'WRONG_MILES',
          driverMessage: 'Miles look wrong on B',
          createdBy: tenantBId,
        },
      })
    );

    // ── driver_pay_audit_logs ─────────────────────────────────────────────────
    await bypass((tx) =>
      tx.driverPayAuditLog.create({
        data: {
          tenantId: tenantAId,
          entityType: 'LoadDriverAssignment',
          entityId: assignmentAId,
          action: 'APPROVE',
          createdBy: tenantAId,
        },
      })
    );

    await bypass((tx) =>
      tx.driverPayAuditLog.create({
        data: {
          tenantId: tenantBId,
          entityType: 'LoadDriverAssignment',
          entityId: assignmentBId,
          action: 'APPROVE',
          createdBy: tenantBId,
        },
      })
    );
  }, 60000);

  afterAll(async () => {
    if (!prisma) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async function bypass<T>(fn: (tx: any) => Promise<T>): Promise<T> {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return prisma.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return fn(tx);
      });
    }

    const ids = [tenantAId, tenantBId].filter(Boolean);
    if (!ids.length) { await prisma.$disconnect(); return; }

    await bypass((tx) => tx.driverPayAuditLog.deleteMany({ where: { tenantId: { in: ids } } }));
    await bypass((tx) => tx.driverDispute.deleteMany({ where: { tenantId: { in: ids } } }));
    await bypass((tx) => tx.payComponentAttachment.deleteMany({ where: { tenantId: { in: ids } } }));
    await bypass((tx) => tx.driverDeduction.deleteMany({ where: { tenantId: { in: ids } } }));
    await bypass((tx) => tx.driverBonus.deleteMany({ where: { tenantId: { in: ids } } }));
    await bypass((tx) => tx.loadPayComponent.deleteMany({ where: { tenantId: { in: ids } } }));
    await bypass((tx) => tx.loadDriverAssignment.deleteMany({ where: { tenantId: { in: ids } } }));
    await bypass((tx) => tx.driverSettlement.deleteMany({ where: { tenantId: { in: ids } } }));
    await bypass((tx) => tx.driverCompensationTemplate.deleteMany({ where: { tenantId: { in: ids } } }));
    await bypass((tx) => tx.carrierLoad.deleteMany({ where: { orgId: { in: ids } } }));
    await bypass((tx) => tx.carrierClient.deleteMany({ where: { orgId: { in: ids } } }));
    await bypass((tx) => tx.carrierDriver.deleteMany({ where: { orgId: { in: ids } } }));
    await bypass((tx) => tx.tenant.deleteMany({ where: { name: { startsWith: marker } } }));

    await prisma.$disconnect();
  }, 60000);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function clientA() { return prisma.$extends(withTenantRLS(tenantAId)); }

  // ── Tests — one per table ────────────────────────────────────────────────────

  it('driver_compensation_templates: tenantA sees only its own records', { timeout: 60000 }, async () => {
    const rows = await clientA().driverCompensationTemplate.findMany();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r: any) => r.tenantId === tenantAId)).toBe(true);
    expect(rows.some((r: any) => r.id === templateAId)).toBe(true);
    expect(rows.some((r: any) => r.id === templateBId)).toBe(false);
  });

  it('driver_settlements: tenantA sees only its own records', { timeout: 60000 }, async () => {
    const rows = await clientA().driverSettlement.findMany();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r: any) => r.tenantId === tenantAId)).toBe(true);
    expect(rows.some((r: any) => r.id === settlementAId)).toBe(true);
    expect(rows.some((r: any) => r.id === settlementBId)).toBe(false);
  });

  it('load_driver_assignments: tenantA sees only its own records', { timeout: 60000 }, async () => {
    const rows = await clientA().loadDriverAssignment.findMany();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r: any) => r.tenantId === tenantAId)).toBe(true);
    expect(rows.some((r: any) => r.id === assignmentAId)).toBe(true);
    expect(rows.some((r: any) => r.id === assignmentBId)).toBe(false);
  });

  it('load_pay_components: tenantA sees only its own records', { timeout: 60000 }, async () => {
    const rows = await clientA().loadPayComponent.findMany();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r: any) => r.tenantId === tenantAId)).toBe(true);
    expect(rows.some((r: any) => r.id === componentAId)).toBe(true);
    expect(rows.some((r: any) => r.id === componentBId)).toBe(false);
  });

  it('driver_bonuses: tenantA sees only its own records', { timeout: 60000 }, async () => {
    const rows = await clientA().driverBonus.findMany();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r: any) => r.tenantId === tenantAId)).toBe(true);
    expect(rows.some((r: any) => r.driverId === driverBId)).toBe(false);
  });

  it('driver_deductions: tenantA sees only its own records', { timeout: 60000 }, async () => {
    const rows = await clientA().driverDeduction.findMany();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r: any) => r.tenantId === tenantAId)).toBe(true);
    expect(rows.some((r: any) => r.driverId === driverBId)).toBe(false);
  });

  it('pay_component_attachments: tenantA sees only its own records', { timeout: 60000 }, async () => {
    const rows = await clientA().payComponentAttachment.findMany();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r: any) => r.tenantId === tenantAId)).toBe(true);
    expect(rows.some((r: any) => r.componentId === componentBId)).toBe(false);
  });

  it('driver_disputes: tenantA sees only its own records', { timeout: 60000 }, async () => {
    const rows = await clientA().driverDispute.findMany();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r: any) => r.tenantId === tenantAId)).toBe(true);
    expect(rows.some((r: any) => r.driverId === driverBId)).toBe(false);
  });

  it('driver_pay_audit_logs: tenantA sees only its own records', { timeout: 60000 }, async () => {
    const rows = await clientA().driverPayAuditLog.findMany();
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows.every((r: any) => r.tenantId === tenantAId)).toBe(true);
    expect(rows.some((r: any) => r.entityId === assignmentBId)).toBe(false);
  });
});
