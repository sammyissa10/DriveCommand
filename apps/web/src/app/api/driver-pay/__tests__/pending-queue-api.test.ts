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
import { GET } from '@/app/api/driver-pay/pending-queue/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(queryParams: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/driver-pay/pending-queue');
  for (const [key, val] of Object.entries(queryParams)) {
    url.searchParams.set(key, val);
  }
  return new NextRequest(url, { method: 'GET' });
}

function makePrisma(overrides: Partial<Record<string, object>> = {}) {
  return {
    loadDriverAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    ...overrides,
  };
}

function makeDbRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'assign-1',
    tenantId: 'tenant-123',
    loadId: 'load-1',
    driverId: 'driver-1',
    payType: 'FLAT_PER_LOAD',
    payStatus: 'PENDING_REVIEW',
    overrideReason: null,
    createdAt: new Date(Date.now() - 86400000 * 3), // 3 days ago
    updatedAt: new Date(),
    driver: { id: 'driver-1', firstName: 'Jane', lastName: 'Doe' },
    load: { id: 'load-1', loadNumber: 'L-001' },
    payComponents: [
      { grossAmount: { toString: () => '500.00' } },
      { grossAmount: { toString: () => '50.00' } },
    ],
    ...overrides,
  };
}

const ownerSession = {
  userId: 'owner-1',
  email: 'owner@test.com',
  role: 'OWNER',
  tenantId: 'tenant-123',
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /pending-queue — auth', () => {
  it('1. Unauthenticated → 401', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });
});

describe('GET /pending-queue — RBAC', () => {
  it('2. DRIVER role → 403', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'driver-1',
      email: 'd@test.com',
      role: 'DRIVER',
      tenantId: 'tenant-123',
    });

    const res = await GET(makeReq());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Drivers cannot');
  });
});

describe('GET /pending-queue — full mode', () => {
  beforeEach(() => {
    vi.mocked(getSession).mockResolvedValue(ownerSession);
  });

  it('3. Default call returns assignments in PENDING_REVIEW + DISPUTED, sorted oldest first', async () => {
    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findMany: vi.fn().mockResolvedValue([
          makeDbRow({ payStatus: 'PENDING_REVIEW' }),
          makeDbRow({ id: 'assign-2', payStatus: 'DISPUTED', driver: { id: 'driver-2', firstName: 'Bob', lastName: 'Smith' }, load: { id: 'load-2', loadNumber: 'L-002' }, payComponents: [] }),
        ]),
        count: vi.fn().mockResolvedValue(0),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignments).toHaveLength(2);
    expect(body.count).toBe(2);

    const findManyCall = (mockPrisma.loadDriverAssignment.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(findManyCall.where.payStatus).toEqual({ in: ['PENDING_REVIEW', 'DISPUTED'] });
    expect(findManyCall.orderBy).toEqual({ createdAt: 'asc' });
  });

  it('4. countOnly=true → returns count of PENDING_REVIEW only', async () => {
    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findMany: vi.fn(),
        count: vi.fn().mockResolvedValue(5),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await GET(makeReq({ countOnly: 'true' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(5);
    expect(body.assignments).toBeUndefined();

    // count query should filter to PENDING_REVIEW only
    const countCall = (mockPrisma.loadDriverAssignment.count as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(countCall.where.payStatus).toBe('PENDING_REVIEW');
  });

  it('5. Filter by driverId → where clause includes it', async () => {
    const findManyMock = vi.fn().mockResolvedValue([]);
    const mockPrisma = {
      loadDriverAssignment: {
        findMany: findManyMock,
        count: vi.fn().mockResolvedValue(0),
      },
    };
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const validDriverId = '550e8400-e29b-41d4-a716-446655440000';
    await GET(makeReq({ driverId: validDriverId }));

    expect(findManyMock).toHaveBeenCalledTimes(1);
    const findManyCall = findManyMock.mock.calls[0][0];
    expect(findManyCall.where.driverId).toBe(validDriverId);
  });

  it('6. Filter by overrideOnly=true → where clause includes overrideReason not null', async () => {
    const findManyMock = vi.fn().mockResolvedValue([]);
    const mockPrisma = {
      loadDriverAssignment: {
        findMany: findManyMock,
        count: vi.fn().mockResolvedValue(0),
      },
    };
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    await GET(makeReq({ overrideOnly: 'true' }));

    expect(findManyMock).toHaveBeenCalledTimes(1);
    const findManyCall = findManyMock.mock.calls[0][0];
    expect(findManyCall.where.overrideReason).toEqual({ not: null });
  });

  it('7. minAmount=600 filters out rows with totalPay < 600', async () => {
    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findMany: vi.fn().mockResolvedValue([
          makeDbRow({ id: 'assign-low', payComponents: [{ grossAmount: { toString: () => '100.00' } }] }),
          makeDbRow({ id: 'assign-high', payComponents: [{ grossAmount: { toString: () => '700.00' } }] }),
        ]),
        count: vi.fn().mockResolvedValue(0),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await GET(makeReq({ minAmount: '600' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignments).toHaveLength(1);
    expect(body.assignments[0].id).toBe('assign-high');
  });

  it('8. sort=amount_desc returns rows highest total first', async () => {
    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findMany: vi.fn().mockResolvedValue([
          makeDbRow({ id: 'assign-low', payComponents: [{ grossAmount: { toString: () => '100.00' } }] }),
          makeDbRow({ id: 'assign-high', payComponents: [{ grossAmount: { toString: () => '800.00' } }] }),
          makeDbRow({ id: 'assign-mid', payComponents: [{ grossAmount: { toString: () => '450.00' } }] }),
        ]),
        count: vi.fn().mockResolvedValue(0),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await GET(makeReq({ sort: 'amount_desc' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignments[0].id).toBe('assign-high');
    expect(body.assignments[1].id).toBe('assign-mid');
    expect(body.assignments[2].id).toBe('assign-low');
  });

  it('9. Cross-tenant: tenant-scoped prisma returns empty → empty array, count 0', async () => {
    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignments).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it('10. Driver name composition: firstName + lastName joined correctly', async () => {
    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findMany: vi.fn().mockResolvedValue([
          makeDbRow({ driver: { id: 'driver-1', firstName: 'Jane', lastName: 'Doe' } }),
        ]),
        count: vi.fn().mockResolvedValue(0),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignments[0].driverName).toBe('Jane Doe');
  });

  it('11. isOverride is true when overrideReason is set', async () => {
    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findMany: vi.fn().mockResolvedValue([
          makeDbRow({ overrideReason: 'Special rate for this load' }),
        ]),
        count: vi.fn().mockResolvedValue(0),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignments[0].isOverride).toBe(true);
    expect(body.assignments[0].overrideReason).toBe('Special rate for this load');
  });

  it('12. ageDays is computed from createdAt', async () => {
    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findMany: vi.fn().mockResolvedValue([
          makeDbRow({ createdAt: new Date(Date.now() - 86400000 * 5) }), // 5 days ago
        ]),
        count: vi.fn().mockResolvedValue(0),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignments[0].ageDays).toBe(5);
  });
});
