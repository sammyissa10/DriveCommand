/**
 * quick-618 — the tenant predicate for `findUnique` / `findUniqueOrThrow` lives
 * in the `where`, and the post-check may only speak when it can see the column.
 *
 * ── WHY THIS IS A SOURCE SCAN ───────────────────────────────────────────────
 *
 * CLAUDE.md's standing rule is that a faked DB in a unit test is not evidence
 * about SQL, and this assertion is precisely about what reaches SQL. The
 * BEHAVIOURAL proof is `scripts/audit/618-finduniq-probe.ts`, which drives the
 * real extension and a real Prisma client against staging as `app_user` — 24
 * cells, both methods, three projections, two RLS modes, each zero paired with a
 * privileged counter-read. That probe reproduced the defect against HEAD before
 * the fix and passes after it; the transcripts are in this task's evidence.
 *
 * What a source scan adds that the probe cannot: the probe has to be RUN, needs
 * staging credentials, and takes minutes. This file fails in CI the moment
 * someone deletes the injection — including the person who deletes it while
 * "simplifying" the case block back into two.
 *
 * ── WHAT IT GUARDS, AND WHY EACH HALF IS NEEDED ─────────────────────────────
 *
 *   1. the `where` injection is PRESENT. Without it the post-check is the only
 *      layer again, and the `!== undefined` guard below turns that layer OFF
 *      for exactly the projections that omit the column — which would be
 *      strictly worse than the bug this task fixed, because it would fail OPEN
 *      rather than closed. The two changes are only safe TOGETHER, so the guard
 *      asserts both or it is guarding nothing.
 *
 *   2. the post-check is still PRESENT and still refuses a mismatch. "Delete the
 *      post-check, the where does it now" is the tempting simplification and it
 *      removes the defence-in-depth layer the extension's own header promises.
 *
 *   3. the post-check is GUARDED by an explicit `undefined` check. This is the
 *      line whose absence WAS the defect: `undefined !== tenantId` is true, so
 *      an unprojected column read as "belongs to someone else".
 *
 * Both the shipped extension and the not-yet-wired prototype are covered. The
 * prototype is the one the task brief pointed at, and shipping it later with the
 * old post-check would reintroduce the defect in a file nobody was watching.
 *
 * ── THE RULES THIS FILE OBEYS (quick-546) ───────────────────────────────────
 *
 * Line endings are normalised: this repo has no `.gitattributes` and
 * `core.autocrlf=true`, so the working tree is CRLF while the index is LF, and a
 * column-zero `\n}\n` end marker does not exist in a CRLF file. quick-546's
 * slice returned null on correct source and its assertion then passed against an
 * EMPTY STRING — the failure mode of a bad slice is green, not red. So every
 * slice here carries a "was it actually found" assertion AND a length floor.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SHIPPED = 'src/lib/db/extensions/tenant-rls.ts';
const PROTOTYPE = 'src/lib/db/extensions/tenant-rls-bound.prototype.ts';

/**
 * A slice below this many characters is not a case block, it is a mis-slice.
 * Real lengths at the time of writing: shipped 612 chars, prototype 640.
 * 200 sits well under both and far above anything an accidental slice produces.
 */
const MIN_BLOCK_CHARS = 200;

/** Read normalised to LF — see the header. */
function readModule(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * The executable body of the combined `findUnique` / `findUniqueOrThrow` case.
 *
 * Sliced from the `case 'findUnique':` label to the `case 'create':` that
 * follows it, then stripped of comments — the long rationale in the shipped file
 * QUOTES the defect it replaced (`result.tenantId !== tenantId`), so a scan that
 * reads comments would match the very string it is asserting is gone. Same trap
 * as quick-600's `pool.on('connect'` check and quick-612's migration guard, both
 * of which false-positived on the prose describing the invariant they protect.
 */
function findUniqueCaseBody(src: string): string {
  const start = src.indexOf("case 'findUnique':");
  const end = src.indexOf("case 'create':", start);
  if (start < 0 || end < 0) return '';
  return src
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

describe('quick-618 — findUnique tenant predicate is injected into the where', () => {
  for (const rel of [SHIPPED, PROTOTYPE]) {
    describe(rel, () => {
      const body = findUniqueCaseBody(readModule(rel));

      it('the case block was actually found (anti-vacuity: a bad slice is GREEN)', () => {
        expect(body).not.toBe('');
        expect(body.length).toBeGreaterThan(MIN_BLOCK_CHARS);
      });

      it('handles findUnique AND findUniqueOrThrow — neither is left on the old path', () => {
        const src = readModule(rel);
        expect(src).toContain("case 'findUnique':");
        expect(src).toContain("case 'findUniqueOrThrow':");
        // Both labels fall into ONE block: the OrThrow label must sit between
        // the findUnique label and the injection, not open a second case.
        const iFind = src.indexOf("case 'findUnique':");
        const iThrow = src.indexOf("case 'findUniqueOrThrow':");
        const iCreate = src.indexOf("case 'create':");
        expect(iThrow).toBeGreaterThan(iFind);
        expect(iThrow).toBeLessThan(iCreate);
      });

      it('INJECTS tenantId into the where — the layer the post-check cannot be', () => {
        // The two files spell the spread differently — the shipped extension is
        // `{ ...a.where, tenantId }` and the typed prototype is
        // `{ ...(a.where as object), tenantId }` — so the pattern matches the
        // SHAPE (spread the caller's where, then add tenantId) rather than one
        // file's punctuation.
        expect(body).toMatch(/a\.where\s*=\s*\{\s*\.\.\.[^,]+,\s*tenantId\s*\}/);
      });

      it('KEEPS a post-check that refuses a mismatched tenant', () => {
        expect(body).toMatch(/!==\s*tenantId/);
        expect(body).toMatch(/Tenant isolation violation/);
        expect(body).toMatch(/return null/);
      });

      it('GUARDS the post-check on undefined — the missing line that WAS the defect', () => {
        expect(body).toMatch(/!==\s*undefined/);
      });

      it('COUNTER-ASSERTION: the old unguarded comparison is gone from the executable body', () => {
        // The defect, verbatim: a bare comparison with no undefined guard.
        // Written as "the result tenantId is compared without any nearby
        // undefined check" — if someone reinstates it, this fails.
        const hasUndefinedGuard = /!==\s*undefined/.test(body);
        const hasComparison = /!==\s*tenantId/.test(body);
        expect(hasComparison && hasUndefinedGuard).toBe(true);
      });
    });
  }

  it('the two files agree — the prototype must not ship a second, stale rule', () => {
    const a = findUniqueCaseBody(readModule(SHIPPED));
    const b = findUniqueCaseBody(readModule(PROTOTYPE));
    for (const needle of ['tenantId', '!== undefined', 'Tenant isolation violation', 'return null']) {
      expect(a).toContain(needle);
      expect(b).toContain(needle);
    }
  });

  it('the stale premise is gone from the shipped file', () => {
    // The sentence that made this defect survive: "we cannot add tenantId
    // directly". It has been false since Prisma 5's extendedWhereUnique went GA,
    // and the file now says so at length. Asserted on the whole file, comments
    // included, because THIS one is about the comment.
    expect(readModule(SHIPPED)).not.toContain('so we cannot add tenantId directly');
  });
});
