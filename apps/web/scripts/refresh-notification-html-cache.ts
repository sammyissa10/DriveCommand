/**
 * refresh-notification-html-cache.ts
 *
 * Scans all NotificationTemplate rows, detects STALE defaultHtmlCache entries
 * (non-null caches that differ from freshly-serialized defaultBlockJson HTML),
 * and updates ONLY the `driver.invited` row.
 *
 * Background: The seed `headerText` for driver.invited was previously 'DriveCommand',
 * producing an <h2>DriveCommand</h2> in the cached HTML body. That duplicated the
 * shell brand banner in the DynamicTemplateEmail component. The seed was later
 * corrected to 'Driver invitation' but defaultHtmlCache was never regenerated.
 * This script fixes the stale cache row without touching the dispatcher, shell, or
 * any other template.
 *
 * Usage (from apps/web/):
 *   npx tsx --env-file=.env.local scripts/refresh-notification-html-cache.ts
 */

import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

import dotenv from 'dotenv';
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '.env.local' });
dotenv.config();

import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// ---------------------------------------------------------------------------
// Tiptap JSON -> HTML serializer (dependency-free, no @tiptap/html import)
// Covers: doc, heading (h1-h6), paragraph, text with bold/italic/link marks.
// ---------------------------------------------------------------------------

function escText(s: string): string {
  // Replace & FIRST to avoid double-escaping
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s: string): string {
  // Replace & FIRST to avoid double-escaping
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

interface TiptapMark {
  type: string;
  attrs?: Record<string, string | null>;
}

interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
}

function serializeInline(nodes: TiptapNode[] | undefined): string {
  if (!nodes || nodes.length === 0) return '';
  return nodes.map(serializeNode).join('');
}

function serializeNode(node: TiptapNode): string {
  switch (node.type) {
    case 'doc':
      return serializeInline(node.content);

    case 'heading': {
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 2;
      const inner = serializeInline(node.content);
      return `<h${level}>${inner}</h${level}>`;
    }

    case 'paragraph': {
      if (!node.content || node.content.length === 0) {
        return '<p><br></p>';
      }
      const inner = serializeInline(node.content);
      if (inner === '') return '<p><br></p>';
      return `<p>${inner}</p>`;
    }

    case 'text': {
      let html = escText(node.text ?? '');
      const marks: TiptapMark[] = node.marks ?? [];
      for (const mark of marks) {
        if (mark.type === 'link') {
          const href = escAttr(String(mark.attrs?.href ?? ''));
          const target = escAttr(String(mark.attrs?.target ?? '_blank'));
          html = `<a href="${href}" target="${target}" rel="noopener noreferrer nofollow">${html}</a>`;
        } else if (mark.type === 'bold') {
          html = `<strong>${html}</strong>`;
        } else if (mark.type === 'italic') {
          html = `<em>${html}</em>`;
        }
        // unknown mark types: passthrough (no wrapping)
      }
      return html;
    }

    default:
      // Unknown block: serialize children if any
      return serializeInline(node.content);
  }
}

function tiptapJsonToHtml(json: unknown): string {
  return serializeNode(json as TiptapNode);
}

// ---------------------------------------------------------------------------
// Extract the first <h2>…</h2> inner text from an HTML string (for reporting)
// ---------------------------------------------------------------------------
function extractFirstH2(html: string | null): string | null {
  if (!html) return null;
  const match = html.match(/<h2>([\s\S]*?)<\/h2>/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Bootstrap — mirrors seed-notifications.ts exactly
// ---------------------------------------------------------------------------
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERROR: Neither DIRECT_URL nor DATABASE_URL is set in environment');
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('refresh-notification-html-cache');
  console.log('================================\n');

  const rows = await prisma.notificationTemplate.findMany({
    select: {
      id: true,
      triggerKey: true,
      defaultBlockJson: true,
      defaultHtmlCache: true,
    },
  });

  console.log(`Found ${rows.length} NotificationTemplate rows\n`);

  // Build staleness report
  type ReportRow = {
    triggerKey: string;
    status: 'FRESH' | 'STALE' | 'NULL-CACHE';
    oldH2: string | null;
    newH2: string | null;
    freshHtml: string;
    existingHtml: string | null;
  };

  const report: ReportRow[] = [];

  for (const row of rows) {
    const freshHtml = tiptapJsonToHtml(row.defaultBlockJson);
    const existingHtml = row.defaultHtmlCache;

    let status: 'FRESH' | 'STALE' | 'NULL-CACHE';
    if (existingHtml === null) {
      status = 'NULL-CACHE';
    } else if (existingHtml !== freshHtml) {
      status = 'STALE';
    } else {
      status = 'FRESH';
    }

    report.push({
      triggerKey: row.triggerKey,
      status,
      oldH2: extractFirstH2(existingHtml),
      newH2: extractFirstH2(freshHtml),
      freshHtml,
      existingHtml,
    });
  }

  // Print staleness report
  console.log('Staleness Report:');
  console.log('-'.repeat(80));
  console.log(
    'triggerKey'.padEnd(40),
    'status'.padEnd(14),
    'oldH2'.padEnd(20),
    'newH2'
  );
  console.log('-'.repeat(80));
  for (const r of report) {
    console.log(
      r.triggerKey.padEnd(40),
      r.status.padEnd(14),
      (r.oldH2 ?? '(none)').substring(0, 18).padEnd(20),
      r.newH2 ?? '(none)'
    );
  }
  console.log('-'.repeat(80));
  console.log();

  // Summary counts
  const staleRows = report.filter((r) => r.status === 'STALE');
  const nullRows = report.filter((r) => r.status === 'NULL-CACHE');
  console.log(`STALE:      ${staleRows.length}`);
  console.log(`NULL-CACHE: ${nullRows.length}`);
  console.log(`FRESH:      ${report.filter((r) => r.status === 'FRESH').length}`);
  console.log();

  if (staleRows.length > 0) {
    console.log('STALE templates (cache differs from freshly-serialized JSON):');
    for (const r of staleRows) {
      console.log(`  - ${r.triggerKey}  oldH2="${r.oldH2 ?? '(none)'}"  newH2="${r.newH2 ?? '(none)'}" `);
    }
    const otherStale = staleRows.filter((r) => r.triggerKey !== 'driver.invited');
    if (otherStale.length > 0) {
      console.log(
        '\nNOTE: Other stale templates detected (not updated by this script — scope is driver.invited only):'
      );
      for (const r of otherStale) {
        console.log(`  - ${r.triggerKey}`);
      }
    }
    console.log();
  }

  // --- Update ONLY driver.invited ---
  const driverInvited = report.find((r) => r.triggerKey === 'driver.invited');

  if (!driverInvited) {
    console.error('ERROR: driver.invited template not found in database. Aborting.');
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  }

  console.log('driver.invited cache update:');
  console.log(`  Old <h2>:        "${driverInvited.oldH2 ?? '(none)'}" `);
  console.log(`  New <h2>:        "${driverInvited.newH2 ?? '(none)'}" `);
  console.log(`  Old cache bytes: ${driverInvited.existingHtml?.length ?? 0}`);
  console.log(`  New cache bytes: ${driverInvited.freshHtml.length}`);
  console.log();

  if (driverInvited.status === 'FRESH') {
    console.log('driver.invited is already FRESH — no update needed.');
  } else {
    const db_row = rows.find((r) => r.triggerKey === 'driver.invited');
    if (!db_row) {
      throw new Error('driver.invited row missing from DB results');
    }
    await prisma.notificationTemplate.update({
      where: { id: db_row.id },
      data: { defaultHtmlCache: driverInvited.freshHtml },
    });
    console.log('driver.invited defaultHtmlCache updated successfully.');
    console.log(`  Old first <h2>: "${driverInvited.oldH2 ?? '(none)'}" `);
    console.log(`  New first <h2>: "${driverInvited.newH2 ?? '(none)'}" `);
  }

  console.log('\nDone.');

  await prisma.$disconnect();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
