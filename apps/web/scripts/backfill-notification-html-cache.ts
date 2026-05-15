/**
 * One-shot backfill: compute Tiptap HTML for every NotificationTemplate row
 * with NULL defaultHtmlCache.
 *
 * Runs in Node via tsx — bypasses Next.js RSC bundling entirely, so it can
 * import @tiptap/html and the extension packages without triggering the
 * Client Reference promotion that caused the production preview failure.
 *
 * Usage: from apps/web run:
 *   npx tsx --env-file=.env.local scripts/backfill-notification-html-cache.ts
 */
import { PrismaClient } from '../src/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { generateHTML } from '@tiptap/html/server';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Heading from '@tiptap/extension-heading';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Link from '@tiptap/extension-link';
import HardBreak from '@tiptap/extension-hard-break';
import BulletList from '@tiptap/extension-bullet-list';
import OrderedList from '@tiptap/extension-ordered-list';
import ListItem from '@tiptap/extension-list-item';

const extensions = [
  Document,
  Paragraph,
  Text,
  Heading.configure({ levels: [1, 2, 3] }),
  Bold,
  Italic,
  Link.configure({ openOnClick: false, autolink: false }),
  HardBreak,
  BulletList,
  OrderedList,
  ListItem,
];

async function main() {
  // Use DIRECT_URL for migrations/scripts (bypasses pgbouncer for raw operations)
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Neither DIRECT_URL nor DATABASE_URL is set in environment');
  }

  const pool = new Pool({ connectionString, max: 1 });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const rows = await prisma.notificationTemplate.findMany({
    where: { defaultHtmlCache: null },
    select: { id: true, triggerKey: true, defaultBlockJson: true },
  });
  console.log(`[backfill] found ${rows.length} NotificationTemplate rows with NULL defaultHtmlCache`);
  for (const row of rows) {
    try {
      const html = generateHTML(row.defaultBlockJson as Parameters<typeof generateHTML>[0], extensions);
      await prisma.notificationTemplate.update({
        where: { id: row.id },
        data: { defaultHtmlCache: html },
      });
      console.log(`[backfill] ${row.triggerKey} -> ${html.length} chars cached`);
    } catch (err) {
      console.error(`[backfill] FAILED ${row.triggerKey}:`, err);
    }
  }
  await prisma.$disconnect();
  await pool.end();
  console.log('[backfill] done');
}

main().catch((err) => { console.error(err); process.exit(1); });
