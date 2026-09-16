/**
 * Audit log writer — append-only, tenant-scoped.
 *
 * Writes audit events to the audit_log table via prisma.auditLog.create.
 * quick-619 — ROUTED. The insert runs on getTenantPrismaForOrg(params.tenantId),
 * no userId (quick-610), and no longer sets `app.bypass_rls`. quick-616 classed
 * this statement BROKEN_POLICY for `audit_log`'s cast; that no longer describes the
 * table. Read from `pg_policies` on 2026-09-16, IDENTICAL on staging and
 * production: `audit_log_append_policy FOR INSERT WITH CHECK (true)` and
 * `tenant_isolation_policy FOR SELECT USING (tenant_id = current_tenant_id())`.
 * The INSERT check admits the row under any GUC, so the cross-tenant write this
 * function's contract requires is still admitted, and the tenant client scopes
 * the connection to the row's own tenant as well.
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
 * contract requires). That migration was applied to STAGING first; it is
 * now on PRODUCTION too (quick-619 measured the two policy sets byte-identical). Until the `app_user` cutover happens on
 * either database, "append-only" is enforced by nothing at all — the
 * connection bypasses RLS entirely and the revoke is inert alongside it, the
 * same way every policy in this repository is inert against `postgres`.
 *
 * Part of DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.4 (quick-329).
 *
 * NOTE: Uses the AuditLog Prisma model added in migration 20260515_pii_encryption_pr1.
 * quick-619: the raw-Prisma scanner used to classify this file INTENTIONAL_ALLOWED
 * because its bypass set_config was present. It no longer uses the bare client.
 */

import { TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
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
 * Inserts an audit log row on a client scoped to the ROW's tenant.
 *
 * The audit system must write even during RBAC-denied access attempts where the
 * calling context may differ from the row being audited. That is why the client
 * is acquired for `params.tenantId` here rather than borrowed from the caller,
 * and why `audit_log_append_policy`'s `WITH CHECK (true)` matters (quick-599).
 *
 * On failure: logs a non-PII error and rethrows — callers decide whether to
 * fail the request.
 */
export async function writeAuditLog(params: WriteAuditLogParams): Promise<void> {
  const { tenantId, userId, action, resourceType, resourceId, fieldName, ip, userAgent } = params;

  try {
    const tenantPrisma = await getTenantPrismaForOrg(tenantId);
    await tenantPrisma.$transaction(async (tx) => {

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
