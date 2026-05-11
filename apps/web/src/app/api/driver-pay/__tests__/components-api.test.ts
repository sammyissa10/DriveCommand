import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/supabase', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  requireTenantId: vi.fn().mockResolvedValue('tenant-123'),
  getTenantPrisma: vi.fn(),
}));

vi.mock('@/lib/driver-pay/calculator', () => ({
  computeGrossAmount: vi
    .fn()
    .mockReturnValue({ neg: () => ({ toString: () => '-50.00' }), toString: () => '50.00' }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import {
  GET,
  POST,
} from '@/app/api/driver-pay/assignments/[assignmentId]/components/route';
import {
  PATCH,
  DELETE,
} from '@/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrisma(overrides: Partial<Record<string, object>> = {}) {
  return {
    loadDriverAssignment: { findFirst: vi.fn() },
    loadPayComponent: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    ...overrides,
  };
}

function makeReq(method: string, body?: object) {
  const url = new URL('http://localhost/api/driver-pay/assignments/test-assign/components');
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Minimal fake component row (satisfies serializeComponent shape)
const fakeComponent = {
  id: 'comp-1',
  tenantId: 'tenant-123',
  assignmentId: 'assign-1',
  loadId: 'load-1',
  driverId: 'driver-1',
  stopId: null,
  componentType: 'BASE_PAY_FLAT',
  category: 'EARNING',
  description: 'Base pay',
  quantity: { toString: () => '1' },
  unit: 'FLAT',
  rate: { toString: () => '50' },
  multiplier: { toString: () => '1' },
  grossAmount: { toString: () => '50.00' },
  isTaxable: true,
  isReimbursement: false,
  originalComponentId: null,
  visibleToDriver: true,
  notes: null,
  enteredBy: 'owner-1',
  createdAt: new Date('2026-05-01T00:00:00Z'),
  updatedAt: new Date('2026-05-01T00:00:00Z'),
  createdBy: 'owner-1',
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /components', () => {
  it('returns components; driver sees only visibleToDriver=true', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'driver-1',
      email: 'driver@test.com',
      role: 'driver',
      tenantId: 'tenant-123',
    });

    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'assign-1',
          driverId: 'driver-1',
          payStatus: 'DRAFT',
          tenantId: 'tenant-123',
        }),
      },
      loadPayComponent: {
        findMany: vi.fn().mockResolvedValue([{ ...fakeComponent, visibleToDriver: true }]),
        create: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await GET(makeReq('GET'), {
      params: Promise.resolve({ assignmentId: 'assign-1' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.components).toHaveLength(1);

    const findManyCall = mockPrisma.loadPayComponent.findMany.mock.calls[0][0];
    expect(findManyCall.where).toMatchObject({ visibleToDriver: true });
  });
});

describe('POST /components', () => {
  it('creates component; category enforcement applies negation for DEDUCTION', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'owner-1',
      email: 'owner@test.com',
      role: 'owner',
      tenantId: 'tenant-123',
    });

    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'assign-1',
          driverId: 'driver-1',
          payStatus: 'DRAFT',
          tenantId: 'tenant-123',
          loadId: 'load-1',
        }),
      },
      loadPayComponent: {
        findMany: vi.fn(),
        create: vi.fn().mockResolvedValue(fakeComponent),
        update: vi.fn(),
        findFirst: vi.fn(),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await POST(
      makeReq('POST', {
        componentType: 'ADVANCE_REPAYMENT',
        category: 'DEDUCTION',
        description: 'Advance repayment',
        quantity: '1',
        unit: 'FLAT',
        rate: '50',
        multiplier: '1',
        isTaxable: true,
        isReimbursement: false,
        visibleToDriver: true,
      }),
      { params: Promise.resolve({ assignmentId: 'assign-1' }) },
    );

    expect(res.status).toBe(201);
    expect(mockPrisma.loadPayComponent.create).toHaveBeenCalled();

    // Verify negation: DEDUCTION category → .neg() was applied
    // The mock computeGrossAmount returns an object with .neg() that returns { toString: () => '-50.00' }
    const createData = mockPrisma.loadPayComponent.create.mock.calls[0][0].data;
    // grossAmount should be the negated value (the .neg() result from the mock)
    expect(createData.grossAmount.toString()).toBe('-50.00');
  });
});

describe('PATCH /components/:componentId', () => {
  it('returns 409 when assignment is PAID', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'owner-1',
      email: 'owner@test.com',
      role: 'owner',
      tenantId: 'tenant-123',
    });

    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'assign-1',
          driverId: 'driver-1',
          payStatus: 'PAID',
          tenantId: 'tenant-123',
        }),
      },
      loadPayComponent: {
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await PATCH(makeReq('PATCH', { description: 'Updated' }), {
      params: Promise.resolve({ assignmentId: 'assign-1', componentId: 'comp-1' }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('paid assignment');
  });
});

describe('DELETE /components/:componentId', () => {
  it('returns 409 when assignment is PAID', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'owner-1',
      email: 'owner@test.com',
      role: 'owner',
      tenantId: 'tenant-123',
    });

    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'assign-1',
          driverId: 'driver-1',
          payStatus: 'PAID',
          tenantId: 'tenant-123',
        }),
      },
      loadPayComponent: {
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await DELETE(makeReq('DELETE'), {
      params: Promise.resolve({ assignmentId: 'assign-1', componentId: 'comp-1' }),
    });

    expect(res.status).toBe(409);
  });

  it('soft-deletes component on DRAFT assignment (sets deletedAt)', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'owner-1',
      email: 'owner@test.com',
      role: 'owner',
      tenantId: 'tenant-123',
    });

    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'assign-1',
          driverId: 'driver-1',
          payStatus: 'DRAFT',
          tenantId: 'tenant-123',
        }),
      },
      loadPayComponent: {
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({ ...fakeComponent, deletedAt: new Date() }),
        findFirst: vi.fn().mockResolvedValue({ ...fakeComponent, deletedAt: null }),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await DELETE(makeReq('DELETE'), {
      params: Promise.resolve({ assignmentId: 'assign-1', componentId: 'comp-1' }),
    });

    expect(res.status).toBe(200);
    expect(mockPrisma.loadPayComponent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    );
  });
});

describe('Tenant isolation', () => {
  it('driver cannot access another driver\'s assignment components (403)', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'driver-1',
      email: 'driver@test.com',
      role: 'driver',
      tenantId: 'tenant-123',
    });

    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'assign-1',
          driverId: 'other-driver', // does NOT match session.userId
          payStatus: 'DRAFT',
          tenantId: 'tenant-123',
        }),
      },
      loadPayComponent: {
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await GET(makeReq('GET'), {
      params: Promise.resolve({ assignmentId: 'assign-1' }),
    });

    expect(res.status).toBe(403);
  });
});
