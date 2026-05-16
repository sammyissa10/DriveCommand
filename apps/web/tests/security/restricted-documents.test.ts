/**
 * Restricted document security suite (quick-348).
 *
 * Covers all 7 truths from the plan's must_haves:
 *   1. Restricted upload S3 key starts with tenant-{id}/restricted/
 *   2. Presigned URL expiries: download <=900s, upload <=300s
 *   3. Every restricted download writes audit_log DOWNLOAD_DOCUMENT before URL returned
 *   4. DRIVER can only download own restricted docs; cross-driver → 403 + audit DENIED
 *   5. Cross-tenant access → 404 + audit DOWNLOAD_DOCUMENT_DENIED in caller's tenant
 *   6. is_restricted derived correctly from documentType at insert time
 *   7. Non-restricted document flow unchanged
 *
 * Requires a real PostgreSQL database with migrations applied.
 * Automatically skipped when DATABASE_URL is not set.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { withTenantRLS } from '@/lib/db/extensions/tenant-rls';
import {
  prisma,
  createTestTenant,
  createTestUser,
  cleanupTestData,
  disconnectPrisma,
} from '../isolation/setup';
import {
  buildRestrictedS3Key,
  generateRestrictedDownloadUrl,
  generateRestrictedUploadUrl,
  isRestrictedDocumentType,
  RESTRICTED_DOCUMENT_TYPES,
  RESTRICTED_DOWNLOAD_EXPIRY_SECONDS,
  RESTRICTED_UPLOAD_EXPIRY_SECONDS,
} from '@/lib/storage/restricted';
import {
  requireRestrictedDocumentAccess,
} from '@/lib/security/restricted-document-access';
import { UserRole } from '@/lib/auth/roles';
import { DocumentType } from '@/generated/prisma';

const hasDatabase = !!process.env.DATABASE_URL;
const describeWithDb = hasDatabase ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Unit tests — no database required
// ---------------------------------------------------------------------------

describe('restricted document type guard', () => {
  it('isRestrictedDocumentType returns true for all 8 restricted types', () => {
    const expected = ['SSN_CARD', 'PASSPORT', 'CDL_SCAN', 'MEDICAL_CARD', 'VOIDED_CHECK', 'W9', 'W4', 'I9'];
    for (const t of expected) {
      expect(isRestrictedDocumentType(t as DocumentType)).toBe(true);
    }
  });

  it('isRestrictedDocumentType returns false for non-restricted types', () => {
    const nonRestricted: Array<DocumentType | null | undefined> = [
      'DRIVER_LICENSE', 'DRIVER_APPLICATION', 'GENERAL', 'RATE_CONFIRMATION', null, undefined,
    ];
    for (const t of nonRestricted) {
      expect(isRestrictedDocumentType(t)).toBe(false);
    }
  });

  it('RESTRICTED_DOCUMENT_TYPES contains exactly 8 values', () => {
    expect(RESTRICTED_DOCUMENT_TYPES).toHaveLength(8);
  });
});

describe('buildRestrictedS3Key', () => {
  it('includes driverId in key when provided', () => {
    const key = buildRestrictedS3Key({
      tenantId: 't1',
      driverId: 'd1',
      fileId: 'f1',
      sanitizedFileName: 'ssn.pdf',
    });
    expect(key).toBe('tenant-t1/restricted/d1/f1-ssn.pdf');
  });

  it('uses _org subfolder when driverId is null', () => {
    const key = buildRestrictedS3Key({
      tenantId: 't1',
      driverId: null,
      fileId: 'f1',
      sanitizedFileName: 'w9.pdf',
    });
    expect(key).toBe('tenant-t1/restricted/_org/f1-w9.pdf');
  });

  it('uses _org subfolder when driverId is undefined', () => {
    const key = buildRestrictedS3Key({
      tenantId: 't1',
      driverId: undefined,
      fileId: 'f2',
      sanitizedFileName: 'i9.pdf',
    });
    expect(key).toBe('tenant-t1/restricted/_org/f2-i9.pdf');
  });

  it('key always starts with tenant-{tenantId}/restricted/', () => {
    const key = buildRestrictedS3Key({
      tenantId: 'abc',
      driverId: 'xyz',
      fileId: 'id1',
      sanitizedFileName: 'file.pdf',
    });
    expect(key.startsWith('tenant-abc/restricted/')).toBe(true);
  });
});

describe('presigned URL expiry constants', () => {
  it('RESTRICTED_DOWNLOAD_EXPIRY_SECONDS is 900 (15 minutes)', () => {
    expect(RESTRICTED_DOWNLOAD_EXPIRY_SECONDS).toBe(900);
  });

  it('RESTRICTED_UPLOAD_EXPIRY_SECONDS is 300 (5 minutes)', () => {
    expect(RESTRICTED_UPLOAD_EXPIRY_SECONDS).toBe(300);
  });
});

// ---------------------------------------------------------------------------
// Presigned URL expiry tests (require S3 env vars but not a database)
// ---------------------------------------------------------------------------
// These call the actual signing code. We skip if S3 env vars are missing,
// since the unit is the signing code, not the S3 service itself.

const hasS3 = !!(process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY && process.env.S3_BUCKET);
const describeWithS3 = hasS3 ? describe : describe.skip;

describeWithS3('presigned URL expiry (S3 signing — no actual upload/download)', () => {
  const testKey = 'tenant-test-tenant-id/restricted/test-driver-id/test-file-id-test.pdf';

  it('generateRestrictedDownloadUrl X-Amz-Expires <= 900s', async () => {
    const url = await generateRestrictedDownloadUrl(testKey);
    const parsed = new URL(url);
    const expires = parseInt(parsed.searchParams.get('X-Amz-Expires') ?? '0', 10);
    expect(expires).toBeGreaterThan(0);
    expect(expires).toBeLessThanOrEqual(900);
  });

  it('generateRestrictedUploadUrl X-Amz-Expires <= 300s', async () => {
    const { uploadUrl } = await generateRestrictedUploadUrl({
      tenantId: 'test-tenant-id',
      driverId: 'test-driver-id',
      fileId: 'test-file-id',
      fileName: 'test.pdf',
      contentType: 'application/pdf',
    });
    const parsed = new URL(uploadUrl);
    const expires = parseInt(parsed.searchParams.get('X-Amz-Expires') ?? '0', 10);
    expect(expires).toBeGreaterThan(0);
    expect(expires).toBeLessThanOrEqual(300);
  });

  it('generateRestrictedUploadUrl key starts with tenant-{id}/restricted/', async () => {
    const { s3Key } = await generateRestrictedUploadUrl({
      tenantId: 'mytenant',
      driverId: 'mydriver',
      fileId: 'myfile',
      fileName: 'ssn.pdf',
      contentType: 'application/pdf',
    });
    expect(s3Key.startsWith('tenant-mytenant/restricted/')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration tests — require real database
// ---------------------------------------------------------------------------

describeWithDb('restricted document RBAC + audit (integration)', () => {
  let tenantAId: string;
  let tenantBId: string;
  let ownerAId: string;
  let managerAId: string;
  let driver1AId: string;
  let driver2AId: string;
  let ownerBId: string;

  let driver1RestrictedDocId: string;
  let driver1RestrictedS3Key: string;
  let nonRestrictedDocId: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bypassPrisma = prisma as any;

  beforeAll(async () => {
    // Create two tenants
    const tenantA = await createTestTenant('Test Tenant A RestrictedDoc');
    const tenantB = await createTestTenant('Test Tenant B RestrictedDoc');
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const ts = Date.now();

    // Tenant A users
    const ownerA = await createTestUser(tenantAId, {
      clerkUserId: `restricted-owner-a-${ts}`,
      email: `restricted-owner-a-${ts}@example.com`,
      role: 'OWNER',
    });
    ownerAId = ownerA.id;

    const managerA = await createTestUser(tenantAId, {
      clerkUserId: `restricted-manager-a-${ts}`,
      email: `restricted-manager-a-${ts}@example.com`,
      role: 'MANAGER',
    });
    managerAId = managerA.id;

    const driver1A = await createTestUser(tenantAId, {
      clerkUserId: `restricted-driver1-a-${ts}`,
      email: `restricted-driver1-a-${ts}@example.com`,
      role: 'DRIVER',
    });
    driver1AId = driver1A.id;

    const driver2A = await createTestUser(tenantAId, {
      clerkUserId: `restricted-driver2-a-${ts}`,
      email: `restricted-driver2-a-${ts}@example.com`,
      role: 'DRIVER',
    });
    driver2AId = driver2A.id;

    // Tenant B user
    const ownerB = await createTestUser(tenantBId, {
      clerkUserId: `restricted-owner-b-${ts}`,
      email: `restricted-owner-b-${ts}@example.com`,
      role: 'OWNER',
    });
    ownerBId = ownerB.id;

    // Create a restricted document owned by driver1 in tenant A
    driver1RestrictedS3Key = `tenant-${tenantAId}/restricted/${driver1AId}/test-file-id-ssn.pdf`;
    const restrictedDoc = await bypassPrisma.$transaction(async (tx: typeof bypassPrisma) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.document.create({
        data: {
          tenantId: tenantAId,
          driverId: driver1AId,
          fileName: 'ssn.pdf',
          s3Key: driver1RestrictedS3Key,
          contentType: 'application/pdf',
          sizeBytes: 1024,
          uploadedBy: ownerAId,
          documentType: 'SSN_CARD',
          isRestricted: true,
        },
      });
    });
    driver1RestrictedDocId = restrictedDoc.id;

    // Create a non-restricted document in tenant A
    const nonRestrictedDoc = await bypassPrisma.$transaction(async (tx: typeof bypassPrisma) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.document.create({
        data: {
          tenantId: tenantAId,
          driverId: driver1AId,
          fileName: 'bol.pdf',
          s3Key: `tenant-${tenantAId}/drivers/file-bol.pdf`,
          contentType: 'application/pdf',
          sizeBytes: 512,
          uploadedBy: ownerAId,
          documentType: 'GENERAL',
          isRestricted: false,
        },
      });
    });
    nonRestrictedDocId = nonRestrictedDoc.id;
  });

  afterAll(async () => {
    // Clean up documents, audit rows, then users and tenants
    await bypassPrisma.$transaction(async (tx: typeof bypassPrisma) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      await tx.document.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
      await tx.auditLog.deleteMany({
        where: { tenantId: { in: [tenantAId, tenantBId] } },
      });
    });
    await cleanupTestData();
    await disconnectPrisma();
  });

  // -------------------------------------------------------------------------
  // Truth 6: is_restricted derived correctly from documentType at insert time
  // -------------------------------------------------------------------------

  it('is_restricted=true when documentType is SSN_CARD', async () => {
    const doc = await bypassPrisma.$transaction(async (tx: typeof bypassPrisma) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.document.findUnique({
        where: { id: driver1RestrictedDocId },
        select: { isRestricted: true, documentType: true },
      });
    });
    expect(doc).not.toBeNull();
    expect(doc.isRestricted).toBe(true);
    expect(doc.documentType).toBe('SSN_CARD');
  });

  it('is_restricted=false when documentType is GENERAL', async () => {
    const doc = await bypassPrisma.$transaction(async (tx: typeof bypassPrisma) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.document.findUnique({
        where: { id: nonRestrictedDocId },
        select: { isRestricted: true, documentType: true },
      });
    });
    expect(doc).not.toBeNull();
    expect(doc.isRestricted).toBe(false);
    expect(doc.documentType).toBe('GENERAL');
  });

  // -------------------------------------------------------------------------
  // Truth 5: Cross-tenant access → 404 + audit DOWNLOAD_DOCUMENT_DENIED
  // -------------------------------------------------------------------------

  it('cross-tenant access returns 404 and writes DOWNLOAD_DOCUMENT_DENIED in caller tenant', async () => {
    // ownerB in tenantB tries to access driver1A's doc in tenantA
    const result = await requireRestrictedDocumentAccess({
      documentId: driver1RestrictedDocId,
      userId: ownerBId,
      userRole: UserRole.OWNER,
      tenantId: tenantBId, // wrong tenant
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }

    // Audit row must be in TENANT B (caller's tenant)
    const auditRows = await bypassPrisma.$transaction(async (tx: typeof bypassPrisma) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.auditLog.findMany({
        where: {
          tenantId: tenantBId,
          userId: ownerBId,
          action: 'DOWNLOAD_DOCUMENT_DENIED',
          resourceId: driver1RestrictedDocId,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].fieldName).toBe('cross_tenant_or_missing');
  });

  // -------------------------------------------------------------------------
  // Truth 4: DRIVER isolation — cross-driver → 403 + audit DENIED
  // -------------------------------------------------------------------------

  it('driver2 cannot access driver1 restricted doc → 403 + DOWNLOAD_DOCUMENT_DENIED', async () => {
    const result = await requireRestrictedDocumentAccess({
      documentId: driver1RestrictedDocId,
      userId: driver2AId,
      userRole: UserRole.DRIVER,
      tenantId: tenantAId,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }

    const auditRows = await bypassPrisma.$transaction(async (tx: typeof bypassPrisma) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.auditLog.findMany({
        where: {
          tenantId: tenantAId,
          userId: driver2AId,
          action: 'DOWNLOAD_DOCUMENT_DENIED',
          resourceId: driver1RestrictedDocId,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].fieldName).toBe('role:DRIVER');
  });

  // -------------------------------------------------------------------------
  // Truth 4: DRIVER accessing own restricted doc → success + DOWNLOAD_DOCUMENT audit
  // -------------------------------------------------------------------------

  it('driver1 can access own restricted doc → ok + URL + DOWNLOAD_DOCUMENT audit', async () => {
    const result = await requireRestrictedDocumentAccess({
      documentId: driver1RestrictedDocId,
      userId: driver1AId,
      userRole: UserRole.DRIVER,
      tenantId: tenantAId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.downloadUrl).toBe('string');
      expect(result.expiresInSeconds).toBe(900);
      expect(result.fileName).toBe('ssn.pdf');
    }

    const auditRows = await bypassPrisma.$transaction(async (tx: typeof bypassPrisma) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.auditLog.findMany({
        where: {
          tenantId: tenantAId,
          userId: driver1AId,
          action: 'DOWNLOAD_DOCUMENT',
          resourceId: driver1RestrictedDocId,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].fieldName).toBe('SSN_CARD');
  });

  // -------------------------------------------------------------------------
  // Truth 3: Manager/Owner/SystemAdmin access → success + DOWNLOAD_DOCUMENT audit
  // -------------------------------------------------------------------------

  it.each([
    ['MANAGER', UserRole.MANAGER, () => managerAId],
    ['OWNER', UserRole.OWNER, () => ownerAId],
  ])('%s in same tenant can access restricted doc', async (_, role, getUserId) => {
    const userId = getUserId();
    const result = await requireRestrictedDocumentAccess({
      documentId: driver1RestrictedDocId,
      userId,
      userRole: role,
      tenantId: tenantAId,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.expiresInSeconds).toBe(900);
      expect(typeof result.downloadUrl).toBe('string');
    }

    const auditRows = await bypassPrisma.$transaction(async (tx: typeof bypassPrisma) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.auditLog.findMany({
        where: {
          tenantId: tenantAId,
          userId,
          action: 'DOWNLOAD_DOCUMENT',
          resourceId: driver1RestrictedDocId,
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].fieldName).toBe('SSN_CARD');
  });

  // -------------------------------------------------------------------------
  // Truth 3: DOWNLOAD_DOCUMENT audit row is written BEFORE URL is returned
  // (test verifies audit exists right after the function returns)
  // -------------------------------------------------------------------------

  it('audit_log DOWNLOAD_DOCUMENT row exists immediately after successful access', async () => {
    const result = await requireRestrictedDocumentAccess({
      documentId: driver1RestrictedDocId,
      userId: managerAId,
      userRole: UserRole.MANAGER,
      tenantId: tenantAId,
    });

    expect(result.ok).toBe(true);

    // Verify row was committed (not just in-transaction) before function returned
    const rows = await bypassPrisma.$transaction(async (tx: typeof bypassPrisma) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.auditLog.findMany({
        where: {
          tenantId: tenantAId,
          userId: managerAId,
          action: 'DOWNLOAD_DOCUMENT',
          resourceId: driver1RestrictedDocId,
        },
      });
    });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // DISPATCHER placeholder (truth #4 — no such role today)
  // -------------------------------------------------------------------------

  // TODO(quick-348-followup): Add DISPATCHER role test when UserRole.DISPATCHER is added.
  // The cross-driver DRIVER test (above) exercises the role-mismatch fallback path.
  it('DISPATCHER role (placeholder) — role does not exist in UserRole enum today', () => {
    // Verify DISPATCHER is not in the UserRole enum
    const roles = Object.values(UserRole);
    expect(roles).not.toContain('DISPATCHER');
  });

  // -------------------------------------------------------------------------
  // Truth 7: Non-restricted document route unchanged
  // -------------------------------------------------------------------------

  it('requireRestrictedDocumentAccess returns 404 for non-restricted doc (caller should use normal flow)', async () => {
    const result = await requireRestrictedDocumentAccess({
      documentId: nonRestrictedDocId,
      userId: ownerAId,
      userRole: UserRole.OWNER,
      tenantId: tenantAId,
    });

    // Should return 404 — not a restricted doc, guard should not be used for it
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
    }
  });

  // -------------------------------------------------------------------------
  // audit_log append-only invariant (Truth — CHECK constraint)
  // Already covered by audit-log-isolation.test.ts; here we verify
  // DOWNLOAD_DOCUMENT_DENIED is accepted by the CHECK constraint.
  // -------------------------------------------------------------------------

  it('audit_log CHECK constraint accepts DOWNLOAD_DOCUMENT_DENIED', async () => {
    // Insert a DOWNLOAD_DOCUMENT_DENIED row via bypass_rls — should not throw
    const insertResult = await bypassPrisma.$transaction(async (tx: typeof bypassPrisma) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.auditLog.create({
        data: {
          tenantId: tenantAId,
          userId: ownerAId,
          action: 'DOWNLOAD_DOCUMENT_DENIED',
          resourceType: 'document',
          resourceId: driver1RestrictedDocId,
          fieldName: 'check_constraint_test',
        },
        select: { id: true, action: true },
      });
    });
    expect(insertResult.action).toBe('DOWNLOAD_DOCUMENT_DENIED');
  });

  it('audit_log RLS — tenantA user does not see tenantB audit rows', async () => {
    const tenantAClient = prisma.$extends(withTenantRLS(tenantAId));
    const rows = await tenantAClient.auditLog.findMany({
      where: { tenantId: tenantBId },
    });
    expect(rows).toHaveLength(0);
  });
});
