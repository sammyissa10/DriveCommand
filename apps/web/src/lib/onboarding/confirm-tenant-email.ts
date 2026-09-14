import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { setTransactionTenantId } from '@/lib/db/tenant-guc';

/**
 * Mark a tenant's email as confirmed.
 *
 * ─── EXTRACTED FROM THE ROUTE (quick-601) ───────────────────────────────────
 *
 * This was inline in `api/email-confirm/[token]/route.ts`. It is lifted out for
 * one reason: a Next route handler cannot be exercised by the `app_user`
 * verification harness, and "the statements are admitted by the policy set" is
 * exactly the claim this task has to prove. The route is now a thin wrapper that
 * verifies the token and maps outcomes to redirects.
 *
 * ─── IT IS NOT A BOOTSTRAP (bypass-replacement-design.md §4.2) ──────────────
 *
 * The tenant id arrives in the AES-GCM token minted at the end of
 * `provisionTenant`, so it is in hand BEFORE any query runs. The former
 * `app.bypass_rls` here was never the mechanism — `tenant_self_read` admits the
 * read and `tenant_self_update` admits the write, both on `id =
 * current_tenant_id()`.
 *
 * Without the GUC the failure is quiet in both halves, which is why it is worth
 * naming: the read returns zero rows, so a VALID confirmation link redirects to
 * `/sign-in?error=link-invalid`; and if it somehow got past that, the UPDATE
 * would report zero rows affected rather than raising (quick-599 D3).
 */
export type ConfirmTenantEmailResult =
  | { status: 'confirmed' }
  | { status: 'already-confirmed' }
  | { status: 'not-found' };

export async function confirmTenantEmail(
  tenantId: string,
): Promise<ConfirmTenantEmailResult> {
  return prisma.$transaction(async (tx) => {
    await setTransactionTenantId(tx, tenantId);

    const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) return { status: 'not-found' as const };

    // Idempotency: already confirmed — skip the update.
    if (tenant.emailConfirmedAt !== null) {
      return { status: 'already-confirmed' as const };
    }

    await tx.tenant.update({
      where: { id: tenantId },
      data: { emailConfirmedAt: new Date() },
    });

    return { status: 'confirmed' as const };
  }, TX_OPTIONS);
}
