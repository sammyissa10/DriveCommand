import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { ProvisioningPhase } from '../../generated/prisma';
import { seedSampleData } from './seed-sample-data';

export async function hydrateTenant(tenantId: string): Promise<void> {
  console.log('[hydrateTenant] starting for tenantId:', tenantId);

  // Idempotency check — read current state first
  const tenant = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  }, TX_OPTIONS);

  if (tenant.provisioningPhase === ProvisioningPhase.HYDRATED) {
    console.log('[hydrateTenant] already HYDRATED, skipping');
    return;
  }

  // Find the owner user (role=OWNER) to use as driverId for sample loads
  const ownerUser = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.user.findFirstOrThrow({
      where: { tenantId, role: 'OWNER' },
    });
  }, TX_OPTIONS);

  console.log('[hydrateTenant] seeding samples for bucket:', tenant.fleetSizeBucket);

  // Seed sample data + mark hydrated in one transaction
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

    await seedSampleData(tx, tenantId, tenant.slug, tenant.fleetSizeBucket, ownerUser.id);
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
