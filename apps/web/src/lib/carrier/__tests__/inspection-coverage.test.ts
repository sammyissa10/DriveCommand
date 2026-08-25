/**
 * quick-545 — the "blocks nothing" predicate.
 *
 * Pure, so there is no DB to fake and DEC-14's warning does not apply. What
 * these tests exist to pin is the pair of clauses that are easy to "simplify"
 * away, both of which would turn the warning into noise:
 *
 *   - a checklist with NO inspection items must NOT warn (stricter failure);
 *   - a blocking step of any OTHER type must NOT count as coverage.
 */

import { describe, it, expect } from 'vitest';
import {
  INSPECTION_ITEM_STEP_TYPE,
  checklistBlocksNothing,
  inspectionItems,
  tenantInspectionsBlockNothing,
  type BlockerCoverageStep,
} from '../inspection-coverage';

const item = (isDispatchBlocker = false): BlockerCoverageStep => ({
  stepType: INSPECTION_ITEM_STEP_TYPE,
  isDispatchBlocker,
});
const signature = (isDispatchBlocker = true): BlockerCoverageStep => ({
  stepType: 'SIGNATURE',
  isDispatchBlocker,
});
const upload = (isDispatchBlocker = true): BlockerCoverageStep => ({
  stepType: 'DOCUMENT_UPLOAD',
  isDispatchBlocker,
});

describe('checklistBlocksNothing', () => {
  it('warns when every inspection item is non-blocking', () => {
    // The 2026-04-24 script's shape: five items, none blocking.
    expect(checklistBlocksNothing([item(), item(), item(), item(), item()])).toBe(true);
  });

  it('stays quiet when a single inspection item blocks', () => {
    expect(checklistBlocksNothing([item(), item(true), item()])).toBe(false);
  });

  it('stays quiet when every inspection item blocks', () => {
    // The seeded DVIR shape.
    expect(checklistBlocksNothing([item(true), item(true)])).toBe(false);
  });

  it('stays quiet on a checklist with NO inspection items at all', () => {
    // Clause 2. With zero items the trip gate answers INSPECTION_REQUIRED
    // forever — drivers dead-end. Saying "nothing can block a trip start" there
    // would be the exact opposite of the truth, so silence is the right answer.
    expect(checklistBlocksNothing([])).toBe(false);
    expect(checklistBlocksNothing([signature(), upload()])).toBe(false);
  });

  it('does NOT count a blocking SIGNATURE or DOCUMENT_UPLOAD as coverage', () => {
    // Clause 1. Both are real for computeDispatchReadiness and BOTH are
    // unreachable from evaluateTripStartGate, which builds criticalFailures
    // only from INSPECTION_ITEM outcomes. Counting them would silence the
    // warning on a checklist that still cannot stop a truck.
    expect(checklistBlocksNothing([item(), signature(true), upload(true)])).toBe(true);
  });

  it('ignores unknown step types entirely', () => {
    expect(
      checklistBlocksNothing([item(), { stepType: 'SOMETHING_NEW', isDispatchBlocker: true }]),
    ).toBe(true);
  });
});

describe('inspectionItems', () => {
  it('keeps only INSPECTION_ITEM rows and preserves order', () => {
    const steps = [signature(), item(true), upload(), item(false)];
    expect(inspectionItems(steps)).toEqual([item(true), item(false)]);
  });
});

describe('tenantInspectionsBlockNothing', () => {
  it('warns when candidates carry items but nothing blocks', () => {
    expect(
      tenantInspectionsBlockNothing({
        candidateChecklists: 2,
        checklistsWithItems: 2,
        blockingItems: 0,
      }),
    ).toBe(true);
  });

  it('stays quiet when ANY candidate has a blocking item', () => {
    // The conservative reading, stated as a test so nobody "fixes" it into
    // per-checklist warning later: one armed checklist silences the tenant
    // warning even though a toothless one exists alongside it.
    expect(
      tenantInspectionsBlockNothing({
        candidateChecklists: 2,
        checklistsWithItems: 2,
        blockingItems: 11,
      }),
    ).toBe(false);
  });

  it('stays quiet when the tenant has no inspection checklist at all', () => {
    // ensureTripInspection already returns the named NO_INSPECTION_CHECKLIST
    // error for this. A second, vaguer warning would compete with it.
    expect(
      tenantInspectionsBlockNothing({
        candidateChecklists: 0,
        checklistsWithItems: 0,
        blockingItems: 0,
      }),
    ).toBe(false);
  });

  it('stays quiet when checklists exist but none carries an inspection item', () => {
    expect(
      tenantInspectionsBlockNothing({
        candidateChecklists: 3,
        checklistsWithItems: 0,
        blockingItems: 0,
      }),
    ).toBe(false);
  });
});
