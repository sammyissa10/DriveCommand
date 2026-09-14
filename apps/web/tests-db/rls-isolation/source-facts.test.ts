/**
 * quick-598 — claims 9 and 14 of the 17, the two that LOOK like source facts.
 *
 * THE ORIGINAL TESTS ASSERTED THEIR OWN INPUT.
 * --------------------------------------------
 * `group-b-isolation.test.ts` claim 9 in full:
 *
 *     const exemptModels = [ 'Tenant', ..., 'DriverPayRecord', ... ];
 *     expect(exemptModels).toContain('DriverPayRecord');
 *
 * It declared an array and asserted the array contained the value it had just
 * written into it. `group-c-isolation.test.ts` claim 14 did the mirror with a
 * `new Set([...])` and `expect(currentExemptModels.has('PushToken')).toBe(false)`
 * — a value it had deliberately left out two lines above. Neither test ever
 * read `src/lib/db/extensions/tenant-rls.ts`. Both would pass unchanged if that
 * file's `EXEMPT_MODELS` said the exact opposite.
 *
 * This file reads the real file.
 *
 * TWO GUARDS, NOT ONE — quick-546's rule.
 * ---------------------------------------
 * A source-slicing test's failure mode is GREEN, not red: when the slice misses
 * it returns an empty string and `expect('').not.toContain('PushToken')` passes.
 * So there is a FOUND assertion and a LENGTH FLOOR, and the CRLF normalisation
 * that quick-546 needed for exactly the same reason (this repo is
 * `core.autocrlf=true` with no `.gitattributes`, so `git ls-files --eol` reports
 * `i/lf w/crlf` and any marker containing `\n` misses in the working tree).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const TENANT_RLS_PATH = resolve(__dirname, '../../src/lib/db/extensions/tenant-rls.ts');

/**
 * The floor is sized for the block as it stands (26 model names plus a long
 * comment body, well over 1 kB) with generous headroom. It is not the current
 * length: a floor equal to today's value fails on the next legitimate removal
 * and teaches people to edit the floor.
 */
const EXEMPT_MODELS_BLOCK_MIN_LENGTH = 400;

let source: string;
let block: string | null;

function sliceExemptModels(normalised: string): string | null {
  const startMarker = 'const EXEMPT_MODELS = new Set([';
  const start = normalised.indexOf(startMarker);
  if (start === -1) return null;
  // The Set literal's closing `]);` sits at column 0 in this file. Anchoring to
  // the newline before it keeps a `]);` appearing inside a comment from ending
  // the slice early.
  const end = normalised.indexOf('\n]);', start);
  if (end === -1) return null;
  return normalised.slice(start, end + 4);
}

beforeAll(() => {
  source = readFileSync(TENANT_RLS_PATH, 'utf8').replace(/\r\n/g, '\n');
  block = sliceExemptModels(source);
});

describe('EXEMPT_MODELS is read from the real file, not restated', () => {
  it('the slice was FOUND (a missed slice fails GREEN, which is why this exists)', () => {
    expect(block, `could not slice EXEMPT_MODELS out of ${TENANT_RLS_PATH}`).not.toBeNull();
    expect(block).not.toBe('');
  });

  it('the slice clears its length floor and reaches the end of the Set literal', () => {
    expect(block!.length).toBeGreaterThan(EXEMPT_MODELS_BLOCK_MIN_LENGTH);
    expect(block!.trimEnd().endsWith(']);')).toBe(true);
  });

  it('the slice contains a plausible number of QUOTED model names', () => {
    // Counts quoted entries, not lines: the block is more comment than code,
    // and a slice that captured only the comment header would still clear the
    // length floor above.
    const quoted = block!.match(/'[A-Z][A-Za-z]+'/g) ?? [];
    expect(quoted.length).toBeGreaterThanOrEqual(20);
  });

  it('claim 9: DriverPayRecord IS exempt (it uses org_id, not tenantId)', () => {
    expect(block!).toContain("'DriverPayRecord'");
  });

  it('claim 14: PushToken is NOT exempt (quick-327 backfilled its tenantId)', () => {
    // QUOTED deliberately. The block's last line is the comment
    //   // PushToken — removed: now has tenantId (quick-327)
    // so an unquoted `not.toContain('PushToken')` would fail on correct source
    // - a red test nobody can fix, which is worse than no test. A quoted
    // `'PushToken'` is the Set ENTRY and nothing else in this file.
    expect(block!).not.toContain("'PushToken'");
    expect(block!, 'the removal comment should still be inside the slice').toContain(
      '// PushToken'
    );
  });

  it('Tenant is exempt (the tenants table has no tenantId column)', () => {
    expect(block!).toContain("'Tenant'");
  });

  it('the whole file does mention PushToken, so the claim-14 assertion is about the SET', () => {
    // Without this, a rename of the file or a wholesale deletion of its
    // contents would satisfy claim 14 by accident. `PushToken` appears in the
    // prose above the set explaining why it was removed.
    expect(source).toContain('PushToken');
  });
});
