/**
 * Backfill script (quick-497 Task 3): give existing "stuck" drivers an onboarding
 * checklist and coherent dispatch readiness.
 *
 * Context: before quick-497, DRIVER PlaybookInstances were never auto-created (no
 * tenant had an ON_DRIVER_CREATE Auto-Start Rule), so getDriverReadiness read the
 * stale User.isDispatchReady DB default (false) and returned an unactionable
 * { isReady:false, blockerStepNames:[] } dead-end. quick-497 fixed the resolver
 * (derives live from step instances) and the auto-start wiring (seeded default
 * trigger + fired at invite acceptance / driver create), but existing tenants and
 * their already-onboarded-in-the-real-world drivers still have ZERO PlaybookInstance
 * rows. This script backfills both:
 *
 *   1. Ensures every tenant has the default-on ON_DRIVER_CREATE -> CDL Driver
 *      Onboarding trigger (so FUTURE drivers auto-start, not just new tenants).
 *   2. Ensures every existing linked (userId != null, role=DRIVER) carrier driver
 *      has an active onboarding PlaybookInstance, and recomputes readiness so
 *      User.isDispatchReady (read by trips.ts server enforcement) is coherent.
 *
 * DECISION (plan Task 3 step 5): chose the DRY "apply optional-tenantPrisma to
 * computeDispatchReadiness" path (already carried out in the same commit) over the
 * direct-isDispatchReady-set alternative — it reuses one source of truth instead of
 * duplicating the blocker-aggregation logic in this script.
 *
 * Idempotent: safe to run twice. The playbook (seedStarterPlaybooks sentinel), the
 * trigger (explicit existence check), and the instance (existing-active-instance
 * pre-check + generatePlaybookInstance's own CONFLICT de-dupe) are all checked
 * before creating.
 *
 * Does NOT push, deploy, or wire into any cron/build step — this is a one-off
 * maintenance script the user runs manually.
 *
 * Run from apps/web:
 *   npx tsx --env-file=.env.local scripts/backfill-driver-onboarding-instances.ts
 *
 * IMPORTANT: this mutates data (creates PlaybookInstance/StepInstance/PlaybookTrigger
 * rows and updates User.isDispatchReady). The executor of quick-497 does NOT run
 * this — it is the USER's call, against their own DB.
 */
import { prisma } from '../src/lib/db/prisma';
import { getTenantPrismaForOrg } from '../src/lib/context/tenant-context';
import { seedStarterPlaybooks } from '../src/server/services/workflows/seedStarterPlaybooks';
import { generatePlaybookInstance } from '../src/server/services/workflows/generatePlaybookInstance';
import { computeDispatchReadiness } from '../src/server/services/workflows/computeDispatchReadiness';

interface TenantSummary {
  tenantId: string;
  tenantName: string;
  triggerCreated: boolean;
  instancesCreated: number;
  alreadyHadInstance: number;
  driversProcessed: number;
  errors: number;
}

async function main() {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  console.log(`[backfill-driver-onboarding] Processing ${tenants.length} active tenant(s)...`);

  const summaries: TenantSummary[] = [];

  for (const tenant of tenants) {
    const summary: TenantSummary = {
      tenantId: tenant.id,
      tenantName: tenant.name,
      triggerCreated: false,
      instancesCreated: 0,
      alreadyHadInstance: 0,
      driversProcessed: 0,
      errors: 0,
    };

    try {
      // 1. Ensure the CDL Driver Onboarding playbook exists (no-op if already seeded;
      //    for a freshly-seeded tenant this ALSO seeds the default trigger — step 2 below
      //    only needs to backfill the trigger for tenants seeded before quick-497).
      await seedStarterPlaybooks(tenant.id);

      const tenantPrisma = await getTenantPrismaForOrg(tenant.id);

      // 3. Resolve the CDL Driver Onboarding playbook id for this tenant.
      const cdlPlaybook = await prisma.playbook.findFirst({
        where: { tenantId: tenant.id, name: 'CDL Driver Onboarding' },
        select: { id: true },
      });

      if (!cdlPlaybook) {
        console.error(`  [${tenant.name}] CDL Driver Onboarding playbook not found after seed — skipping`);
        summary.errors++;
        summaries.push(summary);
        continue;
      }

      // 2. Ensure the default ON_DRIVER_CREATE trigger exists for ALREADY-seeded tenants
      //    (seedStarterPlaybooks is a no-op for them, so it never created the trigger).
      const existingTrigger = await tenantPrisma.playbookTrigger.findFirst({
        where: { tenantId: tenant.id, playbookId: cdlPlaybook.id, triggerEvent: 'ON_DRIVER_CREATE' },
        select: { id: true },
      });

      if (!existingTrigger) {
        await tenantPrisma.playbookTrigger.create({
          data: {
            tenantId: tenant.id,
            playbookId: cdlPlaybook.id,
            triggerEvent: 'ON_DRIVER_CREATE',
            conditions: {},
            recurringConfig: { _custom: true },
            isActive: true,
          },
        });
        summary.triggerCreated = true;
      }

      // 4. For each linked (userId != null) carrier driver whose User has role DRIVER,
      //    ensure an active DRIVER PlaybookInstance exists.
      const carrierDrivers = await tenantPrisma.carrierDriver.findMany({
        where: { orgId: tenant.id, userId: { not: null }, deletedAt: null },
        select: { userId: true },
      });

      for (const cd of carrierDrivers) {
        const userId = cd.userId;
        if (!userId) continue;

        const user = await prisma.user.findFirst({
          where: { id: userId, tenantId: tenant.id, role: 'DRIVER' },
          select: { id: true },
        });
        if (!user) continue; // linked account exists but isn't a DRIVER-role User — skip

        summary.driversProcessed++;

        const existingInstance = await tenantPrisma.playbookInstance.findFirst({
          where: {
            tenantId: tenant.id,
            entityType: 'DRIVER',
            entityId: userId,
            status: { not: 'COMPLETED' },
          },
          select: { id: true },
        });

        let instanceId = existingInstance?.id ?? null;

        if (!instanceId) {
          try {
            const newInstance = await generatePlaybookInstance({
              playbookId: cdlPlaybook.id,
              entityType: 'DRIVER',
              entityId: userId,
              tenantId: tenant.id,
              triggeredBy: 'trigger',
              triggeredEvent: 'ON_DRIVER_CREATE',
              tenantPrisma,
            });
            instanceId = newInstance.id;
            summary.instancesCreated++;
          } catch (err) {
            // CONFLICT (duplicate active instance) is a benign race with the
            // pre-check above — anything else is a real error.
            const isConflict = (err as { code?: string })?.code === 'CONFLICT';
            if (!isConflict) {
              console.error(`  [${tenant.name}] generatePlaybookInstance failed for user ${userId}:`, err);
              summary.errors++;
              continue;
            }
          }
        } else {
          summary.alreadyHadInstance++;
        }

        // 5. Recompute readiness so User.isDispatchReady stays coherent (trips.ts
        //    server enforcement path). Uses the same optional-tenantPrisma-refactored
        //    computeDispatchReadiness as the rest of the request-scoped codebase.
        if (instanceId) {
          try {
            await computeDispatchReadiness(instanceId, tenantPrisma);
          } catch (err) {
            console.error(`  [${tenant.name}] computeDispatchReadiness failed for instance ${instanceId}:`, err);
            summary.errors++;
          }
        }
      }

      console.log(
        `  [${tenant.name}] trigger=${summary.triggerCreated ? 'created' : 'ok'}, ` +
        `drivers=${summary.driversProcessed}, instances_created=${summary.instancesCreated}, ` +
        `already_had_instance=${summary.alreadyHadInstance}, errors=${summary.errors}`
      );
    } catch (err) {
      console.error(`  [${tenant.name}] tenant-level failure:`, err);
      summary.errors++;
    }

    summaries.push(summary);
  }

  const totals = summaries.reduce(
    (acc, s) => ({
      tenants: acc.tenants + 1,
      triggersCreated: acc.triggersCreated + (s.triggerCreated ? 1 : 0),
      instancesCreated: acc.instancesCreated + s.instancesCreated,
      alreadyHadInstance: acc.alreadyHadInstance + s.alreadyHadInstance,
      driversProcessed: acc.driversProcessed + s.driversProcessed,
      errors: acc.errors + s.errors,
    }),
    { tenants: 0, triggersCreated: 0, instancesCreated: 0, alreadyHadInstance: 0, driversProcessed: 0, errors: 0 }
  );

  console.log('\n[backfill-driver-onboarding] Summary:');
  console.log(`  Tenants processed:        ${totals.tenants}`);
  console.log(`  Triggers created:         ${totals.triggersCreated}`);
  console.log(`  Drivers processed:        ${totals.driversProcessed}`);
  console.log(`  Instances created:        ${totals.instancesCreated}`);
  console.log(`  Already had instance:     ${totals.alreadyHadInstance}`);
  console.log(`  Errors:                   ${totals.errors}`);

  await prisma.$disconnect();

  if (totals.errors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[backfill-driver-onboarding] Fatal error:', err);
  process.exit(1);
});
