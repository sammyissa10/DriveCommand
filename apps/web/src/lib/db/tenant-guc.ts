import type { Prisma } from '../../generated/prisma';

/**
 * Set `app.current_tenant_id` for the REMAINDER OF ONE TRANSACTION.
 *
 * ─── ONE PLACE, DELIBERATELY (quick-601) ────────────────────────────────────
 *
 * The GUC name and its scope are written down here and nowhere else on the
 * provisioning path. Before this, NINE sites each spelled out a hand-written
 * bypass `set_config`; replacing nine literals with nine different literals
 * would have been the same defect in a new vocabulary. `getTenantPrisma()` /
 * `getTenantPrismaForOrg()` own the same GUC for ordinary request traffic — see
 * `lib/context/tenant-context.ts` — and this is the transaction-scoped twin, not
 * a competing mechanism.
 *
 * Note the bypass flag's name is deliberately NOT spelled out literally anywhere
 * in this file. The repository's bypass-site census is a grep for that exact
 * string, and a doc comment that mentions it is counted as a site — nine were
 * removed here and the census must say nine.
 *
 * ─── WHY `TRUE` (TRANSACTION SCOPE) AND NOT `false` ─────────────────────────
 *
 * `getTenantPrismaForOrg` uses SESSION scope (`false`) because a request holds
 * one pooled connection for its whole lifetime and every query on it belongs to
 * the same tenant. Provisioning is the opposite case: the tenant being written
 * DID NOT EXIST when the connection was handed out, and must not outlive the
 * transaction that creates it. `TRUE` reverts the value at COMMIT or ROLLBACK,
 * so a pooled connection can never be returned still pinned to a tenant that a
 * rolled-back sign-up never finished creating.
 *
 * ─── WHY IT MUST RUN INSIDE A TRANSACTION ───────────────────────────────────
 *
 * A `TRUE`-scoped `set_config` outside a transaction applies to its own
 * statement and nothing else. Deleting the surrounding `$transaction` does not
 * "simplify" a caller — it silently removes the tenant context, and every
 * FORCE-RLS table on the path then answers zero rows or `42501`. This is the
 * same trap `lib/auth/supabase.ts`'s `getCurrentUser` header documents for the
 * bypass GUC; it applies identically here.
 *
 * @param tx       an interactive-transaction client from `prisma.$transaction`
 * @param tenantId the tenant every subsequent statement in this transaction acts as
 */
export async function setTransactionTenantId(
  tx: Prisma.TransactionClient,
  tenantId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
}
