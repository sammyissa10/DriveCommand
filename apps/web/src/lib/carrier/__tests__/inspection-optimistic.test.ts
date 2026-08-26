/**
 * quick-547 — the transient answer overlay.
 *
 * Pure, like `inspection-handlers.test.ts` next door: no database, no mocks, no
 * React. Every fixture is hand-built, because the point of the module is that
 * the decisions it makes can be checked without standing up any of the things
 * that made the original bug hard to see.
 */
import { describe, it, expect } from 'vitest';
import type {
  InspectionChecklistView,
  InspectionStepView,
} from '../inspection-handlers';
import {
  applyOptimisticAnswers,
  inspectionProgress,
  isAnswered,
  pendingVerbFor,
  sectionRemainingCount,
  STATUS_FOR_VERB,
  type OptimisticAnswer,
} from '../inspection-optimistic';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function step(over: Partial<InspectionStepView> & { stepInstanceId: string }): InspectionStepView {
  return {
    name: 'Brakes',
    description: null,
    stepType: 'INSPECTION_ITEM',
    isCritical: false,
    status: 'NOT_STARTED',
    note: null,
    photoKeys: [],
    section: 'Walkaround',
    requiresPhotoOnFail: false,
    assigneeRole: null,
    answerableByDriver: true,
    ...over,
  };
}

function view(sections: InspectionChecklistView['sections']): InspectionChecklistView {
  return {
    dispatchId: 'trip-1',
    playbookInstanceId: 'pi-1',
    playbookName: 'Pre-trip DVIR',
    truckUnitNumber: '104',
    driverName: 'Sam Vance',
    sections,
    signature: { required: false, signed: false, stepInstanceId: null },
    failNoteMinLength: 10,
  };
}

/** Two steps in one section, both unanswered and both the driver's. */
function twoUnanswered(): InspectionChecklistView {
  return view([
    {
      title: 'Walkaround',
      steps: [step({ stepInstanceId: 's1', name: 'Brakes' }), step({ stepInstanceId: 's2', name: 'Tires' })],
    },
  ]);
}

const claim = (over: Partial<OptimisticAnswer> & { stepInstanceId: string }): OptimisticAnswer => ({
  status: 'COMPLETE',
  verb: 'pass',
  ...over,
});

const stepById = (v: InspectionChecklistView, id: string) =>
  v.sections.flatMap((s) => s.steps).find((s) => s.stepInstanceId === id)!;

// ---------------------------------------------------------------------------

describe('STATUS_FOR_VERB', () => {
  it('maps each button to the status it claims', () => {
    // One place, so the chip a driver sees before the round trip and the status
    // the server ends up storing cannot drift apart.
    expect(STATUS_FOR_VERB).toEqual({ pass: 'COMPLETE', fail: 'FAILED', na: 'SKIPPED' });
  });
});

describe('isAnswered', () => {
  it('treats NOT_STARTED and IN_PROGRESS as unanswered and the rest as answered', () => {
    expect(isAnswered({ status: 'NOT_STARTED' })).toBe(false);
    expect(isAnswered({ status: 'IN_PROGRESS' })).toBe(false);
    expect(isAnswered({ status: 'COMPLETE' })).toBe(true);
    expect(isAnswered({ status: 'FAILED' })).toBe(true);
    expect(isAnswered({ status: 'SKIPPED' })).toBe(true);
  });
});

describe('applyOptimisticAnswers', () => {
  it('applies the claim to the named step ONLY', () => {
    const v = twoUnanswered();
    const out = applyOptimisticAnswers(v, [claim({ stepInstanceId: 's1' })]);

    expect(stepById(out, 's1').status).toBe('COMPLETE');
    // The sibling in the same section is the interesting half: the section's
    // step array is rebuilt, so a careless implementation could easily carry the
    // claim across it.
    expect(stepById(out, 's2').status).toBe('NOT_STARTED');
  });

  it('returns an untouched step by IDENTITY, not as a copy', () => {
    // Identity rather than deep equality, deliberately. Deep equality would pass
    // for an accidental clone, and a clone is exactly what breaks React's
    // reconciliation and what would quietly hide a field being dropped in the
    // spread. Identity asserts the stronger thing: nothing happened to it.
    const v = twoUnanswered();
    const before = stepById(v, 's2');
    const out = applyOptimisticAnswers(v, [claim({ stepInstanceId: 's1' })]);

    expect(stepById(out, 's2')).toBe(before);
  });

  it('leaves a section with no claimed step identical', () => {
    const v = view([
      { title: 'Cab', steps: [step({ stepInstanceId: 's1' })] },
      { title: 'Trailer', steps: [step({ stepInstanceId: 's9' })] },
    ]);
    const untouchedSection = v.sections[1];
    const out = applyOptimisticAnswers(v, [claim({ stepInstanceId: 's1' })]);

    expect(out.sections[1]).toBe(untouchedSection);
  });

  it('lets a server COMPLETE supersede a claim of something else', () => {
    const v = view([
      { title: 'Walkaround', steps: [step({ stepInstanceId: 's1', status: 'COMPLETE' })] },
    ]);
    const out = applyOptimisticAnswers(v, [
      claim({ stepInstanceId: 's1', status: 'FAILED', verb: 'fail' }),
    ]);

    expect(stepById(out, 's1').status).toBe('COMPLETE');
  });

  it('lets a server FAILED supersede a claim of a pass', () => {
    // The direction that matters most. A spent claim painting over a recorded
    // defect would show a green tick on an item a mechanic has to see.
    const v = view([
      {
        title: 'Walkaround',
        steps: [step({ stepInstanceId: 's1', status: 'FAILED', note: 'left rear tire flat' })],
      },
    ]);
    const out = applyOptimisticAnswers(v, [claim({ stepInstanceId: 's1' })]);

    expect(stepById(out, 's1').status).toBe('FAILED');
    expect(stepById(out, 's1').note).toBe('left rear tire flat');
  });

  it('lets a server SKIPPED supersede a claim', () => {
    const v = view([
      { title: 'Walkaround', steps: [step({ stepInstanceId: 's1', status: 'SKIPPED' })] },
    ]);
    const out = applyOptimisticAnswers(v, [claim({ stepInstanceId: 's1' })]);

    expect(stepById(out, 's1').status).toBe('SKIPPED');
  });

  it('still applies a claim over IN_PROGRESS, which is not an answer', () => {
    const v = view([
      { title: 'Walkaround', steps: [step({ stepInstanceId: 's1', status: 'IN_PROGRESS' })] },
    ]);
    const out = applyOptimisticAnswers(v, [claim({ stepInstanceId: 's1' })]);

    expect(stepById(out, 's1').status).toBe('COMPLETE');
  });

  it('carries the note and the photo keys the claim supplies', () => {
    const v = twoUnanswered();
    const out = applyOptimisticAnswers(v, [
      claim({
        stepInstanceId: 's1',
        status: 'FAILED',
        verb: 'fail',
        note: 'left rear tire flat',
        photoKeys: ['tenant-1/inspections/abc.jpg'],
      }),
    ]);

    expect(stepById(out, 's1').note).toBe('left rear tire flat');
    expect(stepById(out, 's1').photoKeys).toEqual(['tenant-1/inspections/abc.jpg']);
  });

  it('is inert for a stepInstanceId that is not in the view', () => {
    const v = twoUnanswered();
    const out = applyOptimisticAnswers(v, [claim({ stepInstanceId: 'ghost' })]);

    expect(out.sections.flatMap((s) => s.steps)).toHaveLength(2);
    expect(out.sections.flatMap((s) => s.steps).map((s) => s.stepInstanceId)).toEqual(['s1', 's2']);
    expect(out.sections[0]).toBe(v.sections[0]);
  });

  it('lets the LAST claim for a step win', () => {
    const v = twoUnanswered();
    const out = applyOptimisticAnswers(v, [
      claim({ stepInstanceId: 's1' }),
      claim({ stepInstanceId: 's1', status: 'FAILED', verb: 'fail' }),
    ]);

    expect(stepById(out, 's1').status).toBe('FAILED');
  });

  it('does not mutate the input view', () => {
    const v = twoUnanswered();
    const snapshot = JSON.parse(JSON.stringify(v));
    const out = applyOptimisticAnswers(v, [
      claim({ stepInstanceId: 's1', status: 'FAILED', verb: 'fail', note: 'cracked' }),
    ]);

    expect(v).toEqual(snapshot);
    expect(out).not.toBe(v);
  });

  it('returns an equal view for an empty overlay', () => {
    const v = twoUnanswered();
    expect(applyOptimisticAnswers(v, [])).toEqual(v);
  });
});

describe('pendingVerbFor', () => {
  it('reports the verb in flight, newest first, and null when there is none', () => {
    const overlay = [
      claim({ stepInstanceId: 's1' }),
      claim({ stepInstanceId: 's1', status: 'SKIPPED', verb: 'na' }),
    ];
    expect(pendingVerbFor(overlay, 's1')).toBe('na');
    expect(pendingVerbFor(overlay, 's2')).toBeNull();
    expect(pendingVerbFor([], 's1')).toBeNull();
  });
});

describe('inspectionProgress', () => {
  it('counts only steps the driver can answer', () => {
    // quick-543's rule. The DISPATCHER step is rendered, read-only, and must
    // never sit in the denominator: the bar would stop one short forever.
    const v = view([
      {
        title: 'Walkaround',
        steps: [
          step({ stepInstanceId: 's1', status: 'COMPLETE' }),
          step({ stepInstanceId: 's2' }),
          step({
            stepInstanceId: 's3',
            answerableByDriver: false,
            assigneeRole: 'DISPATCHER',
          }),
        ],
      },
    ]);

    expect(inspectionProgress(v)).toEqual({ total: 2, answered: 1, remaining: 1 });
  });

  it('reaches all-answered without the step somebody else owns', () => {
    const v = view([
      {
        title: 'Walkaround',
        steps: [
          step({ stepInstanceId: 's1', status: 'COMPLETE' }),
          step({ stepInstanceId: 's2', status: 'FAILED' }),
          step({ stepInstanceId: 's3', answerableByDriver: false }),
        ],
      },
    ]);

    expect(inspectionProgress(v).remaining).toBe(0);
  });

  it('counts across every section', () => {
    const v = view([
      { title: 'Cab', steps: [step({ stepInstanceId: 's1', status: 'SKIPPED' })] },
      { title: 'Trailer', steps: [step({ stepInstanceId: 's2' })] },
    ]);

    expect(inspectionProgress(v)).toEqual({ total: 2, answered: 1, remaining: 1 });
  });

  it('advances the moment the overlay is applied — the header and the chip agree', () => {
    // The whole reason the derivation left the component: it is fed the SAME
    // optimistic view the chips are rendered from, so they cannot disagree.
    const v = twoUnanswered();
    expect(inspectionProgress(v).answered).toBe(0);

    const optimistic = applyOptimisticAnswers(v, [claim({ stepInstanceId: 's1' })]);
    expect(inspectionProgress(optimistic).answered).toBe(1);
    expect(stepById(optimistic, 's1').status).toBe('COMPLETE');
  });

  it('survives a checklist with no steps at all', () => {
    expect(inspectionProgress(view([]))).toEqual({ total: 0, answered: 0, remaining: 0 });
  });
});

describe('sectionRemainingCount', () => {
  it('counts only this section, only the ones that are the driver to answer', () => {
    const section = {
      title: 'Cab',
      steps: [
        step({ stepInstanceId: 's1', status: 'COMPLETE' }),
        step({ stepInstanceId: 's2' }),
        step({ stepInstanceId: 's3', answerableByDriver: false }),
      ],
    };

    expect(sectionRemainingCount(section)).toBe(1);
  });

  it('answers 0 rather than throwing when the index is past the end', () => {
    expect(sectionRemainingCount(undefined)).toBe(0);
  });
});
