/**
 * quick-611 — the `25P02` transaction-abort gate.
 *
 * ─── WHAT THIS EXISTS TO CATCH ─────────────────────────────────────────────
 *
 * `docs/audits/wrapper-migration-scope.md` found 17 sites where a swallowed DB
 * error is followed by more DB work. Its framing was conditional: *after* the
 * `withTenantContext` migration wrapped 456 units in transactions, each of those
 * catches would leave an aborted transaction and everything after it would fail
 * `25P02`.
 *
 * That migration is not proceeding as scoped (quick-602 measured the overlap at
 * 4 of 456 units — 0.88 % — and `withTenantContext` has zero real call sites),
 * so quick-611 re-verified all 17 against the tree as it actually is:
 *
 *     0 LIVE · 16 DORMANT · 1 IMPOSSIBLE
 *
 * None of them is inside a transaction today, so none can cascade, and none was
 * changed. **The risk is entirely in the future tense, and the trigger is a
 * single edit**: wrap any one of these functions — or a caller — in a
 * `$transaction`, and a swallowed error silently becomes data loss. The
 * `createCarrierDriver` case is the one to picture: its own comment says a
 * failed user-link leaves the driver record valid, and inside a transaction
 * that comment becomes false and the driver row the owner was told about
 * disappears.
 *
 * So this gate does not assert that the code is correct. It asserts that the
 * CONDITION under which it is correct still holds, and fails the moment
 * somebody changes it — in the same diff that changes it, which is the only
 * moment the fix is cheap.
 *
 * ─── THE REMEDY, MEASURED AND BANKED ───────────────────────────────────────
 *
 * If this test ever goes red, the fix is not to delete the catch. quick-611
 * measured all three shapes against real staging tables as `app_user`
 * (`evidence/02-cascade-controls.json`):
 *
 *   A  swallowed failure INSIDE the tx  -> later write 25P02, EARLIER WRITE GONE
 *   B  try WRAPS the tx (gps-ping)      -> no cascade, earlier write survives
 *   C  SAVEPOINT around the statement   -> no cascade, earlier write survives
 *
 * C is the fix, and it works through `tx.$executeRawUnsafe('SAVEPOINT …')` /
 * `ROLLBACK TO SAVEPOINT` on the same `tx` — Prisma 7 has no `$savepoint()` API,
 * so that was measured rather than assumed. B is the other legitimate shape:
 * keep the whole transaction inside the try.
 *
 * ─── ANTI-VACUITY ──────────────────────────────────────────────────────────
 *
 * The failure mode of a source scan is GREEN (quick-546). "0 live" is also what
 * a walker that returns false for everything prints, and the repo-wide sweep
 * finds no real hit to prove otherwise — so the SELF-TEST is load-bearing here,
 * not decoration. It drives the predicate over a synthetic positive and a
 * synthetic negative, and BOTH halves are asserted: the positive alone is
 * satisfied by a predicate that says yes to everything, the negative alone by
 * one that says no to everything.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'fs';
import { resolve } from 'path';

import {
  SITES,
  FILES,
  resolveSite,
  selfTest,
  sweepTransactionEnclosedCatches,
  type Verdict,
} from '../../scripts/audit/611-transaction-scope';

const SRC = resolve(__dirname, '../../src');

/**
 * The frozen verdicts, from quick-611's measurement.
 *
 * DORMANT means: no enclosing transaction in its own file, and no caller inside
 * one. IMPOSSIBLE means something stronger — the try BLOCK contains the
 * `$transaction` call, so the catch is its sibling and the transaction has
 * already settled before the catch runs. That one cannot become live without
 * restructuring the function, not merely wrapping it.
 */
const EXPECTED: Record<string, Verdict> = {
  W1: 'DORMANT', W2: 'DORMANT', W3: 'DORMANT',
  R1: 'DORMANT', R2: 'DORMANT', R3: 'DORMANT', R4: 'DORMANT', R5: 'DORMANT',
  R6: 'DORMANT', R7: 'DORMANT', R8: 'DORMANT', R9: 'DORMANT', R10: 'DORMANT',
  R11: 'DORMANT', R12: 'IMPOSSIBLE', R13: 'DORMANT', R14: 'DORMANT',
};

describe('25P02 transaction-abort sites — the dormancy condition still holds', () => {
  it('SELF-TEST: the predicate fires in the POSITIVE direction and rejects the NEGATIVE', () => {
    // Without this, every verdict below is an unexercised walker's opinion.
    const r = selfTest();
    expect(r.positiveDetected, 'a swallowing catch INSIDE a $transaction callback was NOT detected').toBe(true);
    expect(r.negativeRejected, 'the try-WRAPS-transaction shape was wrongly reported as inside one').toBe(true);
  });

  it('the scan visited a real tree (anti-vacuity floor)', () => {
    // 1692 files at quick-611. A floor of 900 cannot be met by a walker that returned [].
    expect(FILES.length).toBeGreaterThan(900);
  });

  it('every site this guard names was actually FOUND and is not a stub', () => {
    // quick-546: a bad read fails GREEN. Assert found, then a byte floor — and a
    // PARAMETERISED one is unnecessary here because every named file is a real
    // module, but the floor stays low (200) so a legitimate small page is safe
    // (quick-562).
    for (const spec of SITES) {
      const abs = resolve(SRC, spec.path);
      expect(existsSync(abs), `${spec.id}: ${spec.path} does not exist — the audit path may have drifted`).toBe(true);
      expect(statSync(abs).size, `${spec.id}: ${spec.path} is too small to be the real file`).toBeGreaterThan(200);
    }
  });

  it('all 17 sites carry their frozen verdict — a site going LIVE fails here', () => {
    for (const spec of SITES) {
      const r = resolveSite(spec);
      expect(
        r.verdict,
        `${spec.id} (${r.resolvedPath}:${r.resolvedLine}, ${r.enclosingFn}) is now ${r.verdict}, expected ${EXPECTED[spec.id]}.\n` +
          `  reason: ${r.reason}\n` +
          `  If this says LIVE, a swallowed DB error in this function now aborts an enclosing transaction and\n` +
          `  everything after it fails 25P02 — including writes that already succeeded. Do NOT delete the catch:\n` +
          `  the resilience is intended. Put a SAVEPOINT around the statement allowed to fail and ROLLBACK TO it\n` +
          `  in the catch (measured working in quick-611 evidence/02-cascade-controls.json, control C), or keep\n` +
          `  the whole $transaction inside the try so the catch is its sibling (control B).`,
      ).toBe(EXPECTED[spec.id]);
    }
  });

  it('NO swallowing catch anywhere in src sits inside a $transaction callback', () => {
    // The named negative, and it is wider than the 17: the original list was
    // built for a different question, so a site that is live today and was never
    // on it would be invisible to a re-check of the 17 alone.
    const hits = sweepTransactionEnclosedCatches();
    expect(
      hits.map((h) => `${h.file}:${h.line} (${h.fn})`),
      'a swallowing try/catch now sits inside a $transaction callback — see the remedy in this file’s header',
    ).toEqual([]);
  });

  it('COUNTER-ASSERTION: the site list is non-empty and covers both kinds', () => {
    // Without this, deleting SITES would make every assertion above pass.
    expect(SITES.length).toBe(17);
    expect(SITES.filter((s) => s.kind === 'WRITE').length).toBe(3);
    expect(SITES.filter((s) => s.kind === 'READ').length).toBe(14);
  });
});
