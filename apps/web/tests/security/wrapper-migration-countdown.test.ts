/**
 * quick-602 step 5 — the `withTenantContext` MIGRATION COUNTDOWN gate.
 *
 * There is no working lint entry point in `apps/web` (`next lint` no longer accepts
 * `--dir` on this Next version, and ESLint 9 finds no `eslint.config.js`), so this is
 * a TEST-BASED SOURCE SCAN under `tests/`, where `vitest.config.ts`'s `tests/**` glob
 * collects it. It is pure source analysis and needs no database.
 *
 * WHAT IT GUARDS
 * --------------
 *   1. ARTEFACT EQUALITY, BOTH DIRECTIONS. `scripts/audit/wrapper-countdown.json`
 *      must equal what the classifier computes over the real tree right now — totals
 *      AND the per-file, per-unit names. A DECREASE failing is the point: it forces
 *      the number down in a reviewable diff, in the same commit as the work.
 *   2. THE ANTI-VACUITY COUNTER. `withTenantContextCallSites` is asserted too.
 *      Without it, "the countdown reached zero" and "somebody deleted the
 *      acquisitions" are indistinguishable. It is AST-based: `withTenantContext`
 *      already appears in three files as PROSE INSIDE COMMENTS, so a string match
 *      would report 3 migrated call sites on a tree that has none.
 *   3. SYNTHETIC SNIPPETS through the pure classifier — a migrated shape and an
 *      unmigrated shape — which is where "recognises a migrated unit although
 *      `withTenantContext` does not exist" is actually asserted. It works because
 *      the classifier never resolves the identifier.
 *   4. ANTI-VACUITY (quick-546): a floor on `filesScanned`; "was it actually found"
 *      assertions; a per-entry `minBytes` floor passed as a PARAMETER, not a blanket
 *      constant (quick-562 — a legitimate one-line re-export `page.tsx` is under 300
 *      bytes, so a blanket floor fails on healthy source).
 *   5. A COUNTER-ASSERTION: a file with zero acquisitions (`lib/db/admin-prisma.ts`)
 *      is confirmed READ and confirmed to yield zero unmigrated units. Without it an
 *      empty-corpus bug would satisfy every other assertion here.
 *
 * Line endings are normalised on every read — `core.autocrlf=true`, no
 * `.gitattributes`, so the working tree is CRLF while the index is LF (quick-546).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'fs';
import { resolve } from 'path';

import {
  classifyFile,
  buildArtefact,
  walkSourceFiles,
  SRC_ROOT,
  ARTEFACT_PATH,
  WRAPPER_NAME,
  type Artefact,
} from '../../scripts/audit/wrapper-countdown';

const COUNTDOWN = 'wrapper-migration-countdown';

/** CRLF normalisation on every read. */
function read(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

/** Floors are PARAMETERS, not one blanket constant (quick-562). */
const FILES_SCANNED_FLOOR = 1_000;
const ARTEFACT_MIN_BYTES = 2_000;
const COUNTER_ASSERTION_FILE = resolve(SRC_ROOT, 'lib/db/admin-prisma.ts');
const COUNTER_ASSERTION_MIN_BYTES = 1_000;

function loadArtefact(): Artefact {
  expect(existsSync(ARTEFACT_PATH), `${COUNTDOWN}: the artefact is missing — run npm run audit:wrapper-countdown`).toBe(true);
  const bytes = statSync(ARTEFACT_PATH).size;
  expect(bytes, `${COUNTDOWN}: the artefact is suspiciously small (${bytes} bytes)`).toBeGreaterThan(ARTEFACT_MIN_BYTES);
  return JSON.parse(read(ARTEFACT_PATH)) as Artefact;
}

describe(`${COUNTDOWN} — the committed artefact matches the tree`, () => {
  const artefact = loadArtefact();
  const live = buildArtefact(SRC_ROOT, artefact.generatedAt);

  it('scanned a real corpus (anti-vacuity floor)', () => {
    expect(live.totals.filesScanned).toBeGreaterThan(FILES_SCANNED_FLOOR);
    expect(walkSourceFiles(SRC_ROOT).length).toBe(live.totals.filesScanned);
  });

  it('totals are equal — a DECREASE fails too, which is the point', () => {
    expect(live.totals).toEqual(artefact.totals);
  });

  it('the per-file, per-unit NAMES are equal in both directions', () => {
    const liveFiles = Object.keys(live.files).sort();
    const artefactFiles = Object.keys(artefact.files).sort();
    expect(liveFiles.filter((f) => !artefactFiles.includes(f))).toEqual([]);
    expect(artefactFiles.filter((f) => !liveFiles.includes(f))).toEqual([]);
    for (const f of liveFiles) {
      expect(live.files[f], `${COUNTDOWN}: ${f} drifted`).toEqual(artefact.files[f]);
    }
  });

  it('every artefact entry exists on disk and is not suspiciously small', () => {
    for (const [rel, entry] of Object.entries(artefact.files)) {
      const abs = resolve(SRC_ROOT, rel);
      expect(existsSync(abs), `${COUNTDOWN}: ${rel} is in the artefact but not on disk`).toBe(true);
      // A PER-ENTRY floor: 1 byte is enough to prove the file was really read, because
      // a legitimate one-line re-export page.tsx is under 300 bytes (quick-562). The
      // meaningful floor is that the entry names at least one unit.
      expect(statSync(abs).size).toBeGreaterThan(0);
      expect(entry.names.length).toBeGreaterThan(0);
      expect(entry.units).toBe(entry.names.length);
    }
  });

  it('the anti-vacuity counter is asserted: withTenantContextCallSites', () => {
    // Today it is 0 and `withTenantContext` does not exist. When the migration starts
    // this number must RISE as the unit count falls; if the unit count falls while
    // this stays 0, acquisitions were deleted rather than wrapped.
    expect(live.totals.withTenantContextCallSites).toBe(artefact.totals.withTenantContextCallSites);
    expect(artefact.totals.withTenantContextCallSites).toBe(0);
  });

  it('COUNTER-ASSERTION: a file with zero acquisitions is read and yields zero units', () => {
    expect(existsSync(COUNTER_ASSERTION_FILE)).toBe(true);
    const text = read(COUNTER_ASSERTION_FILE);
    expect(text.length).toBeGreaterThan(COUNTER_ASSERTION_MIN_BYTES);
    // it really was read: it contains the thing it is famous for
    expect(text).toContain('getAdminDb');
    const c = classifyFile(text, COUNTER_ASSERTION_FILE);
    expect(c.unmigrated).toEqual([]);
    expect(c.unmigratedCallSites).toBe(0);
  });
});

describe(`${COUNTDOWN} — the classifier recognises the MIGRATED shape`, () => {
  // These are the assertions that matter most, because `withTenantContext` does not
  // exist anywhere in `src` yet. The classifier is purely syntactic, so the
  // identifier never has to resolve.
  const MIGRATED = `
    export async function saveThing(id: string) {
      return withTenantContext(async (db) => {
        const prisma = await getTenantPrisma();
        return prisma.thing.findMany();
      });
    }
  `;
  const UNMIGRATED = `
    export async function saveThing(id: string) {
      const prisma = await getTenantPrisma();
      return prisma.thing.findMany();
    }
  `;
  const MIGRATED_NO_INNER = `
    export async function saveThing(id: string) {
      return withTenantContext(async (db) => db.thing.findMany());
    }
  `;
  const PROSE_ONLY = `
    // getTenantPrisma() will eventually be replaced by withTenantContext(...)
    export async function nothing() { return 1; }
  `;

  it('a wrapped acquisition contributes ZERO unmigrated units', () => {
    const c = classifyFile(MIGRATED, 'synthetic-migrated.ts');
    expect(c.unmigrated).toEqual([]);
    expect(c.withTenantContextCalls).toBe(1);
  });

  it('a bare acquisition contributes ONE unmigrated unit, BY NAME', () => {
    const c = classifyFile(UNMIGRATED, 'synthetic-unmigrated.ts');
    expect(c.unmigrated.length).toBe(1);
    expect(c.unmigrated[0].name).toBe('saveThing');
    expect(c.unmigratedCallSites).toBe(1);
    expect(c.withTenantContextCalls).toBe(0);
  });

  it('DISTINGUISHES the two — it does not simply report everything as unmigrated', () => {
    expect(classifyFile(MIGRATED, 'a.ts').unmigrated.length).toBe(0);
    expect(classifyFile(UNMIGRATED, 'b.ts').unmigrated.length).toBe(1);
  });

  it('a fully migrated unit (no inner acquisition) contributes zero and still counts the wrapper', () => {
    const c = classifyFile(MIGRATED_NO_INNER, 'c.ts');
    expect(c.unmigrated).toEqual([]);
    expect(c.withTenantContextCalls).toBe(1);
  });

  it('PROSE in a comment counts as NEITHER — the reason the counter is AST-based', () => {
    const c = classifyFile(PROSE_ONLY, 'd.ts');
    expect(c.unmigrated).toEqual([]);
    expect(c.withTenantContextCalls).toBe(0);
    // and the prose really is present in the input, so this is not a vacuous pass
    expect(PROSE_ONLY).toContain(WRAPPER_NAME);
  });
});
