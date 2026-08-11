/**
 * End stop policy — the READ-ONLY half. Spec Section 9, Part A.
 *
 * Loads the three layers, resolves them through the pure `end-stop.ts`, and
 * describes the answer. **Nothing here writes.** That is the quick-508 rule and
 * it holds for the same reason it held for the client and the contract: a GET
 * that quietly commits is a GET nobody can reason about, and the honest way to
 * say "this is decided but not stored" is already on the payload as
 * `persisted: false`.
 *
 * The one subtlety worth reading before editing is the short-circuit in
 * `buildEndStopSlot`: a stored `resolution_provenance.endStop` key wins over
 * everything computed, because a stored answer must outrank a fresh guess. It is
 * also why "use my company default again" is a POST that DELETES the key rather
 * than a re-fetch — quick-516's exact trap, one slot over.
 */

import type { PrismaClient } from '@/generated/prisma';
import type { CanonicalAddress, CanonicalConsignment } from '@drivecommand/validation';

import {
  facilityVisibilityWhere,
  residenceFacilityForDriver,
  type FacilityViewer,
} from '@/lib/carrier/facility-visibility';

import { formatNormalised, normaliseAddress } from './address';
import {
  DESIGNATED_PARKING_FACILITY_TYPES,
  END_STOP_POLICIES,
  END_STOP_POLICY_LABELS,
  type EndStopPolicy,
} from './end-stop-constants';
import {
  endStopTargetFor,
  resolveEndStopPolicy,
  type EndStopPolicySource,
  type EndStopTargetState,
} from './end-stop';
import type { StopDecision } from './facility-lookup';
import type { ImportRecord } from './persistence';
import { endStopProvenanceOf, type EndStopProvenanceVia } from './provenance';
import { reviewedConsignmentsOf } from './stop-review';
import { isTemplateInsertedStop } from './template-matching';

// ---------------------------------------------------------------------------
// View types — mirrored in packages/api-client and on the mobile screen
// ---------------------------------------------------------------------------

export interface EndStopFacilityView {
  id: string;
  name: string;
  /** One line, through the SHARED normaliser — not a second address formatter. */
  address: string;
  facilityType: string | null;
  /** True only for the assigned driver's home. Drives the privacy note in the UI. */
  isDriverResidence: boolean;
}

export interface EndStopWhyView {
  via: EndStopProvenanceVia | null;
  source: EndStopPolicySource;
  /** One sentence naming which layer answered and what it overrode. */
  detail: string;
}

export interface EndStopPolicyOption {
  policy: EndStopPolicy;
  label: string;
  /** False when this tenant/trip cannot use it yet — no home base, no driver. */
  available: boolean;
  /** Why not, in plain language. Null when available. */
  unavailableReason: string | null;
}

export interface EndStopSlotView {
  /** Mirrors `EndStopTargetState` — the four ways this can fail, plus success. */
  state: EndStopTargetState;
  policy: EndStopPolicy;
  source: EndStopPolicySource;
  facility: EndStopFacilityView | null;
  why: EndStopWhyView;
  /** All five, each with whether this trip can actually use it. */
  options: EndStopPolicyOption[];
  /**
   * Facilities offered when the policy is `DESIGNATED_PARKING`.
   *
   * Already filtered by the residence rule — a driver's home is never in a
   * parking picker, whoever is looking, because Section 9's "not in the general
   * picker" is about pickers and this is one.
   */
  parkingCandidates: EndStopFacilityView[];
  /** Set when the policy needs something before it can produce a stop. */
  blockedReason: string | null;
  /**
   * True when the decision is written to `resolution_provenance.endStop`.
   * False means "derived on this read" — the same honest flag the client,
   * contract, stop and template slots carry.
   */
  persisted: boolean;
  /** True once Phase 8's commit wrote the real `CarrierStop`. */
  materialised: boolean;
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const FACILITY_SELECT = {
  id: true,
  name: true,
  facilityType: true,
  addressLine1: true,
  addressLine2: true,
  city: true,
  state: true,
  zip: true,
  isDriverResidence: true,
  residentDriverId: true,
} as const;

type FacilityRow = {
  id: string;
  name: string;
  facilityType: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  isDriverResidence: boolean;
  residentDriverId: string | null;
};

function addressOf(facility: FacilityRow): CanonicalAddress {
  return {
    line1: facility.addressLine1,
    line2: facility.addressLine2,
    city: facility.city,
    state: facility.state,
    postalCode: facility.zip,
    country: null,
  };
}

export function facilityView(facility: FacilityRow): EndStopFacilityView {
  return {
    id: facility.id,
    name: facility.name,
    address: formatNormalised(normaliseAddress(addressOf(facility))),
    facilityType: facility.facilityType,
    isDriverResidence: facility.isDriverResidence,
  };
}

/** Everything the three layers need, loaded once. */
export interface EndStopContext {
  record: ImportRecord;
  /** `Tenant."defaultEndStopPolicy"`. */
  tenantPolicy: string | null;
  /** `Tenant."homeBaseFacilityId"`. */
  homeBaseFacilityId: string | null;
  /** `route_templates.end_stop_policy` on the selected template, or null. */
  templatePolicy: string | null;
  /**
   * `route_templates.end_stop_facility_id` on the selected template, or null.
   *
   * The template rung's answer to `DESIGNATED_PARKING` — Section 9's *"per
   * template or trip"*, whose template half had no column to live in until
   * quick-520. Read only under that policy.
   */
  templateEndStopFacilityId: string | null;
  /** The driver assigned to the trip this import created, if it has one. */
  assignedDriverId: string | null;
  /** That driver's residence, already through the visibility filter. */
  driverResidenceFacilityId: string | null;
  /** The first stop's resolved facility — `RETURN_TO_ORIGIN`'s target. */
  firstPickupFacilityId: string | null;
  /** Display rows for whatever the answer turns out to be, plus the parking list. */
  facilities: Map<string, FacilityRow>;
  parkingCandidates: FacilityRow[];
}

/**
 * The first stop the truck actually collects from.
 *
 * A stop typed `pickup` wins. Failing that — and on a consignee manifest nothing
 * is typed, because Phase 5 deliberately leaves `stopType` null rather than
 * defaulting it — the first stop that is on the run and has a facility is used.
 * Skipped stops and template-inserted ghosts are excluded here exactly as they
 * are from scoring (quick-517/518): a run does not start at a stop nobody is
 * driving to.
 */
export function firstPickupFacilityOf(
  consignments: readonly CanonicalConsignment[],
  decisions: readonly StopDecision[],
): string | null {
  const live = decisions.filter((d) => {
    const consignment = d.consignment ?? consignments[d.slot.index];
    if (!consignment) return false;
    if (consignment.skipped) return false;
    if (isTemplateInsertedStop(consignment)) return false;
    return Boolean(d.slot.facility?.id);
  });

  const typedPickup = live.find((d) => {
    const consignment = d.consignment ?? consignments[d.slot.index];
    return consignment?.stopType === 'pickup';
  });

  return (typedPickup ?? live[0])?.slot.facility?.id ?? null;
}

/**
 * Load the three layers and the facilities they name.
 *
 * Read-only. The `viewer` is threaded through to `residenceFacilityForDriver`
 * rather than checked afterwards, so a dispatcher without the permission gets
 * null for a residence and the policy reports `UNAVAILABLE` — the same answer
 * they would get if the driver had no address on file, which is exactly the
 * amount of information a refusal should leak.
 */
export async function loadEndStopContext(
  db: PrismaClient,
  orgId: string,
  record: ImportRecord,
  decisions: readonly StopDecision[],
  viewer?: FacilityViewer | null,
): Promise<EndStopContext> {
  const { consignments } = reviewedConsignmentsOf(record.reviewedExtraction, record.rawExtraction);

  const [tenant, template, trip] = await Promise.all([
    db.tenant.findFirst({
      where: { id: orgId },
      select: { defaultEndStopPolicy: true, homeBaseFacilityId: true },
    }),
    record.routeTemplateId
      ? db.routeTemplate.findFirst({
          where: { id: record.routeTemplateId, orgId },
          select: { endStopPolicy: true, endStopFacilityId: true },
        })
      : Promise.resolve(null),
    record.createdTripId
      ? db.trip.findFirst({
          where: { id: record.createdTripId, orgId },
          select: { primaryDriverId: true },
        })
      : Promise.resolve(null),
  ]);

  const assignedDriverId = trip?.primaryDriverId ?? null;
  const driverResidenceFacilityId = assignedDriverId
    ? await residenceFacilityForDriver(db, orgId, assignedDriverId, viewer)
    : null;

  const firstPickupFacilityId = firstPickupFacilityOf(consignments, decisions);
  const stored = endStopProvenanceOf(record);

  const wanted = [
    tenant?.homeBaseFacilityId ?? null,
    driverResidenceFacilityId,
    firstPickupFacilityId,
    stored?.facilityId ?? null,
    // The template's parking facility can be the answer, so its display row has
    // to be loaded here or the card resolves to a facility it cannot name.
    template?.endStopFacilityId ?? null,
  ].filter((id): id is string => Boolean(id));

  const [named, parkingCandidates] = await Promise.all([
    wanted.length
      ? db.carrierFacility.findMany({
          // No visibility filter on THIS query, deliberately: every id in
          // `wanted` was already produced by a path that applied the rule (the
          // residence through `residenceFacilityForDriver`, the rest are not
          // residences), and re-filtering here would silently drop the assigned
          // driver's own home from their own trip's card.
          where: { id: { in: [...new Set(wanted)] }, orgId },
          select: FACILITY_SELECT,
        })
      : Promise.resolve([] as FacilityRow[]),
    db.carrierFacility.findMany({
      where: {
        orgId,
        facilityType: { in: [...DESIGNATED_PARKING_FACILITY_TYPES] },
        NOT: { facilityType: { startsWith: 'inactive_' } },
        ...facilityVisibilityWhere(viewer),
      },
      select: FACILITY_SELECT,
      orderBy: { name: 'asc' },
      take: 100,
    }),
  ]);

  return {
    record,
    tenantPolicy: tenant?.defaultEndStopPolicy ?? null,
    homeBaseFacilityId: tenant?.homeBaseFacilityId ?? null,
    templatePolicy: template?.endStopPolicy ?? null,
    templateEndStopFacilityId: template?.endStopFacilityId ?? null,
    assignedDriverId,
    driverResidenceFacilityId,
    firstPickupFacilityId,
    facilities: new Map((named as FacilityRow[]).map((f) => [f.id, f])),
    parkingCandidates: parkingCandidates as FacilityRow[],
  };
}

// ---------------------------------------------------------------------------
// The slot
// ---------------------------------------------------------------------------

const SOURCE_DETAIL: Record<EndStopPolicySource, string> = {
  TENANT: 'This is your company’s default end stop.',
  TEMPLATE: 'This route’s saved template sets where the day ends, overriding the company default.',
  TRIP: 'You chose this end stop for this trip.',
};

/**
 * The end stop row for the summary card.
 *
 * ---------------------------------------------------------------------------
 * THE STORED KEY SHORT-CIRCUITS THE LADDER
 * ---------------------------------------------------------------------------
 * `resolveEndStopPolicy` is handed the stored policy as its `trip` layer, so a
 * stored record wins by construction rather than by a special case — the third
 * rung of Section 9's order IS the stored key. What that means for the UI is the
 * thing to remember: **there is no value you can write to un-decide.** Writing
 * `NONE` records "this trip has no end stop", which is a real and different
 * answer from "fall back to my company default". The only way back is
 * `clearEndStopChoice`, which deletes the key, and it is a POST.
 */
export function buildEndStopSlot(context: EndStopContext): EndStopSlotView {
  const stored = endStopProvenanceOf(context.record);

  const resolution = resolveEndStopPolicy({
    tenant: context.tenantPolicy,
    template: context.templatePolicy,
    trip: stored?.policy ?? null,
  });

  const targetContext = {
    firstPickupFacilityId: context.firstPickupFacilityId,
    homeBaseFacilityId: context.homeBaseFacilityId,
    // Section 9's "per template or trip", with BOTH halves present since
    // quick-520 gave the template one (`route_templates.end_stop_facility_id`).
    //
    // **The per-trip rung outranks the template rung** — that is Section 9's
    // order and inverting it would let a template quietly override a choice a
    // dispatcher made for today. The `??` is safe rather than lucky: a stored
    // decision whose policy is NOT `DESIGNATED_PARKING` resolves to a different
    // policy entirely (it is fed in as the trip layer above), so the fallback
    // cannot smuggle a parking facility into a trip that chose `NONE`.
    designatedParkingFacilityId:
      (stored?.policy === 'DESIGNATED_PARKING' ? stored.facilityId : null) ??
      context.templateEndStopFacilityId,
    driverResidenceFacilityId: context.driverResidenceFacilityId,
    assignedDriverId: context.assignedDriverId,
  };

  const target = endStopTargetFor(resolution.policy, targetContext);
  const facilityRow = target.facilityId ? context.facilities.get(target.facilityId) : undefined;

  const options: EndStopPolicyOption[] = END_STOP_POLICIES.map((policy) => {
    const probe = endStopTargetFor(policy, targetContext);
    // NEEDS_CHOICE is available — it is a policy whose answer is one tap away,
    // not one this tenant cannot use. Only a missing home base or a missing
    // driver address makes an option genuinely unusable.
    const available = probe.state !== 'UNAVAILABLE';
    return {
      policy,
      label: END_STOP_POLICY_LABELS[policy],
      available,
      unavailableReason: available ? null : probe.reason,
    };
  });

  return {
    state: target.state,
    policy: resolution.policy,
    source: resolution.source,
    facility: facilityRow ? facilityView(facilityRow) : null,
    why: {
      via: stored?.via ?? null,
      source: resolution.source,
      detail: SOURCE_DETAIL[resolution.source],
    },
    options,
    parkingCandidates: context.parkingCandidates.map(facilityView),
    blockedReason: target.reason,
    persisted: Boolean(stored),
    materialised: Boolean(stored?.materialisedAt),
  };
}
