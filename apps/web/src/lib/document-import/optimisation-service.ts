/**
 * Route optimisation — the orchestration. Spec Section 9, Part B.
 *
 * Assembles the inputs, calls the pure solver, and owns the ONE write: applying
 * a suggestion a person accepted. `optimisation.ts` is pure and
 * `optimisation-matrix.ts` speaks to the routing engine.
 *
 * ---------------------------------------------------------------------------
 * NOTHING HERE REORDERS ANYTHING ON ITS OWN
 * ---------------------------------------------------------------------------
 * Section 9: *"Optimisation is a suggestion, never a mutation."* Both `get*`
 * functions are read-only. Both `apply*` functions are reached only by an
 * explicit POST carrying an explicit action, and both **recompute the
 * suggestion server-side** rather than applying an order the client sent: a
 * request that could name its own permutation would be a reorder endpoint with
 * an optimiser-shaped name, and a stale tab could reorder yesterday's stops.
 *
 * The import's accept path funnels into Phase 5's `reorderStops` — the same
 * function a drag on the web list and an arrow tap on the phone already call.
 * A reorder a dispatcher approved and a reorder they dragged are the same event
 * and get the same code, including its permutation validation and its provenance
 * permutation.
 *
 * NO DDL. Nothing in this file adds a column.
 *
 * The matrix cache has two layers (`optimisation-matrix.ts`): L1 in process, L2
 * in `route_matrix_cache`. Both are READ from every path here. Only the two
 * `apply*` functions pass `persist: true`, so **only an accepted suggestion ever
 * writes a cache row** — the `get*` functions, and therefore every GET handler,
 * write nothing at all. That is the same rule as the header above, one layer
 * down: a view path does not mutate, and a cache row is a mutation.
 */

import type { PrismaClient } from '@/generated/prisma';
import type { CanonicalConsignment } from '@drivecommand/validation';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import { saveRouteTemplateCore } from '@/lib/carrier/route-template-save';
import type { FacilityViewer } from '@/lib/carrier/facility-visibility';

import { buildEndStopSlot, loadEndStopContext } from './end-stop-lookup';
import { resolveEndStopPolicy } from './end-stop';
import { isEndStopPolicy } from './end-stop-constants';
import {
  decideStops,
  loadExternalReferences,
  loadFacilityCandidates,
  type StopDecision,
} from './facility-lookup';
import { getDistanceMatrix, prismaMatrixStore, type MatrixPoint } from './optimisation-matrix';
import {
  buildOptimisationSuggestion,
  spliceSuggestedOrder,
  stopSetChanged,
  type OptimisableStop,
  type OptimisationSuggestion,
} from './optimisation';
import { declineSentence, savingsSentence } from './optimisation-copy';
import { getImportRecord, type ImportRecord } from './persistence';
import { templateProvenanceOf } from './provenance';
import { resolveEffectiveClientId, ResolutionError } from './resolution';
import { reorderStops } from './stop-review-service';
import { reviewedConsignmentsOf } from './stop-review';
import { isTemplateInsertedStop } from './template-matching';

// ---------------------------------------------------------------------------
// The view both surfaces render
// ---------------------------------------------------------------------------

export interface OptimisationView {
  /** True when there is a card to draw at all. False means draw nothing. */
  offered: boolean;
  /** Section 9's one line, already assembled. Null when nothing is offered. */
  sentence: string | null;
  /** Why not, for the template screen's button and for logs. */
  declineNote: string | null;
  suggestion: OptimisationSuggestion;
  /**
   * True when this run's stops differ from the template it came from, which is
   * the only condition under which a TRIP is optimised at all (Section 9). Always
   * true when there is no applied template — nothing has optimised these stops.
   */
  stopsChangedFromTemplate: boolean;
}

const notOffered = (
  suggestion: OptimisationSuggestion,
  stopsChangedFromTemplate: boolean,
): OptimisationView => ({
  offered: false,
  sentence: null,
  declineNote: declineSentence(suggestion.declineReason),
  suggestion: { ...suggestion, offered: false },
  stopsChangedFromTemplate,
});

// ---------------------------------------------------------------------------
// Shared: turning rows into solver input
// ---------------------------------------------------------------------------

/**
 * Reference values on a stop, normalised for the precedence link.
 *
 * The VALUE only, not the type. The same shipment number is printed as a BOL on
 * the pickup's paperwork and as an order number on the consignee's often enough
 * that keying on the pair would break the link the constraint exists to find.
 */
function referenceKeysOf(consignment: CanonicalConsignment): string[] {
  return (consignment.references ?? [])
    .map((r) => (r.value ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ''))
    .filter((v) => v.length > 0);
}

/** An appointment start as epoch ms, or null. Never NaN — an unparseable
 *  date is "no window", not "1970". */
function appointmentStartMsOf(consignment: CanonicalConsignment): number | null {
  const earliest = consignment.appointment?.earliest;
  if (!earliest) return null;
  const ms = Date.parse(earliest);
  return Number.isFinite(ms) ? ms : null;
}

/** Facility rows with coordinates, for the matrix. Facilities without them
 *  cannot be costed, and `getDistanceMatrix` answers null. */
async function pointsFor(
  db: PrismaClient,
  orgId: string,
  facilityIds: readonly string[],
): Promise<MatrixPoint[] | null> {
  const ids = [...new Set(facilityIds)].filter(Boolean);
  if (ids.length < 2) return null;

  const rows = await db.carrierFacility.findMany({
    where: { id: { in: ids }, orgId },
    select: { id: true, latitude: true, longitude: true },
  });

  const points: MatrixPoint[] = [];
  for (const row of rows) {
    if (row.latitude == null || row.longitude == null) return null;
    points.push({ id: row.id, latitude: row.latitude, longitude: row.longitude });
  }
  // A facility that vanished between the ladder and here is the same failure as
  // one with no coordinates: an uncostable leg, and therefore no suggestion.
  return points.length === ids.length ? points : null;
}

// ---------------------------------------------------------------------------
// The import (a trip in the making)
// ---------------------------------------------------------------------------

async function importContext(orgId: string, userId: string, record: ImportRecord) {
  const db = await getTenantPrismaForOrg(orgId, userId);
  const effectiveClientId = await resolveEffectiveClientId(db, orgId, record);
  const [candidates, referencesByCode] = await Promise.all([
    loadFacilityCandidates(db, orgId),
    loadExternalReferences(db, orgId, effectiveClientId),
  ]);
  const decisions: StopDecision[] = decideStops(record, { candidates, referencesByCode });
  return { db, decisions };
}

/**
 * The stops that are actually driven, in the current running order.
 *
 * Skipped stops and template-inserted ghosts are excluded exactly as quick-517
 * and quick-518 exclude them from template scoring, and for the same reason: a
 * stop nobody is driving to must not pull the running order toward it. A skipped
 * stop sitting between two live stops would otherwise add two legs to every
 * candidate order and could easily decide which order won.
 */
function movableStopsOf(
  consignments: readonly CanonicalConsignment[],
  decisions: readonly StopDecision[],
): { stops: OptimisableStop[]; unresolved: number } {
  const stops: OptimisableStop[] = [];
  let unresolved = 0;

  decisions.forEach((decision) => {
    const index = decision.slot.index;
    const consignment = decision.consignment ?? consignments[index];
    if (!consignment) return;
    if (consignment.skipped) return;
    if (isTemplateInsertedStop(consignment)) return;

    const facilityId = decision.slot.facility?.id ?? null;
    if (!facilityId) {
      unresolved++;
      return;
    }

    stops.push({
      position: index,
      facilityId,
      stopType: consignment.stopType ?? null,
      referenceKeys: referenceKeysOf(consignment),
      appointmentStartMs: appointmentStartMsOf(consignment),
      appointmentIsFirm: consignment.appointment?.isFirm === true,
    });
  });

  return { stops, unresolved };
}

/**
 * The suggestion for one import. Read-only.
 *
 * The gate in the middle is Section 9's: *"Runs on a trip only when stops
 * changed relative to the template."* A run whose stop set matches the template
 * it was applied from is a run whose order was already optimised when the
 * template was saved, and re-offering it every morning is precisely the noise
 * the floor exists to prevent.
 */
export async function getImportOptimisation(
  orgId: string,
  userId: string,
  importId: string,
  viewer?: FacilityViewer | null,
): Promise<OptimisationView | null> {
  const record = await getImportRecord(orgId, importId, userId);
  if (!record) return null;
  return importOptimisationFor(orgId, userId, record, viewer);
}

export async function importOptimisationFor(
  orgId: string,
  userId: string,
  record: ImportRecord,
  viewer?: FacilityViewer | null,
  /**
   * `persist: true` lets a computed matrix be written to `route_matrix_cache`.
   * Threaded from the caller rather than decided here because the provider is
   * reached through THIS function on both paths: the accept POST recomputes the
   * suggestion by calling it, so setting the flag at the bottom of `apply*`
   * would be setting it after the only call that could use it.
   */
  options?: { persist?: boolean },
): Promise<OptimisationView> {
  const { db, decisions } = await importContext(orgId, userId, record);
  const { consignments } = reviewedConsignmentsOf(record.reviewedExtraction, record.rawExtraction);
  const { stops, unresolved } = movableStopsOf(consignments, decisions);

  // --- The end stop, which is the terminal node and may also be the origin ---
  const endContext = await loadEndStopContext(db, orgId, record, decisions, viewer);
  const endSlot = buildEndStopSlot(endContext);
  const endFacilityId = endSlot.state === 'RESOLVED' ? (endSlot.facility?.id ?? null) : null;

  // A closed loop only when the policy says the truck comes back to where it
  // started — Section 9's `yard -> … -> yard` diagram. For an open route the
  // first leg has no cost anyone can state, and inventing an origin would let a
  // number nobody supplied decide the order.
  const closedLoop = endSlot.policy === 'HOME_BASE' || endSlot.policy === 'RETURN_TO_ORIGIN';
  const startFacilityId = closedLoop ? endFacilityId : null;

  // --- Has anything changed relative to the applied template? --------------
  const templateProvenance = templateProvenanceOf(record);
  let stopsChangedFromTemplate = true;
  if (templateProvenance?.appliedAt && templateProvenance.templateId) {
    const templateStops = await db.routeTemplateStop.findMany({
      where: { routeTemplateId: templateProvenance.templateId },
      select: { facilityId: true },
    });
    stopsChangedFromTemplate = stopSetChanged(
      templateStops.map((s) => s.facilityId).filter((id): id is string => Boolean(id)),
      stops.map((s) => s.facilityId),
    );
  }

  const empty = buildOptimisationSuggestion({
    stops: [],
    matrix: { ids: [], miles: [], minutes: [] },
    startFacilityId: null,
    endFacilityId: null,
  });

  if (!stopsChangedFromTemplate) return notOffered(empty, false);
  if (unresolved > 0) {
    return notOffered({ ...empty, declineReason: 'UNRESOLVED_STOPS' }, stopsChangedFromTemplate);
  }

  const facilityIds = [...stops.map((s) => s.facilityId)];
  if (endFacilityId) facilityIds.push(endFacilityId);
  if (startFacilityId) facilityIds.push(startFacilityId);

  const points = await pointsFor(db, orgId, facilityIds);
  const matrix = points
    ? await getDistanceMatrix(points, {
        orgId,
        store: prismaMatrixStore(db),
        persist: options?.persist === true,
      })
    : null;
  if (!matrix) {
    return notOffered({ ...empty, declineReason: 'NO_MATRIX' }, stopsChangedFromTemplate);
  }

  const suggestion = buildOptimisationSuggestion({
    stops,
    matrix,
    startFacilityId,
    endFacilityId,
  });

  if (!suggestion.offered) return notOffered(suggestion, stopsChangedFromTemplate);

  return {
    offered: true,
    sentence: savingsSentence(suggestion),
    declineNote: null,
    suggestion,
    stopsChangedFromTemplate,
  };
}

/**
 * "Use suggested order", for an import.
 *
 * Recomputes the suggestion rather than trusting one from the request, then
 * hands the permutation to Phase 5's `reorderStops`. Two consequences worth
 * stating: the facility provenance is permuted alongside the consignments (so
 * nobody re-confirms a facility they confirmed a minute ago), and the order is
 * validated as a permutation a second time on the way in.
 */
export async function applyImportOptimisation(
  orgId: string,
  userId: string,
  importId: string,
  viewer?: FacilityViewer | null,
): Promise<{ applied: boolean; savedMiles: number; savedMinutes: number }> {
  const record = await getImportRecord(orgId, importId, userId);
  if (!record) throw new ResolutionError('Import not found.', 'NOT_FOUND');

  // `persist: true` — this is an accepted suggestion, and one of exactly two
  // places in the codebase allowed to write a `route_matrix_cache` row.
  const view = await importOptimisationFor(orgId, userId, record, viewer, { persist: true });
  if (!view.offered) {
    throw new ResolutionError(
      view.declineNote ?? 'There is no better order to apply.',
      'INVALID_STOP',
    );
  }

  const { consignments } = reviewedConsignmentsOf(record.reviewedExtraction, record.rawExtraction);
  const movablePositions = view.suggestion.movedOrder.slice().sort((a, b) => a - b);
  const order = spliceSuggestedOrder(
    consignments.length,
    movablePositions,
    view.suggestion.movedOrder,
  );
  if (!order) {
    throw new ResolutionError('That order no longer matches this document.', 'INVALID_STOP');
  }

  await reorderStops(orgId, userId, importId, order);

  logger.info('[document-import] optimised order applied', {
    importId,
    savedMiles: view.suggestion.savedMiles,
    savedMinutes: view.suggestion.savedMinutes,
  });

  return {
    applied: true,
    savedMiles: view.suggestion.savedMiles,
    savedMinutes: view.suggestion.savedMinutes,
  };
}

// ---------------------------------------------------------------------------
// The route template — "optimise once, reuse daily"
// ---------------------------------------------------------------------------

/**
 * The suggestion for a saved route template. Read-only.
 *
 * Section 9 runs this *"on the template when created or edited"*, which is why
 * the route serving it is a GET the template screen calls after a save rather
 * than something bolted into `saveRouteTemplateCore`: a save that silently
 * reached a routing provider would make writing a template depend on a network
 * call, and a save that silently reordered would be the mutation Part B forbids.
 *
 * Two differences from the import path, both forced by the data:
 *
 *  - **Windows are offsets, not times.** `route_template_stops` stores
 *    `appt_window_start_offset_min` from the route's departure and has no "is
 *    firm" column at all. So a template's windows are treated as SOFT ordering
 *    preferences — penalties, never hard constraints. Reading an offset as firm
 *    would be inventing a commitment nobody recorded.
 *  - **There is no per-trip layer.** A template's end stop is its own override
 *    or the tenant default; the third rung of the ladder belongs to a trip.
 */
export async function getTemplateOptimisation(
  orgId: string,
  userId: string,
  templateId: string,
  /** See `importOptimisationFor` — the accept path reaches the provider here. */
  options?: { persist?: boolean },
): Promise<OptimisationView | null> {
  const db = await getTenantPrismaForOrg(orgId, userId);

  const template = await db.routeTemplate.findFirst({
    where: { id: templateId, orgId },
    select: {
      id: true,
      endStopPolicy: true,
      endStopFacilityId: true,
      stops: {
        select: {
          id: true,
          sequenceOrder: true,
          facilityId: true,
          stopType: true,
          apptWindowStartOffsetMin: true,
        },
        orderBy: { sequenceOrder: 'asc' },
      },
    },
  });
  if (!template) return null;

  const tenant = await db.tenant.findFirst({
    where: { id: orgId },
    select: { defaultEndStopPolicy: true, homeBaseFacilityId: true },
  });

  const resolution = resolveEndStopPolicy({
    tenant: tenant?.defaultEndStopPolicy ?? null,
    template: isEndStopPolicy(template.endStopPolicy) ? template.endStopPolicy : null,
    trip: null,
  });

  const stops: OptimisableStop[] = template.stops
    .filter((s) => Boolean(s.facilityId))
    .map((s, i) => ({
      position: i,
      facilityId: s.facilityId as string,
      stopType: s.stopType ?? null,
      // No shared references on a template — it stores facilities and order, not
      // paperwork numbers — so pickups are constrained against every delivery.
      // That is `precedencePairs`' documented fallback and the safe direction.
      referenceKeys: [],
      // Offsets are minutes from departure; used only as a soft ordering hint,
      // hence a synthetic epoch. Never firm — see the header.
      appointmentStartMs:
        s.apptWindowStartOffsetMin != null ? s.apptWindowStartOffsetMin * 60_000 : null,
      appointmentIsFirm: false,
    }));

  const empty = buildOptimisationSuggestion({
    stops: [],
    matrix: { ids: [], miles: [], minutes: [] },
    startFacilityId: null,
    endFacilityId: null,
  });

  // A template's `RETURN_TO_ORIGIN` is its own first stop, `HOME_BASE` is the
  // tenant's, and `DESIGNATED_PARKING` is now the template's own column — the
  // rung Section 9 always named and that had nowhere to store a facility until
  // quick-520. The remaining two resolve per trip and contribute nothing here.
  const endFacilityId =
    resolution.policy === 'HOME_BASE'
      ? (tenant?.homeBaseFacilityId ?? null)
      : resolution.policy === 'RETURN_TO_ORIGIN'
        ? (stops[0]?.facilityId ?? null)
        : resolution.policy === 'DESIGNATED_PARKING'
          ? (template.endStopFacilityId ?? null)
          : null;

  // **`startFacilityId = endFacilityId` was only ever correct because
  // `endFacilityId` was null for every policy except the two closed-loop ones.**
  // Adding DESIGNATED_PARKING breaks that accident: the day does not START at
  // the yard, it merely ends there, and equating the two would silently cost
  // every candidate order a leg from the parking spot to the first pickup and
  // turn an open route into a loop. Mirrors `importOptimisationFor` (~line 238).
  const closedLoop =
    resolution.policy === 'HOME_BASE' || resolution.policy === 'RETURN_TO_ORIGIN';
  const startFacilityId = closedLoop ? endFacilityId : null;

  const facilityIds = stops.map((s) => s.facilityId);
  if (endFacilityId) facilityIds.push(endFacilityId);

  const points = await pointsFor(db, orgId, facilityIds);
  const matrix = points
    ? await getDistanceMatrix(points, {
        orgId,
        store: prismaMatrixStore(db),
        persist: options?.persist === true,
      })
    : null;
  if (!matrix) return notOffered({ ...empty, declineReason: 'NO_MATRIX' }, true);

  const suggestion = buildOptimisationSuggestion({ stops, matrix, startFacilityId, endFacilityId });
  if (!suggestion.offered) return notOffered(suggestion, true);

  return {
    offered: true,
    sentence: savingsSentence(suggestion),
    declineNote: null,
    suggestion,
    stopsChangedFromTemplate: true,
  };
}

/**
 * "Use suggested order", for a template.
 *
 * Renumbers `sequence_order` and rewrites the template through
 * `saveRouteTemplateCore` — the one place a template gets written (the path
 * lifted out of the server action in Phase 6, so a header-less caller can use
 * it). Nothing else about the template changes: same facilities, same windows,
 * same paperwork, same client. Only the order, and only because someone tapped.
 */
export async function applyTemplateOptimisation(
  orgId: string,
  userId: string,
  templateId: string,
): Promise<{ applied: boolean; savedMiles: number; savedMinutes: number }> {
  const db = await getTenantPrismaForOrg(orgId, userId);

  // `persist: true` — the second and last place allowed to write a cache row.
  const view = await getTemplateOptimisation(orgId, userId, templateId, { persist: true });
  if (!view) throw new ResolutionError('Template not found.', 'NOT_FOUND');
  if (!view.offered) {
    throw new ResolutionError(
      view.declineNote ?? 'There is no better order to apply.',
      'INVALID_STOP',
    );
  }

  const template = await db.routeTemplate.findFirst({
    where: { id: templateId, orgId },
    select: {
      templateName: true,
      clientId: true,
      contractId: true,
      scheduleType: true,
      recurrenceRule: true,
      recurrenceTimezone: true,
      scheduledDepartureTime: true,
      equipmentType: true,
      tempMinF: true,
      tempMaxF: true,
      maxWeightLbs: true,
      commodityDescription: true,
      defaultDriverId: true,
      defaultTruckId: true,
      autoGenerateDaysAhead: true,
      notes: true,
      endStopPolicy: true,
      // Selected because the payload below re-saves the WHOLE template through
      // `saveRouteTemplateCore`. A field missing from either the select or the
      // payload is a field this reorder DELETES — reordering a template would
      // silently wipe its designated parking.
      endStopFacilityId: true,
      stops: {
        orderBy: { sequenceOrder: 'asc' },
        select: {
          facilityId: true,
          stopType: true,
          contactName: true,
          contactPhone: true,
          apptWindowStartOffsetMin: true,
          apptWindowEndOffsetMin: true,
          expectedDwellMinutes: true,
          commodityDescription: true,
          bolRequired: true,
          podRequired: true,
          specialInstructions: true,
        },
      },
    },
  });
  if (!template) throw new ResolutionError('Template not found.', 'NOT_FOUND');

  // `movedOrder` holds positions into the facility-bearing stop list, which is
  // the same list `getTemplateOptimisation` built from `stops` in sequence
  // order. A template stop with no facility cannot exist (the save path rejects
  // it), so the two lists are the same length.
  const ordered = view.suggestion.movedOrder.map((position) => template.stops[position]);
  if (ordered.some((s) => !s)) {
    throw new ResolutionError('That order no longer matches this template.', 'INVALID_STOP');
  }

  const result = await saveRouteTemplateCore(db, orgId, {
    templateId,
    templateName: template.templateName,
    clientId: template.clientId,
    contractId: template.contractId ?? undefined,
    scheduleType: template.scheduleType,
    recurrenceRule: template.recurrenceRule ?? undefined,
    recurrenceTimezone: template.recurrenceTimezone ?? undefined,
    scheduledDepartureTime: template.scheduledDepartureTime ?? undefined,
    equipmentType: template.equipmentType,
    tempMinF: template.tempMinF ?? undefined,
    tempMaxF: template.tempMaxF ?? undefined,
    maxWeightLbs: template.maxWeightLbs ?? undefined,
    commodityDescription: template.commodityDescription ?? undefined,
    defaultDriverId: template.defaultDriverId ?? undefined,
    defaultTruckId: template.defaultTruckId ?? undefined,
    autoGenerateDaysAhead: template.autoGenerateDaysAhead ?? undefined,
    notes: template.notes ?? undefined,
    endStopPolicy: template.endStopPolicy ?? undefined,
    // Carried through for the reason given at the select: this reorder rewrites
    // the whole row, so omitting the facility would clear it.
    endStopFacilityId: template.endStopFacilityId ?? undefined,
    createdById: userId,
    stops: ordered.map((stop, i) => ({
      facility_id: stop.facilityId,
      sequence_order: i + 1,
      stop_type: stop.stopType,
      contact_name: stop.contactName,
      contact_phone: stop.contactPhone,
      appt_window_start_offset_min: stop.apptWindowStartOffsetMin,
      appt_window_end_offset_min: stop.apptWindowEndOffsetMin,
      expected_dwell_minutes: stop.expectedDwellMinutes,
      commodity_description: stop.commodityDescription,
      bol_required: stop.bolRequired,
      pod_required: stop.podRequired,
      special_instructions: stop.specialInstructions,
    })),
  });

  if (!result.success) {
    throw new ResolutionError(result.error ?? 'Could not reorder that template.', 'INVALID_STOP');
  }

  logger.info('[document-import] optimised template order applied', {
    templateId,
    savedMiles: view.suggestion.savedMiles,
    savedMinutes: view.suggestion.savedMinutes,
  });

  return {
    applied: true,
    savedMiles: view.suggestion.savedMiles,
    savedMinutes: view.suggestion.savedMinutes,
  };
}
