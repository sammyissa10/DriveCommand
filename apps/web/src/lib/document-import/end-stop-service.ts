/**
 * End stop policy — the WRITING half. Spec Section 9, Part A.
 *
 * Everything in this phase that changes a row is here, the same way
 * `facility-resolution.ts` holds Phase 4's writes, `stop-review-service.ts`
 * holds Phase 5's and `template-service.ts` holds Phase 6's. `end-stop.ts` is
 * pure and `end-stop-lookup.ts` is read-only.
 *
 * ---------------------------------------------------------------------------
 * NO DDL
 * ---------------------------------------------------------------------------
 * The end stop decision is one key on `document_imports.resolution_provenance`,
 * a jsonb column that has held the client, contract, stop and template
 * decisions since Phase 3. `Tenant."defaultEndStopPolicy"`,
 * `Tenant."homeBaseFacilityId"`, `route_templates.end_stop_policy`,
 * `dispatches.end_stop_policy` and `stops.is_end_stop` were created by Phase 1
 * and verified present against production on 2026-08-10. No migration was
 * written.
 */

import { Prisma } from '@/generated/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import {
  canSeeDriverResidences,
  carrierDriverIdForUser,
  type FacilityViewer,
} from '@/lib/carrier/facility-visibility';

import {
  endStopStopDraft,
  endStopTargetFor,
  resolveEndStopPolicy,
  type EndStopStopDraft,
} from './end-stop';
import { isEndStopPolicy, type EndStopPolicy } from './end-stop-constants';
import {
  buildEndStopSlot,
  loadEndStopContext,
  type EndStopContext,
  type EndStopSlotView,
} from './end-stop-lookup';
import {
  decideStops,
  loadExternalReferences,
  loadFacilityCandidates,
  type StopDecision,
} from './facility-lookup';
import { getImportRecord, type ImportRecord } from './persistence';
import {
  endStopProvenanceOf,
  provenanceOf,
  stampEndStop,
  type EndStopProvenance,
  type EndStopProvenanceVia,
  type ResolutionProvenance,
} from './provenance';
import { resolveEffectiveClientId, ResolutionError } from './resolution';

// ---------------------------------------------------------------------------
// Shared plumbing — mirrors the three sibling services rather than reinventing it
// ---------------------------------------------------------------------------

/** Statuses in which the end stop may still be changed. Same set as the others. */
const EDITABLE: readonly string[] = ['NEEDS_REVIEW', 'READY'];

function assertEditable(record: ImportRecord): void {
  if (!EDITABLE.includes(record.status)) {
    throw new ResolutionError(
      `This import is ${record.status.replace(/_/g, ' ').toLowerCase()} and its end stop can no longer be changed.`,
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
 * The viewer, for the residence privacy rule.
 *
 * Built here rather than passed in from every caller because the id it needs —
 * `carrier_drivers.id` — is not on a session, and a caller that had to remember
 * to resolve it is a caller that will forget. When the role or permissions are
 * not supplied (the mobile surface authenticates with a Bearer token that
 * carries a role but no permission map), the answer is the restrictive one: see
 * `facility-visibility.ts` on default deny.
 */
async function viewerFor(
  db: Parameters<typeof carrierDriverIdForUser>[0],
  orgId: string,
  userId: string,
  supplied?: FacilityViewer | null,
): Promise<FacilityViewer> {
  if (supplied?.carrierDriverId !== undefined) return supplied;
  const carrierDriverId = await carrierDriverIdForUser(db, orgId, userId);
  return { role: supplied?.role ?? '', permissions: supplied?.permissions ?? null, carrierDriverId };
}

/** Everything the view and the writers need, loaded once. */
async function loadContext(
  orgId: string,
  userId: string,
  record: ImportRecord,
  supplied?: FacilityViewer | null,
): Promise<EndStopContext> {
  const db = await getTenantPrismaForOrg(orgId, userId);
  const effectiveClientId = await resolveEffectiveClientId(db, orgId, record);

  const [candidates, referencesByCode, viewer] = await Promise.all([
    loadFacilityCandidates(db, orgId),
    loadExternalReferences(db, orgId, effectiveClientId),
    viewerFor(db, orgId, userId, supplied),
  ]);

  const decisions: StopDecision[] = decideStops(record, { candidates, referencesByCode });
  return loadEndStopContext(db, orgId, record, decisions, viewer);
}

/**
 * Merge one end-stop record into the row and write it.
 *
 * In-memory merge, single `updateMany`, every other provenance key carried
 * across untouched — the quick-509 pattern, unchanged.
 *
 * A `null` provenance **removes** the key rather than writing a record that says
 * nothing. That is load-bearing and is quick-516's lesson applied one slot over:
 * `buildEndStopSlot` feeds the stored policy in as the per-trip layer, so a
 * stored record outranks the tenant default and the template override by
 * construction. The only way back to "use whatever my company says" is for the
 * key to be gone — there is no value that means undecided, because `NONE` means
 * something else entirely ("this trip ends nowhere").
 */
async function writeEndStop(
  orgId: string,
  userId: string,
  record: ImportRecord,
  provenance: EndStopProvenance | null,
): Promise<ImportRecord> {
  const db = await getTenantPrismaForOrg(orgId, userId);

  const current = provenanceOf(record);
  const next: ResolutionProvenance = { ...current };
  if (provenance) next.endStop = provenance;
  else delete next.endStop;

  const data: Prisma.DocumentImportUncheckedUpdateManyInput = {
    resolutionProvenance: next as unknown as Prisma.InputJsonValue,
    updatedById: userId,
  };

  await db.documentImport.updateMany({ where: { id: record.id, orgId, deletedAt: null }, data });

  const fresh = await getImportRecord(orgId, record.id, userId);
  return fresh ?? record;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** The end stop row for the summary card. Read-only — the writes are below. */
export async function getEndStopView(
  orgId: string,
  userId: string,
  importId: string,
  viewer?: FacilityViewer | null,
): Promise<EndStopSlotView | null> {
  const record = await getImportRecord(orgId, importId, userId);
  if (!record) return null;
  return buildEndStopSlot(await loadContext(orgId, userId, record, viewer));
}

/** The same slot, for a caller that already holds the record. */
export async function endStopSlotFor(
  orgId: string,
  userId: string,
  record: ImportRecord,
  viewer?: FacilityViewer | null,
): Promise<EndStopSlotView> {
  return buildEndStopSlot(await loadContext(orgId, userId, record, viewer));
}

// ---------------------------------------------------------------------------
// The per-trip choice
// ---------------------------------------------------------------------------

/**
 * A person chose an end stop for this trip — Section 9's third rung.
 *
 * The facility is validated against the tenant AND against the visibility rule
 * before it is stored. That second check is the one that matters: without it a
 * dispatcher without the residence permission could name another driver's home
 * facility id directly and have the system confirm it back to them on the card,
 * which is the "call the API as driver B" failure the phase's verify table asks
 * for. `residenceFacilityForDriver` guards the *lookup*; this guards the *write*.
 */
export async function setEndStopChoice(
  orgId: string,
  userId: string,
  importId: string,
  policy: string,
  facilityId: string | null,
): Promise<EndStopSlotView> {
  const record = await requireRecord(orgId, userId, importId);
  assertEditable(record);

  if (!isEndStopPolicy(policy)) {
    throw new ResolutionError('That is not an end stop this system has.', 'INVALID_STOP');
  }

  const db = await getTenantPrismaForOrg(orgId, userId);
  const viewer = await viewerFor(db, orgId, userId, null);

  let chosenFacilityId: string | null = null;

  if (policy === 'DESIGNATED_PARKING') {
    if (!facilityId) {
      throw new ResolutionError('Pick where this truck parks at the end of the day.', 'INVALID_FACILITY');
    }
    const facility = await db.carrierFacility.findFirst({
      where: { id: facilityId, orgId, deletedAt: null },
      select: { id: true, isDriverResidence: true, residentDriverId: true },
    });
    if (!facility) {
      throw new ResolutionError('That facility is not available.', 'INVALID_FACILITY');
    }
    // A residence is never designated parking, whoever is asking. Section 9 says
    // "not suggested for other trips", and pinning a driver's house as the
    // parking spot for a trip is precisely that.
    if (facility.isDriverResidence && !canSeeDriverResidences(viewer)) {
      throw new ResolutionError('That facility is not available.', 'INVALID_FACILITY');
    }
    if (facility.isDriverResidence) {
      throw new ResolutionError(
        'A driver’s home cannot be designated parking. Choose the driver’s home policy instead.',
        'INVALID_FACILITY',
      );
    }
    chosenFacilityId = facility.id;
  } else if (facilityId) {
    // Every other policy computes its own facility. Accepting one here would let
    // a client assert an end stop the ladder never resolved — the same rule
    // Phase 4 applies to a T3 confirmation, where the only thing a client may
    // state is *which* thing a person tapped and the server recomputes the rest.
    throw new ResolutionError('That end stop works out its own facility.', 'INVALID_FACILITY');
  }

  const provenance = stampEndStop(
    {
      via: 'MANUAL',
      score: null,
      matchedText: null,
      policy,
      facilityId: chosenFacilityId,
    },
    userId,
  );

  const updated = await writeEndStop(orgId, userId, record, provenance);
  logger.info('[document-import] end stop chosen', { importId, policy });
  return endStopSlotFor(orgId, userId, updated, viewer);
}

/**
 * "Use my company's default again." Un-decide the end stop.
 *
 * Deletes the whole key. The next read resolves the ladder from scratch, so the
 * template override — or the tenant default — takes effect again.
 *
 * `assertEditable` confines this to `NEEDS_REVIEW` / `READY`, which is also why
 * it cannot lose a `materialisedAt`: that field is only ever written against a
 * `COMMITTED` row, and a `COMMITTED` row cannot reach this function. A trip
 * whose end stop has already been created keeps its record.
 */
export async function clearEndStopChoice(
  orgId: string,
  userId: string,
  importId: string,
): Promise<EndStopSlotView> {
  const record = await requireRecord(orgId, userId, importId);
  assertEditable(record);

  const updated = await writeEndStop(orgId, userId, record, null);
  logger.info('[document-import] end stop decision cleared', { importId });
  return endStopSlotFor(orgId, userId, updated);
}

// ---------------------------------------------------------------------------
// The mutation boundary
// ---------------------------------------------------------------------------

/**
 * Commit the derived end stop decision, if there is not already one.
 *
 * **Phase 8's atomic commit must call this** before it reads the policy, for the
 * reason quick-508 recorded for the client and quick-510 for the contract: an
 * import whose end stop was displayed from the tenant default, and where nobody
 * tapped anything, has no record at all — and a commit that read the columns
 * fresh could reach a different answer from the card that authorised it if the
 * tenant default or the template changed in between.
 *
 * Deliberately NOT called from the stop-review or facility mutations, unlike
 * `ensureStopsCommitted`. Freezing the policy the first time somebody edits a
 * stop would pin it before the template has been chosen, and the template
 * override is the second rung of the ladder. `ensureTemplateCommitted` is
 * scoped the same way and for the same reason.
 */
export async function ensureEndStopCommitted(
  orgId: string,
  userId: string,
  record: ImportRecord,
  viewer?: FacilityViewer | null,
): Promise<ImportRecord> {
  if (endStopProvenanceOf(record)) return record;

  const context = await loadContext(orgId, userId, record, viewer);
  const resolution = resolveEndStopPolicy({
    tenant: context.tenantPolicy,
    template: context.templatePolicy,
    trip: null,
  });

  const target = endStopTargetFor(resolution.policy, {
    firstPickupFacilityId: context.firstPickupFacilityId,
    homeBaseFacilityId: context.homeBaseFacilityId,
    // The template's own parking facility. Hardcoded `null` here until
    // quick-520, which meant a template-level `DESIGNATED_PARKING` committed as
    // `NEEDS_CHOICE` with no facility even though the template had already
    // answered the question. There is deliberately no per-trip term: this
    // function only runs when nothing is stored (the guard above), so the trip
    // rung has nothing to say.
    designatedParkingFacilityId: context.templateEndStopFacilityId,
    driverResidenceFacilityId: context.driverResidenceFacilityId,
    assignedDriverId: context.assignedDriverId,
  });

  const via: EndStopProvenanceVia =
    resolution.source === 'TEMPLATE' ? 'TEMPLATE_OVERRIDE' : 'TENANT_DEFAULT';

  const provenance = stampEndStop(
    { via, score: null, matchedText: null, policy: resolution.policy, facilityId: target.facilityId },
    userId,
  );

  logger.info('[document-import] end stop auto-committed', {
    importId: record.id,
    policy: resolution.policy,
    via,
  });

  return writeEndStop(orgId, userId, record, provenance);
}

// ---------------------------------------------------------------------------
// What Phase 8 writes
// ---------------------------------------------------------------------------

export interface EndStopCommitPlan {
  policy: EndStopPolicy;
  /** Null when the policy is `NONE`, or cannot resolve. Then no stop is written. */
  draft: EndStopStopDraft | null;
  /** Why there is no draft, for the commit's own warnings. Null when there is one. */
  blockedReason: string | null;
}

/**
 * The end stop row for a commit, as data.
 *
 * Returned rather than written, because Phase 8 owns the transaction and this
 * module must not open a second write path into `stops` (audit B9: the module
 * already has one too many). Phase 8 spreads `draft` into its
 * `carrierStop.create`, sets `dispatches.end_stop_policy` from `policy`, and
 * calls `markEndStopMaterialised` inside the same transaction.
 *
 * `lastSequenceOrder` is the highest sequence the commit has already written, so
 * the end stop lands one past it — pinned last, and enforced by
 * `@@unique([dispatchId, sequenceOrder])` rather than by a sort somewhere.
 */
export async function endStopCommitPlan(
  orgId: string,
  userId: string,
  record: ImportRecord,
  lastSequenceOrder: number,
  viewer?: FacilityViewer | null,
): Promise<EndStopCommitPlan> {
  const context = await loadContext(orgId, userId, record, viewer);
  const slot = buildEndStopSlot(context);

  if (slot.state !== 'RESOLVED' || !slot.facility) {
    return {
      policy: slot.policy,
      draft: null,
      blockedReason: slot.blockedReason,
    };
  }

  return {
    policy: slot.policy,
    draft: endStopStopDraft(slot.facility.id, lastSequenceOrder),
    blockedReason: null,
  };
}

/**
 * Record that the end stop is now a real row.
 *
 * Separate from the decision for the same reason `TemplateProvenance.appliedAt`
 * is separate from its selection: deciding is not writing, and a row where the
 * write has happened must never be materialised twice or a trip grows two end
 * stops.
 */
export async function markEndStopMaterialised(
  orgId: string,
  userId: string,
  record: ImportRecord,
): Promise<ImportRecord> {
  const stored = endStopProvenanceOf(record);
  if (!stored) return record;
  if (stored.materialisedAt) return record;

  return writeEndStop(orgId, userId, record, {
    ...stored,
    materialisedAt: new Date().toISOString(),
  });
}
