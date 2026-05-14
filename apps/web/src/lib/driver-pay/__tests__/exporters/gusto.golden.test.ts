/**
 * gusto.golden.test.ts — Golden file tests for the Gusto CSV exporter.
 *
 * Gusto produces different column shapes for W-2 vs 1099:
 * - W-2: employee_email, regular_hours, bonus, reimbursement, etc.
 * - 1099: contractor_email, wage, reimbursement, bonus
 *
 * Two separate golden files: gusto.w2.golden.csv and gusto.1099.golden.csv.
 * Each call to build() receives a HOMOGENEOUS list (API route splits before calling).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { gustoExporter } from '../../exporters/gusto';
import { w2Settlement, c1099Settlement } from './__fixtures__/settlements.fixture';

const FIXTURES = join(__dirname, '__fixtures__');

async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as string | Buffer));
  }
  return Buffer.concat(chunks).toString('utf8');
}

describe('gustoExporter golden — W-2', () => {
  it('matches W-2 golden', async () => {
    const stream = gustoExporter.build([w2Settlement]);
    const actual = await streamToString(stream);
    const expected = readFileSync(join(FIXTURES, 'gusto.w2.golden.csv'), 'utf8');
    expect(actual).toBe(expected);
  });

  it('uses employee_email column for W-2', async () => {
    const stream = gustoExporter.build([w2Settlement]);
    const actual = await streamToString(stream);
    expect(actual).toContain('employee_email');
    expect(actual).toContain('w2.driver+test@example.invalid');
  });

  it('includes bonus column for W-2 (gross_taxable + bonuses)', async () => {
    const stream = gustoExporter.build([w2Settlement]);
    const actual = await streamToString(stream);
    // bonus = grossTaxable(2500.00) + bonusTotal(150.00) = 2650.00
    expect(actual).toContain('2650.00');
  });

  it('includes reimbursement column for non-taxable gross (per-diem)', async () => {
    const stream = gustoExporter.build([w2Settlement]);
    const actual = await streamToString(stream);
    // grossNonTaxable = 50.00
    expect(actual).toContain('50.00');
  });

  it('handles empty W-2 input', async () => {
    const stream = gustoExporter.build([]);
    const actual = await streamToString(stream);
    expect(actual).toBe('');
  });
});

describe('gustoExporter golden — 1099', () => {
  it('matches 1099 golden', async () => {
    const stream = gustoExporter.build([c1099Settlement]);
    const actual = await streamToString(stream);
    const expected = readFileSync(join(FIXTURES, 'gusto.1099.golden.csv'), 'utf8');
    expect(actual).toBe(expected);
  });

  it('uses contractor_email column for 1099', async () => {
    const stream = gustoExporter.build([c1099Settlement]);
    const actual = await streamToString(stream);
    expect(actual).toContain('contractor_email');
    expect(actual).toContain('c1099.driver+test@example.invalid');
  });

  it('includes wage column with gross taxable for 1099', async () => {
    const stream = gustoExporter.build([c1099Settlement]);
    const actual = await streamToString(stream);
    // wage = 3800.00
    expect(actual).toContain('3800.00');
  });

  it('includes bonus column for 1099 bonuses', async () => {
    const stream = gustoExporter.build([c1099Settlement]);
    const actual = await streamToString(stream);
    // referral bonus = 200.00
    expect(actual).toContain('200.00');
  });

  it('includes quantity>1 fixture without errors (1099 qty=2)', async () => {
    // 1099 exporter processes settlement-level; qty=2 in payComponents does not affect output
    const stream = gustoExporter.build([c1099Settlement]);
    const actual = await streamToString(stream);
    // 1099 fixture has 2 payComponents with qty=2 — one row per settlement expected
    const lines = actual.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2); // header + 1 data row
  });

  it('build() returns a Readable', () => {
    const stream = gustoExporter.build([c1099Settlement]);
    expect(stream).toBeInstanceOf(Readable);
  });
});
