/**
 * payroll-export-rbac.test.ts
 *
 * Tests that POST /api/reports/payroll-export enforces ADMIN-only access.
 * - OWNER, MANAGER, DRIVER → 403
 * - SYSTEM_ADMIN → not 403 (may fail for other reasons in a full mock, but not 403)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/supabase', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrisma: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { POST } from '@/app/api/reports/payroll-export/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(role: string) {
  return {
    userId: 'user-rbac-test',
    email: `${role.toLowerCase()}@test.invalid`,
    role,
    tenantId: 'tenant-rbac-test',
  };
}

// Valid RFC 4122 UUID (variant bits = 8xxx in group 4)
const TEST_SETTLEMENT_ID = 'ce8f9e8f-3571-4c9e-8ad0-dc62da71fb69';

function makeValidBody() {
  return JSON.stringify({
    format: 'generic_csv',
    employmentType: 'W2_EMPLOYEE',
    settlementIds: [TEST_SETTLEMENT_ID],
  });
}

function makeReq(body = makeValidBody()) {
  return new NextRequest(new URL('http://localhost/api/reports/payroll-export'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

function makeAdminPrisma() {
  return {
    driverSettlement: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    loadDriverAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    loadPayComponent: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    driverBonus: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    driverPayAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/reports/payroll-export — RBAC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 for DRIVER role', async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('DRIVER'));

    const res = await POST(makeReq());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/Forbidden/i);
  });

  it('returns 403 for MANAGER role', async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('MANAGER'));

    const res = await POST(makeReq());
    expect(res.status).toBe(403);
  });

  it('does NOT return 403 for OWNER role (OWNER is ADMIN in this codebase)', async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('OWNER'));
    vi.mocked(getTenantPrisma).mockResolvedValue(makeAdminPrisma() as never);

    const res = await POST(makeReq());
    // May return 200, 422 (no settlements found / empty export), etc. — but NOT 403
    expect(res.status).not.toBe(403);
  });

  it('does NOT return 403 for SYSTEM_ADMIN role', async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('SYSTEM_ADMIN'));
    vi.mocked(getTenantPrisma).mockResolvedValue(makeAdminPrisma() as never);

    const res = await POST(makeReq());
    expect(res.status).not.toBe(403);
  });

  it('returns 401 when no session', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await POST(makeReq());
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    vi.mocked(getSession).mockResolvedValue(makeSession('OWNER'));
    vi.mocked(getTenantPrisma).mockResolvedValue(makeAdminPrisma() as never);

    const res = await POST(
      new NextRequest(new URL('http://localhost/api/reports/payroll-export'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'invalid_format' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
