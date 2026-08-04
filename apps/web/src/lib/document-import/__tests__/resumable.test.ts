/**
 * What the resume banner is allowed to offer.
 *
 * WHAT WAS BROKEN. `listResumableImports` included FAILED, so the Trips page
 * banner — "…is unfinished / Pick up where you left off" — sent a user to a CSV
 * that could not be parsed. There is nothing to pick up there: the screen
 * explains the failure and that is all it can do. An offer to resume must lead
 * to work that can be done.
 *
 * The status list is the whole fix and both surfaces read it, so it is what is
 * asserted here rather than a mocked query returning rows it was handed.
 */

import { describe, expect, it } from 'vitest';
import { RESUMABLE_STATUSES } from '../persistence';
import { IMPORT_STATUSES, TERMINAL_STATUSES } from '../lifecycle';

describe('RESUMABLE_STATUSES', () => {
  it('does not offer a failed import', () => {
    expect(RESUMABLE_STATUSES).not.toContain('FAILED');
  });

  it('offers exactly the states with work left in them', () => {
    // UPLOADED and EXTRACTING are what a killed lambda or a backgrounded phone
    // leaves behind; NEEDS_REVIEW is spec Phase 2 item 8 itself.
    expect([...RESUMABLE_STATUSES].sort()).toEqual(
      ['EXTRACTING', 'NEEDS_REVIEW', 'UPLOADED'].sort(),
    );
  });

  it('offers nothing terminal, and nothing already committed', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(RESUMABLE_STATUSES).not.toContain(status);
    }
    expect(RESUMABLE_STATUSES).not.toContain('COMMITTED');
    expect(RESUMABLE_STATUSES).not.toContain('COMMITTING');
  });

  it('names only real statuses', () => {
    for (const status of RESUMABLE_STATUSES) {
      expect(IMPORT_STATUSES).toContain(status);
    }
  });

  it('leaves a failed import cancellable, which is how it gets dismissed', () => {
    // "Choose recent" lists everything and puts a dismiss on the failed rows;
    // that dismiss is a cancel, so the edge has to exist.
    expect(TERMINAL_STATUSES).toContain('CANCELLED');
  });
});
