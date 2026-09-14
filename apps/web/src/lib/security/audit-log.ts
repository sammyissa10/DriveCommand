/**
 * Audit log writer — append-only, tenant-scoped.
 *
 * Writes audit events to the audit_log table via prisma.auditLog.create.
 * Inserts use a bypass_rls transaction so this call succeeds regardless of
 * the caller's tenant context — that is what makes today's insert succeed:
 * the connection is `postgres`, which carries `rolbypassrls = true`, and the
 * `set_config('app.bypass_rls', 'on', TRUE)` line below is the reason. It
 * stays; removing it is the wrapper migration's job, not this file's.
 *
 * quick-599 CORRECTION — this header used to claim "The audit_log table has
 * FORCE RLS + REVOKE UPDATE/DELETE — it is append-only by construction".
 * Measured on staging on 2026-09-14 (before quick-599's migration): FALSE.
 * `app_user` held UPDATE and DELETE grants on `audit_log`, and both
 * succeeded when probed directly — the exact pair
 * `bypass-replacement-design.md` §3.1 item 4 assumed away. The revoke is
 * REAL as of `20260914120000_tenant_audit_automation_policy_closure`, which
 * also splits the single FOR ALL policy into FOR SELECT (kept, unchanged
 * name `tenant_isolation_policy`) and a new FOR INSERT `audit_log_append_policy`
 * (`WITH CHECK (true)`, admitting the cross-tenant write this function's own
 * contract requires). That migration is applied to STAGING only; production
 * is PENDING as of this comment. Until the `app_user` cutover happens on
 * either database, "append-only" is enforced by nothing at all — the
 * connection bypasses RLS entirely and the revoke is inert alongside it, the
 * same way every policy in this repository is inert against `postgres`.
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
