/**
 * Stop review — the writing half. Spec Section 10.
 *
 * Everything in this phase that changes a row is in this file, the same way
 * `facility-resolution.ts` holds every write in Phase 4. `stop-review.ts` beside
 * it is pure: it computes rollups, decides what blocks, applies patches and
 * permutes arrays, and it has never seen Prisma.
 *
 * ---------------------------------------------------------------------------
 * NO WRITES IN ANY VIEW PATH
 * ---------------------------------------------------------------------------
 * `getStopReview` loads, decides and describes. It does not commit the silent
 * T1/T2 links it displays, it does not initialise `reviewedExtraction`, and it
 * does not backfill a stop type or a rollup it would like to have found. That is
 * the quick-508 rule and it is not softened here: a GET that quietly writes is a
 * GET nobody can reason about, and the honest version of "this is decided but
 * not stored" is already on the payload as `StopSlotView.persisted`.
 *
 * Every mutation below opens with `ensureStopsCommitted`, which is the other
 * half of the same rule — the moment anything on this import becomes real,
 * everything the card already showed as decided becomes real too. It also
 * commits the client (via `ensureClientCommitted`), which is what the external
 * reference table is keyed on.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE EDITS LIVE
 * ---------------------------------------------------------------------------
 * `document_imports.reviewed_extraction` — jsonb, present since Phase 1, and the
 * column spec Section 6 names for exactly this: *"edits live in
 * `reviewedExtraction`, not a normalised staging table — resume-after-close works
 * for free and there is no second schema to keep in sync"*. Reorder is therefore
 * persistence, not local state: the array order IS the running order, the same
 * way `sourceFileKeys` array order is the page order (Phase 2).
 *
 * NO DDL. No migration was written for this phase. Every column touched here —
 * `reviewed_extraction`, `resolution_provenance`, `updated_by_id` — was verified
 * present against production before a line of it was written.
 */

import { Prisma } from '@/generated/prisma';
import type { CanonicalExtraction } from '@drivecommand/validation';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';

import {
  decideStops,
  fingerprintOf,
  loadExternalReferences,
  loadFacilityCandidates,
  summariseStops,
} from './facility-lookup';
import { ensureStopsCommitted } from './facility-resolution';
import { getImportRecord, type ImportRecord } from './persistence';
import { provenanceOf, stopProvenanceOf, type ResolutionProvenance, type StopProvenance } from './provenance';
import { resolveEffectiveClientId, ResolutionError } from './resolution';
import {
  applyBulkToStops,
  applyStopPatch,
  buildStopReview,
  reorderConsignments,
  restampStopLink,
  reviewedConsignmentsOf,
  StopOrderError,
  type BulkApplyInput,
  type StopPatch,
  type StopReviewView,
} from './stop-review';

// ---------------------------------------------------------------------------
// Shared plumbing — mirrors facility-resolution.ts rather than reinventing it
// ---------------------------------------------------------------------------

/** Statuses in which stops may still be edited. Same set as the ladder's. */
const EDITABLE: readonly string[] = ['NEEDS_REVIEW', 'READY'];

function assertEditable(record: ImportRecord): void {
  if (!EDITABLE.includes(record.status)) {
    throw new ResolutionError(
      `This import is ${record.status.replace(/_/g, ' ').toLowerCase()} and its stops can no longer be changed.`,
      'BAD_STATUS',
    );
  }
}

async function requireRecord(orgId: string, userId: string, importId: string): Promise<ImportRecord> {
  const record = await getImportRecord(orgId, importId, userId);
  if (!record) throw new ResolutionError('Import not found.', 'NOT_FOUND');
  return record;
}

/**
 * Compose the review from the ladder view and the consignments.
 *
 * The facility half is re-derived on every read through the SAME `decideStops`
 * the writers use, scoped by the SAME effective client (quick-511) — so the tier
 * this screen shows is the tier a commit would write, by construction rather
 * than by coincidence.
 */
async function viewOf(orgId: string, userId: string, record: ImportRecord): Promise<StopReviewView> {
  const db = await getTenantPrismaForOrg(orgId, userId);
  const effectiveClientId = await resolveEffectiveClientId(db, orgId, record);
  const [candidates, referencesByCode] = await Promise.all([
    loadFacilityCandidates(db, orgId),
    loadExternalReferences(db, orgId, effectiveClientId),
  ]);

  const decisions = decideStops(record, { candidates, referencesByCode });
  const counts = summariseStops(decisions);
  const { consignments } = reviewedConsignmentsOf(record.reviewedExtraction, record.rawExtraction);

  return buildStopReview(consignments, counts.stops, {
    matched: counts.matched,
    created: counts.created,
    needsReview: counts.needsReview,
    note: counts.note,
  });
}

/**
 * Write the reviewed consignments, and optionally the permuted/re-stamped stop
 * links, in ONE statement.
 *
 * The provenance is merged in memory the way `writeStopProvenance` does it —
 * Prisma has no jsonb `||`, the read has already happened, and the `client` and
 * `contract` keys must survive a stop write untouched. Passing `stops` as a
 * WHOLE replacement rather than a merge is deliberate and is the difference from
 * Phase 4's helper: a reorder renumbers every key, so merging would leave the
 * pre-move entries behind and a stop could end up linked to two facilities.
 */
async function writeReview(
  orgId: string,
  userId: string,
  record: ImportRecord,
  extraction: CanonicalExtraction,
  stops?: Record<string, StopProvenance>,
): Promise<ImportRecord> {
  const db = await getTenantPrismaForOrg(orgId, userId);

  // Unchecked, because `updatedById` is a scalar FK and the checked variant of
  // the updateMany input only exposes it as a relation connect. Same shape the
  // sibling writers in `facility-resolution.ts` and `persistence.ts` produce.
  const data: Prisma.DocumentImportUncheckedUpdateManyInput = {
    reviewedExtraction: extraction as unknown as Prisma.InputJsonValue,
    updatedById: userId,
  };

  if (stops) {
    const current = provenanceOf(record);
    const next: ResolutionProvenance = { ...current, stops };
    data.resolutionProvenance = next as unknown as Prisma.InputJsonValue;
  }

  await db.documentImport.updateMany({
    where: { id: record.id, orgId, deletedAt: null },
    data,
  });

  const fresh = await getImportRecord(orgId, record.id, userId);
  return fresh ?? record;
}

/**
 * The extraction to write back, with the consignments replaced.
 *
 * On the first edit `reviewedExtraction` is null and `rawExtraction` is the
 * source — this is where the copy is made, at a mutation, never on a read.
 * `rawExtraction` itself is never touched: it is the audit record of what the
 * model actually returned (DEC-6) and a review screen must not rewrite history.
 */
function nextExtraction(record: ImportRecord, consignments: CanonicalExtraction['consignments']): CanonicalExtraction {
  const { extraction } = reviewedConsignmentsOf(record.reviewedExtraction, record.rawExtraction);
  if (!extraction) {
    throw new ResolutionError('This import has nothing to review yet.', 'BAD_STATUS');
  }
  return { ...extraction, consignments };
}

/** Open every mutation the same way: found, editable, and links made real. */
async function beginMutation(orgId: string, userId: string, importId: string): Promise<ImportRecord> {
  const record = await requireRecord(orgId, userId, importId);
  assertEditable(record);
  // The mutation boundary. Silent T1/T2 links become rows here, so a reorder has
  // something to carry and a later commit is not reading an empty provenance.
  return ensureStopsCommitted(orgId, userId, record);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** The whole review screen for one import. Read-only — the writes are below. */
export async function getStopReview(
  orgId: string,
  userId: string,
  importId: string,
): Promise<StopReviewView | null> {
  const record = await getImportRecord(orgId, importId, userId);
  if (!record) return null;
  return viewOf(orgId, userId, record);
}

// ---------------------------------------------------------------------------
// Reorder
// ---------------------------------------------------------------------------

/**
 * Persist a new running order.
 *
 * Server-side, in `reviewed_extraction`, because Phase 5's other stated drift
 * risk is "reorder that updates local state without persisting" — and a reorder
 * that lives in a component dies on navigation, which is precisely the check the
 * phase's verify table runs (drag, leave, come back).
 *
 * The facility links are permuted alongside. See `reorderConsignments` for why
 * that is not the index re-keying Phase 4 warned against.
 */
export async function reorderStops(
  orgId: string,
  userId: string,
  importId: string,
  order: number[],
): Promise<StopReviewView> {
  const record = await beginMutation(orgId, userId, importId);
  const { consignments } = reviewedConsignmentsOf(record.reviewedExtraction, record.rawExtraction);

  let result;
  try {
    result = reorderConsignments(consignments, order, stopProvenanceOf(record), fingerprintOf);
  } catch (e) {
    if (e instanceof StopOrderError) throw new ResolutionError(e.message, 'INVALID_STOP');
    throw e;
  }

  const updated = await writeReview(
    orgId,
    userId,
    record,
    nextExtraction(record, result.consignments),
    result.stopProvenance,
  );

  logger.info('[document-import] stops reordered', { importId, stops: order.length });
  return viewOf(orgId, userId, updated);
}

// ---------------------------------------------------------------------------
// Edit one stop
// ---------------------------------------------------------------------------

/**
 * Apply one dispatcher's edit to one stop.
 *
 * If the edit changed the stop's identity — its name, its code, its address —
 * the existing facility link is re-stamped with the new fingerprint rather than
 * left to go stale. See `restampStopLink`: correcting a typo must not throw away
 * the facility the same person confirmed a minute ago.
 */
export async function updateStop(
  orgId: string,
  userId: string,
  importId: string,
  stopIndex: number,
  patch: StopPatch,
): Promise<StopReviewView> {
  const record = await beginMutation(orgId, userId, importId);
  const { consignments } = reviewedConsignmentsOf(record.reviewedExtraction, record.rawExtraction);

  if (!Number.isInteger(stopIndex) || stopIndex < 0 || stopIndex >= consignments.length) {
    throw new ResolutionError('That stop does not exist on this document.', 'INVALID_STOP');
  }

  const before = consignments[stopIndex];
  const after = applyStopPatch(before, patch);

  const next = [...consignments];
  next[stopIndex] = after;

  const links = stopProvenanceOf(record);
  const restamped = restampStopLink(links[String(stopIndex)], fingerprintOf(before), fingerprintOf(after));
  const stops = restamped ? { ...links, [String(stopIndex)]: restamped } : undefined;

  const updated = await writeReview(orgId, userId, record, nextExtraction(record, next), stops);

  logger.info('[document-import] stop edited', {
    importId,
    stopIndex,
    fields: Object.keys(patch),
    relinked: Boolean(restamped),
  });
  return viewOf(orgId, userId, updated);
}

// ---------------------------------------------------------------------------
// Bulk apply
// ---------------------------------------------------------------------------

export interface BulkApplyOutcome {
  view: StopReviewView;
  /** How many stops changed. The number the confirmation already named. */
  applied: number;
  /** Selected stops that could not take the action, and are reported not hidden. */
  skipped: number[];
  fields: string[];
}

/**
 * Apply one bar action across the selection.
 *
 * `stopIndexes` is the SELECTION as the client holds it — a Set of indexes, not
 * a slice of what is on screen. `applyBulkToStops` then walks the whole array.
 * A selected stop scrolled far out of view is written identically to one under
 * the cursor because neither this function nor the one it calls has any concept
 * of a viewport.
 *
 * None of the bulk fields is part of a stop's fingerprint (that is the code, the
 * name and the address), so no link needs re-stamping here and none is touched.
 */
export async function bulkApplyStops(
  orgId: string,
  userId: string,
  importId: string,
  stopIndexes: number[],
  input: BulkApplyInput,
): Promise<BulkApplyOutcome> {
  const record = await beginMutation(orgId, userId, importId);
  const { consignments } = reviewedConsignmentsOf(record.reviewedExtraction, record.rawExtraction);

  if (stopIndexes.length === 0) {
    throw new ResolutionError('Select at least one stop first.', 'INVALID_STOP');
  }
  const unknown = stopIndexes.filter((i) => !Number.isInteger(i) || i < 0 || i >= consignments.length);
  if (unknown.length > 0) {
    throw new ResolutionError('That selection refers to a stop this document does not have.', 'INVALID_STOP');
  }

  const result = applyBulkToStops(consignments, stopIndexes, input);
  if (result.fields.length === 0) {
    throw new ResolutionError('Nothing to apply — pick a field first.', 'INVALID_STOP');
  }

  const updated = await writeReview(orgId, userId, record, nextExtraction(record, result.consignments));

  logger.info('[document-import] bulk applied to stops', {
    importId,
    selected: stopIndexes.length,
    applied: result.applied,
    skipped: result.skipped.length,
    fields: result.fields,
  });

  return {
    view: await viewOf(orgId, userId, updated),
    applied: result.applied,
    skipped: result.skipped,
    fields: result.fields,
  };
}
