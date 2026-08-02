/**
 * Import lifecycle state machine tests.
 * Spec Section 6 diagram; Phase 1 item 5 ("rejecting illegal transitions").
 */

import { describe, it, expect } from 'vitest';
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  IllegalImportTransitionError,
  IMPORT_STATUSES,
  isImportStatus,
  isTerminal,
  type ImportStatus,
} from '../lifecycle';

describe('legal transitions from the Section 6 diagram', () => {
  const legal: Array<[ImportStatus, ImportStatus]> = [
    ['UPLOADED', 'EXTRACTING'],
    ['UPLOADED', 'FAILED'],
    ['UPLOADED', 'CANCELLED'],
    ['EXTRACTING', 'NEEDS_REVIEW'],
    ['EXTRACTING', 'FAILED'],
    ['NEEDS_REVIEW', 'READY'],
    ['READY', 'COMMITTING'],
    ['COMMITTING', 'COMMITTED'],
    // The rollback edge: any failure inside the commit transaction returns the
    // import to review with zero orphans (Section 11).
    ['COMMITTING', 'NEEDS_REVIEW'],
    // A failed extraction can be retried once the bad page is re-shot.
    ['FAILED', 'NEEDS_REVIEW'],
    ['FAILED', 'EXTRACTING'],
  ];

  it.each(legal)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });
});

describe('illegal transitions', () => {
  const illegal: Array<[ImportStatus, ImportStatus]> = [
    // Cannot skip review and commit straight from upload.
    ['UPLOADED', 'COMMITTED'],
    ['UPLOADED', 'READY'],
    ['UPLOADED', 'COMMITTING'],
    // Cannot commit without passing through COMMITTING.
    ['READY', 'COMMITTED'],
    ['NEEDS_REVIEW', 'COMMITTED'],
    // Cannot go backwards out of a terminal state.
    ['COMMITTED', 'NEEDS_REVIEW'],
    ['COMMITTED', 'CANCELLED'],
    ['CANCELLED', 'EXTRACTING'],
    ['CANCELLED', 'UPLOADED'],
    // Cannot cancel mid-commit — the transaction owns that window.
    ['COMMITTING', 'CANCELLED'],
  ];

  it.each(illegal)('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(IllegalImportTransitionError);
  });

  it('rejects self-transitions, which are almost always a double-submit', () => {
    for (const s of IMPORT_STATUSES) {
      expect(canTransition(s, s)).toBe(false);
    }
  });

  it('names the allowed targets in the error, so the caller can act on it', () => {
    try {
      assertTransition('UPLOADED', 'COMMITTED');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(IllegalImportTransitionError);
      const e = err as IllegalImportTransitionError;
      expect(e.from).toBe('UPLOADED');
      expect(e.to).toBe('COMMITTED');
      expect(e.allowed).toContain('EXTRACTING');
      expect(e.message).toContain('EXTRACTING');
    }
  });

  it('explains terminality rather than listing an empty allow-list', () => {
    try {
      assertTransition('COMMITTED', 'READY');
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as Error).message).toContain('terminal');
    }
  });

  it('rejects a status that is not in the enum at all', () => {
    expect(() => assertTransition('BANANA' as ImportStatus, 'READY')).toThrow(
      IllegalImportTransitionError,
    );
  });
});

describe('helpers', () => {
  it('identifies terminal states', () => {
    expect(isTerminal('COMMITTED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('READY')).toBe(false);
  });

  it('terminal states allow nothing', () => {
    expect(allowedTransitions('COMMITTED')).toHaveLength(0);
    expect(allowedTransitions('CANCELLED')).toHaveLength(0);
  });

  it('validates status strings', () => {
    expect(isImportStatus('NEEDS_REVIEW')).toBe(true);
    expect(isImportStatus('needs_review')).toBe(false);
    expect(isImportStatus(null)).toBe(false);
  });

  it('every status in the enum matches the database CHECK constraint list', () => {
    // Mirrors document_imports_status_check in
    // prisma/migrations/20260802120000_document_import_phase1/migration.sql
    expect([...IMPORT_STATUSES].sort()).toEqual(
      [
        'UPLOADED',
        'EXTRACTING',
        'NEEDS_REVIEW',
        'READY',
        'COMMITTING',
        'COMMITTED',
        'FAILED',
        'CANCELLED',
      ].sort(),
    );
  });
});
