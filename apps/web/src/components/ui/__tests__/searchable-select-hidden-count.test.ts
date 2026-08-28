/**
 * quick-565 — what `SearchableSelect` says about the options search removed.
 *
 * WHY THESE ARE PURE FUNCTIONS AND NOT A MOUNTED COMPONENT. `HiddenCount` reads
 * cmdk's live filter state through `useCommandState`, so asserting it in place
 * needs a mounted `<Command>` — and this app has neither jsdom nor
 * @testing-library/react, and this task is not the place to add a dependency.
 * The decision is therefore lifted into two exported functions, the same shape
 * `assignment-options.ts` uses: the judgement lives where a test can drive it,
 * the component is a thin consumer. The interactive path was verified in a real
 * Chromium at 1568px and the numbers are in the quick-565 summary.
 *
 * WHAT IS BEING PROTECTED. cmdk hides a non-matching item outright, leaving no
 * trace. On the assignment screen three of fourteen trucks are BLOCKED and
 * sorted last, so a term that excludes them used to give a dispatcher no signal
 * they existed — and blocked options are precisely the ones worth knowing about.
 * Two states used to look identical and must not again:
 *
 *   - options exist but the search hid them  → the footer says how many
 *   - no options exist at all                → a different sentence entirely
 *
 * HOW IT FAILS IF THE WORK IS UNDONE:
 *   - Footer rendered when nothing is typed  → 'says nothing when the box is empty'.
 *   - Footer rendered when nothing is hidden → 'says nothing when everything matches'.
 *   - The two empty states collapsed back    → 'an empty list does not borrow…'.
 */

import { describe, expect, it } from 'vitest';
import {
  NO_OPTIONS_MESSAGE,
  emptyMessageFor,
  hiddenBySearchText,
} from '../searchable-select';

describe('the footer speaks only when it has something to say', () => {
  it('says nothing when the search box is empty', () => {
    // The step-4 check by name: clearing the search must remove the footer,
    // not leave it reading "14 of 14".
    expect(hiddenBySearchText('', 14, 14)).toBeNull();
  });

  it('says nothing when the box holds only whitespace', () => {
    expect(hiddenBySearchText('   ', 14, 14)).toBeNull();
  });

  it('says nothing when everything still matches', () => {
    // A footer permanently reading "0 of 14 hidden" is noise, and noise is what
    // teaches people to stop reading the line that matters.
    expect(hiddenBySearchText('T', 14, 14)).toBeNull();
  });

  it('counts what the search removed', () => {
    expect(hiddenBySearchText('Ford', 1, 14)).toBe('13 of 14 hidden by your search');
    expect(hiddenBySearchText('Acadia 2021', 2, 14)).toBe('12 of 14 hidden by your search');
    expect(hiddenBySearchText('Carlos', 1, 7)).toBe('6 of 7 hidden by your search');
  });

  it('still speaks when the search hid EVERYTHING — that is the whole point', () => {
    // Beside "No trucks found.", this is what separates "your search excluded
    // fourteen trucks" from "you have no trucks".
    expect(hiddenBySearchText('zzzzz', 0, 14)).toBe('14 of 14 hidden by your search');
    expect(hiddenBySearchText('zzzzz', 0, 7)).toBe('7 of 7 hidden by your search');
  });

  it('says nothing when there was nothing to hide in the first place', () => {
    // Zero options and a search term: `emptyMessageFor` owns this case, and two
    // sentences about one empty list would be worse than one.
    expect(hiddenBySearchText('anything', 0, 0)).toBeNull();
  });

  it('never reports a negative count', () => {
    // Defensive: if cmdk ever counted something not in `options`, the footer
    // must fall silent rather than print "-1 of 3 hidden".
    expect(hiddenBySearchText('x', 5, 3)).toBeNull();
  });

  it('is one whole string, so no JSX boundary can eat a space', () => {
    // quick-517: `<p>{n} of {m} hidden</p>` rendered "4 stopswill" twice across
    // two investigations that both blamed JSX trimming and were both wrong.
    const line = hiddenBySearchText('Ford', 1, 14)!;
    expect(line).toMatch(/^\d+ of \d+ hidden by your search$/);
    expect(line).not.toMatch(/\s{2,}/);
  });
});

describe('the two empty states are told apart', () => {
  it('an empty list does not borrow the search-found-nothing copy', () => {
    // The defect: `emptyMessage` is written by the caller for a search that
    // matched nothing ("No drivers found."), so an empty roster used to borrow
    // it and read as though a search had happened.
    expect(emptyMessageFor(0, 'No drivers found.')).toBe(NO_OPTIONS_MESSAGE);
    expect(emptyMessageFor(0, 'No trucks found.')).toBe(NO_OPTIONS_MESSAGE);
  });

  it("a search that matched nothing KEEPS the caller's copy", () => {
    // Step 5, pinned: "No drivers found." at a term like zzzzz is existing
    // behaviour and must survive.
    expect(emptyMessageFor(7, 'No drivers found.')).toBe('No drivers found.');
    expect(emptyMessageFor(14, 'No trucks found.')).toBe('No trucks found.');
  });

  it('the two sentences are actually different', () => {
    // Without this, merging them back would satisfy both cases above by
    // accident. It is the counter-assertion, not decoration.
    expect(emptyMessageFor(0, 'No drivers found.')).not.toBe(
      emptyMessageFor(7, 'No drivers found.'),
    );
  });

  it('names no noun, because the component does not know one', () => {
    // Its options are drivers, trucks, trailers or trips depending on the
    // caller. A generic component that guesses would be wrong six times in
    // seven.
    expect(NO_OPTIONS_MESSAGE).not.toMatch(/driver|truck|trailer|trip/i);
  });
});
