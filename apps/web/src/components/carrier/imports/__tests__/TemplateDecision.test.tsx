/**
 * The apply confirmation, RENDERED (quick-517).
 *
 * ---------------------------------------------------------------------------
 * THE DOM IS THE AUTHORITY, AND THIS IS THE DOM
 * ---------------------------------------------------------------------------
 * The dialog showed "4 stopswill" and "2 stopson" on screen. Twice the diagnosis
 * was made by reasoning about JSX whitespace trimming, and twice the reasoning
 * disagreed with what shipped — quick-515 concluded the joins could not exist,
 * having modelled the transform by hand.
 *
 * So this test does not model anything. It renders the copy with React and reads
 * the markup, the same way `ContractDecision.test.tsx` does. If a space is ever
 * lost again — by a formatter reflowing a line, a JSX rule, or someone putting the
 * sentence back into adjacent children — this fails with the joined word in the
 * diff.
 *
 * It renders `ApplyConfirmCopy` rather than `TemplateDecision` because the dialog
 * body sits behind `AlertDialog` and an internal `confirming` state: unreachable
 * from a static render, which is why the copy had no test before. Extracting it was
 * part of the fix.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { ApplyConfirmCopy } from '../TemplateDecision';
import { buildTemplateDiff, type ImportStopRef, type TemplateStopRef } from '@/lib/document-import/template-matching';

const ADDRESS = { line1: '1 Main St', line2: null, city: 'Milwaukee', state: 'WI', postalCode: '53202', country: null };

const stop = (index: number, facilityId: string): ImportStopRef => ({
  index,
  facilityId,
  name: `Stop ${facilityId}`,
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

/** 4 matched, 2 new, 1 not on today's manifest — the shape in the screenshot. */
const DIFF = buildTemplateDiff(
  [stop(0, 'A'), stop(1, 'B'), stop(2, 'C'), stop(3, 'D'), stop(4, 'E'), stop(5, 'F')],
  [templateStop('A', 1), templateStop('B', 2), templateStop('C', 3), templateStop('D', 4), templateStop('G', 5)],
);

/** Markup with tags stripped and entities decoded — what a reader sees. */
function renderedText(diff = DIFF): string {
  const html = renderToStaticMarkup(<ApplyConfirmCopy diff={diff} />);
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x2019;/g, '’')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('the apply confirmation as it reaches the screen', () => {
  it('renders "4 stops will take", not "4 stopswill"', () => {
    const text = renderedText();

    expect(text).toContain('4 stops will take this route’s order');
    expect(text).not.toContain('stopswill');
  });

  it('renders "2 stops on today’s document are", not "2 stopson"', () => {
    const text = renderedText();

    expect(text).toContain('2 stops on today’s document are not on this route');
    expect(text).not.toContain('stopson');
  });

  it('renders the singular sentence with its spaces too', () => {
    const text = renderedText();

    expect(text).toContain('1 stop on this route is not on today’s manifest');
  });

  it('has no word running into another anywhere in the dialog', () => {
    // The class, not the two instances. Every token starting with "stop" must be
    // exactly "stop" or "stops"; anything longer swallowed its neighbour.
    // Tokenised rather than pattern-matched — `/stops?[a-z]/` matches the
    // innocent word "stops", and the first version of this assertion duly failed
    // on correct copy.
    const tokens = renderedText().toLowerCase().match(/[a-z’'-]+/g) ?? [];

    expect(tokens.filter((t) => t.startsWith('stop') && t !== 'stop' && t !== 'stops')).toEqual([]);
  });

  it('still carries the footnote about what the import keeps', () => {
    expect(renderedText()).toContain('quantities, references and per-stop notes are not changed');
  });

  it('drops a sentence rather than rendering "0 stops"', () => {
    const clean = buildTemplateDiff([stop(0, 'A')], [templateStop('A', 1)]);

    const text = renderedText(clean);

    expect(text).toContain('1 stop will take');
    expect(text).not.toContain('0 stop');
  });
});
