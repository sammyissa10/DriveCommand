/**
 * quick-604 — both directions of the tripwire arming gate, plus a source scan
 * proving `lib/db/prisma.ts` carries exactly one arming path and still carries
 * its original tenant-GUC initialiser.
 *
 * WHY THIS FILE MATTERS MORE THAN A NORMAL UNIT TEST.
 * --------------------------------------------------
 * `shouldArmTripwire` is consumed by `lib/db/prisma.ts`, which PRODUCTION RUNS.
 * If it ever returns true against a production connection string, every
 * production request runs with `app.tenant_context_tripwire = 'on'`, and any
 * statement that reaches an RLS policy without a tenant context raises SQLSTATE
 * `TC001` instead of returning rows. The case this file exists for is the
 * fourth row of the table below: a **production-shaped string with the flag
 * ON** must not arm.
 *
 * The seventh row is the case a NEGATIVE gate ("not the production ref") would
 * have got wrong — an unrecognised project ref. That row was witnessed RED
 * against a deliberately-inverted implementation before this file was accepted
 * green; the red output is quoted in
 * `.planning/quick/604-.../evidence/02-arming-gate.md`.
 *
 * Line endings are normalised in the source scan — `core.autocrlf=true` and
 * there is no `.gitattributes`, so the working tree is CRLF while the index is
 * LF (quick-546).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { shouldArmTripwire } from '../../src/lib/db/tripwire-arm';

const STAGING_STRING =
  'postgresql://postgres.wyixpgunnjmzguhggocz:pw@aws-0-us-west-1.pooler.supabase.com:5432/postgres';
const PRODUCTION_STRING =
  'postgresql://postgres.oqdhberkghtnszrkdvfm:pw@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true';
const UNRECOGNISED_STRING =
  'postgresql://postgres.someotherproject:pw@aws-0-us-west-1.pooler.supabase.com:5432/postgres';

describe('shouldArmTripwire — both directions', () => {
  const cases: Array<{ name: string; url: string | undefined; flag: string | undefined; expected: boolean }> = [
    { name: 'staging string + flag "on"', url: STAGING_STRING, flag: 'on', expected: true },
    // THE case this file exists for.
    { name: 'PRODUCTION string + flag "on"', url: PRODUCTION_STRING, flag: 'on', expected: false },
    { name: 'production string, flag unset', url: PRODUCTION_STRING, flag: undefined, expected: false },
    { name: 'staging string, flag unset', url: STAGING_STRING, flag: undefined, expected: false },
    { name: 'staging string, flag "off"', url: STAGING_STRING, flag: 'off', expected: false },
    { name: 'staging string, flag "ON"', url: STAGING_STRING, flag: 'ON', expected: false },
    { name: 'staging string, flag "1"', url: STAGING_STRING, flag: '1', expected: false },
    { name: 'staging string, flag "true"', url: STAGING_STRING, flag: 'true', expected: false },
    // The case a NEGATIVE gate would have got wrong.
    { name: 'UNRECOGNISED ref + flag "on"', url: UNRECOGNISED_STRING, flag: 'on', expected: false },
    { name: 'undefined connection string + flag "on"', url: undefined, flag: 'on', expected: false },
    { name: 'empty connection string + flag "on"', url: '', flag: 'on', expected: false },
  ];

  for (const c of cases) {
    it(`${c.name} → ${c.expected}`, () => {
      expect(shouldArmTripwire(c.url, c.flag)).toBe(c.expected);
    });
  }

  it('arms for exactly one flag literal and no other', () => {
    const arming = ['on', 'ON', 'On', 'oN', '1', 'true', 'yes', 'enabled', '', ' on ']
      .filter((f) => shouldArmTripwire(STAGING_STRING, f));
    expect(arming).toEqual(['on']);
  });
});

describe('prisma.ts wiring — source scan', () => {
  const PRISMA_PATH = resolve(__dirname, '..', '..', 'src', 'lib', 'db', 'prisma.ts');
  const ARM_PATH = resolve(__dirname, '..', '..', 'src', 'lib', 'db', 'tripwire-arm.ts');

  // Per-file floors, sized to these two files specifically — never a blanket
  // constant (quick-562). Measured at ~3.6 kB and ~3.0 kB respectively.
  const PRISMA_MIN_BYTES = 2500;
  const ARM_MIN_BYTES = 1200;

  const prismaSrc = readFileSync(PRISMA_PATH, 'utf8').replace(/\r\n/g, '\n');
  const armSrc = readFileSync(ARM_PATH, 'utf8').replace(/\r\n/g, '\n');

  it('actually read both files (anti-vacuity: a bad read fails GREEN, not red)', () => {
    expect(prismaSrc.length).toBeGreaterThan(PRISMA_MIN_BYTES);
    expect(armSrc.length).toBeGreaterThan(ARM_MIN_BYTES);
    // "Was the thing actually found" — the connect handler is the anchor every
    // other assertion in this block depends on.
    expect(prismaSrc).toContain("pool.on('connect'");
  });

  it('prisma.ts references the gate', () => {
    expect(prismaSrc).toContain('shouldArmTripwire');
    expect(prismaSrc).toContain("from './tripwire-arm'");
  });

  it('there is exactly ONE arming path, and it sits inside the gate', () => {
    const lines = prismaSrc.split('\n');
    const armLines = lines
      .map((line, i) => ({ line, n: i }))
      .filter(({ line }) => line.includes('app.tenant_context_tripwire'));

    // Exactly one — a second, ungated arming path is the failure this catches.
    expect(armLines).toHaveLength(1);

    const armAt = armLines[0].n;
    // Walk backwards to the nearest `if (` and assert it is the gate's.
    let guardAt = -1;
    for (let i = armAt; i >= 0; i--) {
      if (/^\s*if \(/.test(lines[i])) {
        guardAt = i;
        break;
      }
    }
    expect(guardAt).toBeGreaterThanOrEqual(0);
    expect(lines[guardAt]).toContain('ARM_TRIPWIRE');
  });

  it('the gate is evaluated once at module scope, not per connection', () => {
    // The call must appear BEFORE the connect handler is registered.
    const callAt = prismaSrc.indexOf('shouldArmTripwire(');
    const handlerAt = prismaSrc.indexOf("pool.on('connect'");
    expect(callAt).toBeGreaterThanOrEqual(0);
    expect(handlerAt).toBeGreaterThanOrEqual(0);
    expect(callAt).toBeLessThan(handlerAt);
    // And exactly one call site.
    expect(prismaSrc.split('shouldArmTripwire(').length - 1).toBe(1);
  });

  it('COUNTER-ASSERTION: the original tenant-GUC init is still present', () => {
    // Without this, every assertion above is satisfiable by deleting the whole
    // connect handler.
    expect(prismaSrc).toContain("set_config('app.current_tenant_id', '', false)");
  });

  it('the arm is caught, so an arm failure cannot crash a request', () => {
    const armAt = prismaSrc.indexOf('app.tenant_context_tripwire');
    const after = prismaSrc.slice(armAt, armAt + 400);
    expect(after).toContain('.catch(');
  });

  it('tripwire-arm.ts states the gate positively', () => {
    // The staging ref is required; the production ref is only ever a second
    // refusal. A `!includes(PRODUCTION_REF)` as the PRIMARY test is the
    // inversion this file was witnessed red against.
    expect(armSrc).toContain("if (!connectionString.includes(STAGING_REF)) return false;");
  });
});
