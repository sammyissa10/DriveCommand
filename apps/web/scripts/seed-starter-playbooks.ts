import { prisma } from '../src/lib/db/prisma';
import { seedStarterPlaybooks } from '../src/server/services/workflows/seedStarterPlaybooks';

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  console.log(`Seeding starter playbooks for ${tenants.length} tenant(s)...`);

  for (const t of tenants) {
    try {
      await seedStarterPlaybooks(t.id);
      console.log(`  ✓ ${t.name} (${t.id})`);
    } catch (e) {
      console.error(`  ✗ ${t.name}: ${(e as Error).message}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
