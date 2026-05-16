/**
 * Audit log writer — append-only, tenant-scoped.
 *
 * Writes audit events to the audit_log table via prisma.auditLog.create.
 * The audit_log table has FORCE RLS + REVOKE UPDATE/DELETE — it is append-only
 * by construction. Inserts use a bypass_rls transaction so this call succeeds
 * regardless of the caller's tenant context.
 *
 * Part of DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.4 (quick-329).
 *
 * NOTE: Uses the AuditLog Prisma model added in migration 20260515_pii_encryption_pr1.
 * The raw-Prisma scanner classifies this file as INTENTIONAL_ALLOWED via the
 * bypass_rls file-level check (set_config('app.bypass_rls', 'on', TRUE) is present).
 */

import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

export type AuditAction =
  | 'VIEW_PII'
  | 'VIEW_PII_DENIED'
  | 'DOWNLOAD_DOCUMENT'
  | 'DOWNLOAD_DOCUMENT_DENIED'
  | 'UPDATE_RESTRICTED'
  | 'DELETE_RESTRICTED'
  | 'EXPORT'
  | 'RATE_LIMIT_HIT';

/** All valid audit actions — mirrors the audit_log.action CHECK constraint. */
export const AUDIT_ACTIONS: readonly AuditAction[] = [
  'VIEW_PII',
  'VIEW_PII_DENIED',
  'DOWNLOAD_DOCUMENT',
  'DOWNLOAD_DOCUMENT_DENIED',
  'UPDATE_RESTRICTED',
  'DELETE_RESTRICTED',
  'EXPORT',
  'RATE_LIMIT_HIT',
] as const;

export interface WriteAuditLogParams {
  tenantId: string;
  userId: string;
  action: AuditAction;
  resourceType: string;
  resourceId: string;
  fieldName?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Inserts an audit log row using a bypass_rls transaction.
 *
 * bypass_rls is used so this call succeeds regardless of which tenant context
 * the caller is operating under. This is intentional: the audit system must
 * write even during RBAC-denied access attempts where the calling context may
 * differ from the row being audited.
 *
 * On failure: logs a non-PII error and rethrows — callers decide whether to
 * fail the request.
 */
export async function writeAuditLog(params: WriteAuditLogParams): Promise<void> {
  const { tenantId, userId, action, resourceType, resourceId, fieldName, ip, userAgent } = params;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          action,
          resourceType,
          resourceId,
          fieldName: fieldName ?? null,
          ipAddress: ip ?? null,
          userAgent: userAgent ?? null,
        },
      });
    }, TX_OPTIONS);
  } catch (err) {
    logger.error('audit_log_insert_failed', err, { action, resourceType });
    throw err;
  }
}
