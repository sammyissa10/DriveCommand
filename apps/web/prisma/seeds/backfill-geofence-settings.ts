/**
 * One-time backfill: insert TenantNotificationSettings rows for 'geofence.alert'
 * for all existing tenants that don't already have one.
 *
 * Run: cd apps/web && npm run seed:backfill-geofence
 *
 * (or directly: cd apps/web && npx tsx prisma/seeds/backfill-geofence-settings.ts)
 */
import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

import dotenv from 'dotenv';
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '.env.local' });
dotenv.config();

import { PrismaClient } from '../../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenants = await prisma.tenant.findMany({
    select: { id: true },
  });

  const existingSettings = await prisma.tenantNotificationSettings.findMany({
    where: { triggerKey: 'geofence.alert' },
    select: { tenantId: true },
  });

  const existingTenantIds = new Set(existingSettings.map((s) => s.tenantId));
  const tenantsToBackfill = tenants.filter((t) => !existingTenantIds.has(t.id));

  console.log('TenantNotificationSettings backfill — geofence.alert');
  console.log('====================================================');
  console.log(`Total tenants:              ${tenants.length}`);
  console.log(`Already have settings row:  ${existingSettings.length}`);
  console.log(`To backfill:                ${tenantsToBackfill.length}`);

  if (tenantsToBackfill.length > 0) {
    const result = await prisma.tenantNotificationSettings.createMany({
      data: tenantsToBackfill.map((t) => ({
        tenantId: t.id,
        triggerKey: 'geofence.alert',
        isActive: true,
      })),
      skipDuplicates: true,
    });
    console.log(`Inserted:                   ${result.count} rows`);
  } else {
    console.log('Nothing to backfill.');
  }

  // Verification
  const finalCount = await prisma.tenantNotificationSettings.count({
    where: { triggerKey: 'geofence.alert' },
  });
  console.log(`\nVerification:`);
  console.log(`  Total tenants:   ${tenants.length}`);
  console.log(`  Settings rows:   ${finalCount}`);
  console.log(
    tenants.length === finalCount
      ? '  STATUS: MATCH - all tenants have geofence.alert settings'
      : `  STATUS: MISMATCH (${finalCount} / ${tenants.length}) - investigate`
  );
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
