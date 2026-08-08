/**
 * Route-template matching — the WRITING half. Spec Section 8.
 *
 * Everything in this phase that changes a row is in this file, the same way
 * `facility-resolution.ts` holds every write in Phase 4 and
 * `stop-review-service.ts` holds every write in Phase 5. `template-matching.ts`
 * is pure and `template-lookup.ts` is read-only.
 *
 * ---------------------------------------------------------------------------
 * SELECTION AND APPLICATION ARE TWO DIFFERENT THINGS
 * ---------------------------------------------------------------------------
 * This is the one design call in the phase worth reading before the code.
 *
 * **Selection** — *which* template — auto-collapses at 0.75 and is committed at
 * the mutation boundary by `ensureTemplateCommitted`, exactly as
 * `ensureClientCommitted` (quick-508) and `ensureContractCommitted` (quick-510)
 * do for their slots. It sets one column and one provenance record.
 *
 * **Application** — the merge in Section 8's box — reorders the running order,
 * fills windows, adds rows for stops that are not on today's manifest and
 * appends rows that are not on the template. That is a rewrite of the
 * dispatcher's stop list, and it happens only when a person asks for it.
 *
 * Collapsing the first into the second would mean a card that displayed a
 * template and silently reordered twelve stops on a GET — a write in a view
 * path, and the largest one in the module. `TemplateProvenance.appliedAt` is
 * null until the merge actually runs, so the two states are distinguishable on
 * the row rather than inferred from it.
 *
 * ---------------------------------------------------------------------------
 * NO DDL
 * ---------------------------------------------------------------------------
 * `document_imports.route_template_id`, `route_templates.source_import_id`,
 * `route_templates.is_suggested`, `route_templates.last_applied_at`,
 * `route_templates.application_count` and
 * `Tenant."autoCreateRouteTemplatesFromImports"` were all added by Phase 1 and
 * were **verified present against production** on 2026-08-07 before a line of
 * this was written. The template provenance is another key on the existing
 * `resolution_provenance` jsonb column. No migration was written.
 */

import { Prisma } from '@/generated/prisma';
import type { CanonicalExtraction } from '@drivecommand/validation';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import { saveRouteTemplateCore } from '@/lib/carrier/route-template-save';

import {
  decideStops,
  loadExternalReferences,
  loadFacilityCandidates,
  type StopDecision,
} from './facility-lookup';
import { ensureStopsCommitted } from './facility-resolution';
import { getImportRecord, type ImportRecord } from './persistence';
import {
  provenanceOf,
  stampTemplate,
  stopProvenanceOf,
  templateProvenanceOf,
  type ResolutionProvenance,
  type StopProvenance,
  type TemplateOfferRecord,
  type TemplateProvenance,
  type TemplateProvenanceVia,
} from './provenance';
import { ensureContractCommitted, resolveEffectiveClientId, ResolutionError } from './resolution';
import { reviewedConsignmentsOf } from './stop-review';
import {
  bestExistingScore,
  buildTemplateSlot,
  importStopsFrom,
  loadTemplateCandidates,
  type LoadedTemplate,
  type TemplateSlotView,
} from './template-lookup';
import {
  applyTemplateToConsignments,
  deterministicTemplate,
  facilitySetForImport,
  rankTemplates,
  templateDrifted,
  templateFacilitySet,
  templateStopsFrom,
  type ImportStopRef,
} from './template-matching';
import {
  TEMPLATE_DEFAULT_EQUIPMENT_TYPE,
  TEMPLATE_DEFAULT_SCHEDULE_TYPE,
} from './template-constants';

// ---------------------------------------------------------------------------
// Shared plumbing — mirrors the two sibling services rather than reinventing it
// ---------------------------------------------------------------------------

/** Statuses in which the template decision may still be changed. */
const EDITABLE: readonly string[] = ['NEEDS_REVIEW', 'READY'];

function assertEditable(record: ImportRecord): void {
  if (!EDITABLE.includes(record.status)) {
    throw new ResolutionError(
      `This import is ${record.status.replace(/_/g, ' ').toLowerCase()} and its template can no longer be changed.`,
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
 * Everything both the view and the writers need, loaded once.
 *
 * The ladder is run here rather than passed in because template matching is
 * *defined* over resolved facilities: Section 8 says "resolve facilities first".
 * The same `decideStops` and the same effective client (quick-511) the card and
 * the commit path use, so the facility ids the score is computed over on a read
 * are the facility ids it is computed over on a write.
 */
interface TemplateContext {
  record: ImportRecord;
  decisions: StopDecision[];
  importStops: ImportStopRef[];
  templates: LoadedTemplate[];
  effectiveClientId: string | null;
}

async function loadContext(orgId: string, userId: string, record: ImportRecord): Promise<TemplateContext> {
  const db = await getTenantPrismaForOrg(orgId, userId);
  const effectiveClientId = await resolveEffectiveClientId(db, orgId, record);

  const [candidates, referencesByCode, templates] = await Promise.all([
    loadFacilityCandidates(db, orgId),
    loadExternalReferences(db, orgId, effectiveClientId),
    loadTemplateCandidates(db, orgId, effectiveClientId, record.contractId),
  ]);

  const decisions = decideStops(record, { candidates, referencesByCode });
  return { record, decisions, importStops: importStopsFrom(decisions), templates, effectiveClientId };
}

/**
 * Merge one template provenance record into the row and write it.
 *
 * In-memory merge, single `updateMany`, other keys carried across untouched —
 * the quick-509 pattern, unchanged. Prisma has no jsonb `||` operator and the
 * read has already happened, so this costs nothing.
 */
async function writeTemplate(
  orgId: string,
  userId: string,
  record: ImportRecord,
  templateId: string | null,
  provenance: TemplateProvenance,
  extra?: { reviewedExtraction?: CanonicalExtraction; stops?: Record<string, StopProvenance> },
): Promise<ImportRecord> {
  const db = await getTenantPrismaForOrg(orgId, userId);

  const current = provenanceOf(record);
  const next: ResolutionProvenance = { ...current, template: provenance };
  if (extra?.stops) next.stops = extra.stops;

  const data: Prisma.DocumentImportUncheckedUpdateManyInput = {
    routeTemplateId: templateId,
    resolutionProvenance: next as unknown as Prisma.InputJsonValue,
    updatedById: userId,
  };
  if (extra?.reviewedExtraction) {
    data.reviewedExtraction = extra.reviewedExtraction as unknown as Prisma.InputJsonValue;
  }

  await db.documentImport.updateMany({
    where: { id: record.id, orgId, deletedAt: null },
    data,
  });

  const fresh = await getImportRecord(orgId, record.id, userId);
  return fresh ?? record;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * The template row for the summary card. Read-only.
 *
 * Nothing in this call graph writes: it loads, it runs the ladder, it scores, it
 * describes. The auto-collapsed value it may return is marked `persisted: false`
 * until a mutation commits it.
 */
export async function getTemplateView(
  orgId: string,
  userId: string,
  importId: string,
): Promise<TemplateSlotView | null> {
  const record = await getImportRecord(orgId, importId, userId);
  if (!record) return null;
  const context = await loadContext(orgId, userId, record);
  return buildTemplateSlot(context);
}

/** The same slot, for a caller that already holds the record (the summary card). */
export async function templateSlotFor(
  orgId: string,
  userId: string,
  record: ImportRecord,
): Promise<TemplateSlotView> {
  return buildTemplateSlot(await loadContext(orgId, userId, record));
}

// ---------------------------------------------------------------------------
// The mutation boundary
// ---------------------------------------------------------------------------

/**
 * Commit the auto-collapsed template selection, if there is one.
 *
 * **Phase 8's atomic commit must call this** before reading
 * `record.routeTemplateId`, for the same reason quick-510 recorded for
 * `ensureContractCommitted`: an import whose template collapsed on the card and
 * where nobody tapped anything has null in that column, and a commit that reads
 * the column would build a trip with no template while the card that authorised
 * it displayed one.
 *
 * Composes `ensureContractCommitted` first — a template belongs to a client and
 * a contract, and the candidate set is scoped by both, so there is nothing
 * stable to resolve against until those are real. That call in turn composes
 * `ensureClientCommitted`, so one call commits all three slots in the right
 * order.
 *
 * A no-op when a template is already chosen, when the dispatcher declined, or
 * when nothing reaches the threshold. A miss returns the record unchanged so the
 * caller's own guard fires exactly as before.
 */
export async function ensureTemplateCommitted(
  orgId: string,
  userId: string,
  record: ImportRecord,
): Promise<ImportRecord> {
  if (record.routeTemplateId) return record;

  const stored = templateProvenanceOf(record);
  if (stored?.via === 'NONE') return record;

  const withContract = await ensureContractCommitted(orgId, userId, record);
  const context = await loadContext(orgId, userId, withContract);

  const ranked = rankTemplates(
    facilitySetForImport(context.importStops),
    context.templates.map((t) => ({ template: t, facilityIds: templateFacilitySet(t.stops) })),
  );
  const best = deterministicTemplate(ranked);
  if (!best) return withContract;

  const provenance = stampTemplate(
    {
      via: 'AUTO_MATCH',
      score: best.score.score,
      matchedText: best.template.templateName,
      templateId: best.template.id,
      templateName: best.template.templateName,
    },
    userId,
  );

  logger.info('[document-import] template auto-committed', {
    importId: record.id,
    templateId: best.template.id,
    score: best.score.score,
  });

  return writeTemplate(orgId, userId, withContract, best.template.id, provenance);
}

// ---------------------------------------------------------------------------
// Explicit selection
// ---------------------------------------------------------------------------

/**
 * A person picked one of the ranked candidates.
 *
 * The score written is **recomputed server-side** from the same scorer, never
 * taken from the request — the same rule Phase 4 applies to a T3 confirmation,
 * and for the same reason: a stored score is evidence about what the system
 * thought, and a client that could set it could make the "why" say anything.
 */
export async function assignTemplate(
  orgId: string,
  userId: string,
  importId: string,
  templateId: string,
): Promise<TemplateSlotView> {
  const record = await requireRecord(orgId, userId, importId);
  assertEditable(record);

  const withContract = await ensureContractCommitted(orgId, userId, record);
  const context = await loadContext(orgId, userId, withContract);

  const chosen = context.templates.find((t) => t.id === templateId);
  if (!chosen) {
    throw new ResolutionError('That template is not available for this client.', 'INVALID_CONTRACT');
  }

  const scored = rankTemplates(
    facilitySetForImport(context.importStops),
    context.templates.map((t) => ({ template: t, facilityIds: templateFacilitySet(t.stops) })),
  ).find((r) => r.template.id === templateId);

  const provenance = stampTemplate(
    {
      via: 'MANUAL',
      score: scored?.score.score ?? null,
      matchedText: chosen.templateName,
      templateId: chosen.id,
      templateName: chosen.templateName,
    },
    userId,
  );

  const updated = await writeTemplate(orgId, userId, withContract, chosen.id, provenance);
  logger.info('[document-import] template picked', { importId, templateId });
  return templateSlotFor(orgId, userId, updated);
}

/**
 * "Continue without a template."
 *
 * Recorded as a decision (`via: 'NONE'`) rather than left as an absent value.
 * Without the record the card cannot tell "nobody has looked at templates yet"
 * from "a dispatcher chose to run without one", and would re-collapse a 0.76
 * match on the next read over the top of an answer someone had already given.
 * It is also what the auto-create step reads to know no template was applied.
 */
export async function declineTemplate(
  orgId: string,
  userId: string,
  importId: string,
): Promise<TemplateSlotView> {
  const record = await requireRecord(orgId, userId, importId);
  assertEditable(record);

  const provenance = stampTemplate(
    { via: 'NONE', score: null, matchedText: null, templateId: null, templateName: null },
    userId,
  );

  const updated = await writeTemplate(orgId, userId, record, null, provenance);
  logger.info('[document-import] template declined', { importId });
  return templateSlotFor(orgId, userId, updated);
}

// ---------------------------------------------------------------------------
// Application — the merge
// ---------------------------------------------------------------------------

export interface TemplateApplyOutcome {
  view: TemplateSlotView;
  matched: number;
  appended: number;
  notOnManifest: number;
  /**
   * Matched stops whose windows the route supplies and Phase 8 will set at
   * commit (quick-515). Not "applied" — nothing was.
   */
  windowsDeferred: number;
  windowsKept: number;
  /** True when the template has offsets but no departure time to anchor them to. */
  windowsUnavailable: boolean;
}

/**
 * ---------------------------------------------------------------------------
 * PHASE 8 OBLIGATION #4 — MATERIALISE THE APPOINTMENT WINDOWS AT COMMIT
 * ---------------------------------------------------------------------------
 * The other three are: `ensureTemplateCommitted` before reading
 * `routeTemplateId`, `ensureStopsCommitted` before reading stop links, and
 * `runPostCommitTemplateStep` after the transaction. This is the fourth, and it
 * is the one with a user-visible hole until it is done (quick-515).
 *
 * A stop applied from a template carries `templateApptOffsetStartMin` /
 * `templateApptOffsetEndMin` — minutes from the route start — and **no
 * appointment**. The review screen shows them as elapsed time and says the exact
 * times are set when the trip is finished. Phase 8 has to make that true:
 *
 * ```ts
 * // The arithmetic already exists. Do not reimplement it here.
 * //   apps/web/src/lib/carrier/trips.ts:317-328  (and :491, :760)
 * const depTime = trip.scheduledDeparture;               // the Finish trip "Start" field
 * appointmentStart = new Date(depTime.getTime() + startOffsetMin * 60000);
 * appointmentEnd   = new Date(depTime.getTime() + endOffsetMin   * 60000);
 * ```
 *
 * Anchor to the **trip's** `scheduledDeparture`, never to
 * `route_templates.scheduled_departure_time` — that column is the dispatch
 * generator's seed for computing a departure on a recurrence date, it is NULL on
 * every `on_call` template (which is every template this module auto-creates),
 * and anchoring to it is the defect quick-515 removed.
 *
 * A stop whose `appointment` is already set keeps it: the import wins, and a
 * window printed on today's document must not be recomputed from a habit.
 */

/**
 * Apply the selected template to the stop list. Section 8's merge box.
 *
 * Opens with `ensureStopsCommitted`, like every stop mutation since Phase 4 —
 * the silent T1/T2 links become rows here, so the merge has real facility links
 * to carry to their new positions instead of re-deriving them afterwards
 * against a list that has changed underneath.
 *
 * The reorder is the template's order and nothing else. No optimisation, no
 * tidying, no "obvious" slotting of a new stop next to its neighbours — new
 * stops go to the end and the dispatcher drags them, which is what Section 8
 * asks for and what this phase's constraints require.
 */
export async function applyTemplate(
  orgId: string,
  userId: string,
  importId: string,
): Promise<TemplateApplyOutcome> {
  const record = await requireRecord(orgId, userId, importId);
  assertEditable(record);

  // Commit the selection first, so applying an auto-collapsed template writes
  // the same id it displayed rather than re-deriving it mid-merge.
  const withTemplate = await ensureTemplateCommitted(orgId, userId, record);
  const committed = await ensureStopsCommitted(orgId, userId, withTemplate);

  if (!committed.routeTemplateId) {
    throw new ResolutionError('Pick a template before applying one.', 'INVALID_CONTRACT');
  }

  const context = await loadContext(orgId, userId, committed);
  const template = context.templates.find((t) => t.id === committed.routeTemplateId);
  if (!template) {
    throw new ResolutionError('That template is no longer available.', 'INVALID_CONTRACT');
  }

  const { extraction, consignments } = reviewedConsignmentsOf(
    committed.reviewedExtraction,
    committed.rawExtraction,
  );
  if (!extraction) {
    throw new ResolutionError('This import has nothing to apply a template to yet.', 'BAD_STATUS');
  }

  const result = applyTemplateToConsignments(
    consignments,
    context.importStops,
    template.stops,
    stopProvenanceOf(committed),
    {
      documentDate: committed.documentDate ? committed.documentDate.toISOString().slice(0, 10) : null,
      scheduledDepartureTime: template.scheduledDepartureTime,
    },
  );

  const stored = templateProvenanceOf(committed);
  const provenance = stampTemplate(
    {
      via: stored?.via ?? 'MANUAL',
      score: stored?.score ?? null,
      matchedText: stored?.matchedText ?? template.templateName,
      templateId: template.id,
      templateName: template.templateName,
      appliedAt: new Date().toISOString(),
      offer: stored?.offer ?? null,
    },
    userId,
  );

  const updated = await writeTemplate(orgId, userId, committed, template.id, provenance, {
    reviewedExtraction: { ...extraction, consignments: result.consignments },
    stops: result.stopProvenance,
  });

  // Not in the same statement as the import write, and deliberately so: these
  // two counters are usage telemetry for the template list's ordering, and
  // losing one must never cost the dispatcher their merge.
  await bumpApplicationCount(orgId, userId, template.id);

  logger.info('[document-import] template applied', {
    importId,
    templateId: template.id,
    matched: result.diff.matched,
    appended: result.diff.importOnly,
    notOnManifest: result.diff.templateOnly,
  });

  return {
    view: await templateSlotFor(orgId, userId, updated),
    matched: result.diff.matched,
    appended: result.diff.importOnly,
    notOnManifest: result.diff.templateOnly,
    windowsDeferred: result.windowsDeferred,
    windowsKept: result.windowsKept,
    windowsUnavailable: result.windowsUnavailable,
  };
}

async function bumpApplicationCount(orgId: string, userId: string, templateId: string): Promise<void> {
  try {
    const db = await getTenantPrismaForOrg(orgId, userId);
    await db.routeTemplate.updateMany({
      where: { id: templateId, orgId },
      data: { lastAppliedAt: new Date(), applicationCount: { increment: 1 } },
    });
  } catch (e) {
    logger.warn('[document-import] could not record template application', { templateId, err: e });
  }
}

// ---------------------------------------------------------------------------
// Saving a stop list out as a template
// ---------------------------------------------------------------------------

export interface SaveTemplateOutcome {
  templateId: string;
  templateName: string;
  isSuggested: boolean;
  stopCount: number;
  /** Stops left out, and why. Reported rather than silently dropped. */
  skippedUnresolved: number;
  skippedNotToday: number;
  narrowedStopTypes: number;
}

/**
 * Name a template from the document. Section 8: *"name it from `groupLabel` +
 * client + date"*.
 *
 * `groupLabel` is the routing zone as printed ("WEST - MKE"), which is the
 * closest thing a manifest has to a route name and is exactly what a dispatcher
 * would have typed. Falls back to the client alone when the document has no
 * zone; the date is always there so two saves from two days never collide into
 * one indistinguishable pair.
 */
export function templateNameFrom(
  groupLabel: string | null,
  clientName: string | null,
  documentDate: Date | null,
): string {
  const date = (documentDate ?? new Date()).toISOString().slice(0, 10);
  const parts = [groupLabel?.trim(), clientName?.trim()].filter(Boolean);
  return parts.length ? `${parts.join(' — ')} · ${date}` : `Imported route · ${date}`;
}

/**
 * Write the reviewed stop list out as a route template.
 *
 * Serves both Section 8 paths — the tenant setting's automatic creation and the
 * human's one-tap "Save as route template" — because they differ in exactly two
 * things: who asked, and whether the result lands in "Suggested templates". The
 * write itself is the same write, and it goes through `saveRouteTemplateCore`,
 * which is the Templates screen's own save path rather than a second one.
 */
async function writeTemplateFromImport(
  orgId: string,
  userId: string,
  record: ImportRecord,
  context: TemplateContext,
  options: { via: TemplateProvenanceVia; isSuggested: boolean },
): Promise<SaveTemplateOutcome> {
  const db = await getTenantPrismaForOrg(orgId, userId);
  const { consignments } = reviewedConsignmentsOf(record.reviewedExtraction, record.rawExtraction);

  const facilityByIndex: Record<number, string | null> = {};
  for (const stop of context.importStops) facilityByIndex[stop.index] = stop.facilityId;

  const draft = templateStopsFrom(consignments, facilityByIndex);
  if (draft.stops.length === 0) {
    throw new ResolutionError(
      'None of these stops has a confirmed facility yet, so there is nothing to save as a template.',
      'INVALID_STOP',
    );
  }

  const clientId = context.effectiveClientId;
  if (!clientId) {
    throw new ResolutionError('Pick the client before saving a template.', 'NO_CLIENT');
  }

  const client = await db.carrierClient.findFirst({ where: { id: clientId, orgId }, select: { name: true } });
  const groupLabel = consignments.find((c) => c.groupLabel)?.groupLabel ?? null;
  const templateName = templateNameFrom(groupLabel, client?.name ?? null, record.documentDate);

  const outcome = await saveRouteTemplateCore(db, orgId, {
    templateName,
    clientId,
    ...(record.contractId ? { contractId: record.contractId } : {}),
    // `on_call` and `other` claim nothing — see `template-constants.ts`. A
    // template created from one day's manifest has no recurrence and no stated
    // equipment, and inventing either would put a guess into the dispatch
    // generator's rotation.
    scheduleType: TEMPLATE_DEFAULT_SCHEDULE_TYPE,
    equipmentType: TEMPLATE_DEFAULT_EQUIPMENT_TYPE,
    sourceImportId: record.id,
    isSuggested: options.isSuggested,
    createdById: userId,
    stops: draft.stops.map((s) => ({
      facility_id: s.facilityId,
      sequence_order: s.sequenceOrder,
      stop_type: s.stopType,
      contact_name: s.contactName,
      contact_phone: s.contactPhone,
      special_instructions: s.specialInstructions,
      bol_required: s.bolRequired,
      pod_required: s.podRequired,
    })),
  });

  if (!outcome.success || !outcome.templateId) {
    throw new ResolutionError(outcome.error ?? 'Could not save the template.', 'INVALID_STOP');
  }

  const provenance = stampTemplate(
    {
      via: options.via,
      score: null,
      matchedText: templateName,
      templateId: outcome.templateId,
      templateName,
      appliedAt: null,
      offer: templateProvenanceOf(record)?.offer ?? null,
    },
    userId,
  );
  await writeTemplate(orgId, userId, record, outcome.templateId, provenance);

  logger.info('[document-import] template created from import', {
    importId: record.id,
    templateId: outcome.templateId,
    via: options.via,
    isSuggested: options.isSuggested,
    stops: draft.stops.length,
    skippedUnresolved: draft.skippedUnresolved,
    skippedNotToday: draft.skippedNotToday,
    narrowedStopTypes: draft.narrowedStopTypes,
  });

  return {
    templateId: outcome.templateId,
    templateName,
    isSuggested: options.isSuggested,
    stopCount: draft.stops.length,
    skippedUnresolved: draft.skippedUnresolved,
    skippedNotToday: draft.skippedNotToday,
    narrowedStopTypes: draft.narrowedStopTypes,
  };
}

/**
 * The one-tap "Save as route template" on the commit success screen (Section 8,
 * offered when the tenant setting is off).
 *
 * `isSuggested: false` — a human asked for this one, so it is a hand-built
 * template and belongs with the hand-built templates. That is the entire
 * difference between this and the automatic path, and it is the right one:
 * "Suggested" exists to quarantine rows nobody chose.
 */
export async function saveImportAsRouteTemplate(
  orgId: string,
  userId: string,
  importId: string,
): Promise<SaveTemplateOutcome> {
  const record = await requireRecord(orgId, userId, importId);
  const context = await loadContext(orgId, userId, record);
  return writeTemplateFromImport(orgId, userId, record, context, {
    via: 'SAVED_FROM_IMPORT',
    isSuggested: false,
  });
}

// ---------------------------------------------------------------------------
// Post-commit — items 5 and 6 of Section 8
// ---------------------------------------------------------------------------

export interface TemplateOfferView {
  /** Nothing to offer; render nothing. */
  kind: 'NONE' | 'UPDATE_TEMPLATE' | 'SAVE_AS_TEMPLATE' | 'AUTO_CREATED';
  templateId: string | null;
  templateName: string | null;
  /** "2 stops added · the order changed". Null for the save-as offer. */
  changedSummary: string | null;
  /** True once the person has answered. The offer is made once, never repeated. */
  answered: boolean;
}

/**
 * What, if anything, to offer after a commit.
 *
 * Read-only, and computed from what was stored rather than re-derived: whether
 * the trip drifted from its template is a fact about the moment it was
 * committed, and `TemplateOfferRecord.changedSummary` is where that fact lives.
 * `answered` is why the record exists at all — *"offered once, never silent"*
 * is a claim about history, and history is not derivable from the current row.
 */
export async function getTemplateOffer(
  orgId: string,
  userId: string,
  importId: string,
): Promise<TemplateOfferView | null> {
  const record = await getImportRecord(orgId, importId, userId);
  if (!record) return null;
  if (record.status !== 'COMMITTED') return { kind: 'NONE', templateId: null, templateName: null, changedSummary: null, answered: false };

  const stored = templateProvenanceOf(record);
  const offer = stored?.offer ?? null;

  if (!offer) return { kind: 'NONE', templateId: null, templateName: null, changedSummary: null, answered: false };

  const kind: TemplateOfferView['kind'] =
    stored?.via === 'AUTO_CREATED'
      ? 'AUTO_CREATED'
      : offer.changedSummary
        ? 'UPDATE_TEMPLATE'
        : 'SAVE_AS_TEMPLATE';

  return {
    kind,
    templateId: stored?.templateId ?? null,
    templateName: stored?.templateName ?? null,
    changedSummary: offer.changedSummary,
    answered: offer.respondedAt != null,
  };
}

/**
 * The step Phase 8's commit must run once the trip exists.
 *
 * ---------------------------------------------------------------------------
 * PHASE 8: CALL THIS AFTER THE COMMIT TRANSACTION SUCCEEDS.
 * ---------------------------------------------------------------------------
 * It is written here rather than left as a note because all three of Section
 * 8's post-commit behaviours are one decision on the same two facts — was a
 * template applied, and is the tenant setting on:
 *
 * ```
 *   template applied, trip differs  ->  record the "update the template?" offer
 *   no template, setting ON         ->  create one, isSuggested, unless the stop
 *                                       set already scores >= 0.75 (the guard)
 *   no template, setting OFF        ->  record the "save as template?" offer
 * ```
 *
 * Deliberately NOT inside the commit transaction. Creating a template is not
 * part of committing a trip, and a template write that failed must never roll
 * back a trip a driver is waiting on. Every failure here is logged and
 * swallowed for that reason — the same trade `attachSourceDocument` makes in
 * `resolution.ts` (DEC-13), and stated rather than implied.
 *
 * It has no caller today, exactly as `ensureContractCommitted` had none when
 * quick-510 wrote it: there is no commit in this codebase yet. Wiring it into a
 * path that does not need it would be a write nobody asked for.
 */
export async function runPostCommitTemplateStep(
  orgId: string,
  userId: string,
  importId: string,
): Promise<TemplateOfferView | null> {
  try {
    const record = await getImportRecord(orgId, importId, userId);
    if (!record) return null;

    const stored = templateProvenanceOf(record);
    // Made ONCE. A record that already exists is never overwritten, whatever the
    // trip looks like now — that is the whole meaning of "offered once".
    if (stored?.offer) return getTemplateOffer(orgId, userId, importId);

    const context = await loadContext(orgId, userId, record);

    // ---- A template was applied: did the trip drift from it? ---------------
    if (stored?.appliedAt && stored.templateId) {
      const template = context.templates.find((t) => t.id === stored.templateId);
      if (!template) return null;

      const committedOrder = context.importStops
        .filter((s) => !consignmentSkipped(record, s.index))
        .map((s) => s.facilityId)
        .filter((id): id is string => Boolean(id));

      const { drifted, summary } = templateDrifted(templateFacilitySet(template.stops), committedOrder);
      if (!drifted) return { kind: 'NONE', templateId: null, templateName: null, changedSummary: null, answered: false };

      await recordOffer(orgId, userId, record, stored, summary);
      return getTemplateOffer(orgId, userId, importId);
    }

    // ---- No template was applied ------------------------------------------
    const autoCreate = await tenantAutoCreates(orgId, userId);

    if (!autoCreate) {
      // Section 8: "When off, offer one-tap Save as route template on the
      // success screen." An offer with no changedSummary is that offer.
      await recordOffer(orgId, userId, record, stored, null);
      return getTemplateOffer(orgId, userId, importId);
    }

    // ---- Setting ON: create, unless a near-duplicate already exists --------
    //
    // Section 8's guard, in the spec's own words: "skip creation when the stop
    // set already scores above 0.75 against an existing template — near
    // duplicate templates are worse than none." Uses `bestExistingScore`, which
    // is the same predicate the card's collapse uses, so the guard cannot drift
    // into a second definition of "already covered".
    const best = bestExistingScore(context.importStops, context.templates);
    if (best.band === 'AUTO') {
      logger.info('[document-import] auto-create skipped — near-duplicate template exists', {
        importId,
        templateId: best.templateId,
        score: best.score,
      });
      return { kind: 'NONE', templateId: best.templateId, templateName: best.templateName, changedSummary: null, answered: false };
    }

    const created = await writeTemplateFromImport(orgId, userId, record, context, {
      via: 'AUTO_CREATED',
      isSuggested: true,
    });

    const fresh = await getImportRecord(orgId, importId, userId);
    if (fresh) {
      await recordOffer(orgId, userId, fresh, templateProvenanceOf(fresh), null);
    }

    logger.info('[document-import] template auto-created', { importId, templateId: created.templateId });
    return getTemplateOffer(orgId, userId, importId);
  } catch (e) {
    // Swallowed on purpose. See the doc comment: a template step must never
    // undo a committed trip. Logged with the error serialized (DEC-11 §3), so
    // this is a failure someone can find rather than a silence.
    logger.error('[document-import] post-commit template step failed', e, { orgId, importId });
    return null;
  }
}

/** Whether this stop was left skipped on the reviewed list. */
function consignmentSkipped(record: ImportRecord, index: number): boolean {
  const { consignments } = reviewedConsignmentsOf(record.reviewedExtraction, record.rawExtraction);
  return Boolean(consignments[index]?.skipped);
}

async function tenantAutoCreates(orgId: string, userId: string): Promise<boolean> {
  const db = await getTenantPrismaForOrg(orgId, userId);
  const tenant = await db.tenant.findFirst({
    where: { id: orgId },
    select: { autoCreateRouteTemplatesFromImports: true },
  });
  return tenant?.autoCreateRouteTemplatesFromImports ?? false;
}

async function recordOffer(
  orgId: string,
  userId: string,
  record: ImportRecord,
  stored: TemplateProvenance | null,
  changedSummary: string | null,
): Promise<void> {
  const offer: TemplateOfferRecord = {
    offeredAt: new Date().toISOString(),
    respondedAt: null,
    response: null,
    changedSummary,
  };

  const provenance = stampTemplate(
    {
      via: stored?.via ?? 'NONE',
      score: stored?.score ?? null,
      matchedText: stored?.matchedText ?? null,
      templateId: stored?.templateId ?? null,
      templateName: stored?.templateName ?? null,
      appliedAt: stored?.appliedAt ?? null,
      offer,
    },
    userId,
  );

  await writeTemplate(orgId, userId, record, record.routeTemplateId, provenance);
}

/**
 * The dispatcher's answer to the post-commit offer.
 *
 * `UPDATED` rewrites the template's stops from the committed list, through the
 * same `saveRouteTemplateCore` in edit mode — which deletes and recreates the
 * stop rows, so the template ends up exactly as the trip ran rather than as a
 * merge of two orders. `DISMISSED` records the answer and nothing else.
 *
 * Either way the response is stamped, so the offer is never made twice.
 */
export async function respondToTemplateOffer(
  orgId: string,
  userId: string,
  importId: string,
  response: 'UPDATED' | 'DISMISSED',
): Promise<TemplateOfferView | null> {
  const record = await requireRecord(orgId, userId, importId);
  const stored = templateProvenanceOf(record);
  if (!stored?.offer) {
    throw new ResolutionError('There is no template question to answer on this import.', 'INVALID_STOP');
  }
  if (stored.offer.respondedAt) return getTemplateOffer(orgId, userId, importId);

  if (response === 'UPDATED') {
    const context = await loadContext(orgId, userId, record);
    if (stored.templateId) {
      await updateTemplateFromImport(orgId, userId, record, context, stored.templateId);
    } else {
      await writeTemplateFromImport(orgId, userId, record, context, {
        via: 'SAVED_FROM_IMPORT',
        isSuggested: false,
      });
    }
  }

  const fresh = (await getImportRecord(orgId, importId, userId)) ?? record;
  const latest = templateProvenanceOf(fresh) ?? stored;

  const provenance = stampTemplate(
    {
      via: latest.via,
      score: latest.score,
      matchedText: latest.matchedText,
      templateId: latest.templateId,
      templateName: latest.templateName,
      appliedAt: latest.appliedAt,
      offer: {
        ...stored.offer,
        respondedAt: new Date().toISOString(),
        response,
      },
    },
    userId,
  );

  await writeTemplate(orgId, userId, fresh, fresh.routeTemplateId, provenance);
  logger.info('[document-import] template offer answered', { importId, response });
  return getTemplateOffer(orgId, userId, importId);
}

/** Rewrite an existing template's stops from this import's committed list. */
async function updateTemplateFromImport(
  orgId: string,
  userId: string,
  record: ImportRecord,
  context: TemplateContext,
  templateId: string,
): Promise<void> {
  const db = await getTenantPrismaForOrg(orgId, userId);
  const existing = await db.routeTemplate.findFirst({
    where: { id: templateId, orgId },
    select: { id: true, templateName: true, clientId: true, contractId: true, scheduleType: true, equipmentType: true },
  });
  if (!existing) {
    throw new ResolutionError('That template no longer exists.', 'INVALID_CONTRACT');
  }

  const { consignments } = reviewedConsignmentsOf(record.reviewedExtraction, record.rawExtraction);
  const facilityByIndex: Record<number, string | null> = {};
  for (const stop of context.importStops) facilityByIndex[stop.index] = stop.facilityId;

  const draft = templateStopsFrom(consignments, facilityByIndex);
  if (draft.stops.length === 0) {
    throw new ResolutionError('There are no confirmed stops to update the template with.', 'INVALID_STOP');
  }

  const outcome = await saveRouteTemplateCore(db, orgId, {
    templateId: existing.id,
    // The template keeps its own name, client, contract, schedule and equipment.
    // The offer is "update the stops", not "overwrite the template" — silently
    // resetting a hand-set equipment type to `other` would be a change nobody
    // asked for on a row a person has been maintaining.
    templateName: existing.templateName,
    clientId: existing.clientId,
    ...(existing.contractId ? { contractId: existing.contractId } : {}),
    scheduleType: existing.scheduleType,
    equipmentType: existing.equipmentType,
    createdById: userId,
    stops: draft.stops.map((s) => ({
      facility_id: s.facilityId,
      sequence_order: s.sequenceOrder,
      stop_type: s.stopType,
      contact_name: s.contactName,
      contact_phone: s.contactPhone,
      special_instructions: s.specialInstructions,
      bol_required: s.bolRequired,
      pod_required: s.podRequired,
    })),
  });

  if (!outcome.success) {
    throw new ResolutionError(outcome.error ?? 'Could not update the template.', 'INVALID_STOP');
  }
}
