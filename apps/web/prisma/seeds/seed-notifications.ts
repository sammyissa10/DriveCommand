/**
 * Notification Templates Seed Runner
 *
 * Imports all 9 category arrays, concatenates, and upserts each template
 * by triggerKey. Idempotent: running twice produces identical state.
 *
 * Upsert semantics:
 *   - subject, blockJson, availableVariables, defaultRecipients → updated on every run
 *   - isActive, inAppEnabled → set on INSERT only (never overwrite SysAdmin runtime toggles)
 *
 * Usage:
 *   npm run seed:notifications
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
import { userTemplates } from './notification-template-data/user';
import { loadTemplates } from './notification-template-data/load';
import { driverTemplates } from './notification-template-data/driver';
import { truckTemplates } from './notification-template-data/truck';
import { messageTemplates } from './notification-template-data/message';
import { financeTemplates } from './notification-template-data/finance';
import { routeTemplates } from './notification-template-data/route';
import { customerTemplates } from './notification-template-data/customer';
import { digestTemplates } from './notification-template-data/digest';
import type { NotificationTemplateSeed } from '../../src/lib/notifications/types';

const pool = new Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ALL_TEMPLATES: NotificationTemplateSeed[] = [
  ...userTemplates,
  ...loadTemplates,
  ...driverTemplates,
  ...truckTemplates,
  ...messageTemplates,
  ...financeTemplates,
  ...routeTemplates,
  ...customerTemplates,
  ...digestTemplates,
];

// Validation: every {{var}} used in a template must be declared in availableVariables
function validateSeed(seed: NotificationTemplateSeed): string[] {
  const errors: string[] = [];
  const declared = new Set(seed.availableVariables.map((v) => v.name));
  const subjectTokens = [...seed.defaultSubject.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  const bodyText = JSON.stringify(seed.defaultBlockJson);
  const bodyTokens = [...bodyText.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  const used = new Set([...subjectTokens, ...bodyTokens]);
  for (const token of used) {
    if (!declared.has(token)) {
      errors.push(`Template ${seed.triggerKey}: uses {{${token}}} but it is not in availableVariables`);
    }
  }
  return errors;
}

async function main() {
  console.log('Notification Templates Seed');
  console.log('===========================\n');
  console.log(`Total templates to seed: ${ALL_TEMPLATES.length}`);

  // Validate all seeds before writing anything
  const errors = ALL_TEMPLATES.flatMap(validateSeed);
  if (errors.length > 0) {
    console.error('\nSeed validation failed:');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log('Validation: passed\n');

  // Validate uniqueness of trigger keys
  const seen = new Set<string>();
  for (const t of ALL_TEMPLATES) {
    if (seen.has(t.triggerKey)) {
      console.error(`Duplicate triggerKey: ${t.triggerKey}`);
      process.exit(1);
    }
    seen.add(t.triggerKey);
  }

  let inserted = 0;
  let updated = 0;

  for (const seed of ALL_TEMPLATES) {
    const existing = await prisma.notificationTemplate.findUnique({
      where: { triggerKey: seed.triggerKey },
    });

    if (existing) {
      await prisma.notificationTemplate.update({
        where: { triggerKey: seed.triggerKey },
        data: {
          category: seed.category,
          displayName: seed.displayName,
          description: seed.description,
          defaultSubject: seed.defaultSubject,
          defaultBlockJson: seed.defaultBlockJson as object,
          availableVariables: seed.availableVariables as object,
          defaultRecipients: seed.defaultRecipients as object,
          // intentionally NOT updating isActive or inAppEnabled — SysAdmin owns those at runtime
        },
      });
      updated++;
    } else {
      await prisma.notificationTemplate.create({
        data: {
          triggerKey: seed.triggerKey,
          category: seed.category,
          displayName: seed.displayName,
          description: seed.description,
          defaultSubject: seed.defaultSubject,
          defaultBlockJson: seed.defaultBlockJson as object,
          availableVariables: seed.availableVariables as object,
          defaultRecipients: seed.defaultRecipients as object,
          isActive: seed.isActive,
          inAppEnabled: seed.inAppEnabled,
        },
      });
      inserted++;
    }
  }

  console.log(`Inserted: ${inserted}`);
  console.log(`Updated:  ${updated}`);
  console.log(`Total:    ${inserted + updated}`);

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await pool.end();
  process.exit(1);
});
