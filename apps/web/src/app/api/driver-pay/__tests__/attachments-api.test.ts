import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be hoisted before imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth/supabase', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  requireTenantId: vi.fn().mockResolvedValue('tenant-a'),
  getTenantPrisma: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  uploadLimiter: null,
  applyRateLimit: vi.fn().mockResolvedValue(null), // always allow in tests
}));

vi.mock('@/lib/storage/attachments', () => ({
  getAttachmentUploadUrl: vi.fn().mockResolvedValue({
    uploadUrl: 'https://s3.example.com/upload?signed=xxx',
    storageKey: 'tenant-a/components/comp-1/uuid-123.jpg',
  }),
  getAttachmentDownloadUrl: vi.fn().mockResolvedValue('https://s3.example.com/download?signed=yyy'),
}));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import {
  GET as listAttachments,
  POST as postAttachment,
} from '@/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/route';
import { DELETE as deleteAttachment } from '@/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/route';
import { GET as getDownloadUrl } from '@/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/download-url/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrisma(overrides: Partial<Record<string, object>> = {}) {
  return {
    loadDriverAssignment: { findFirst: vi.fn() },
    loadPayComponent: { findFirst: vi.fn() },
    payComponentAttachment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    ...overrides,
  };
}

function makeReq(method: string, body?: object, searchParams?: Record<string, string>) {
  const url = new URL(
    'http://localhost/api/driver-pay/assignments/assign-1/components/comp-1/attachments',
  );
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      url.searchParams.set(k, v);
    }
  }
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeDownloadReq() {
  const url = new URL(
    'http://localhost/api/driver-pay/assignments/assign-1/components/comp-1/attachments/attach-1/download-url',
  );
  return new NextRequest(url, { method: 'GET' });
}

const fakeAssignment = {
  id: 'assign-1',
  driverId: 'driver-1',
  payStatus: 'DRAFT',
  tenantId: 'tenant-a',
  loadId: 'load-1',
  deletedAt: null,
};

const fakeComponent = {
  id: 'comp-1',
  assignmentId: 'assign-1',
  tenantId: 'tenant-a',
  deletedAt: null,
};

const fakeAttachment = {
  id: 'attach-1',
  tenantId: 'tenant-a',
  componentId: 'comp-1',
  assignmentId: 'assign-1',
  storageKey: 'tenant-a/components/comp-1/uuid-123.jpg',
  filename: 'receipt.jpg',
  contentType: 'image/jpeg',
  sizeBytes: 512000,
  uploadedBy: 'driver-1',
  createdAt: new Date('2026-05-01T00:00:00Z'),
  deletedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Test 1: Tenant isolation — cross-tenant access returns 404
// ---------------------------------------------------------------------------

describe('Tenant isolation', () => {
  it('Tenant B gets 404 for tenant A attachment download URL (not 403)', async () => {
    // Session belongs to tenant-b; attachment's tenant is tenant-a (enforced by RLS).
    // The tenant-scoped Prisma mock simulates RLS blocking — findFirst returns null
    // because tenant-b cannot see tenant-a rows.
    vi.mocked(getSession).mockResolvedValue({
      userId: 'owner-b',
      email: 'owner@tenantb.com',
      role: 'owner',
      tenantId: 'tenant-b',
    });

    const mockPrisma = makePrisma({
      payComponentAttachment: {
        findFirst: vi.fn().mockResolvedValue(null), // RLS blocks — tenant-b sees nothing
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await getDownloadUrl(makeDownloadReq(), {
      params: Promise.resolve({
        assignmentId: 'assign-1',
        componentId: 'comp-1',
        attachmentId: 'attach-1',
      }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Test 2: Cross-tenant componentId guess fails on presign
// ---------------------------------------------------------------------------

describe('Cross-tenant component guess', () => {
  it('POST presign returns 404 when component belongs to another tenant', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'owner-b',
      email: 'owner@tenantb.com',
      role: 'owner',
      tenantId: 'tenant-b',
    });

    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue(null), // tenant-b cannot see tenant-a's assignment
      },
      loadPayComponent: {
        findFirst: vi.fn(),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await postAttachment(
      makeReq(
        'POST',
        {
          filename: 'receipt.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 512000,
        },
        { action: 'presign' },
      ),
      {
        params: Promise.resolve({ assignmentId: 'assign-1', componentId: 'comp-1' }),
      },
    );

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Test 3: MIME validation
// ---------------------------------------------------------------------------

describe('File type validation', () => {
  it('POST presign rejects invalid MIME type with 400', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'owner-1',
      email: 'owner@test.com',
      role: 'owner',
      tenantId: 'tenant-a',
    });

    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue(fakeAssignment),
      },
      loadPayComponent: {
        findFirst: vi.fn().mockResolvedValue(fakeComponent),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await postAttachment(
      makeReq(
        'POST',
        {
          filename: 'malware.exe',
          contentType: 'application/x-msdownload', // NOT in allowed list
          sizeBytes: 100000,
        },
        { action: 'presign' },
      ),
      {
        params: Promise.resolve({ assignmentId: 'assign-1', componentId: 'comp-1' }),
      },
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not allowed/i);
  });
});

// ---------------------------------------------------------------------------
// Test 4: Soft-delete — subsequent fetches return 404
// ---------------------------------------------------------------------------

describe('Soft-deleted attachment', () => {
  it('GET download-url returns 404 for a soft-deleted attachment', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'owner-1',
      email: 'owner@test.com',
      role: 'owner',
      tenantId: 'tenant-a',
    });

    const mockPrisma = makePrisma({
      payComponentAttachment: {
        // deletedAt is non-null — the route WHERE clause (deletedAt: null) won't match this,
        // simulated here by returning null (as a real DB with RLS would)
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await getDownloadUrl(makeDownloadReq(), {
      params: Promise.resolve({
        assignmentId: 'assign-1',
        componentId: 'comp-1',
        attachmentId: 'attach-1',
      }),
    });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Test 5 (bonus): PAID assignment returns 409 on presign
// ---------------------------------------------------------------------------

describe('PAID guard', () => {
  it('POST presign returns 409 when assignment is PAID', async () => {
    vi.mocked(getSession).mockResolvedValue({
      userId: 'owner-1',
      email: 'owner@test.com',
      role: 'owner',
      tenantId: 'tenant-a',
    });

    const mockPrisma = makePrisma({
      loadDriverAssignment: {
        findFirst: vi.fn().mockResolvedValue({ ...fakeAssignment, payStatus: 'PAID' }),
      },
      loadPayComponent: {
        findFirst: vi.fn().mockResolvedValue(fakeComponent),
      },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(mockPrisma as never);

    const res = await postAttachment(
      makeReq(
        'POST',
        {
          filename: 'receipt.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 512000,
        },
        { action: 'presign' },
      ),
      {
        params: Promise.resolve({ assignmentId: 'assign-1', componentId: 'comp-1' }),
      },
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain('paid assignment');
  });
});
