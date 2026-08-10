/**
 * The apply-confirmation's sentences (quick-517).
 *
 * The dialog rendered "4 stopswill" and "2 stopson" on screen. These assertions
 * are on finished strings, which is the point of the fix: the sentence is no
 * longer assembled by the renderer out of adjacent text nodes, so there is no
 * boundary left for anything to drop. `TemplateDecision.test.tsx` renders the same
 * copy and reads the markup, so the DOM has the last word.
 *
 * The catch-all at the bottom is the one worth keeping honest: rather than listing
 * the joins that were reported, it fails on ANY place where a digit or letter runs
 * straight into a letter across a word that should have a space. That is the
 * defect class, not the two instances of it.
 */

import { describe, expect, it } from 'vitest';

import { APPLY_CONFIRM_FOOTNOTE, applyConfirmSentences, countOf } from '../template-copy';
import { buildTemplateDiff, type ImportStopRef, type TemplateStopRef } from '../template-matching';

const ADDRESS = { line1: '1 Main St', line2: null, city: 'Milwaukee', state: 'WI', postalCode: '53202', country: null };

const stop = (index: number, facilityId: string | null): ImportStopRef => ({
  index,
  facilityId,
  name: facilityId ? `Stop ${facilityId}` : 'Unresolved',
  skipped: false,
  templateInserted: false,
});

const templateStop = (facilityId: string, sequenceOrder: number): TemplateStopRef => ({
  sequenceOrder,
  facilityId,
  facilityName: `Facility ${facilityId}`,
  facilityAddress: ADDRESS,
  stopType: 'delivery',
  contactName: null,
  contactPhone: null,
  apptWindowStartOffsetMin: null,
  apptWindowEndOffsetMin: null,
  bolRequired: true,
  podRequired: true,
  specialInstructions: null,
});

/** 4 matched, 2 import-only, 1 template-only — the shape in the screenshot. */
const DIFF = buildTemplateDiff(
  [stop(0, 'A'), stop(1, 'B'), stop(2, 'C'), stop(3, 'D'), stop(4, 'E'), stop(5, 'F')],
  [templateStop('A', 1), templateStop('B', 2), templateStop('C', 3), templateStop('D', 4), templateStop('G', 5)],
);

/**
 * Words that swallowed a neighbour.
 *
 * Every token starting with "stop" must be exactly "stop" or "stops" — anything
 * longer is the defect ("stopswill", "stopson"). Tokenising keeps the check honest
 * about hyphenated forms like "per-stop", which do not start with "stop".
 */
function joinedWords(text: string): string[] {
  const tokens = text.toLowerCase().match(/[a-z’'-]+/g) ?? [];
  return tokens.filter((t) => t.startsWith('stop') && t !== 'stop' && t !== 'stops');
}

describe('countOf', () => {
  it('puts a space between the number and the noun', () => {
    expect(countOf(4, 'stop')).toBe('4 stops');
    expect(countOf(1, 'stop')).toBe('1 stop');
    expect(countOf(0, 'stop')).toBe('0 stops');
  });
});

describe('applyConfirmSentences', () => {
  it('renders the reported sentences with their spaces', () => {
    expect(DIFF.matched).toBe(4);
    expect(DIFF.importOnly).toBe(2);
    expect(DIFF.templateOnly).toBe(1);

    const [matched, importOnly, templateOnly] = applyConfirmSentences(DIFF);

    // The two exact joins from the screenshot, as the strings they should be.
    expect(matched).toContain('4 stops will take');
    expect(matched).not.toContain('stopswill');
    expect(importOnly).toContain('2 stops on today’s document are');
    expect(importOnly).not.toContain('stopson');
    expect(templateOnly).toContain('1 stop on this route is');
  });

  it('agrees in number, in both directions', () => {
    const one = buildTemplateDiff([stop(0, 'A'), stop(1, 'B')], [templateStop('A', 1), templateStop('C', 2)]);
    const [matched, importOnly, templateOnly] = applyConfirmSentences(one);

    expect(matched).toContain('1 stop will take');
    expect(importOnly).toContain('1 stop on today’s document is not');
    expect(templateOnly).toContain('1 stop on this route is not');
  });

  it('omits a sentence rather than saying "0 stops"', () => {
    const clean = buildTemplateDiff([stop(0, 'A')], [templateStop('A', 1)]);

    const sentences = applyConfirmSentences(clean);

    expect(sentences).toHaveLength(1);
    expect(sentences.join(' ')).not.toContain('0 stop');
  });

  it('has no run-together words anywhere, at any count', () => {
    // The defect CLASS, not the two reported instances. Every sentence, every
    // plural branch, plus the footnote.
    const shapes = [DIFF, buildTemplateDiff([stop(0, 'A'), stop(1, 'B')], [templateStop('A', 1), templateStop('C', 2)])];
    const text = [...shapes.flatMap(applyConfirmSentences), APPLY_CONFIRM_FOOTNOTE].join('\n');

    for (const word of ['stopswill', 'stopson', 'stopwill', 'stopon', 'stopsare', 'stopis', 'documentare', 'documentis', 'routeis', 'routeare']) {
      expect(text).not.toContain(word);
    }
    // And the general form. Tokenised rather than pattern-matched, because
    // `/stops?[a-z]/` matches the innocent word "stops" — the first version of
    // this assertion failed on correct copy, which is its own small lesson about
    // trusting a hand-written pattern over the thing itself.
    expect(joinedWords(text)).toEqual([]);
  });
});
