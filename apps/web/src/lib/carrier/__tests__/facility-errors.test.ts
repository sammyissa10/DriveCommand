import { describe, it, expect } from 'vitest';
import {
  diagnoseFacilityUnavailable,
  facilityUnavailableMessage,
  FacilityUnavailableError,
  type FacilityUnavailableReason,
} from '@/lib/carrier/facility-errors';

// The `db` argument below is a stub — its `carrierFacility.findFirst` returns
// a fixed fixture row rather than talking to Postgres. This proves the branch
// logic and the exact message strings; it is not evidence about SQL (that
// class of proof — pg_get_constraintdef, live inserts — belongs to the
// migration work, not a unit test with a faked client).
function stubDb(row: { deletedAt: Date | null } | null) {
  return {
    carrierFacility: {
      findFirst: async () => row,
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('diagnoseFacilityUnavailable', () => {
  it('diagnoses DELETED when the row exists with deletedAt set', async () => {
    const db = stubDb({ deletedAt: new Date('2026-01-01T00:00:00Z') });
    const reason = await diagnoseFacilityUnavailable(db, 'fac_1', 'org_1');
    expect(reason).toBe('DELETED');
  });

  it('diagnoses NOT_IN_ORG when the row exists with deletedAt null (missed the main query for some other reason)', async () => {
    const db = stubDb({ deletedAt: null });
    const reason = await diagnoseFacilityUnavailable(db, 'fac_1', 'org_1');
    expect(reason).toBe('NOT_IN_ORG');
  });

  it('diagnoses NOT_IN_ORG when no row is found at all (e.g. cross-tenant id)', async () => {
    const db = stubDb(null);
    const reason = await diagnoseFacilityUnavailable(db, 'fac_1', 'org_1');
    expect(reason).toBe('NOT_IN_ORG');
  });
});

describe('facilityUnavailableMessage', () => {
  it('returns the two approved sentences verbatim, character for character', () => {
    expect(facilityUnavailableMessage('DELETED')).toBe(
      'That facility has been deleted and cannot be used.',
    );
    expect(facilityUnavailableMessage('NOT_IN_ORG')).toBe(
      'That facility does not belong to this organization.',
    );
  });

  it('covers both members of the reason union (compile-time exhaustiveness proxy)', () => {
    const reasons: FacilityUnavailableReason[] = ['DELETED', 'NOT_IN_ORG'];
    for (const reason of reasons) {
      expect(typeof facilityUnavailableMessage(reason)).toBe('string');
    }
  });
});

describe('FacilityUnavailableError', () => {
  it('carries the facility id on the object, never interpolated into the message', () => {
    const err = new FacilityUnavailableError('DELETED', 'fac_1');
    expect(err.message).not.toContain('fac_1');
    expect(err.facilityId).toBe('fac_1');
    expect(err.reason).toBe('DELETED');
  });

  it('message matches facilityUnavailableMessage for each reason', () => {
    expect(new FacilityUnavailableError('DELETED', 'fac_2').message).toBe(
      facilityUnavailableMessage('DELETED'),
    );
    expect(new FacilityUnavailableError('NOT_IN_ORG', 'fac_3').message).toBe(
      facilityUnavailableMessage('NOT_IN_ORG'),
    );
  });

  it('is both an Error and a FacilityUnavailableError via instanceof', () => {
    const err = new FacilityUnavailableError('NOT_IN_ORG', 'fac_4');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof FacilityUnavailableError).toBe(true);
    expect(err.name).toBe('FacilityUnavailableError');
  });
});
