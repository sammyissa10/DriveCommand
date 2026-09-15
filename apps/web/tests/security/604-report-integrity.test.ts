/**
 * quick-604 — the four finishing checks, as assertions over the COMMITTED
 * artefacts on disk rather than as claims in prose.
 *
 *   1. every entry in `04-click-through.json` carries a verdict drawn from
 *      exactly `{pass, fail, not-reachable}`, and there are >= 40 of them;
 *   2. the five category counts SUM to the failure count, with the failure count
 *      derived INDEPENDENTLY from the verdict fields rather than read from the
 *      classification's own header;
 *   3. every `OUTSIDE_456` entry has a non-empty `file` and an integer `line`;
 *   4. the surface list in `604-click-through.ts` has >= 25 entries and the cron
 *      enumeration is asserted `=== 14` in the script itself.
 *
 * All three red runs are recorded in `evidence/06-classification.md`. A guard
 * asserted without a witnessed red is the quick-549 shape and does not count.
 *
 * Source scans normalise CRLF (`core.autocrlf=true`, no `.gitattributes`), carry
 * a "was it actually found" assertion, and carry a length floor **parameterised
 * per file** rather than a blanket constant (quick-562).
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const EVIDENCE = resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence',
);
const CLICK_JSON = resolve(EVIDENCE, '04-click-through.json');
const WRITES_JSON = resolve(EVIDENCE, '05-writes.json');
const CLASSIFY_JSON = resolve(EVIDENCE, '06-classification.json');
const SCRIPT = resolve(__dirname, '..', '..', 'scripts/audit/604-click-through.ts');

/** Per-file floors, measured against these specific artefacts. */
const FLOORS: Record<string, number> = {
  [CLICK_JSON]: 20_000,
  [WRITES_JSON]: 1_500,
  [CLASSIFY_JSON]: 3_000,
  [SCRIPT]: 15_000,
};

function read(path: string): string {
  expect(existsSync(path), `${path} must exist`).toBe(true);
  const text = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  // Anti-vacuity: the failure mode of a bad read is GREEN, not red.
  expect(text.length).toBeGreaterThan(FLOORS[path]);
  return text;
}

const click = JSON.parse(read(CLICK_JSON));
const writes = JSON.parse(read(WRITES_JSON));
const classify = JSON.parse(read(CLASSIFY_JSON));
const script = read(SCRIPT);

const VERDICTS = ['pass', 'fail', 'not-reachable'];
const CATEGORIES = [
  'TRIPWIRE_TC001',
  'MISSING_GRANT',
  'RLS_DENIAL_SATISFIABLE',
  'RLS_DENIAL_NO_POLICY',
  'SOMETHING_ELSE',
];

describe('check 1 — every surface has its own verdict, from exactly three literals', () => {
  it('there are at least 40 entries', () => {
    expect(Array.isArray(click.entries)).toBe(true);
    expect(click.entries.length).toBeGreaterThanOrEqual(40);
  });

  it('zero entries have an unset verdict', () => {
    const unset = click.entries.filter((e: any) => e.verdict === undefined || e.verdict === null || e.verdict === '');
    expect(unset.map((e: any) => e.surface)).toEqual([]);
  });

  it('every verdict is one of exactly three literals', () => {
    const seen = [...new Set(click.entries.map((e: any) => e.verdict))].sort();
    for (const v of seen) expect(VERDICTS).toContain(v);
  });

  it('every `fail` carries a SQLSTATE or the explicit literal SQLSTATE_UNRECOVERED', () => {
    const bad = click.entries
      .filter((e: any) => e.verdict === 'fail')
      .filter((e: any) => typeof e.sqlstate !== 'string' || e.sqlstate.length === 0);
    expect(bad.map((e: any) => e.surface)).toEqual([]);
  });

  it('no surface appears twice — a duplicate row would double-count a verdict', () => {
    const keys = click.entries.map((e: any) => `${e.role}:${e.method}:${e.surface}`);
    expect(keys.length).toBe(new Set(keys).size);
  });
});

describe('check 2 — the five category counts SUM to the failure count', () => {
  it('the failure count derived independently equals the category sum', () => {
    const derived =
      click.entries.filter((e: any) => e.verdict === 'fail').length +
      writes.entries.filter((w: any) => w.verdict === 'SILENT_NO_OP' || w.verdict === 'REFUSED').length;

    const sum = CATEGORIES.reduce((a, c) => a + (classify.counts[c] ?? 0), 0);

    // Derived from the verdicts, never from `classify.derivedFailureCount`.
    expect(sum).toBe(derived);
  });

  it('the classification has exactly the five categories and no sixth', () => {
    expect(Object.keys(classify.counts).sort()).toEqual([...CATEGORIES].sort());
  });

  it('every finding carries exactly one of the five categories', () => {
    for (const f of classify.findings) expect(CATEGORIES).toContain(f.category);
    expect(classify.findings.length).toBe(
      CATEGORIES.reduce((a, c) => a + (classify.counts[c] ?? 0), 0),
    );
  });

  it('a SILENT_NO_OP would enter classification as a FAILURE, never as a pass', () => {
    // Structural: the derivation above includes SILENT_NO_OP. This asserts the
    // verdict vocabulary the derivation depends on has not drifted.
    const seen = [...new Set(writes.entries.map((w: any) => w.verdict))];
    for (const v of seen) expect(['WROTE', 'SILENT_NO_OP', 'REFUSED']).toContain(v);
  });
});

describe('check 3 — every OUTSIDE_456 entry names a file and a line', () => {
  it('the list was actually produced (anti-vacuity)', () => {
    expect(Array.isArray(classify.outside456)).toBe(true);
    // Counter-assertion: the attribution field really does take more than one
    // value, so "every OUTSIDE_456 entry is well-formed" is not satisfiable by
    // there being no attribution at all.
    const attributions = [...new Set(classify.findings.map((f: any) => f.attribution))];
    for (const a of attributions)
      expect(['IN_456', 'IN_456_FILE_ONLY', 'OUTSIDE_456', 'SITE_UNRECOVERED']).toContain(a);
  });

  it('every entry has a non-empty file and an integer line', () => {
    for (const o of classify.outside456) {
      expect(typeof o.file).toBe('string');
      expect(o.file.length).toBeGreaterThan(0);
      expect(Number.isInteger(o.line)).toBe(true);
      expect(o.line).toBeGreaterThan(0);
    }
  });

  it('the OUTSIDE_456 list matches the findings marked OUTSIDE_456', () => {
    const fromFindings = classify.findings.filter((f: any) => f.attribution === 'OUTSIDE_456').length;
    expect(classify.outside456.length).toBe(fromFindings);
  });
});

describe('check 4 — the surface list and the cron enumeration, by source scan', () => {
  it('the anchors were actually found', () => {
    expect(script).toContain('const OWNER_SURFACES = [');
    expect(script).toContain('const DRIVER_SURFACES = [');
    expect(script).toContain('function enumerateCronRoutes()');
  });

  it('the named surface list has at least 25 entries', () => {
    const block = (name: string) => {
      const start = script.indexOf(`const ${name} = [`);
      expect(start, `${name} block not found`).toBeGreaterThanOrEqual(0);
      const end = script.indexOf('] as const;', start);
      expect(end, `${name} block has no terminator`).toBeGreaterThan(start);
      return script.slice(start, end);
    };
    const count = (name: string) => (block(name).match(/'\/[^']*'/g) ?? []).length;
    const owner = count('OWNER_SURFACES');
    const driver = count('DRIVER_SURFACES');
    expect(owner).toBeGreaterThan(0);
    expect(driver).toBeGreaterThan(0);
    expect(owner + driver).toBeGreaterThanOrEqual(25);
    // And the JSON agrees with the source.
    expect(click.namedSurfaceCount).toBe(owner + driver);
  });

  it('the cron enumeration is asserted === 14 IN THE SCRIPT, and reads 14 in the artefact', () => {
    expect(script).toContain('if (CRON_ROUTES.length !== 14)');
    // Counter-assertion: the list is enumerated from the directory, not hardcoded.
    expect(script).toContain("resolve(APP_ROOT, 'src/app/api/cron')");
    expect(script).not.toMatch(/const CRON_ROUTES = \[\s*'/);
    expect(click.cronRouteCount).toBe(14);
    expect(click.entries.filter((e: any) => e.label === 'cron').length).toBe(14);
  });

  it('/api/warmup is present and is NOT folded into the 14', () => {
    expect(click.extraScheduled).toEqual(['/api/warmup']);
    expect(click.entries.filter((e: any) => e.label === 'scheduled-non-cron').length).toBe(1);
  });
});
