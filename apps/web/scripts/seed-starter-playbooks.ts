import { prisma } from '../src/lib/db/prisma';
import { seedStarterPlaybooks } from '../src/server/services/workflows/seedStarterPlaybooks';

/**
 * quick-623 — THE EXIT STATUS IS THE REPORT.
 *
 * The per-tenant ✓ / ✗ lines were always printed, but the script exited 0 whatever they
 * said, so `migrate.mjs` (which reads only the exit status) and anybody scripting against
 * it saw success while tenants were left with no starter playbooks. Now:
 *
 *   exit 0 — every enumerated tenant seeded or was already seeded;
 *   exit 1 — at least one tenant FAILED (a summary names how many), or the tenant
 *            enumeration itself failed or found ZERO active tenants.
 *
 * Zero is treated as a failure deliberately. The enumeration below is a bare-client read
 * of "Tenant", whose only read policy is `tenant_self_read (id = current_tenant_id())`.
 * Under app_user with no tenant context it returns 0 rows with no error (or TC001 when
 * the tripwire is armed), which printed "Seeding starter playbooks for 0 tenant(s)..." and
 * exited 0: the same silent-success defect one layer up. A real environment always has a
 * tenant; an empty one pays a warning from migrate.mjs, which does not gate on this.
 * Routing the enumeration to a connection that can see every tenant (`getAdminDb`) is the
 * cutover fix; it needs DATABASE_URL_ADMIN in the build environment and is reported, not
 * done, here.
 */
async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  console.log(`Seeding starter playbooks for ${tenants.length} tenant(s)...`);

  if (tenants.length === 0) {
    console.error(
      '  ✗ enumerated ZERO active tenants. On an app_user connection with no tenant context this is ' +
        'row-level security hiding every "Tenant" row, not an empty database. Nothing was seeded.',
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  const failed: string[] = [];
  for (const t of tenants) {
    try {
      await seedStarterPlaybooks(t.id);
      console.log(`  ✓ ${t.name} (${t.id})`);
    } catch (e) {
      failed.push(t.id);
      console.error(`  ✗ ${t.name} (${t.id}): ${(e as Error).message}`);
    }
  }

  await prisma.$disconnect();

  if (failed.length > 0) {
    console.error(
      `Starter playbook seeding FAILED for ${failed.length} of ${tenants.length} tenant(s); ` +
        `those tenants have no starter playbooks. Re-run: npx tsx scripts/seed-starter-playbooks.ts (idempotent).`,
    );
    process.exit(1);
  }
  console.log(`Starter playbooks present for all ${tenants.length} tenant(s).`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
