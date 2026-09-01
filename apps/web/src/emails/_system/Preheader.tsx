/**
 * Preheader — the inbox preview line.
 *
 * This is the sentence a recipient reads in the Gmail/Apple Mail list BEFORE
 * opening anything. The shell it replaces emitted a constant, so every
 * dispatcher email previewed as "DriveCommand notification" whatever it was
 * about — a trip reminder and a failed brake inspection were indistinguishable
 * in the list. That is the single highest-leverage line in the whole email.
 *
 * TWO PARTS, AND THE SECOND IS THE ONE PEOPLE FORGET
 * --------------------------------------------------
 * Hiding the div is only half the job. Gmail takes the preview text and then
 * KEEPS GOING into the visible body, so an unpadded preheader reads as
 * "Trip DC-2026-00412 departs Tue 26 Aug DriveCommand Trip coming up Mike…".
 * The trailing run of zero-width non-joiners (U+200C, interleaved with
 * U+200A hair spaces so clients that collapse whitespace cannot collapse the
 * run) fills the remaining preview budget with nothing visible.
 *
 * `mso-hide: all` is NOT set here — React drops unknown CSS properties, so it
 * would silently do nothing. It is emitted as `.dc-preheader { mso-hide: all }`
 * in the Shell's <style> block, where Word actually honours it.
 */

import * as React from 'react';
import { styles } from './tokens';

/** Roughly the Gmail preview budget, minus a typical subject. */
const PAD_LENGTH = 120;

/**
 * U+200C ZERO WIDTH NON-JOINER + U+200A HAIR SPACE.
 *
 * The ZWNJ is invisible and non-collapsing; the hair space between each one
 * stops clients that normalise repeated identical characters from folding the
 * run down to a single glyph.
 */
const PAD = '‌ '.repeat(PAD_LENGTH);

export type PreheaderProps = {
  /** The preview sentence. Required — there is no sensible default. */
  text: string;
};

export const Preheader: React.FC<PreheaderProps> = ({ text }) => (
  <div className="dc-preheader" style={styles.preheader}>
    {text}
    {PAD}
  </div>
);

export default Preheader;
