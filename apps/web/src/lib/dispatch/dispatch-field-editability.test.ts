import { describe, expect, it } from 'vitest';
import {
  dispatchFieldEditability,
  lockedDispatchUpdateFields,
  DISPATCH_EDITABLE_FIELDS,
} from './dispatch-field-editability';

describe('dispatchFieldEditability', () => {
  it('planned: canEdit true, all 9 fields editable, lockReason null', () => {
    const result = dispatchFieldEditability('planned');
    expect(result.canEdit).toBe(true);
    expect(result.lockReason).toBeNull();
    expect(DISPATCH_EDITABLE_FIELDS).toHaveLength(9);
    for (const field of DISPATCH_EDITABLE_FIELDS) {
      expect(result.fields[field].editable).toBe(true);
      expect(result.fields[field].reason).toBeNull();
    }
  });

  it('in_progress: everything editable except routeTemplateId', () => {
    const result = dispatchFieldEditability('in_progress');
    expect(result.canEdit).toBe(true);
    expect(result.lockReason).toBeNull();

    const editableFields: (typeof DISPATCH_EDITABLE_FIELDS)[number][] = [
      'primaryDriverId',
      'coDriverId',
      'truckId',
      'scheduledDeparture',
      'scheduledArrival',
      'plannedMiles',
      'actualMiles',
      'notes',
    ];
    for (const field of editableFields) {
      expect(result.fields[field].editable).toBe(true);
    }

    expect(result.fields.routeTemplateId.editable).toBe(false);
    expect(result.fields.routeTemplateId.reason).toBeTruthy();
    expect(typeof result.fields.routeTemplateId.reason).toBe('string');
  });

  it.each(['completed', 'cancelled', 'tonu'])(
    '%s: canEdit false, lockReason non-empty, every field locked',
    (status) => {
      const result = dispatchFieldEditability(status);
      expect(result.canEdit).toBe(false);
      expect(result.lockReason).toBeTruthy();
      for (const field of DISPATCH_EDITABLE_FIELDS) {
        expect(result.fields[field].editable).toBe(false);
        expect(result.fields[field].reason).toBe(result.lockReason);
      }
    }
  );

  it('unknown status behaves like planned', () => {
    const result = dispatchFieldEditability('archived');
    expect(result.canEdit).toBe(true);
    expect(result.lockReason).toBeNull();
    for (const field of DISPATCH_EDITABLE_FIELDS) {
      expect(result.fields[field].editable).toBe(true);
    }
  });

  it('lockedDispatchUpdateFields returns the correct locked field set', () => {
    expect(lockedDispatchUpdateFields('in_progress')).toEqual(['routeTemplateId']);
    expect(lockedDispatchUpdateFields('planned')).toEqual([]);
  });
});
