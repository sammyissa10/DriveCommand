/**
 * Notification Templates Seed Runner
 *
 * Imports all 11 category arrays, concatenates, and upserts each template
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
import { tripTemplates } from './notification-template-data/trip';
import { importTemplates } from './notification-template-data/import';
// '@tiptap/html/server', NOT '@tiptap/html'. The default entry point throws
// "generateHTML can only be used in a browser environment" under Node and tells
// you so by name; the /server export is the documented Node build. Caught by
// running the seed rather than by reading the types, which resolve identically.
import { generateHTML } from '@tiptap/html/server';
import StarterKit from '@tiptap/starter-kit';
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
  // Document Import Phase 10 — Section 13.
  ...tripTemplates,
  ...importTemplates,
];

/**
 * Render a seed's Tiptap doc to the HTML the dispatcher actually sends.
 *
 * WHY THIS EXISTS, because its absence was a silent failure waiting to happen.
 *
 * `dispatchNotification` reads `defaultHtmlCache` and, when it is null, records
 * a FAILED audit row with "No cached HTML available for trigger" and sends
 * nothing. Until now the ONLY writer of that column was the SysAdmin block
 * editor's save action — a human opening each template in a browser and
 * pressing Save. All 37 pre-existing templates have HTML because somebody did
 * exactly that. Seeding ten new templates without it would have produced ten
 * triggers that look perfectly configured in the UI and deliver nothing, with
 * the failure visible only in `NotificationSendLog`.
 *
 * `template-renderer.ts` says "Tiptap is NOT invoked on the server", and that
 * remains true of the REQUEST PATH — quick-335 moved it out because the Next
 * RSC graph was promoting Tiptap extension symbols to Client References. This
 * is a standalone Node script run from the command line, not part of that graph,
 * so the constraint does not apply here. `@tiptap/html` and `@tiptap/starter-kit`
 * are already dependencies; nothing was installed.
 *
 * `{{token}}` strings survive untouched — verified — because they are ordinary
 * text nodes, which is exactly what `build-template.ts` documents.
 */
function renderSeedHtml(seed: NotificationTemplateSeed): string {
  return generateHTML(seed.defaultBlockJson as Parameters<typeof generateHTML>[0], [StarterKit]);
}

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
          // INSERT ONLY, deliberately. The update branch above leaves this
          // column alone so a SysAdmin's edited HTML is never clobbered by a
          // seed run — which also means the 37 pre-existing templates keep the
          // exact HTML they already have and are untouched by this change.
          defaultHtmlCache: renderSeedHtml(seed),
          // Phase 10. INSERT ONLY, exactly like its two neighbours — a SysAdmin
          // who turns push off for a trigger at runtime must not have it turned
          // back on by the next seed run. `?? false` mirrors the column default,
          // so the 37 pre-Phase-10 seeds that omit the field are unaffected.
          pushEnabled: seed.pushEnabled ?? false,
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
