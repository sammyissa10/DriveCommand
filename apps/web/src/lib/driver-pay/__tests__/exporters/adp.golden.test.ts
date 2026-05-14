/**
 * adp.golden.test.ts — Golden file tests for the ADP Run CSV exporter.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { adpExporter } from '../../exporters/adp';
import { w2Settlement, c1099Settlement } from './__fixtures__/settlements.fixture';

const FIXTURES = join(__dirname, '__fixtures__');

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as string | Buffer));
  }
  return Buffer.concat(chunks).toString('utf8');
}

describe('adpExporter golden', () => {
  it('matches golden for W-2 + 1099 combined input', async () => {
    const stream = adpExporter.build([w2Settlement, c1099Settlement]);
    const actual = await streamToString(stream);
    const expected = readFileSync(join(FIXTURES, 'adp.golden.csv'), 'utf8');
    expect(actual).toBe(expected);
  });

  it('handles 1099-only input — emits 1099 earnings code', async () => {
    const stream = adpExporter.build([c1099Settlement]);
    const actual = await streamToString(stream);
    expect(actual).toContain('1099');
    expect(actual).toContain('3800.00');
  });

  it('W-2 settlement uses MISC earnings code', async () => {
    const stream = adpExporter.build([w2Settlement]);
    const actual = await streamToString(stream);
    expect(actual).toContain('MISC');
    expect(actual).toContain('2500.00');
  });

  it('emits TODO placeholders for carrier-specific columns', async () => {
    const stream = adpExporter.build([w2Settlement]);
    const actual = await streamToString(stream);
    expect(actual).toContain('TODO:CO_CODE');
    expect(actual).toContain('TODO:BATCH_ID');
    expect(actual).toContain('TODO:FILE_NUM');
  });

  it('includes quantity>1 fixture without errors (1099 qty=2)', async () => {
    // qty=2 does not affect ADP row count — one row per settlement
    const stream = adpExporter.build([c1099Settlement]);
    const actual = await streamToString(stream);
    const lines = actual.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2); // header + 1 data row
  });

  it('includes deduction (negative amount handled in net pay, not separate column)', async () => {
    // ADP uses gross_taxable as earnings amount — deductions are not separate columns
    const stream = adpExporter.build([w2Settlement]);
    const actual = await streamToString(stream);
    // W-2 grossTaxable = 2500.00
    expect(actual).toContain('2500.00');
  });

  it('build() returns a Readable', () => {
    const stream = adpExporter.build([w2Settlement]);
    expect(stream).toBeInstanceOf(Readable);
  });
});
