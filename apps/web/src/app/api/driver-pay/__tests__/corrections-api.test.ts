import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/supabase', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrisma: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { POST } from '@/app/api/driver-pay/assignments/[assignmentId]/corrections/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ASSIGNMENT_ID = 'assign-uuid-456';
const COMPONENT_ID = 'comp-uuid-789';

function makeReq(body: object) {
  const url = new URL(
    `http://localhost/api/driver-pay/assignments/${ASSIGNMENT_ID}/corrections`,
  );
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const mockParams = { params: Promise.resolve({ assignmentId: ASSIGNMENT_ID }) };

function makeDbAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ASSIGNMENT_ID,
    tenantId: 'tenant-123',
    loadId: 'load-123',
    driverId: 'driver-123',
    driverRole: 'MAIN_DRIVER',
    payType: 'FLAT_PER_LOAD',
    payStatus: 'PAID',
    baseRate: { toString: () => '500.00' },
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makeDbComponent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: COMPONENT_ID,
    tenantId: 'tenant-123',
    assignmentId: ASSIGNMENT_ID,
    loadId: 'load-123',
    driverId: 'driver-123',
    stopId: null,
    componentType: 'ADJUSTMENT_NEGATIVE',
    category: 'ADJUSTMENT',
    description: 'Correction: test reason here',
    quantity: { toString: () => '1' },
    unit: 'FLAT',
    rate: { toString: () => '-50.00' },
    multiplier: { toString: () => '1' },
    grossAmount: { toString: () => '-50.00' },
    isTaxable: true,
    isReimbursement: false,
    originalComponentId: null,
    visibleToDriver: true,
    notes: 'test reason here',
    enteredBy: 'owner-1',
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    createdBy: 'owner-1',
    deletedAt: null,
    ...overrides,
  };
}

function makePrismaWithAssignment(assignmentStatus = 'PAID', componentOverrides: Partial<Record<string, unknown>> = {}) {
  const transaction = vi.fn().mockImplementation((ops: unknown[]) => Promise.all(ops));

  return {
    loadDriverAssignment: {
      findFirst: vi.fn().mockResolvedValue(makeDbAssignment({ payStatus: assignmentStatus })),
      update: vi.fn().mockResolvedValue(makeDbAssignment({ payStatus: 'CORRECTED' })),
    },
    loadPayComponent: {
      findFirst: vi.fn().mockResolvedValue(makeDbComponent()),
      create: vi.fn().mockResolvedValue(makeDbComponent(componentOverrides)),
    },
    driverPayAuditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
    $transaction: transaction,
  };
}

const ownerSession = {
  userId: 'owner-1',
  email: 'owner@test.com',
  role: 'OWNER',
  tenantId: 'tenant-123',
};

const validBody = {
  reason: 'This is a correction reason long enough',
  amount: '50.00',
  type: 'NEGATIVE',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /corrections — auth', () => {
  it('1. Unauthenticated → 401', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const res = await POST(makeReq(validBody), mockParams);
    expect(res.status).toBe(401);
  });
});

describe('POST /corrections — RBAC', () => {
  it('2. DRIVER role → 403', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'driver-1',
      email: 'd@test.com',
      role: 'DRIVER',
      tenantId: 'tenant-123',
    });
    const res = await POST(makeReq(validBody), mockParams);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Drivers cannot');
  });
});

describe('POST /corrections — body validation', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(ownerSession);
  });

  it('3. Reason too short (<10 chars) → 400', async () => {
    const res = await POST(makeReq({ ...validBody, reason: 'short' }), mockParams);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('10 characters');
  });

  it('4. Amount = "0" → 400', async () => {
    const res = await POST(makeReq({ ...validBody, amount: '0' }), mockParams);
    expect(res.status).toBe(400);
  });

  it('5. Type missing → 400', async () => {
    const { type: _type, ...bodyWithoutType } = validBody;
    const res = await POST(makeReq(bodyWithoutType), mockParams);
    expect(res.status).toBe(400);
  });
});

describe('POST /corrections — business rules', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(ownerSession);
  });

  it('6. Assignment not found → 404', async () => {
    const mockPrisma = makePrismaWithAssignment();
    mockPrisma.loadDriverAssignment.findFirst = vi.fn().mockResolvedValue(null);
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await POST(makeReq(validBody), mockParams);
    expect(res.status).toBe(404);
  });

  it('7. Assignment in DRAFT → 422 with "not been paid yet" message', async () => {
    const mockPrisma = makePrismaWithAssignment('DRAFT');
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await POST(makeReq(validBody), mockParams);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('not been paid yet');
  });

  it('8. Assignment in PENDING_REVIEW → 422', async () => {
    const mockPrisma = makePrismaWithAssignment('PENDING_REVIEW');
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await POST(makeReq(validBody), mockParams);
    expect(res.status).toBe(422);
  });

  it('9. Assignment in APPROVED → 422', async () => {
    const mockPrisma = makePrismaWithAssignment('APPROVED');
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await POST(makeReq(validBody), mockParams);
    expect(res.status).toBe(422);
  });

  it('10. originalComponentId doesnt belong to assignment → 422', async () => {
    const mockPrisma = makePrismaWithAssignment('PAID');
    mockPrisma.loadPayComponent.findFirst = vi.fn().mockResolvedValue(null);
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await POST(
      makeReq({ ...validBody, originalComponentId: '550e8400-e29b-41d4-a716-446655440001' }),
      mockParams,
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('Original component not found');
  });

  it('11. Sign correctness — POSITIVE: creates ADJUSTMENT_POSITIVE with positive grossAmount', async () => {
    const mockPrisma = makePrismaWithAssignment('PAID', {
      componentType: 'ADJUSTMENT_POSITIVE',
      grossAmount: { toString: () => '50' },
      rate: { toString: () => '50' },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await POST(
      makeReq({ ...validBody, amount: '50.00', type: 'POSITIVE' }),
      mockParams,
    );
    expect(res.status).toBe(201);

    const createCall = mockPrisma.loadPayComponent.create.mock.calls[0][0];
    expect(createCall.data.componentType).toBe('ADJUSTMENT_POSITIVE');
    // grossAmount should be positive (Decimal '50')
    const grossStr = createCall.data.grossAmount.toString();
    expect(Number(grossStr)).toBeGreaterThan(0);
  });

  it('12. Sign correctness — NEGATIVE: creates ADJUSTMENT_NEGATIVE with negative grossAmount', async () => {
    const mockPrisma = makePrismaWithAssignment('PAID', {
      componentType: 'ADJUSTMENT_NEGATIVE',
      grossAmount: { toString: () => '-50' },
      rate: { toString: () => '-50' },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await POST(
      makeReq({ ...validBody, amount: '50.00', type: 'NEGATIVE' }),
      mockParams,
    );
    expect(res.status).toBe(201);

    const createCall = mockPrisma.loadPayComponent.create.mock.calls[0][0];
    expect(createCall.data.componentType).toBe('ADJUSTMENT_NEGATIVE');
    const grossStr = createCall.data.grossAmount.toString();
    expect(Number(grossStr)).toBeLessThan(0);
  });

  it('13. Absolute value handling: amount="-25.00", type="NEGATIVE" → grossAmount is -25 (not double-negate)', async () => {
    const mockPrisma = makePrismaWithAssignment('PAID');
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    await POST(
      makeReq({ ...validBody, amount: '-25.00', type: 'NEGATIVE' }),
      mockParams,
    );

    const createCall = mockPrisma.loadPayComponent.create.mock.calls[0][0];
    // abs(-25) = 25, then neg() = -25
    expect(createCall.data.grossAmount.toString()).toBe('-25');
  });

  it('14. Status flips: PAID → CORRECTED', async () => {
    const mockPrisma = makePrismaWithAssignment('PAID');
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await POST(makeReq(validBody), mockParams);
    expect(res.status).toBe(201);

    expect(mockPrisma.loadDriverAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { payStatus: 'CORRECTED' },
      }),
    );
  });

  it('15. CORRECTED → CORRECTED still allowed (multiple corrections)', async () => {
    const mockPrisma = makePrismaWithAssignment('CORRECTED');
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await POST(makeReq(validBody), mockParams);
    expect(res.status).toBe(201);
  });

  it('16. Audit log: driverPayAuditLog.create called with correct shape', async () => {
    const mockPrisma = makePrismaWithAssignment('PAID');
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    await POST(makeReq(validBody), mockParams);

    const auditCall = mockPrisma.driverPayAuditLog.create.mock.calls[0][0];
    expect(auditCall.data.entityType).toBe('LoadDriverAssignment');
    expect(auditCall.data.entityId).toBe(ASSIGNMENT_ID);
    expect(auditCall.data.action).toBe('correction:PAID->CORRECTED');
    expect(auditCall.data.previousValue).toEqual({ status: 'PAID' });
    expect(auditCall.data.newValue).toMatchObject({
      status: 'CORRECTED',
      reason: validBody.reason,
    });
  });

  it('17. Transaction: $transaction called once with three operations', async () => {
    const mockPrisma = makePrismaWithAssignment('PAID');
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    await POST(makeReq(validBody), mockParams);

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    const txArgs = mockPrisma.$transaction.mock.calls[0][0] as unknown[];
    expect(txArgs).toHaveLength(3);
  });

  it('18. Cross-tenant: tenant-scoped prisma returns null on findFirst → 404', async () => {
    const mockPrisma = makePrismaWithAssignment('PAID');
    mockPrisma.loadDriverAssignment.findFirst = vi.fn().mockResolvedValue(null);
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await POST(makeReq(validBody), mockParams);
    expect(res.status).toBe(404);
  });
});
