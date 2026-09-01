/**
 * Guards for the three body-HTML transforms.
 *
 * The shape of every transform's test is the same three-part one, because a
 * "does it fire" test alone is worthless here:
 *
 *   1. FIRES on the target shape.
 *   2. DOES NOT FIRE on the near-miss sitting right next to it. This is the
 *      half that matters — every transform rewrites copy a human wrote, and the
 *      brief is explicit that a false positive is worse than not firing.
 *   3. Leaves unrelated HTML BYTE-IDENTICAL.
 *
 * The near-miss cases are not invented. They are the strings this module will
 * actually meet: facility names ("Hall Ford, West Bend"), the `defectItems`
 * variable ("Mirrors, Wiper blades"), last-name-first driver data, and a
 * heading that merely contains the brand.
 */

import { describe, it, expect } from 'vitest';
import { transformBodyHtml } from '../body-html-transform';

const CTA = '<p><a href="https://app.drivecommand.com/carrier/trips/t1">Open trip</a></p>';

describe('transformBodyHtml — transform 1, CTA upgrade', () => {
  it('fires: final paragraph containing exactly one anchor becomes a button', () => {
    const { html, notes } = transformBodyHtml(`<p>Body text.</p>${CTA}`);

    expect(notes.some((n) => n.startsWith('cta: upgraded'))).toBe(true);
    // The bulletproof markup, not a bare anchor.
    expect(html).toContain('v:roundrect');
    expect(html).toContain('<!--[if mso]>');
    // The destination survives as visible text for image-blocked / text clients.
    expect(html).toContain('https://app.drivecommand.com/carrier/trips/t1');
    expect(html).not.toContain('<p><a href=');
  });

  it('does NOT fire: anchor surrounded by prose is left alone', () => {
    const input = '<p>Please <a href="https://x.test/a">open the trip</a> before you leave.</p>';
    const { html, notes } = transformBodyHtml(input);

    expect(html).toBe(input);
    expect(notes.some((n) => n.startsWith('cta:'))).toBe(false);
  });

  it('does NOT fire: paragraph with two anchors', () => {
    const input = '<p><a href="https://x.test/a">One</a><a href="https://x.test/b">Two</a></p>';
    const { html } = transformBodyHtml(input);

    expect(html).toBe(input);
  });

  it('does NOT fire: anchor is not the final block element', () => {
    const input = `${CTA}<p>Trailing prose.</p>`;
    const { html } = transformBodyHtml(input);

    expect(html).toBe(input);
  });

  it('does NOT fire: unsafe href scheme', () => {
    const input = '<p><a href="javascript:alert(1)">Click</a></p>';
    const { html, notes } = transformBodyHtml(input);

    expect(html).toBe(input);
    expect(notes.some((n) => n.includes('not http(s)/mailto'))).toBe(true);
  });

  it('round-trips entities rather than double-escaping them', () => {
    const { html } = transformBodyHtml(
      '<p><a href="https://x.test/?a=1&amp;b=2">Fish &amp; Chips</a></p>',
    );

    expect(html).toContain('Fish &amp; Chips');
    expect(html).not.toContain('&amp;amp;');
    expect(html).toContain('a=1&amp;b=2');
  });
});

describe('transformBodyHtml — transform 2, banner de-duplication', () => {
  it('fires: leading heading whose text is exactly the brand name is removed', () => {
    const { html, notes } = transformBodyHtml('<h2>DriveCommand</h2><p>Hello.</p>');

    expect(html).toBe('<p>Hello.</p>');
    expect(notes.some((n) => n.startsWith('banner: removed'))).toBe(true);
  });

  it('fires: match is case- and whitespace-insensitive', () => {
    const { html } = transformBodyHtml('<h1>  drivecommand  </h1><p>Hello.</p>');
    expect(html).toBe('<p>Hello.</p>');
  });

  it('does NOT fire: heading merely CONTAINS the brand name', () => {
    const input = '<h2>Welcome to DriveCommand</h2><p>Hello.</p>';
    const { html, notes } = transformBodyHtml(input);

    expect(html).toBe(input);
    expect(notes.some((n) => n.startsWith('banner:'))).toBe(false);
  });

  it('does NOT fire: brand heading that is not the FIRST element', () => {
    const input = '<p>Intro.</p><h2>DriveCommand</h2>';
    const { html } = transformBodyHtml(input);

    expect(html).toBe(input);
  });
});

describe('transformBodyHtml — transform 3, greeting normalisation', () => {
  it('fires: "Name, sentence" splits into a greeting and a sentence', () => {
    const { html, notes } = transformBodyHtml(
      '<p>Mike Rodriguez, trip DC-2026-00412 has not been started. Truck T-104.</p>',
    );

    expect(html).toBe(
      '<p>Mike Rodriguez,</p><p>Trip DC-2026-00412 has not been started. Truck T-104.</p>',
    );
    expect(notes.some((n) => n.startsWith('greeting: split'))).toBe(true);
  });

  // --- the near-misses this transform exists to survive ---------------------

  it('does NOT fire: remainder begins with a capital (city, state)', () => {
    const input = '<p>Chicago, IL to Dallas, TX is the lane. Confirm it.</p>';
    expect(transformBodyHtml(input).html).toBe(input);
  });

  it('does NOT fire: last-name-first driver data', () => {
    const input = '<p>Smith, John, trip DC-1 has not been started. Truck T-1.</p>';
    expect(transformBodyHtml(input).html).toBe(input);
  });

  it('does NOT fire: facility name with a comma', () => {
    const input = '<p>Hall Ford, West Bend is the first stop. Arrive by six.</p>';
    expect(transformBodyHtml(input).html).toBe(input);
  });

  it('does NOT fire: single-word opener that is not a name', () => {
    const input = '<p>Reminder, your trip departs soon. Check the load.</p>';
    expect(transformBodyHtml(input).html).toBe(input);
  });

  it('does NOT fire: remainder is a fragment with no sentence period', () => {
    const input = '<p>Mike Rodriguez, trip DC-1 is yours</p>';
    expect(transformBodyHtml(input).html).toBe(input);
  });

  it('does NOT fire: name contains digits', () => {
    const input = '<p>Truck T104, trip DC-1 has not been started. Go now.</p>';
    expect(transformBodyHtml(input).html).toBe(input);
  });
});

describe('transformBodyHtml — invariants', () => {
  it('leaves unrelated HTML byte-identical', () => {
    const input =
      '<h2>Inspection failed — trip blocked</h2>' +
      '<p>Sam Okonkwo failed the pre-trip inspection on truck T-112.</p>' +
      '<ul><li>Service brakes</li></ul>';

    const { html, notes } = transformBodyHtml(input);

    expect(html).toBe(input);
    expect(notes).toEqual([]);
  });

  it('never throws, and passes empty input straight through', () => {
    expect(() => transformBodyHtml('')).not.toThrow();
    expect(transformBodyHtml('').html).toBe('');
    // @ts-expect-error — deliberately wrong type; must not throw.
    expect(() => transformBodyHtml(null)).not.toThrow();
  });

  it('declines an oversized body rather than working on it', () => {
    const { html, notes } = transformBodyHtml('<p>x</p>'.repeat(40_000));
    expect(notes.some((n) => n.includes('exceeds'))).toBe(true);
    expect(html.length).toBeGreaterThan(200_000);
  });

  it('applies banner before greeting, so the greeting sees the real first paragraph', () => {
    const { html } = transformBodyHtml(
      '<h2>DriveCommand</h2><p>Mike Rodriguez, trip DC-1 is yours. Truck T-1.</p>',
    );

    expect(html).toBe('<p>Mike Rodriguez,</p><p>Trip DC-1 is yours. Truck T-1.</p>');
  });

  it('applies all three to the real trip.reminder body', () => {
    const input =
      '<h2>DriveCommand</h2>' +
      '<p>Mike Rodriguez, trip DC-2026-00412 has not been started. Truck T-104.</p>' +
      CTA;

    const { html, notes } = transformBodyHtml(input);

    expect(notes).toHaveLength(3);
    expect(html).not.toContain('<h2>DriveCommand</h2>');
    expect(html).toContain('<p>Mike Rodriguez,</p>');
    expect(html).toContain('v:roundrect');
  });
});

describe('transformBodyHtml — greeting anchoring (regression, quick-573)', () => {
  /**
   * The original implementation anchored the greeting pattern to the start of
   * the BODY, not to the first paragraph. Every real template opens with an
   * <h2>, so it fired on zero of 47 production rows — dead code that passed its
   * own unit tests because those fixtures had no heading.
   */
  it('fires when a NON-brand heading precedes the greeting paragraph', () => {
    const { html, notes } = transformBodyHtml(
      '<h2>Trip coming up</h2><p>Mike Rodriguez, trip DC-1 has not been started. Truck T-1.</p>',
    );

    expect(notes.some((n) => n.startsWith('greeting: split'))).toBe(true);
    expect(html).toBe(
      '<h2>Trip coming up</h2><p>Mike Rodriguez,</p><p>Trip DC-1 has not been started. Truck T-1.</p>',
    );
  });

  it('does not treat a <pre> block as the first paragraph', () => {
    const input = '<pre>Mike Rodriguez, trip DC-1 has not been started.</pre>';
    expect(transformBodyHtml(input).html).toBe(input);
  });
});
