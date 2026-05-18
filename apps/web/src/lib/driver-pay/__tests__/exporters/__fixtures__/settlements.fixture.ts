/**
 * settlements.fixture.ts — Test fixtures for payroll exporter golden tests.
 *
 * Rules:
 * - NO real names (driver names are "FIRST_W2 / LAST_W2" / "FIRST_1099 / LAST_1099")
 * - NO real emails (use .invalid TLD per RFC 6761)
 * - NO real driver IDs (deterministic UUIDs only)
 * - Values use string form to avoid Decimal/Prisma round-trip in tests
 */

import type { SettlementWithLines } from '@/lib/driver-pay/exporters/index';
import type { Prisma } from '@/generated/prisma';

/** Helper: create a Decimal-like value from a string for use in fixtures */
function dec(s: string): Prisma.Decimal {
  return { toString: () => s } as unknown as Prisma.Decimal;
}

// ---------------------------------------------------------------------------
// W-2 fixture
//
// Driver: FIRST_W2 LAST_W2, W2_EMPLOYEE
// Period: 2026-04-01 → 2026-04-07
// Finalized: 2026-04-08T12:00:00Z
// grossTaxable: 2500.00, grossNonTaxable: 50.00
// totalDeductions: 425.50, netPay: 2124.50
// Components: linehaul (qty=1), detention (qty=4), deduction-uniform (qty=1)
// Bonuses: safety $100, performance $50
// Deductions snapshot: uniform -$25.50, garnishment -$400
// ---------------------------------------------------------------------------

export const w2Settlement: SettlementWithLines = {
  settlement: {
    id: '11111111-0000-0000-0000-000000000001',
    tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
    driverId: 'bbbbbbbb-0000-0000-0000-000000000001',
    periodStart: new Date('2026-04-01'),
    periodEnd: new Date('2026-04-07'),
    status: 'FINALIZED' as const,
    grossTaxable: dec('2500.00'),
    grossNonTaxable: dec('50.00'),
    totalDeductions: dec('425.50'),
    netPay: dec('2124.50'),
    finalizedBy: 'cccccccc-0000-0000-0000-000000000001',
    finalizedAt: new Date('2026-04-08T12:00:00Z'),
    paidAt: null,
    settlementReference: 'SET-2026-04-W2-001',
    pdfUrl: null,
    notes: JSON.stringify({
      _deductionsApplied: [
        { deductionId: 'ded-001', description: 'Uniform', amount: '-25.50', type: 'EQUIPMENT' },
        { deductionId: 'ded-002', description: 'Garnishment', amount: '-400.00', type: 'GARNISHMENT' },
      ],
    }),
    employmentTypeSnapshot: 'W2_EMPLOYEE' as const,
    createdAt: new Date('2026-04-08T10:00:00Z'),
    updatedAt: new Date('2026-04-08T12:00:00Z'),
    createdBy: 'cccccccc-0000-0000-0000-000000000001',
    updatedBy: null,
    deletedAt: null,
    driver: {
      id: 'bbbbbbbb-0000-0000-0000-000000000001',
      firstName: 'FIRST_W2',
      lastName: 'LAST_W2',
      email: 'w2.driver+test@example.invalid',
      phone: null,
    },
  },
  payComponents: [
    {
      id: 'pc-001',
      tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
      assignmentId: 'asgn-001',
      loadId: 'load-001',
      driverId: 'bbbbbbbb-0000-0000-0000-000000000001',
      stopId: null,
      componentType: 'BASE_PAY_MILEAGE' as const,
      category: 'EARNING' as const,
      description: 'Linehaul — 1250 miles @ $1.80/mi',
      quantity: dec('1'),
      unit: 'MILES' as const,
      rate: dec('1.80'),
      multiplier: dec('1.00'),
      grossAmount: dec('2250.00'),
      isTaxable: true,
      isReimbursement: false,
      originalComponentId: null,
      visibleToDriver: true,
      notes: null,
      enteredBy: 'cccccccc-0000-0000-0000-000000000001',
      createdAt: new Date('2026-04-08T10:00:00Z'),
      updatedAt: new Date('2026-04-08T10:00:00Z'),
      createdBy: 'cccccccc-0000-0000-0000-000000000001',
      updatedBy: null,
      deletedAt: null,
    },
    {
      id: 'pc-002',
      tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
      assignmentId: 'asgn-001',
      loadId: 'load-001',
      driverId: 'bbbbbbbb-0000-0000-0000-000000000001',
      stopId: null,
      componentType: 'DETENTION' as const,
      category: 'ACCESSORIAL' as const,
      description: 'Detention — 4 hours @ $25/hr',
      quantity: dec('4'),
      unit: 'HOURS' as const,
      rate: dec('25.00'),
      multiplier: dec('1.00'),
      grossAmount: dec('100.00'),
      isTaxable: true,
      isReimbursement: false,
      originalComponentId: null,
      visibleToDriver: true,
      notes: null,
      enteredBy: 'cccccccc-0000-0000-0000-000000000001',
      createdAt: new Date('2026-04-08T10:00:00Z'),
      updatedAt: new Date('2026-04-08T10:00:00Z'),
      createdBy: 'cccccccc-0000-0000-0000-000000000001',
      updatedBy: null,
      deletedAt: null,
    },
    {
      id: 'pc-003',
      tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
      assignmentId: 'asgn-001',
      loadId: 'load-001',
      driverId: 'bbbbbbbb-0000-0000-0000-000000000001',
      stopId: null,
      componentType: 'GARNISHMENT' as const,
      category: 'DEDUCTION' as const,
      description: 'Uniform deduction',
      quantity: dec('1'),
      unit: 'FLAT' as const,
      rate: dec('-25.50'),
      multiplier: dec('1.00'),
      grossAmount: dec('-25.50'),
      isTaxable: false,
      isReimbursement: false,
      originalComponentId: null,
      visibleToDriver: true,
      notes: null,
      enteredBy: 'cccccccc-0000-0000-0000-000000000001',
      createdAt: new Date('2026-04-08T10:00:00Z'),
      updatedAt: new Date('2026-04-08T10:00:00Z'),
      createdBy: 'cccccccc-0000-0000-0000-000000000001',
      updatedBy: null,
      deletedAt: null,
    },
  ],
  bonuses: [
    {
      id: 'bonus-001',
      tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
      driverId: 'bbbbbbbb-0000-0000-0000-000000000001',
      bonusType: 'SAFETY' as const,
      amount: dec('100.00'),
      description: 'Safety bonus Q2',
      triggerDate: new Date('2026-04-07'),
      scheduledPayDate: null,
      paidAt: null,
      installmentNumber: null,
      totalInstallments: null,
      parentBonusId: null,
      referredDriverId: null,
      settlementId: '11111111-0000-0000-0000-000000000001',
      isTaxable: true,
      visibleToDriver: true,
      notes: null,
      createdAt: new Date('2026-04-08T10:00:00Z'),
      updatedAt: new Date('2026-04-08T10:00:00Z'),
      createdBy: 'cccccccc-0000-0000-0000-000000000001',
      updatedBy: null,
      deletedAt: null,
    },
    {
      id: 'bonus-002',
      tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
      driverId: 'bbbbbbbb-0000-0000-0000-000000000001',
      bonusType: 'PERFORMANCE' as const,
      amount: dec('50.00'),
      description: 'Performance bonus',
      triggerDate: new Date('2026-04-07'),
      scheduledPayDate: null,
      paidAt: null,
      installmentNumber: null,
      totalInstallments: null,
      parentBonusId: null,
      referredDriverId: null,
      settlementId: '11111111-0000-0000-0000-000000000001',
      isTaxable: true,
      visibleToDriver: true,
      notes: null,
      createdAt: new Date('2026-04-08T10:00:00Z'),
      updatedAt: new Date('2026-04-08T10:00:00Z'),
      createdBy: 'cccccccc-0000-0000-0000-000000000001',
      updatedBy: null,
      deletedAt: null,
    },
  ],
  deductionsSnapshot: [
    { deductionId: 'ded-001', description: 'Uniform', amount: '-25.50', type: 'EQUIPMENT' },
    { deductionId: 'ded-002', description: 'Garnishment', amount: '-400.00', type: 'GARNISHMENT' },
  ],
};

// ---------------------------------------------------------------------------
// 1099 fixture
//
// Driver: FIRST_1099 LAST_1099, OWNER_OPERATOR_1099
// Period: 2026-04-01 → 2026-04-07
// Finalized: 2026-04-08T12:00:00Z
// grossTaxable: 3800.00, grossNonTaxable: 0, totalDeductions: 950.00, netPay: 2850.00
// Components: 2x percentage-of-revenue with qty=2 (tests quantity>1 case)
// Bonuses: referral $200
// Deductions: truck-lease -$950 qty=1
// ---------------------------------------------------------------------------

export const c1099Settlement: SettlementWithLines = {
  settlement: {
    id: '22222222-0000-0000-0000-000000000002',
    tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
    driverId: 'dddddddd-0000-0000-0000-000000000002',
    periodStart: new Date('2026-04-01'),
    periodEnd: new Date('2026-04-07'),
    status: 'FINALIZED' as const,
    grossTaxable: dec('3800.00'),
    grossNonTaxable: dec('0.00'),
    totalDeductions: dec('950.00'),
    netPay: dec('2850.00'),
    finalizedBy: 'cccccccc-0000-0000-0000-000000000001',
    finalizedAt: new Date('2026-04-08T12:00:00Z'),
    paidAt: null,
    settlementReference: 'SET-2026-04-1099-001',
    pdfUrl: null,
    notes: JSON.stringify({
      _deductionsApplied: [
        { deductionId: 'ded-003', description: 'Truck Lease', amount: '-950.00', type: 'LEASE' },
      ],
    }),
    employmentTypeSnapshot: 'OWNER_OPERATOR_1099' as const,
    createdAt: new Date('2026-04-08T10:00:00Z'),
    updatedAt: new Date('2026-04-08T12:00:00Z'),
    createdBy: 'cccccccc-0000-0000-0000-000000000001',
    updatedBy: null,
    deletedAt: null,
    driver: {
      id: 'dddddddd-0000-0000-0000-000000000002',
      firstName: 'FIRST_1099',
      lastName: 'LAST_1099',
      email: 'c1099.driver+test@example.invalid',
      phone: null,
    },
  },
  // Two pay components with quantity=2 — tests quantity>1 multiplier path (Phase 4 lesson)
  payComponents: [
    {
      id: 'pc-004',
      tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
      assignmentId: 'asgn-002',
      loadId: 'load-002',
      driverId: 'dddddddd-0000-0000-0000-000000000002',
      stopId: null,
      componentType: 'BASE_PAY_PERCENTAGE' as const,
      category: 'EARNING' as const,
      description: '75% of load revenue — Load 1',
      quantity: dec('2'),    // qty=2 to test quantity>1
      unit: 'PERCENTAGE' as const,
      rate: dec('75.00'),
      multiplier: dec('1.00'),
      grossAmount: dec('1900.00'),
      isTaxable: true,
      isReimbursement: false,
      originalComponentId: null,
      visibleToDriver: true,
      notes: null,
      enteredBy: 'cccccccc-0000-0000-0000-000000000001',
      createdAt: new Date('2026-04-08T10:00:00Z'),
      updatedAt: new Date('2026-04-08T10:00:00Z'),
      createdBy: 'cccccccc-0000-0000-0000-000000000001',
      updatedBy: null,
      deletedAt: null,
    },
    {
      id: 'pc-005',
      tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
      assignmentId: 'asgn-002',
      loadId: 'load-003',
      driverId: 'dddddddd-0000-0000-0000-000000000002',
      stopId: null,
      componentType: 'BASE_PAY_PERCENTAGE' as const,
      category: 'EARNING' as const,
      description: '75% of load revenue — Load 2',
      quantity: dec('2'),    // qty=2 to test quantity>1
      unit: 'PERCENTAGE' as const,
      rate: dec('75.00'),
      multiplier: dec('1.00'),
      grossAmount: dec('1900.00'),
      isTaxable: true,
      isReimbursement: false,
      originalComponentId: null,
      visibleToDriver: true,
      notes: null,
      enteredBy: 'cccccccc-0000-0000-0000-000000000001',
      createdAt: new Date('2026-04-08T10:00:00Z'),
      updatedAt: new Date('2026-04-08T10:00:00Z'),
      createdBy: 'cccccccc-0000-0000-0000-000000000001',
      updatedBy: null,
      deletedAt: null,
    },
  ],
  bonuses: [
    {
      id: 'bonus-003',
      tenantId: 'aaaaaaaa-0000-0000-0000-000000000001',
      driverId: 'dddddddd-0000-0000-0000-000000000002',
      bonusType: 'REFERRAL' as const,
      amount: dec('200.00'),
      description: 'Referral bonus',
      triggerDate: new Date('2026-04-07'),
      scheduledPayDate: null,
      paidAt: null,
      installmentNumber: null,
      totalInstallments: null,
      parentBonusId: null,
      referredDriverId: null,
      settlementId: '22222222-0000-0000-0000-000000000002',
      isTaxable: true,
      visibleToDriver: true,
      notes: null,
      createdAt: new Date('2026-04-08T10:00:00Z'),
      updatedAt: new Date('2026-04-08T10:00:00Z'),
      createdBy: 'cccccccc-0000-0000-0000-000000000001',
      updatedBy: null,
      deletedAt: null,
    },
  ],
  deductionsSnapshot: [
    { deductionId: 'ded-003', description: 'Truck Lease', amount: '-950.00', type: 'LEASE' },
  ],
};
