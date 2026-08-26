/**
 * quick-546 — the function that CREATES a trip's inspection and the function
 * that FINDS it must name the same scope, and that scope must come from one
 * constant.
 *
 * WHY THIS IS A SOURCE SCAN AND NOT A MOCK TEST — the same reasoning as
 * `trip-start-gate-coverage.test.ts`, which is worth reading first. The defect
 * this guards against is not "function X behaves wrongly in situation Y". It is
 * "the writer and the reader drifted apart and nobody noticed", which is exactly
 * what happened: `ensureTripInspection` wrote `entityType: playbook.entityType`
 * with `entityId` switching to `truckId`, `findTripInspection` read a fixed
 * `'DISPATCH'` / `dispatchId`, and on eight tenants the writer produced a row
 * the reader could never see. Both functions passed every behavioural test that
 * existed. A mock-based test asserts about the shapes its author remembered; it
 * cannot fail because two real call sites disagree.
 *
 * Nothing is stubbed here. The assertions run against the files that ship, read
 * from disk, so a future edit is caught by the edit itself rather than by
 * someone remembering to update a fixture.
 *
 * WHY VEHICLE SCOPE CANNOT BE THE ANSWER, restated so this file stands alone:
 * `generatePlaybookInstance` refuses a duplicate on `(playbookId, entityId,
 * tenantId, status != COMPLETED)`, and nothing in this repo ever sets an
 * inspection instance to COMPLETED. A truck-keyed instance is created once and
 * can never be superseded — the second trip in that truck gets a CONFLICT and a
 * dead button. See `TRIP_INSPECTION_ENTITY_TYPE`'s comment.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { TRIP_INSPECTION_ENTITY_TYPE } from '../inspection-constants';

// ---------------------------------------------------------------------------
// The two functions under guard
// ---------------------------------------------------------------------------

/** Repo-relative so a failure message says something a human can open. */
const LOOKUP_MODULE = 'src/lib/carrier/inspection-lookup.ts';
const SERVICE_MODULE = 'src/lib/carrier/inspection-service.ts';

/** The reader. */
const FINDER = 'findTripInspection';
/** The writer. */
const CREATOR = 'ensureTripInspection';

/**
 * A slice below this many characters is not a function body, it is a rename.
 *
 * Real lengths at the time of writing: `findTripInspection` 740 chars,
 * `ensureTripInspection` 3813. 300 sits well under both while being far above
 * anything an accidental mis-slice would produce, so the floor fails on the
 * thing it is for and does not fail on ordinary editing.
 */
const MIN_BODY_CHARS = 300;

// ---------------------------------------------------------------------------
// Slicing
// ---------------------------------------------------------------------------

/**
 * Cut out exactly ONE function body, from its `export async function NAME(` to
 * the closing brace in COLUMN ZERO that ends it.
 *
 * The scoping is the whole point and is not incidental:
 *
 *  - `findValidPriorInspection` lives in the same file as `findTripInspection`
 *    and legitimately contains BOTH `entityType: 'DISPATCH'` and
 *    `entityType: 'VEHICLE'` literals — deliberately, because it reads HISTORY
 *    and must still honour the VEHICLE-scoped rows production carries from the
 *    2026-04-24 script. A whole-file scan would therefore be permanently red,
 *    and a red test that everyone knows to ignore protects nothing.
 *
 *  - The end marker is the column-zero `\n}` rather than "the next `\nexport `".
 *    That was checked by hand against both files and the looser marker
 *    over-slices in both: in `inspection-lookup.ts` it swallows
 *    `findValidPriorInspection`'s doc comment (which is one sentence away from
 *    containing the very literals this test forbids), and in
 *    `inspection-service.ts` it swallows the whole `isConflictError` helper,
 *    which is not exported. Everything inside these functions is indented, so a
 *    brace at column zero is unambiguously the one that closes them.
 *
 * Returns null when the start marker is absent — the caller asserts on that
 * rather than silently scanning an empty string.
 */
function sliceFunctionBody(source: string, name: string): string | null {
  const marker = `export async function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) return null;

  const end = source.indexOf('\n}\n', start);
  if (end === -1) return null;

  return source.slice(start, end + 3);
}

/**
 * Read a module's source with newlines NORMALISED to `\n`.
 *
 * The normalisation is load-bearing, not tidiness. This repo has no
 * `.gitattributes` and Windows checkouts run `core.autocrlf=true`, so the same
 * committed file is LF in the index and CRLF in the working tree. The slicer's
 * end marker is the column-zero `\n}\n`, which does not exist in a CRLF file —
 * so without this the slice returns null on every Windows clone, every
 * `git checkout` of these files, and every branch switch.
 *
 * That failure mode was observed, and it is worse than a plain red: the "no
 * hardcoded literal" assertion passes VACUOUSLY against an empty slice. Only the
 * integrity floor above catches it. Normalising here removes the whole class
 * rather than trusting the floor to keep catching it.
 */
function readModule(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

/** Both quote styles, because prettier is a convention and not a guarantee. */
const ENTITY_TYPE_LITERAL = /entityType:\s*['"](?:DISPATCH|VEHICLE)['"]/;

describe('quick-546 — trip inspection scope is one constant', () => {
  it('TRIP_INSPECTION_ENTITY_TYPE is DISPATCH — one instance per TRIP', () => {
    // CATCHES: someone flips the constant to 'VEHICLE'. That re-creates the
    // dead button rather than fixing anything, because generatePlaybookInstance
    // will not issue a second instance for the same entityId and no code path
    // ever retires the first one. There is no third legal value: these are the
    // only two scopes the candidate query admits.
    expect(TRIP_INSPECTION_ENTITY_TYPE).toBe('DISPATCH');
  });

  const cases = [
    { label: `${FINDER} (the reader)`, module: LOOKUP_MODULE, fn: FINDER },
    { label: `${CREATOR} (the writer)`, module: SERVICE_MODULE, fn: CREATOR },
  ] as const;

  for (const { label, module, fn } of cases) {
    describe(label, () => {
      const source = readModule(module);
      const body = sliceFunctionBody(source, fn);

      it('was actually found and sliced', () => {
        // CATCHES: someone renames the function, or changes its declaration
        // shape. Without this the slice is null/empty and EVERY other assertion
        // below passes vacuously — the test would go green on precisely the
        // edit it exists to catch. Same discipline as the address fixture's
        // contiguous-id + length floor.
        expect(
          body,
          `Could not find "export async function ${fn}(" in ${module}. ` +
            `If it was renamed, update this test's ${fn === FINDER ? 'FINDER' : 'CREATOR'} ` +
            `constant — do not delete the assertion.`,
        ).not.toBeNull();

        expect(
          (body ?? '').length,
          `The slice for ${fn} in ${module} is only ${(body ?? '').length} chars, ` +
            `below the ${MIN_BODY_CHARS} floor. The end marker probably moved; a short ` +
            `slice makes every other assertion here pass against nothing.`,
        ).toBeGreaterThan(MIN_BODY_CHARS);
      });

      it('takes its scope from TRIP_INSPECTION_ENTITY_TYPE', () => {
        // CATCHES: someone "simplifies" the constant away — inlining it reads as
        // tidier and silently removes the only thing keeping these two functions
        // in step.
        expect(
          body ?? '',
          `${fn} in ${module} no longer references TRIP_INSPECTION_ENTITY_TYPE. ` +
            `The writer and the reader must take their scope from the same constant.`,
        ).toContain('TRIP_INSPECTION_ENTITY_TYPE');
      });

      it('carries no hardcoded entityType literal', () => {
        // CATCHES: someone reverts to a literal in either function — the exact
        // shape of the original defect. A literal in ONE of them is enough: the
        // pair only has to disagree once for a driver to get a dead button.
        const match = ENTITY_TYPE_LITERAL.exec(body ?? '');
        expect(
          match?.[0] ?? null,
          `${fn} in ${module} contains a hardcoded ${match?.[0]}. ` +
            `Use TRIP_INSPECTION_ENTITY_TYPE — a scope written down twice is a scope ` +
            `that will disagree with itself.`,
        ).toBeNull();
      });
    });
  }

  it('the slicing excludes findValidPriorInspection, which keeps both literals', () => {
    // Not an assertion ABOUT findValidPriorInspection's behaviour — that is out
    // of scope here. It asserts that the slicing above is real: the reader's
    // slice must not reach the shape-tolerant history lookup that shares its
    // file, or the "no literal" assertion would be testing the wrong function.
    const body = sliceFunctionBody(readModule(LOOKUP_MODULE), FINDER) ?? '';
    expect(body).not.toContain('findValidPriorInspection');
  });
});
