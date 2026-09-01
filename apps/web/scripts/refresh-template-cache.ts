/**
 * refresh-template-cache.ts
 *
 * Regenerates `NotificationTemplate.defaultHtmlCache` from each row's stored
 * `defaultBlockJson`, through the same Tiptap renderer the seed uses.
 *
 * ===========================================================================
 * WHAT THIS ACTUALLY FIXES — worth being precise, because it is NOT what a
 * "shell change" implies
 * ===========================================================================
 * `defaultHtmlCache` holds the BODY HTML only: the Tiptap output that
 * `renderTemplate` substitutes variables into and hands to the shell. The shell
 * itself is applied at render time, every send. So **a change to Shell.tsx does
 * not require this script at all** — it reaches every email on the next send
 * with no cache work.
 *
 * What this script fixes is drift between `defaultBlockJson` (the source) and
 * `defaultHtmlCache` (the derived copy). That drift is real and has happened:
 * the `driver.invited` seed once carried `headerText: 'DriveCommand'`, was
 * corrected, and the cache was never regenerated — so the stale `<h2>` outlived
 * the fix. `defaultHtmlCache` is only ever written on seed INSERT or by a human
 * pressing Save in the SysAdmin block editor, and nothing else reconciles it.
 *
 * Note that the specific `<h2>DriveCommand</h2>` duplication is now ALSO handled
 * at render time by `body-html-transform.ts` transform 2, so it no longer
 * depends on this script running. This is the durable fix for the source of
 * truth; the transform is the safety net for rows nobody refreshes.
 *
 * ===========================================================================
 * SAFETY
 * ===========================================================================
 * Dry-run is the DEFAULT. `--write` is required to persist anything, and is the
 * only path that opens a write transaction. `defaultBlockJson` is never
 * modified — this regenerates a derived column from an untouched source.
 *
 * Usage (from apps/web/):
 *   npx tsx --env-file=.env.local scripts/refresh-template-cache.ts
 *   npx tsx --env-file=.env.local scripts/refresh-template-cache.ts --trigger=trip.reminder
 *   npx tsx --env-file=.env.local scripts/refresh-template-cache.ts --write
 */

import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

import dotenv from 'dotenv';
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '.env.local' });
dotenv.config();

import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';
// '@tiptap/html/server', NOT '@tiptap/html' — the default entry throws
// "generateHTML can only be used in a browser environment" under Node, and the
// types resolve identically so tsc cannot see the difference. Same note as
// prisma/seeds/seed-notifications.ts, which this deliberately mirrors: if the
// two ever render differently, a refresh would silently rewrite every row.
import { generateHTML } from '@tiptap/html/server';
import StarterKit from '@tiptap/starter-kit';
import { transformBodyHtml } from '../src/lib/notifications/body-html-transform';
import { substituteVariables } from '../src/lib/notifications/template-renderer';

const pool = new Pool({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const WRITE = argv.includes('--write');
const TRIGGER = argv.find((a) => a.startsWith('--trigger='))?.split('=')[1];
const DIFF_LIMIT = 3;

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

/**
 * Tiptap emits the whole body as ONE line, so a plain line diff would report
 * "everything changed" and show nothing useful. Splitting on tag boundaries
 * gives a diff a person can actually read.
 */
function toLines(html: string): string[] {
  return html.replace(/></g, '>\n<').split('\n');
}

/** Standard LCS table — the bodies here are a few dozen pseudo-lines. */
function unifiedDiff(before: string, after: string): string {
  const a = toLines(before);
  const b = toLines(after);
  const m = a.length;
  const n = b.length;

  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push(`  ${a[i]}`);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push(`- ${a[i]}`);
      i++;
    } else {
      out.push(`+ ${b[j]}`);
      j++;
    }
  }
  while (i < m) out.push(`- ${a[i++]}`);
  while (j < n) out.push(`+ ${b[j++]}`);

  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

type Row = {
  id: string;
  triggerKey: string;
  defaultBlockJson: unknown;
  defaultHtmlCache: string | null;
  availableVariables: unknown;
};

async function main(): Promise<void> {
  console.log(`Mode: ${WRITE ? 'WRITE — rows will be persisted' : 'DRY RUN (default)'}`);
  if (TRIGGER) console.log(`Scoped to trigger: ${TRIGGER}`);
  console.log('');

  const rows = await prisma.$transaction(async (tx) => {
    // @bypass_rls reason: maintenance script over a global (non-tenant) table.
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.notificationTemplate.findMany({
      where: TRIGGER ? { triggerKey: TRIGGER } : undefined,
      select: {
        id: true,
        triggerKey: true,
        defaultBlockJson: true,
        defaultHtmlCache: true,
        availableVariables: true,
      },
      orderBy: { triggerKey: 'asc' },
    });
  });

  console.log(`Total rows: ${rows.length}`);

  const changed: { row: Row; fresh: string }[] = [];
  const failed: { triggerKey: string; error: string }[] = [];
  const transformFired: { triggerKey: string; notes: string[] }[] = [];

  for (const row of rows as Row[]) {
    let fresh: string;
    try {
      fresh = generateHTML(row.defaultBlockJson as Parameters<typeof generateHTML>[0], [
        StarterKit,
      ]);
    } catch (err) {
      failed.push({
        triggerKey: row.triggerKey,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    if (fresh !== row.defaultHtmlCache) changed.push({ row, fresh });

    // Report which rows the RENDER-TIME transforms will act on.
    //
    // The sample values MATTER and this was wrong on the first run: the cached
    // HTML still contains `{{driverName}}` tokens, and in production the
    // transforms run AFTER substitution. Checking the raw cache reported that
    // the greeting transform fires on zero rows, which is true of the token
    // text and false of the email anybody receives. `availableVariables` exists
    // to carry exactly these samples.
    //
    // This does not affect what is WRITTEN — the cache stores untransformed
    // body HTML — it is the visibility step 9 asks for.
    const samples: Record<string, string> = {};
    for (const v of (row.availableVariables as { name: string; sampleValue?: string }[]) ?? []) {
      if (v?.name) samples[v.name] = v.sampleValue ?? `<${v.name}>`;
    }
    const { notes } = transformBodyHtml(substituteVariables(fresh, samples));
    const structural = notes.filter(
      (n) => n.startsWith('banner: removed') || n.startsWith('greeting: split'),
    );
    if (structural.length > 0) transformFired.push({ triggerKey: row.triggerKey, notes: structural });
  }

  console.log(`Rows whose HTML would change: ${changed.length}`);
  console.log(`Rows that failed to render: ${failed.length}`);
  for (const f of failed) console.log(`  FAILED ${f.triggerKey}: ${f.error}`);

  console.log('');
  console.log(`Rows where transform 2 (banner) or 3 (greeting) fires: ${transformFired.length}`);
  for (const t of transformFired) {
    console.log(`  ${t.triggerKey}`);
    for (const n of t.notes) console.log(`      ${n}`);
  }

  if (changed.length > 0) {
    console.log('');
    console.log(`Diffs (first ${Math.min(DIFF_LIMIT, changed.length)} of ${changed.length}):`);
    for (const { row, fresh } of changed.slice(0, DIFF_LIMIT)) {
      console.log(`\n--- ${row.triggerKey} (cached)`);
      console.log(`+++ ${row.triggerKey} (regenerated)`);
      console.log(unifiedDiff(row.defaultHtmlCache ?? '', fresh));
    }
  }

  if (!WRITE) {
    console.log('');
    console.log('Dry run — nothing written. Re-run with --write to persist.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    // @bypass_rls reason: maintenance script over a global (non-tenant) table.
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    for (const { row, fresh } of changed) {
      // defaultBlockJson is NOT touched. Only the derived column is written.
      await tx.notificationTemplate.update({
        where: { id: row.id },
        data: { defaultHtmlCache: fresh },
      });
    }
  });

  console.log('');
  console.log(`Wrote ${changed.length} rows.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
