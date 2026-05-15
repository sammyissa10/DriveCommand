/**
 * Audit log writer — append-only, tenant-scoped.
 *
 * Writes audit events to the audit_log table.
 * The audit_log table has FORCE RLS + REVOKE UPDATE/DELETE — it is append-only
 * by construction. Inserts bypass RLS for the system write path.
 *
 * Part of DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.4.
 *
 * NOTE: Uses prisma.auditLog.create (Prisma client method) added in migration
 * 20260515_pii_encryption_pr1. The AuditLog model is defined in schema.prisma.
 */

import { prisma } from '@/lib/db/prisma';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { Prisma } from '@/generated/prisma/client';
import { logger } from '@/lib/logger';

export type AuditAction =
  | 'VIEW_PII'
  | 'VIEW_PII_DENIED'
  | 'DOWNLOAD_DOCUMENT'
  | 'UPDATE_RESTRICTED'
  | 'DELETE_RESTRICTED'
  | 'EXPORT'
  | 'RATE_LIMIT_HIT';

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
 * Uses bypass_rls so this call succeeds regardless of which tenant context the
 * caller is operating under. This is intentional: the audit system must write
 * even if the caller's tenant context differs from the row being audited
 * (e.g. during RBAC-denied access attempts).
 *
 * On failure: logs a non-PII error and rethrows — callers decide whether to
 * fail the request.
 */
export async function writeAuditLog(params: WriteAuditLogParams): Promise<void> {
  const { tenantId, userId, action, resourceType, resourceId, fieldName, ip, userAgent } = params;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Use parameterized INSERT via Prisma.sql — never string concatenation.
      await tx.$executeRaw(
        Prisma.sql`
          INSERT INTO audit_log (
            tenant_id, user_id, action, resource_type, resource_id,
            field_name, ip_address, user_agent, created_at
          ) VALUES (
            ${tenantId}::uuid,
            ${userId}::uuid,
            ${action},
            ${resourceType},
            ${resourceId}::uuid,
            ${fieldName ?? null},
            ${ip ?? null}::inet,
            ${userAgent ?? null},
            NOW()
          )
        `
      );
    }, TX_OPTIONS);
  } catch (err) {
    logger.error('audit_log_insert_failed', err, { action, resourceType });
    throw err;
  }
}
