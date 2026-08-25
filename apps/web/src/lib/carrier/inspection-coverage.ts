/**
 * quick-545 — "does this inspection checklist actually block anything?", as a
 * pure function.
 *
 * Same three-file split as the rest of Phase 9: this is the decision, the read
 * that feeds it lives in `inspection-lookup.ts`, and there is no write. No
 * Prisma, no React — deliberately, because the SAME predicate has to run in two
 * places that share no runtime:
 *
 *   - the playbook builder, client-side, over steps already in the browser;
 *   - `/settings/operations`, server-side, over an aggregate across every
 *     inspection checklist the tenant could run.
 *
 * Two implementations of one rule is how a settings page ends up disagreeing
 * with the builder it is telling the owner to go and open.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE RULE IS, AND WHY EACH CLAUSE IS LOAD-BEARING
 * ---------------------------------------------------------------------------
 *
 * A tenant has this gap when `requirePreTripInspection` AND
 * `blockTripStartOnFailedInspection` are both on — so the setting reads as
 * protection — and yet no inspection item is marked `isDispatchBlocker`, so
 * `evaluateTripStartGate` can never reach its `BLOCKED` branch. A driver fails
 * the brake check, the gate returns `PASSED_WITH_DEFECTS`, and the trip starts.
 *
 * The two tenant settings are checked by the CALLER, not here — the settings
 * page checks them against live toggle state so the warning appears the moment
 * an owner flips the switch, before saving. What this file owns is the
 * checklist half:
 *
 *  1. **Only `INSPECTION_ITEM` steps count.** `inspection-lookup.ts`'s
 *     `buildSnapshot` filters to that step type, so `criticalFailures` can only
 *     ever be built from those rows. A blocking SIGNATURE or DOCUMENT_UPLOAD
 *     step in an inspection playbook is real — `computeDispatchReadiness` reads
 *     it — but it CANNOT stop a trip, and counting it here would silence the
 *     warning on a checklist that still blocks nothing.
 *
 *  2. **At least one `INSPECTION_ITEM` step must exist.** With zero of them,
 *     `isInspectionComplete` returns false forever (it requires
 *     `items.length > 0`) and the gate answers `INSPECTION_REQUIRED` on every
 *     start — drivers dead-end. That is a STRICTER failure, not a laxer one, and
 *     telling that owner "nothing can block a trip start" would be the exact
 *     opposite of the truth. Silence here is correct.
 *
 * Neither `evaluateTripStartGate` nor `computeDispatchReadiness` is touched by
 * any of this. This module only describes them.
 */

/**
 * The one step type the trip gate can act on.
 *
 * Stated once, here, rather than restated at each call site — same reason
 * `inspection-constants.ts` exists. `inspection-lookup.ts`'s `INSPECTION_ITEM`
 * is now an alias for this constant rather than a second literal, so the
 * predicate and the snapshot builder cannot drift onto different step types.
 */
export const INSPECTION_ITEM_STEP_TYPE = 'INSPECTION_ITEM';

/**
 * The least a step has to tell us. Structural on purpose: the builder passes a
 * `PlaybookStepItem` and the server passes a Prisma row, and neither should have
 * to be reshaped to be asked this question.
 */
export interface BlockerCoverageStep {
  stepType: string;
  isDispatchBlocker: boolean;
}

export function inspectionItems<T extends BlockerCoverageStep>(steps: readonly T[]): T[] {
  return steps.filter((s) => s.stepType === INSPECTION_ITEM_STEP_TYPE);
}

/**
 * Does this ONE checklist block nothing?
 *
 * `true` only when it has inspection items AND none of them blocks — clause 2
 * above is why the first half is not redundant.
 */
export function checklistBlocksNothing(steps: readonly BlockerCoverageStep[]): boolean {
  const items = inspectionItems(steps);
  return items.length > 0 && !items.some((s) => s.isDispatchBlocker);
}

/**
 * The tenant-wide aggregate, counted across every inspection checklist that
 * could actually run.
 */
export interface InspectionBlockerCoverage {
  /**
   * Active, non-deleted VEHICLE_INSPECTION playbooks with
   * `entityType IN ('DISPATCH','VEHICLE')` — the exact candidate set
   * `ensureTripInspection` selects from.
   */
  candidateChecklists: number;
  /** Of those, how many carry at least one INSPECTION_ITEM step. */
  checklistsWithItems: number;
  /** INSPECTION_ITEM steps across all candidates marked `isDispatchBlocker`. */
  blockingItems: number;
}

/**
 * Does NOTHING this tenant could run block a trip?
 *
 * Evaluated across EVERY candidate checklist rather than "the one that will
 * run", and that is a deliberate, conservative choice.
 *
 * There is no deterministic "the one". `ensureTripInspection` picks the oldest
 * by `createdAt`, but that is only the fallback path — `fireEvent`
 * ('ON_DISPATCH_CREATE') spawns whatever a `PlaybookTrigger` names, and
 * `findTripInspection` then accepts whichever instance is sitting on the trip.
 * A warning keyed on the oldest row would be wrong in both directions.
 *
 * Requiring ALL candidates to be toothless means this can never fire while some
 * protection exists. It can stay quiet on a MIXED tenant — one armed checklist,
 * one toothless one, and the toothless one is what runs — and that false
 * negative is accepted knowingly: a warning that cries wolf is a warning owners
 * learn to scroll past, and then it protects nothing either. No tenant in
 * production is mixed (checked 2026-08-25: the 8 zero-blocker checklists are all
 * `entityType=VEHICLE`, the 16 seeded DVIR ones are all `DISPATCH` with 11/11
 * items blocking, and no tenant holds both).
 */
export function tenantInspectionsBlockNothing(coverage: InspectionBlockerCoverage): boolean {
  return coverage.checklistsWithItems > 0 && coverage.blockingItems === 0;
}

