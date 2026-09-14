import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { setTransactionTenantId } from '@/lib/db/tenant-guc';
import { ProvisioningPhase } from '../../generated/prisma';
import { seedSampleData, SEED_CONFIGS } from './seed-sample-data';
import { generateVehicleIds } from '@/lib/carrier/fleet-trucks';

/**
 * ─── NO BYPASS, TWO TENANT-SCOPED TRANSACTIONS (quick-601) ──────────────────
 *
 * `tenantId` is an argument, so both transactions here were DECORATIVE bypass
 * sites: every read and every one of `seedSampleData`'s nine writes is already
 * keyed to this tenant, and every table it touches carries a satisfiable
 * `tenant_isolation_policy` (`tenantId` on `User`/`Truck`/`Customer`/`Load`,
 * `org_id` on `carrier_trucks`/`clients`/`carrier_drivers`/`loads`). Setting the
 * GUC is all they ever needed.
 *
 * `generateVehicleIds` below was NOT decorative and is the one real dependency
 * this file had on a bypassing role — see the note at its call site.
 */
export async function hydrateTenant(tenantId: string): Promise<void> {
  console.log('[hydrateTenant] starting for tenantId:', tenantId);

  // Read tenant + owner in a single transaction before touching the seeder.
  // Both lookups happen here so the seeding transaction holds the pool connection
  // only while it's doing actual writes — no read-heavy preamble inside.
  const { tenant, ownerUser } = await prisma.$transaction(async (tx) => {
    await setTransactionTenantId(tx, tenantId);
    const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const ownerUser = await tx.user.findFirstOrThrow({ where: { tenantId, role: 'OWNER' } });
    return { tenant, ownerUser };
  }, TX_OPTIONS);

  if (tenant.provisioningPhase === ProvisioningPhase.HYDRATED) {
    console.log('[hydrateTenant] already HYDRATED, skipping');
    return;
  }

  // Pre-generate vehicle IDs OUTSIDE the transaction.
  // generateVehicleIds uses the global prisma client. Calling it inside a
  // prisma.$transaction deadlocks the max:1 pool (transaction holds the only
  // connection; the inner prisma call queues for a connection it can never get).
  //
  // It reads carrier_trucks GLOBALLY and must: carrier_trucks_vehicle_id_key is a
  // global unique index, so a tenant-scoped read cannot see the max and every
  // tenant would be handed VH-<year>-00001. It reaches that global row through a
  // SECURITY DEFINER function, not through a bypassing connection — see
  // lib/carrier/fleet-trucks.ts.
  const vehicleIds = process.env.ONBOARDING_SEED_SAMPLES !== 'false'
    ? await generateVehicleIds(SEED_CONFIGS[tenant.fleetSizeBucket].trucksCount)
    : [];

  console.log('[hydrateTenant] seeding samples for bucket:', tenant.fleetSizeBucket);

  // Seed sample data + mark hydrated in one transaction
  await prisma.$transaction(async (tx) => {
    await setTransactionTenantId(tx, tenantId);

    await seedSampleData(tx, tenantId, tenant.slug, tenant.fleetSizeBucket, ownerUser.id, vehicleIds);
    console.log('[hydrateTenant] samples seeded');

    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        provisioningPhase: ProvisioningPhase.HYDRATED,
        sampleDataSeeded: true,
      },
    });
    console.log('[hydrateTenant] provisioningPhase flipped to HYDRATED');
  }, TX_OPTIONS);
}
