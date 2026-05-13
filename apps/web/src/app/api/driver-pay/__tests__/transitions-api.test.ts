import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/supabase', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrisma: vi.fn(),
}));

// Mock the state machine so we test API plumbing, not FSM logic
vi.mock('@/lib/driver-pay/state-machine', () => ({
  canTransition: vi.fn(),
  nextStatusFor: vi.fn(),
  TRANSITION_LABELS: {
    submit: 'Submitted for review',
    approve: 'Approved',
    dispute: 'Disputed',
    correct: 'Corrected',
    reject: 'Rejected — sent back to draft',
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/driver-pay/auto-base-pay', () => ({
  ensureBasePayComponent: vi.fn().mockResolvedValue(undefined),
}));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { canTransition } from '@/lib/driver-pay/state-machine';
import { ensureBasePayComponent } from '@/lib/driver-pay/auto-base-pay';
import { POST } from '@/app/api/driver-pay/assignments/[assignmentId]/transitions/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ASSIGNMENT_ID = 'assign-uuid-123';

function makePrisma(overrides: Partial<Record<string, object>> = {}) {
  const transaction = vi.fn().mockImplementation((ops: unknown[]) => Promise.all(ops));

  return {
    loadDriverAssignment: {
      findFirst: vi.fn().mockResolvedValue(makeDbAssignment()),
      update: vi.fn().mockResolvedValue(makeDbAssignment({ payStatus: 'PENDING_REVIEW' })),
    },
    loadPayComponent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    driverPayAuditLog: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
    $transaction: transaction,
    ...overrides,
  };
}

function makeDbAssignment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ASSIGNMENT_ID,
    tenantId: 'tenant-123',
    loadId: 'load-123',
    driverId: 'driver-123',
    driverRole: 'MAIN_DRIVER',
    payType: 'FLAT_PER_LOAD',
    baseRate: { toString: () => '500.00' },
    rateUnit: 'PER_LOAD',
    currency: 'USD',
    payStatus: 'DRAFT',
    actualMiles: null,
    estimatedMiles: null,
    mileageSource: null,
    actualHours: null,
    estimatedHours: null,
    loadRevenue: null,
    overrideReason: null,
    approvedBy: null,
    approvedAt: null,
    settlementId: null,
    createdAt: new Date('2026-05-01T00:00:00Z'),
    updatedAt: new Date('2026-05-01T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makeReq(body: object, headers: Record<string, string> = {}) {
  const url = new URL(
    `http://localhost/api/driver-pay/assignments/${ASSIGNMENT_ID}/transitions`,
  );
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

const mockParams = { params: Promise.resolve({ assignmentId: ASSIGNMENT_ID }) };

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /transitions — auth', () => {
  it('1. returns 401 when unauthenticated', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await POST(makeReq({ action: 'submit' }), mockParams);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });
});

describe('POST /transitions — RBAC', () => {
  it('2. DRIVER role + submit → 403', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'driver-1',
      email: 'driver@test.com',
      role: 'DRIVER',
      tenantId: 'tenant-123',
    });

    const res = await POST(makeReq({ action: 'submit' }), mockParams);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Drivers cannot');
  });

  it('2b. driver (lowercase) role → 403', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'driver-1',
      email: 'driver@test.com',
      role: 'driver',
      tenantId: 'tenant-123',
    });

    const res = await POST(makeReq({ action: 'submit' }), mockParams);
    expect(res.status).toBe(403);
  });
});

describe('POST /transitions — body validation', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'owner-1',
      email: 'owner@test.com',
      role: 'owner',
      tenantId: 'tenant-123',
    });
  });

  it('3. Missing action field → 400', async () => {
    const res = await POST(makeReq({}), mockParams);
    expect(res.status).toBe(400);
  });

  it('4. Invalid action value → 400', async () => {
    const res = await POST(makeReq({ action: 'WRONG_ACTION' }), mockParams);
    expect(res.status).toBe(400);
  });
});

describe('POST /transitions — business rules', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'owner-1',
      email: 'owner@test.com',
      role: 'OWNER',
      tenantId: 'tenant-123',
    });
  });

  it('5. Dispute without reason → 422', async () => {
    const mockPrisma = makePrisma();
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);
    vi.mocked(canTransition).mockReturnValue({ ok: true, nextStatus: 'DISPUTED' });

    // No reason provided
    const res = await POST(makeReq({ action: 'dispute' }), mockParams);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('A reason is required.');
  });

  it('5b. Dispute with too-short reason → 422', async () => {
    const mockPrisma = makePrisma();
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);
    vi.mocked(canTransition).mockReturnValue({ ok: true, nextStatus: 'DISPUTED' });

    const res = await POST(makeReq({ action: 'dispute', reason: 'short' }), mockParams);
    expect(res.status).toBe(422);
  });

  it('6. Assignment not found → 404', async () => {
    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await POST(makeReq({ action: 'submit' }), mockParams);
    expect(res.status).toBe(404);
  });

  it('7. Happy path — canTransition ok → 200 + update + audit log', async () => {
    const mockPrisma = makePrisma();
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);
    vi.mocked(canTransition).mockReturnValue({ ok: true, nextStatus: 'PENDING_REVIEW' });

    const res = await POST(makeReq({ action: 'submit' }), mockParams);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignment).toBeDefined();

    // Verify $transaction was called
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    // Verify update was called
    expect(mockPrisma.loadDriverAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ASSIGNMENT_ID },
        data: expect.objectContaining({ payStatus: 'PENDING_REVIEW' }),
      }),
    );

    // Verify audit log was created
    expect(mockPrisma.driverPayAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'status:DRAFT->PENDING_REVIEW',
          previousValue: { status: 'DRAFT' },
        }),
      }),
    );
  });

  it('8. Pre-condition fail — canTransition returns ok:false → 422 with error + actionHint', async () => {
    const mockPrisma = makePrisma();
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);
    vi.mocked(canTransition).mockReturnValue({
      ok: false,
      reason: 'X reason',
      actionHint: 'Y hint',
    });

    const res = await POST(makeReq({ action: 'submit' }), mockParams);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe('X reason');
    expect(body.actionHint).toBe('Y hint');
  });

  it('9. Cross-tenant — findFirst returns null → 404', async () => {
    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await POST(makeReq({ action: 'submit' }), mockParams);
    expect(res.status).toBe(404);
  });

  it('10. Correction via this endpoint → 422 with "Use the Corrections API" message', async () => {
    const mockPrisma = makePrisma();
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await POST(makeReq({ action: 'correct' }), mockParams);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('Corrections API');
  });

  it('11. IP capture — audit log includes IP from x-forwarded-for', async () => {
    const mockPrisma = makePrisma();
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);
    vi.mocked(canTransition).mockReturnValue({ ok: true, nextStatus: 'PENDING_REVIEW' });

    const res = await POST(
      makeReq({ action: 'submit' }, { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }),
      mockParams,
    );
    expect(res.status).toBe(200);

    const auditCall = mockPrisma.driverPayAuditLog.create.mock.calls[0][0];
    expect(auditCall.data.ipAddress).toBe('1.2.3.4');
  });

  it('12. Transaction usage — $transaction called once', async () => {
    const mockPrisma = makePrisma();
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);
    vi.mocked(canTransition).mockReturnValue({ ok: true, nextStatus: 'APPROVED' });

    const res = await POST(makeReq({ action: 'approve' }), mockParams);
    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

    // Approve sets approvedAt + approvedBy
    expect(mockPrisma.loadDriverAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approvedAt: expect.any(Date),
          approvedBy: 'owner-1',
        }),
      }),
    );
  });
});

describe('POST /transitions — submit auto-base-pay wiring', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'owner-1',
      email: 'owner@test.com',
      role: 'OWNER',
      tenantId: 'tenant-123',
    });
  });

  it('13. CPM with actualMiles → ensureBasePayComponent called once', async () => {
    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue(
          makeDbAssignment({
            payType: 'CPM',
            actualMiles: { toString: () => '412' },
            estimatedMiles: { toString: () => '400' },
            payStatus: 'DRAFT',
          }),
        ),
        update: vi.fn().mockResolvedValue(makeDbAssignment({ payStatus: 'PENDING_REVIEW' })),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);
    vi.mocked(canTransition).mockReturnValue({ ok: true, nextStatus: 'PENDING_REVIEW' });

    const res = await POST(makeReq({ action: 'submit' }), mockParams);
    expect(res.status).toBe(200);
    expect(ensureBasePayComponent).toHaveBeenCalledTimes(1);
    expect(ensureBasePayComponent).toHaveBeenCalledWith(
      ASSIGNMENT_ID,
      'tenant-123',
      expect.anything(),
      expect.any(String),
    );
  });

  it('14. FLAT_PER_LOAD always calls ensureBasePayComponent (no quantity fields needed)', async () => {
    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue(
          makeDbAssignment({
            payType: 'FLAT_PER_LOAD',
            actualMiles: null,
            estimatedMiles: null,
            payStatus: 'DRAFT',
          }),
        ),
        update: vi.fn().mockResolvedValue(makeDbAssignment({ payStatus: 'PENDING_REVIEW' })),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);
    vi.mocked(canTransition).mockReturnValue({ ok: true, nextStatus: 'PENDING_REVIEW' });

    const res = await POST(makeReq({ action: 'submit' }), mockParams);
    expect(res.status).toBe(200);
    expect(ensureBasePayComponent).toHaveBeenCalledTimes(1);
  });

  it('15. CPM with no miles → ensureBasePayComponent NOT called, returns 422 from FSM', async () => {
    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue(
          makeDbAssignment({
            payType: 'CPM',
            actualMiles: null,
            estimatedMiles: null,
            payStatus: 'DRAFT',
          }),
        ),
        update: vi.fn(),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);
    vi.mocked(canTransition).mockReturnValue({
      ok: false,
      reason: 'Add a base pay component before submitting.',
      actionHint: 'add-base-pay',
    });

    const res = await POST(makeReq({ action: 'submit' }), mockParams);
    expect(res.status).toBe(422);
    expect(ensureBasePayComponent).not.toHaveBeenCalled();
  });
});
