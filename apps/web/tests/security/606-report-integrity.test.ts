/**
 * quick-606 — report integrity, over THIS TASK'S artefacts.
 *
 * A NEW file. `tests/security/604-report-integrity.test.ts` is untouched: its
 * inputs are a closed task's evidence and must stay byte-identical (asserted by
 * sha256 in `docs/audits/app-user-failure-remediation.md` §9).
 *
 * ─── WHAT THIS ASSERTS, AND WHY EACH ONE EXISTS ────────────────────────────
 *
 *   1. The category SUM equals a failure count derived INDEPENDENTLY from the
 *      verdict fields, never read from the classification's own header. Asserted
 *      on BOTH classifications — the BEFORE (11 failures) and the AFTER (0).
 *   2. **A sum of 0 === 0 is vacuous.** So the BEFORE classification is asserted
 *      to be NON-TRIVIAL: without it, deleting every finding would satisfy the
 *      arithmetic check and this file would go green over an empty corpus. That
 *      is the whole failure mode quick-549 named — a bad slice fails GREEN.
 *   3. Every row of the re-run carries a verdict, and the two honest non-verdicts
 *      carry a reason:
 *        `LATENT`       — a 2xx whose data gate found ZERO rows
 *        `NOT_MEASURED` — no request issued, or the gate could not be read
 *      **Neither is ever merged into `pass` or `fail`**, which is asserted by
 *      counting: pass + fail + LATENT + NOT_MEASURED + not-reachable must equal
 *      the row count exactly, so a row cannot be counted twice or dropped.
 *   4. Anti-vacuity floors: a minimum row count on each artefact, and a check
 *      that the BEFORE and AFTER artefacts describe THE SAME FIFTEEN SURFACES.
 *      An AFTER file with fewer rows than the BEFORE is how a failure quietly
 *      leaves a report.
 *   5. No row is `fail` in the AFTER artefact — the task's actual claim, stated
 *      as an assertion rather than as prose in a document.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const EVIDENCE = resolve(
  __dirname,
  '../../../../.planning/quick/606-fix-the-eleven-measured-app-user-failure/evidence',
);

function readJson(name: string): any {
  const p = resolve(EVIDENCE, name);
  expect(existsSync(p), `${name} is missing from quick-606's evidence directory`).toBe(true);
  return JSON.parse(readFileSync(p, 'utf8').replace(/\r\n/g, '\n'));
}

const BEFORE = readJson('02-reverify.json');
const AFTER = readJson('09-final-verdicts.json');
const BEFORE_CLASS = readJson('02-classification.json');
const AFTER_CLASS = readJson('09-classification.json');

const CATEGORIES = [
  'TRIPWIRE_TC001',
  'MISSING_GRANT',
  'RLS_DENIAL_SATISFIABLE',
  'RLS_DENIAL_NO_POLICY',
  'SOMETHING_ELSE',
] as const;

/** Derived from the VERDICT FIELDS, never from the classification's own header. */
function derivedFailures(doc: any): number {
  return doc.rows.filter((r: any) => r.verdict606 === 'fail').length;
}

describe('quick-606 — report integrity', () => {
  it('both artefacts carry the same FIFTEEN surfaces (anti-vacuity, rule 4)', () => {
    expect(BEFORE.rows.length).toBe(15);
    expect(AFTER.rows.length).toBe(15);
    const ids = (d: any) => d.rows.map((r: any) => r.id).sort();
    // Same set in both directions — an AFTER file that quietly dropped a row
    // would otherwise satisfy every count below.
    expect(ids(AFTER)).toEqual(ids(BEFORE));
    const routes = (d: any) => d.rows.map((r: any) => r.route).sort();
    expect(routes(AFTER)).toEqual(routes(BEFORE));
  });

  it('BEFORE: the category sum equals the independently derived failure count', () => {
    const sum = CATEGORIES.reduce((a, c) => a + (BEFORE_CLASS.counts[c] ?? 0), 0);
    expect(sum).toBe(derivedFailures(BEFORE));
    expect(BEFORE_CLASS.categorySum).toBe(sum);
    expect(BEFORE_CLASS.arithmeticCheckPasses).toBe(true);
  });

  it('BEFORE is NON-TRIVIAL — without this, 0 === 0 would pass over an empty corpus', () => {
    // The measured BEFORE was 11 failures: 7 TRIPWIRE_TC001, 2 MISSING_GRANT,
    // 2 SOMETHING_ELSE. A floor rather than an equality, so a future re-run that
    // legitimately finds MORE is not forced red — but an emptied artefact is.
    expect(derivedFailures(BEFORE)).toBeGreaterThanOrEqual(11);
    expect(BEFORE_CLASS.counts.TRIPWIRE_TC001).toBeGreaterThanOrEqual(7);
    expect(BEFORE_CLASS.findings.length).toBeGreaterThanOrEqual(11);
    // and the classifier genuinely attributed them, rather than emitting rows
    // with no site at all
    expect(BEFORE_CLASS.outside456.length).toBeGreaterThanOrEqual(9);
  });

  it('AFTER: the category sum equals the independently derived failure count', () => {
    const sum = CATEGORIES.reduce((a, c) => a + (AFTER_CLASS.counts[c] ?? 0), 0);
    expect(sum).toBe(derivedFailures(AFTER));
    expect(AFTER_CLASS.categorySum).toBe(sum);
    expect(AFTER_CLASS.arithmeticCheckPasses).toBe(true);
    // The classifier actually read the 15 rows — a zero sum over zero input is
    // not the same claim as a zero sum over fifteen measured surfaces.
    expect(AFTER_CLASS.entriesConsidered).toBe(15);
  });

  it('every row carries a verdict, and the verdicts PARTITION the rows', () => {
    for (const doc of [BEFORE, AFTER]) {
      const buckets = { pass: 0, fail: 0, LATENT: 0, NOT_MEASURED: 0, 'not-reachable': 0 } as Record<string, number>;
      for (const r of doc.rows) {
        expect(r.verdict606, `row ${r.id} has no verdict`).toBeTruthy();
        expect(Object.keys(buckets), `row ${r.id} has an unknown verdict ${r.verdict606}`).toContain(
          r.verdict606,
        );
        buckets[r.verdict606]++;
      }
      // Exact partition: nothing double-counted, nothing dropped, and in
      // particular LATENT/NOT_MEASURED are not folded into pass or fail.
      const total = Object.values(buckets).reduce((a, b) => a + b, 0);
      expect(total).toBe(doc.rows.length);
    }
  });

  it('LATENT and NOT_MEASURED rows each carry a reason', () => {
    for (const doc of [BEFORE, AFTER]) {
      for (const r of doc.rows) {
        if (r.verdict606 !== 'LATENT' && r.verdict606 !== 'NOT_MEASURED') continue;
        expect(typeof r.reason, `row ${r.id} (${r.verdict606}) has no reason`).toBe('string');
        expect(r.reason.length, `row ${r.id} (${r.verdict606}) has an empty reason`).toBeGreaterThan(30);
      }
    }
  });

  it('a LATENT row names the table that was empty, and a NOT_MEASURED row says no request was issued', () => {
    // The reasons must be SPECIFIC. A generic sentence would satisfy the length
    // floor above and tell a reader nothing about what was not measured.
    for (const r of AFTER.rows.filter((x: any) => x.verdict606 === 'LATENT')) {
      expect(r.dataGate, `LATENT row ${r.id} has no data gate`).toBeTruthy();
      expect(r.dataGate.count).toBe(0);
      expect(r.reason).toContain('= 0 on staging');
    }
    for (const r of AFTER.rows.filter((x: any) => x.verdict606 === 'NOT_MEASURED')) {
      expect(r.reason).toContain('no request issued');
      expect(r.status).toBeNull();
    }
  });

  it('AFTER: no surface is `fail` — the task’s actual claim, asserted', () => {
    const failed = AFTER.rows.filter((r: any) => r.verdict606 === 'fail').map((r: any) => r.route);
    expect(failed).toEqual([]);
  });

  it('the BEFORE verdicts were taken before any fix, and are not a copy of quick-604’s table', () => {
    // Every row carries quick-604's verdict alongside its own, and at least one
    // of them DISAGREES — which is the evidence that the re-verification was a
    // re-measurement rather than a restatement (rows 10 and 11 were fixed by
    // quick-605; row 3 and row 12 changed shape).
    for (const r of BEFORE.rows) expect(r.quick604, `row ${r.id} carries no quick-604 verdict`).toBeTruthy();
    const changed = BEFORE.rows.filter((r: any) => r.quick604.verdict !== r.verdict606);
    expect(changed.length).toBeGreaterThanOrEqual(4);
  });
});
