import type { PrismaClient } from '@/generated/prisma';

/**
 * Shared failure mode for the five carrier facility ownership checks
 * (quick-531).
 *
 * Why its own module rather than living in `facilities.ts`: `facilities.ts`
 * is imported by `loads.ts` and `stops.ts`, and both of those are exactly
 * the sites that need to throw this error — putting the type here instead
 * avoids an import cycle.
 *
 * What this module does NOT do: none of the five sites' main ownership
 * queries (`where: { id, orgId, deletedAt: null }`) are touched by this
 * module. `diagnoseFacilityUnavailable` runs only as a supplementary lookup
 * on a path that has *already* failed that query — it exists purely to say
 * *why* it failed. The cost is one extra round trip, and only on the
 * failure path; a successful ownership check never touches this file.
 */

export type FacilityUnavailableReason = 'DELETED' | 'NOT_IN_ORG';

/** The two approved sentences, verbatim. This is the only place either appears. */
export function facilityUnavailableMessage(reason: FacilityUnavailableReason): string {
  switch (reason) {
    case 'DELETED':
      return 'That facility has been deleted and cannot be used.';
    case 'NOT_IN_ORG':
      return 'That facility does not belong to this organization.';
  }
}

/**
 * Thrown by the four sites that throw (persistStops, createStop,
 * createCarrierDriver, updateCarrierDriver). `route-template-save.ts`
 * does not throw this — it must keep its `{ success: false, error }`
 * result shape, so it calls `facilityUnavailableMessage` directly instead.
 *
 * The facility id lives on the object, never interpolated into the
 * message: that keeps the message a stable, matchable, user-safe sentence
 * (routes map on `instanceof`, not string content) while still preserving
 * the id for the logger's benefit.
 */
export class FacilityUnavailableError extends Error {
  readonly reason: FacilityUnavailableReason;
  readonly facilityId: string;

  constructor(reason: FacilityUnavailableReason, facilityId: string) {
    super(facilityUnavailableMessage(reason));
    this.name = 'FacilityUnavailableError';
    this.reason = reason;
    this.facilityId = facilityId;
  }
}

/**
 * Supplementary lookup — call ONLY after the main tenant-scoped ownership
 * query has already missed. Deliberately unfiltered by `deletedAt`: finding
 * the soft-deleted row is this query's entire job. `orgId` stays in the
 * `where`, so a cross-tenant id still diagnoses as NOT_IN_ORG (and is still
 * rejected by the caller — this function only classifies, it never grants
 * access).
 */
export async function diagnoseFacilityUnavailable(
  db: PrismaClient,
  facilityId: string,
  orgId: string,
): Promise<FacilityUnavailableReason> {
  const row = await db.carrierFacility.findFirst({
    where: { id: facilityId, orgId },
    select: { deletedAt: true },
  });
  return row?.deletedAt ? 'DELETED' : 'NOT_IN_ORG';
}
