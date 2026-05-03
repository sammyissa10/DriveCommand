import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { ProvisioningPhase } from '../../generated/prisma';
import { seedSampleData, SEED_CONFIGS } from './seed-sample-data';
import { generateVehicleIds } from '@/lib/carrier/fleet-trucks';

export async function hydrateTenant(tenantId: string): Promise<void> {
  console.log('[hydrateTenant] starting for tenantId:', tenantId);

  // Read tenant + owner in a single transaction before touching the seeder.
  // Both lookups happen here so the seeding transaction holds the pool connection
  // only while it's doing actual writes — no read-heavy preamble inside.
  const { tenant, ownerUser } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
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
  const vehicleIds = process.env.ONBOARDING_SEED_SAMPLES !== 'false'
    ? await generateVehicleIds(SEED_CONFIGS[tenant.fleetSizeBucket].trucksCount)
    : [];

  console.log('[hydrateTenant] seeding samples for bucket:', tenant.fleetSizeBucket);

  // Seed sample data + mark hydrated in one transaction
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

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
