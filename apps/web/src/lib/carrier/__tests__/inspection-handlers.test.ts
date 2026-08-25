/**
 * The pure helpers inside the inspection handlers: URL parsing, section
 * grouping, the photo-config spelling, and the copy strings.
 *
 * These are the parts most likely to be quietly wrong, because each of them
 * reproduces something the repo already does slightly differently somewhere.
 */
import { describe, it, expect } from 'vitest';
import { dispatchIdFromUrl } from '../inspection-url';
import { sectionOf, requiresPhotoOnFail, inspectionCopy } from '../inspection-handlers';

describe('dispatchIdFromUrl', () => {
  const base = 'http://localhost:3000/api/mobile/carrier/driver/dispatches';

  it('reads the id before the named segment', () => {
    expect(dispatchIdFromUrl(`${base}/trip-abc/inspection`, 'inspection')).toBe('trip-abc');
  });

  it('reads the id for a deeper route', () => {
    expect(dispatchIdFromUrl(`${base}/trip-abc/inspection/checklist`, 'inspection')).toBe('trip-abc');
  });

  it('strips a query string instead of gluing it onto the id', () => {
    // The existing tasks/[id]/fail copy of this logic splits on '/' with no URL
    // parse, so `.../fail?retry=1` would yield an id of `fail?retry=1`'s
    // predecessor only by luck of segment position — and `?x=1` on the id
    // segment itself would survive into the query.
    expect(dispatchIdFromUrl(`${base}/trip-abc/start?retry=1`, 'start')).toBe('trip-abc');
  });

  it('uses the LAST occurrence when a segment name repeats', () => {
    expect(
      dispatchIdFromUrl(`${base}/inspection/real-trip/inspection`, 'inspection')
    ).toBe('real-trip');
  });

  it('returns null when the named segment is absent', () => {
    expect(dispatchIdFromUrl(`${base}/trip-abc`, 'inspection')).toBeNull();
  });

  it('returns null rather than an empty id when the segment leads the path', () => {
    expect(dispatchIdFromUrl('http://localhost:3000/inspection', 'inspection')).toBeNull();
  });

  it('decodes a percent-encoded id', () => {
    expect(dispatchIdFromUrl(`${base}/a%2Fb/inspection`, 'inspection')).toBe('a/b');
  });

  it('survives a relative url with no origin', () => {
    expect(dispatchIdFromUrl('/api/x/trip-9/inspection', 'inspection')).toBe('trip-9');
  });
});

describe('sectionOf', () => {
  it('falls back to one section when the playbook has no grouping', () => {
    // This is the starter seed's exact shape: playbookPhase 'NONE' on all 12
    // steps. Grouping by PhaseType would have produced one section called
    // "None" and delivered nothing.
    expect(sectionOf({ playbookPhase: 'NONE', defaultConfig: {} })).toBe('Walkaround');
  });

  it('uses defaultConfig.section when the checklist author set one', () => {
    expect(sectionOf({ defaultConfig: { section: 'Brakes' } })).toBe('Brakes');
  });

  it('lets a per-playbook overrideConfig win over the template default', () => {
    expect(
      sectionOf({ defaultConfig: { section: 'Brakes' }, overrideConfig: { section: 'Air System' } })
    ).toBe('Air System');
  });

  it('humanises a real playbookPhase', () => {
    expect(sectionOf({ playbookPhase: 'PRE_START', defaultConfig: {} })).toBe('Pre start');
  });

  it('ignores a blank section string rather than rendering an empty header', () => {
    expect(sectionOf({ defaultConfig: { section: '   ' } })).toBe('Walkaround');
  });

  it('handles a null snapshot without throwing', () => {
    expect(sectionOf(null)).toBe('Walkaround');
  });
});

describe('requiresPhotoOnFail', () => {
  it('reads the spelling the starter seed writes', () => {
    // seedStarterPlaybooks writes `requiresPhotoOnFail`...
    expect(requiresPhotoOnFail({ defaultConfig: { requiresPhotoOnFail: true } })).toBe(true);
  });

  it('reads the spelling failInspectionItem enforces', () => {
    // ...while failInspectionItem checks `requiresPhoto`. Two keys, which is why
    // the seeded enforcement has always been inert.
    expect(requiresPhotoOnFail({ defaultConfig: { requiresPhoto: true } })).toBe(true);
  });

  it('is false when neither is set', () => {
    expect(requiresPhotoOnFail({ defaultConfig: {} })).toBe(false);
    expect(requiresPhotoOnFail(null)).toBe(false);
  });
});

describe('inspectionCopy — one string per sentence', () => {
  it('renders a singular defect count without a stray plural', () => {
    expect(inspectionCopy.passedWithDefects(1)).toContain('1 item was flagged');
  });

  it('renders a plural defect count', () => {
    expect(inspectionCopy.passedWithDefects(4)).toContain('4 items were flagged');
  });

  it('never produces two words run together at a count boundary', () => {
    // quick-517's "4 stopswill". Every sentence with a number in it goes through
    // this object precisely so the boundary does not exist to get wrong.
    const sentences = [
      inspectionCopy.passedWithDefects(1),
      inspectionCopy.passedWithDefects(4),
      inspectionCopy.inspectionRequired(0),
      inspectionCopy.inspectionRequired(1),
      inspectionCopy.inspectionRequired(7),
      inspectionCopy.blocked(1),
      inspectionCopy.blocked(3),
      inspectionCopy.priorInspection(1),
      inspectionCopy.priorInspection(6),
    ];
    for (const s of sentences) {
      expect(s).not.toMatch(/\d[a-z]/i);
      expect(s).not.toMatch(/\s{2,}/);
      expect(s.trim()).toBe(s);
    }
  });

  it('says "within the last hour" rather than "1 hours ago"', () => {
    expect(inspectionCopy.priorInspection(1)).toBe(
      'You inspected this truck within the last hour. No new walkaround needed.'
    );
  });

  it('names the overriding manager when it can, and stays true when it cannot', () => {
    expect(inspectionCopy.ownerOverride('Dana Reyes')).toContain('Dana Reyes');
    expect(inspectionCopy.ownerOverride(null)).toContain('A manager');
  });
});
