/**
 * quick-550 — the signature validator's two conditions, un-collapsed.
 *
 * Pure, like `inspection-optimistic.test.ts` next door: no database, no mocks,
 * no React, no jsdom. The last point is deliberate — quick-547 wrote a
 * component test for this same screen and did not commit it, because `jsdom`
 * and `react-dom/client` are hoisted transitive deps and NOT declared
 * devDependencies of `apps/web`. The decision was extracted instead, which is
 * what makes it checkable at all.
 *
 * Every case asserts on BOTH the outcome `kind` AND the exact sentence the
 * driver reads. Asserting only on truthiness would still pass under a refactor
 * that collapsed the two conditions back into one boolean — which is the bug.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  planSignatureSubmission,
  resolveRasterisedSignature,
  SIGNATURE_BLANK_NAME_ERROR,
  SIGNATURE_EMPTY_CANVAS_ERROR,
  SIGNATURE_PAD_MISSING_ERROR,
} from '../inspection-signature';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function readSource(relative: string): string {
  // Resolved from this file, never from cwd — vitest's cwd is the app root
  // today and a runner change would silently turn this test green-by-absence.
  return readFileSync(path.resolve(HERE, relative), 'utf8').replace(/\r\n/g, '\n');
}

describe('planSignatureSubmission — the variant split', () => {
  it('1. a typed name with content submits, and never asks for the canvas', () => {
    const plan = planSignatureSubmission({ signatureNeeded: false, name: 'Sam Vance' });

    expect(plan).toEqual({ kind: 'SUBMIT_ONLY' });
    // The property under test is "the canvas is never consulted". SUBMIT_ONLY
    // is the only outcome that does not license touching the DOM, so asserting
    // the negative explicitly is the assertion, not a flourish.
    expect(plan.kind).not.toBe('RASTERISE');
    expect(plan.kind).not.toBe('REJECT');
  });

  it('2. a typed name left blank is rejected in the server action’s own words', () => {
    const plan = planSignatureSubmission({ signatureNeeded: false, name: '   ' });

    expect(plan.kind).toBe('REJECT');
    expect(plan).toEqual({ kind: 'REJECT', error: SIGNATURE_BLANK_NAME_ERROR });
    // Pinned by VALUE, not only by constant identity: renaming the constant is
    // free, changing what the driver reads is not.
    expect((plan as { error: string }).error).toBe('Type the name you are signing under.');
  });

  it('3. a drawn playbook rasterises', () => {
    const plan = planSignatureSubmission({ signatureNeeded: true, name: 'Sam Vance' });

    expect(plan).toEqual({ kind: 'RASTERISE' });
    expect(plan.kind).not.toBe('SUBMIT_ONLY');
  });

  it('6. the blank-name check runs BEFORE the variant split, so both variants say the same thing', () => {
    const drawn = planSignatureSubmission({ signatureNeeded: true, name: '' });
    const typed = planSignatureSubmission({ signatureNeeded: false, name: '' });

    expect(drawn).toEqual({ kind: 'REJECT', error: SIGNATURE_BLANK_NAME_ERROR });
    expect(typed).toEqual({ kind: 'REJECT', error: SIGNATURE_BLANK_NAME_ERROR });
    expect((drawn as { error: string }).error).toBe((typed as { error: string }).error);
  });

  it('whitespace of every flavour counts as blank', () => {
    for (const name of ['', ' ', '\t', '\n', '   \t \n ']) {
      expect(planSignatureSubmission({ signatureNeeded: false, name })).toEqual({
        kind: 'REJECT',
        error: SIGNATURE_BLANK_NAME_ERROR,
      });
    }
  });
});

describe('resolveRasterisedSignature — what the canvas gave back', () => {
  it('3. strokes on the pad go on to upload then submit', () => {
    const outcome = resolveRasterisedSignature({ hasPad: true, hasBlob: true });

    expect(outcome).toEqual({ kind: 'UPLOAD_THEN_SUBMIT' });
    expect(outcome.kind).not.toBe('REJECT');
  });

  it('4. an untouched canvas is STILL rejected — quick-533’s guarantee', () => {
    const outcome = resolveRasterisedSignature({ hasPad: true, hasBlob: false });

    expect(outcome.kind).toBe('REJECT');
    expect(outcome).toEqual({ kind: 'REJECT', error: SIGNATURE_EMPTY_CANVAS_ERROR });
    expect((outcome as { error: string }).error).toBe(
      'The signature came out empty. Sign again.',
    );
  });

  it('5. a missing pad is NOT reported as an empty signature', () => {
    // The regression test for the collapse itself. Before quick-550 both of
    // these facts produced one sentence, and the one the driver got was the
    // one that did not apply to them.
    const outcome = resolveRasterisedSignature({ hasPad: false, hasBlob: false });

    expect(outcome.kind).toBe('REJECT');
    expect(outcome).toEqual({ kind: 'REJECT', error: SIGNATURE_PAD_MISSING_ERROR });
    expect((outcome as { error: string }).error).not.toBe(SIGNATURE_EMPTY_CANVAS_ERROR);
    expect(SIGNATURE_PAD_MISSING_ERROR).not.toBe(SIGNATURE_EMPTY_CANVAS_ERROR);
    expect(SIGNATURE_PAD_MISSING_ERROR).not.toBe(SIGNATURE_BLANK_NAME_ERROR);
  });

  it('a missing pad outranks the blob check, because with no pad the blob means nothing', () => {
    expect(resolveRasterisedSignature({ hasPad: false, hasBlob: true })).toEqual({
      kind: 'REJECT',
      error: SIGNATURE_PAD_MISSING_ERROR,
    });
  });

  it('the pad-missing sentence names the component, not the driver', () => {
    // Wording is the whole point of this constant: telling someone to "sign
    // again" when there is no canvas is the dead end quick-550 removes.
    expect(SIGNATURE_PAD_MISSING_ERROR).toBe(
      'The signature pad did not load. Reload this page and try again.',
    );
    expect(SIGNATURE_PAD_MISSING_ERROR.toLowerCase()).not.toContain('sign again');
  });
});

describe('7. the blank-name wording lives in one place', () => {
  const LITERAL = 'Type the name you are signing under.';

  it('actions.ts imports the constant and no longer carries the literal', () => {
    const actions = readSource(
      '../../../app/(driver-fullscreen)/inspection/actions.ts',
    );

    expect(actions).toContain('SIGNATURE_BLANK_NAME_ERROR');
    expect(actions).not.toContain(LITERAL);
  });

  it('inspection-signature.ts carries it exactly once', () => {
    const module = readSource('../inspection-signature.ts');
    const occurrences = module.split(LITERAL).length - 1;

    expect(occurrences).toBe(1);
  });
});
