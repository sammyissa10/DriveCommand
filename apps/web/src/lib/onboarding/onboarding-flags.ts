import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { setTransactionTenantId } from '@/lib/db/tenant-guc';

export interface OnboardingFlags {
  hasClient: boolean;
  hasContract: boolean;
  hasLoad: boolean;
  hasTrip: boolean;
}

/**
 * Onboarding step completion, derived from real records (not click-tracking).
 * Sample/seeded rows and soft-deleted rows are excluded so demo data never marks
 * a step done.
 *
 * ─── EXTRACTED FROM welcome/page.tsx (quick-601) ────────────────────────────
 *
 * Lifted out of the page for the same reason as `confirmTenantEmail`: a server
 * component cannot be driven by the `app_user` verification harness, and these
 * four counts are the last statements on the hydration path.
 *
 * The former `app.bypass_rls` was DECORATIVE — every count already carries an
 * explicit `orgId` filter, and `clients` / `contracts` / `loads` / `dispatches`
 * all run `tenant_isolation_policy` on `org_id = current_tenant_id()`. Under a
 * tenant-scoped role with no GUC they return zero, which renders the activation
 * checklist with every step incomplete on a tenant that just seeded four of them
 * — a wrong screen, not an error.
 */
export async function getOnboardingFlags(tenantId: string): Promise<OnboardingFlags> {
  return prisma.$transaction(async (tx) => {
    await setTransactionTenantId(tx, tenantId);
    const [clients, contracts, loads, trips] = await Promise.all([
      tx.carrierClient.count({ where: { orgId: tenantId, isSample: false, deletedAt: null } }),
      tx.carrierContract.count({ where: { orgId: tenantId, deletedAt: null } }),
      tx.carrierLoad.count({ where: { orgId: tenantId, isSample: false, deletedAt: null } }),
      tx.trip.count({ where: { orgId: tenantId, deletedAt: null } }),
    ]);
    return {
      hasClient: clients > 0,
      hasContract: contracts > 0,
      hasLoad: loads > 0,
      hasTrip: trips > 0,
    };
  }, TX_OPTIONS);
}

/**
 * The tenant's provisioning phase, read for the welcome page's advisory log and
 * for its post-failure state check.
 *
 * Same shape, same reason. `tenant_self_read` admits it once the GUC is set.
 */
export async function readTenantProvisioningState(tenantId: string): Promise<{
  provisioningPhase: string;
  sampleDataSeeded: boolean;
} | null> {
  return prisma.$transaction(async (tx) => {
    await setTransactionTenantId(tx, tenantId);
    return tx.tenant.findUnique({
      where: { id: tenantId },
      select: { provisioningPhase: true, sampleDataSeeded: true },
    });
  }, TX_OPTIONS);
}
