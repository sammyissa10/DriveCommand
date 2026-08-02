/**
 * Import lifecycle state machine.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 6.
 *
 *   UPLOADED -> EXTRACTING -> NEEDS_REVIEW -> READY
 *       |            |             ^            |
 *       |            v             |            v
 *       +-------> FAILED ----------+       COMMITTING
 *                    |                          |
 *                CANCELLED                      v
 *                                          COMMITTED
 *                                       (or rollback to
 *                                        NEEDS_REVIEW)
 *
 * Illegal transitions throw. The database CHECK constraint on
 * document_imports.status guards the *set* of values; this guards the *edges*
 * between them, which SQL cannot express cheaply.
 */

export const IMPORT_STATUSES = [
  'UPLOADED',
  'EXTRACTING',
  'NEEDS_REVIEW',
  'READY',
  'COMMITTING',
  'COMMITTED',
  'FAILED',
  'CANCELLED',
] as const;

export type ImportStatus = (typeof IMPORT_STATUSES)[number];

/**
 * Allowed next states, keyed by current state.
 *
 * Notable edges, all from the Section 6 diagram:
 * - FAILED -> NEEDS_REVIEW: a failed extraction can be retried into review once
 *   the bad page is re-shot, rather than forcing a fresh upload.
 * - COMMITTING -> NEEDS_REVIEW: the rollback path. Any failure inside the commit
 *   transaction returns the import to review with zero orphans (Section 11).
 * - COMMITTED and CANCELLED are terminal.
 */
const TRANSITIONS: Record<ImportStatus, readonly ImportStatus[]> = {
  UPLOADED: ['EXTRACTING', 'FAILED', 'CANCELLED'],
  EXTRACTING: ['NEEDS_REVIEW', 'FAILED', 'CANCELLED'],
  NEEDS_REVIEW: ['READY', 'EXTRACTING', 'FAILED', 'CANCELLED'],
  READY: ['COMMITTING', 'NEEDS_REVIEW', 'CANCELLED'],
  COMMITTING: ['COMMITTED', 'NEEDS_REVIEW', 'FAILED'],
  COMMITTED: [],
  FAILED: ['NEEDS_REVIEW', 'EXTRACTING', 'CANCELLED'],
  CANCELLED: [],
};

/** Terminal states accept no further transitions. */
export const TERMINAL_STATUSES: readonly ImportStatus[] = ['COMMITTED', 'CANCELLED'];

export class IllegalImportTransitionError extends Error {
  readonly from: ImportStatus;
  readonly to: ImportStatus;
  readonly allowed: readonly ImportStatus[];

  constructor(from: ImportStatus, to: ImportStatus) {
    const allowed = TRANSITIONS[from] ?? [];
    super(
      allowed.length === 0
        ? `Import is ${from}, which is terminal — cannot move to ${to}.`
        : `Cannot move an import from ${from} to ${to}. Allowed: ${allowed.join(', ')}.`,
    );
    this.name = 'IllegalImportTransitionError';
    this.from = from;
    this.to = to;
    this.allowed = allowed;
  }
}

export function isImportStatus(value: unknown): value is ImportStatus {
  return typeof value === 'string' && (IMPORT_STATUSES as readonly string[]).includes(value);
}

export function isTerminal(status: ImportStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function allowedTransitions(from: ImportStatus): readonly ImportStatus[] {
  return TRANSITIONS[from] ?? [];
}

export function canTransition(from: ImportStatus, to: ImportStatus): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Throws `IllegalImportTransitionError` unless the edge exists.
 *
 * Call this before every status write. A self-transition is rejected too — it is
 * almost always a bug (a double-submit or a retry that should have been a
 * no-op), and letting it through hides the real problem.
 */
export function assertTransition(from: ImportStatus, to: ImportStatus): void {
  if (!isImportStatus(from)) {
    throw new IllegalImportTransitionError(from as ImportStatus, to);
  }
  if (!canTransition(from, to)) {
    throw new IllegalImportTransitionError(from, to);
  }
}
