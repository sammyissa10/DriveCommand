/**
 * Restricted document access guard.
 *
 * Enforces RBAC, writes audit_log rows (success and denial), and returns
 * a 15-minute presigned download URL for restricted PII documents.
 *
 * RBAC matrix (spec §4.4, adapted — no DISPATCHER role exists in DriveCommand;
 * gate at MANAGER+ and the absence of DISPATCHER is the de-facto block):
 *   - SYSTEM_ADMIN / OWNER / MANAGER → allowed for any document in their tenant
 *   - DRIVER                          → allowed ONLY for documents where driverId === userId
 *   - (no DISPATCHER role today)      → if added later, gate explicitly here
 *
 * Cross-tenant access → 404 (no information leak), audit row DOWNLOAD_DOCUMENT_DENIED
 * in the caller's tenant.
 *
 * The audit_log row is written BEFORE the presigned URL is returned (spec §4.5).
 * If the audit insert fails, the error propagates — no URL leaks without an audit trail.
 *
 * Part of DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.3 + 4.4 (quick-348).
 */

import { prisma } from '@/lib/db/prisma';
import { UserRole } from '@/lib/auth/roles';
import { generateRestrictedDownloadUrl, isRestrictedKey } from '@/lib/storage/restricted';
import { writeAuditLog } from './audit-log';

export type RestrictedAccessResult =
  | { ok: true; downloadUrl: string; fileName: string; expiresInSeconds: 900 }
  | { ok: false; status: 403 | 404; error: string };

export interface RestrictedAccessRequest {
  documentId: string;
  userId: string;
  userRole: UserRole;
  tenantId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Gate restricted document downloads.
 *
 * Performs, in order:
 * 1. Unscoped document lookup (intentional — enables cross-tenant 404 classification)
 * 2. Cross-tenant / not-found check → 404 + audit DOWNLOAD_DOCUMENT_DENIED
 * 3. Non-restricted document check → 404 (configuration error from caller)
 * 4. S3 key validity check → 403 + audit DOWNLOAD_DOCUMENT_DENIED
 * 5. RBAC check → 403 + audit DOWNLOAD_DOCUMENT_DENIED
 * 6. Success → audit DOWNLOAD_DOCUMENT, then generate 15-min presigned URL
 *
 * Note on unscoped lookup: A tenant-scoped query would silently 404 cross-tenant
 * attempts and we would miss the audit row in the caller's tenant. The unscoped
 * lookup is intentional so we can classify and audit cross-tenant attempts.
 * (documented as INTENTIONAL_ALLOWED per bypass_rls scanner convention)
 */
export async function requireRestrictedDocumentAccess(
  req: RestrictedAccessRequest
): Promise<RestrictedAccessResult> {
  // Unscoped lookup — intentional for cross-tenant 404 classification + audit
  const doc = await prisma.document.findUnique({
    where: { id: req.documentId },
    select: {
      id: true,
      tenantId: true,
      driverId: true,
      fileName: true,
      s3Key: true,
      isRestricted: true,
      documentType: true,
    },
  });

  const auditBase = {
    tenantId: req.tenantId,
    userId: req.userId,
    resourceType: 'document',
    resourceId: req.documentId,
    ip: req.ipAddress ?? null,
    userAgent: req.userAgent ?? null,
  };

  // Not found OR wrong tenant → 404 (no info leak) + audit denial in caller's tenant
  if (!doc || doc.tenantId !== req.tenantId) {
    await writeAuditLog({
      ...auditBase,
      action: 'DOWNLOAD_DOCUMENT_DENIED',
      fieldName: 'cross_tenant_or_missing',
    });
    return { ok: false, status: 404, error: 'Document not found' };
  }

  // Document is not actually restricted — caller should use the normal flow.
  // Return 404 to be safe (no information leak about document existence via this path).
  if (!doc.isRestricted) {
    return { ok: false, status: 404, error: 'Document not found' };
  }

  // Defense-in-depth: refuse if key is missing or malformed (wrong prefix)
  if (!doc.s3Key || !isRestrictedKey(doc.s3Key, doc.tenantId)) {
    await writeAuditLog({
      ...auditBase,
      action: 'DOWNLOAD_DOCUMENT_DENIED',
      fieldName: 'invalid_key',
    });
    return { ok: false, status: 403, error: 'Invalid restricted document key' };
  }

  // Role gate
  // SYSTEM_ADMIN / OWNER / MANAGER → privileged (any doc in their tenant)
  // DRIVER → only their own doc (driverId must match userId)
  // No DISPATCHER role today — when added, gate it explicitly here.
  const isPrivileged =
    req.userRole === UserRole.SYSTEM_ADMIN ||
    req.userRole === UserRole.OWNER ||
    req.userRole === UserRole.MANAGER;

  const isOwnDriverDoc =
    req.userRole === UserRole.DRIVER && doc.driverId === req.userId;

  if (!isPrivileged && !isOwnDriverDoc) {
    await writeAuditLog({
      ...auditBase,
      action: 'DOWNLOAD_DOCUMENT_DENIED',
      fieldName: `role:${req.userRole}`,
    });
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  // SUCCESS — write audit row BEFORE returning the URL (spec §4.5 requirement:
  // "audit row must be committed before presigned URL is returned to client").
  await writeAuditLog({
    ...auditBase,
    action: 'DOWNLOAD_DOCUMENT',
    fieldName: doc.documentType ?? null,
  });

  const downloadUrl = await generateRestrictedDownloadUrl(doc.s3Key);

  return {
    ok: true,
    downloadUrl,
    fileName: doc.fileName,
    expiresInSeconds: 900,
  };
}
