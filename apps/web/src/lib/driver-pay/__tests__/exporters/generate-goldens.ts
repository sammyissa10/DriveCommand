/**
 * generate-goldens.ts — Standalone script to generate golden fixture files.
 * Run via: npx tsx src/lib/driver-pay/__tests__/exporters/generate-goldens.ts
 *
 * Outputs LF-only CSV files regardless of OS.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { w2Settlement, c1099Settlement } from './__fixtures__/settlements.fixture';
import { genericCsvExporter } from '../../exporters/generic-csv';
import { quickbooksExporter } from '../../exporters/quickbooks';
import { adpExporter } from '../../exporters/adp';
import { gustoExporter } from '../../exporters/gusto';

const fixturesDir = join(__dirname, '__fixtures__');

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as string | Buffer));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const both = [w2Settlement, c1099Settlement];
  const w2Only = [w2Settlement];
  const c1099Only = [c1099Settlement];

  // Generic CSV — both
  const genericBoth = await streamToString(genericCsvExporter.build(both));
  writeFileSync(join(fixturesDir, 'generic-csv.golden.csv'), genericBoth.replace(/\r\n/g, '\n'), { encoding: 'utf8' });
  console.log('generic-csv.golden.csv written');

  // QuickBooks CSV — both
  const qbBoth = await streamToString(quickbooksExporter.build(both));
  writeFileSync(join(fixturesDir, 'quickbooks.golden.csv'), qbBoth.replace(/\r\n/g, '\n'), { encoding: 'utf8' });
  console.log('quickbooks.golden.csv written');

  // ADP CSV — both
  const adpBoth = await streamToString(adpExporter.build(both));
  writeFileSync(join(fixturesDir, 'adp.golden.csv'), adpBoth.replace(/\r\n/g, '\n'), { encoding: 'utf8' });
  console.log('adp.golden.csv written');

  // Gusto — W-2 only (homogeneous)
  const gustoW2 = await streamToString(gustoExporter.build(w2Only));
  writeFileSync(join(fixturesDir, 'gusto.w2.golden.csv'), gustoW2.replace(/\r\n/g, '\n'), { encoding: 'utf8' });
  console.log('gusto.w2.golden.csv written');

  // Gusto — 1099 only (homogeneous)
  const gusto1099 = await streamToString(gustoExporter.build(c1099Only));
  writeFileSync(join(fixturesDir, 'gusto.1099.golden.csv'), gusto1099.replace(/\r\n/g, '\n'), { encoding: 'utf8' });
  console.log('gusto.1099.golden.csv written');

  console.log('All golden files written to', fixturesDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
