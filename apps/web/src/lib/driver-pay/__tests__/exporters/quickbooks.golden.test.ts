/**
 * quickbooks.golden.test.ts — Golden file tests for the QuickBooks CSV exporter.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { quickbooksExporter } from '../../exporters/quickbooks';
import { w2Settlement, c1099Settlement } from './__fixtures__/settlements.fixture';

const FIXTURES = join(__dirname, '__fixtures__');

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as string | Buffer));
  }
  return Buffer.concat(chunks).toString('utf8');
}

describe('quickbooksExporter golden', () => {
  it('matches golden for W-2 + 1099 combined input', async () => {
    const stream = quickbooksExporter.build([w2Settlement, c1099Settlement]);
    const actual = await streamToString(stream);
    const expected = readFileSync(join(FIXTURES, 'quickbooks.golden.csv'), 'utf8');
    expect(actual).toBe(expected);
  });

  it('handles 1099-only input — emits debit + deduction credits + cash credit', async () => {
    const stream = quickbooksExporter.build([c1099Settlement]);
    const actual = await streamToString(stream);
    // 1099 settlement has 1 deduction — so: 1 debit + 1 credit-deduction + 1 credit-cash = 3 data rows
    const lines = actual.split('\n').filter(Boolean);
    expect(lines).toHaveLength(4); // header + 3 rows
    expect(lines[1]).toContain('Payroll Expense');
    expect(lines[2]).toContain('TODO:DEDUCTION_ACCOUNT');
    expect(lines[3]).toContain('Cash/Checking');
  });

  it('W-2 fixture has 2 deductions — emits header + debit + 2 credits + 1 cash = 5 rows', async () => {
    const stream = quickbooksExporter.build([w2Settlement]);
    const actual = await streamToString(stream);
    const lines = actual.split('\n').filter(Boolean);
    // header + debit + deduction1 + deduction2 + cash = 5
    expect(lines).toHaveLength(5);
  });

  it('Date is formatted as MM/DD/YYYY', async () => {
    const stream = quickbooksExporter.build([w2Settlement]);
    const actual = await streamToString(stream);
    // finalizedAt = 2026-04-08T12:00:00Z → 04/08/2026
    expect(actual).toContain('04/08/2026');
  });

  it('deduction amounts are positive in Credits column (abs value applied)', async () => {
    const stream = quickbooksExporter.build([w2Settlement]);
    const actual = await streamToString(stream);
    // deduction -25.50 should appear as 25.50 in credits
    expect(actual).toContain(',25.50,');
    // deduction -400.00 should appear as 400.00
    expect(actual).toContain(',400.00,');
  });

  it('uses TODO:DEDUCTION_ACCOUNT placeholder for deductions', async () => {
    const stream = quickbooksExporter.build([w2Settlement]);
    const actual = await streamToString(stream);
    expect(actual).toContain('TODO:DEDUCTION_ACCOUNT');
  });

  it('includes quantity>1 fixture without errors (1099 qty=2)', async () => {
    // Should not throw; 1099 exporter processes regardless of payComponent quantity
    const stream = quickbooksExporter.build([c1099Settlement]);
    const actual = await streamToString(stream);
    expect(actual).toContain('SET-2026-04-1099-001');
  });

  it('build() returns a Readable', () => {
    const stream = quickbooksExporter.build([w2Settlement]);
    expect(stream).toBeInstanceOf(Readable);
  });
});
