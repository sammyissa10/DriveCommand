/**
 * Route-template matching and application — the pure half. Spec Section 8.
 *
 * No Prisma, no network, no clock, no `Date.now()`. Everything here takes
 * already-loaded shapes and returns new ones, which is what makes the scorer
 * testable against hand-checkable numbers and what stops the ranking on the card
 * from drifting away from the ranking a mutation would compute — the read path
 * and the write path call these same functions, exactly as Phase 4's ladder is
 * shared between `facility-lookup.ts` and `facility-resolution.ts`.
 *
 * ---------------------------------------------------------------------------
 * THE SCORE IS OVER RESOLVED FACILITY IDs. NEVER OVER NAMES.
 * ---------------------------------------------------------------------------
 * Section 8 says so in as many words, and it is the phase's stated drift risk.
 * The reason is concrete: "RUSS DARROW HONDA" is a name three dealerships in one
 * metro share, and "Russ Darrow Honda — Milwaukee" and "Russ Darrow Honda — West
 * Bend" are two buildings forty minutes apart. Matching on the string would
 * score them identical and hand a dispatcher an order that drives to the wrong
 * town. The facility ladder (Section 7) has already done the hard work of
 * turning a printed name into a building; this file consumes its answer and has
 * no access to the names at all — `facilitySetForImport` is the only bridge, and
 * it reads `facilityId`.
 */

import type { CanonicalAddress, CanonicalConsignment } from '@drivecommand/validation';
import type { StopProvenance } from './provenance';
import {
  ROUTE_TEMPLATE_STOP_TYPES,
  TEMPLATE_AUTO_APPLY_THRESHOLD,
  TEMPLATE_CANDIDATE_THRESHOLD,
  TEMPLATE_COUNT_MISMATCH_FACTOR,
  TEMPLATE_DEFAULT_STOP_TYPE,
  TEMPLATE_MAX_CANDIDATES,
  TEMPLATE_STOP_COUNT_TOLERANCE,
  type RouteTemplateStopType,
} from './template-constants';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** One stop on the import, AFTER the facility ladder has run over it. */
export interface ImportStopRef {
  /** Index into `reviewedExtraction.consignments`. The key everything else uses. */
  index: number;
  /** The resolved building, or null when the ladder is still waiting on a human. */
  facilityId: string | null;
  /** For the diff's text only. Never scored — see the header. */
  name: string;
}

/** One stop on a saved route template. Mirrors `route_template_stops`. */
export interface TemplateStopRef {
  sequenceOrder: number;
  facilityId: string;
  facilityName: string;
  facilityAddress: CanonicalAddress;
  stopType: string;
  contactName: string | null;
  contactPhone: string | null;
  apptWindowStartOffsetMin: number | null;
  apptWindowEndOffsetMin: number | null;
  bolRequired: boolean;
  podRequired: boolean;
  /** The template's standing note for this stop. NOT the import's per-stop note. */
  specialInstructions: string | null;
}

// ---------------------------------------------------------------------------
// The set an import contributes
// ---------------------------------------------------------------------------

/**
 * The set the import brings to the comparison.
 *
 * A resolved stop contributes its facility id. **An unresolved stop contributes
 * a synthetic member that cannot match anything**, rather than contributing
 * nothing — and that choice is load-bearing, so it is stated rather than left in
 * the code.
 *
 * Dropping unresolved stops from the set entirely would mean a manifest whose
 * eight stops resolved four-and-four, against a four-stop template covering
 * exactly those four, scores a perfect 1.0 and collapses — while half of today
 * is still an open question. The card would say "this is last week's run" about
 * a run it has only seen half of. Counting each unknown as its own distinct
 * member says the honest thing: four out of eight, 0.5, ask.
 *
 * The synthetic key is built here, at the bridge, rather than inside the scorer
 * — `scoreFacilitySets` really does take two lists of ids and do nothing but
 * Jaccard, which is what Section 8 specifies and what the tests pin.
 */
export function facilitySetForImport(stops: readonly ImportStopRef[]): string[] {
  return stops.map((s) => (s.facilityId ? s.facilityId : `unresolved:${s.index}`));
}

export const templateFacilitySet = (stops: readonly TemplateStopRef[]): string[] =>
  stops.map((s) => s.facilityId);

// ---------------------------------------------------------------------------
// The score
// ---------------------------------------------------------------------------

export interface TemplateScore {
  /** The number every threshold is compared against. Downweight already applied. */
  score: number;
  /** Before the downweight, so the "why" can show the arithmetic. */
  jaccard: number;
  /** |A ∩ B| over the DISTINCT sets. */
  intersection: number;
  /** |A ∪ B|. */
  union: number;
  importStopCount: number;
  templateStopCount: number;
  /** |a - b| / max(a, b), 0 when both are 0. */
  countDifference: number;
  /** True when `countDifference` exceeded the tolerance and the factor was applied. */
  countMismatch: boolean;
}

/**
 * Jaccard over two id sets, weighted down when the stop counts disagree.
 *
 * **Ordering is ignored, and that is a property of the measure rather than a
 * decision made here.** Sets have no order. Section 8's reason is worth keeping
 * in front of anyone tempted to add a sequence term: *order is a template
 * property* — the template is precisely the thing that knows the right order, so
 * scoring a candidate down for disagreeing with today's arbitrary document order
 * would penalise it for the one job it exists to do.
 *
 * Duplicates collapse. A run that visits one warehouse twice (a pickup and a
 * later delivery — legitimate, and Phase 5 treats it as a warning not a block)
 * contributes that building once to both sides. The stop *counts* below still
 * see both, so the shape difference is not lost, it is just measured by the part
 * of the score built to measure it.
 */
export function scoreFacilitySets(
  importIds: readonly string[],
  templateIds: readonly string[],
): TemplateScore {
  const a = new Set(importIds);
  const b = new Set(templateIds);

  let intersection = 0;
  for (const id of a) if (b.has(id)) intersection++;
  const union = a.size + b.size - intersection;

  const jaccard = union === 0 ? 0 : intersection / union;

  const importStopCount = importIds.length;
  const templateStopCount = templateIds.length;
  const largest = Math.max(importStopCount, templateStopCount);
  const countDifference = largest === 0 ? 0 : Math.abs(importStopCount - templateStopCount) / largest;

  const countMismatch = countDifference > TEMPLATE_STOP_COUNT_TOLERANCE;
  const score = countMismatch ? jaccard * TEMPLATE_COUNT_MISMATCH_FACTOR : jaccard;

  return {
    score,
    jaccard,
    intersection,
    union,
    importStopCount,
    templateStopCount,
    countDifference,
    countMismatch,
  };
}

/**
 * Which of Section 8's three presentations a score earns.
 *
 * One function, so the card, the mutation boundary and the auto-create guard
 * cannot disagree about what "a good enough match" means. The auto-create guard
 * in particular is stated in Section 8 as "skip creation when the stop set
 * already scores above 0.75 against an existing template" — the same sentence
 * and therefore the same predicate, not a second one that happens to use the
 * same number.
 */
export type TemplateBand =
  /** >= 0.75 — collapse into the summary card. */
  | 'AUTO'
  /** 0.45 .. 0.75 — up to three ranked candidates, each with a stop diff. */
  | 'CANDIDATE'
  /** < 0.45 — offer only "Continue without a template". */
  | 'NONE';

export function bandFor(score: number): TemplateBand {
  if (score >= TEMPLATE_AUTO_APPLY_THRESHOLD) return 'AUTO';
  if (score >= TEMPLATE_CANDIDATE_THRESHOLD) return 'CANDIDATE';
  return 'NONE';
}

export interface ScoredTemplate<T> {
  template: T;
  score: TemplateScore;
  band: TemplateBand;
}

/**
 * Score every candidate and rank them, best first.
 *
 * Ties break on the template's own order, which the caller supplies (most
 * recently applied first — see `template-lookup.ts`). Deterministic either way:
 * a ranking that reshuffles between two reads of the same data is a ranking a
 * dispatcher cannot learn.
 */
export function rankTemplates<T>(
  importIds: readonly string[],
  candidates: readonly { template: T; facilityIds: readonly string[] }[],
): ScoredTemplate<T>[] {
  return candidates
    .map(({ template, facilityIds }) => {
      const score = scoreFacilitySets(importIds, facilityIds);
      return { template, score, band: bandFor(score.score) };
    })
    .sort((x, y) => y.score.score - x.score.score);
}

/**
 * The single collapsing match, or null.
 *
 * **Null when two templates both clear the threshold and neither is clearly
 * ahead.** Section 4.2's table reads "similarity 0.75+ to *one* template", and
 * collapsing to whichever sorted first would pick one of two real routes at
 * random — the same call Phase 4 made when two facilities normalise to one
 * address (T2 ambiguity drops to T3 with both offered, rather than linking).
 * An ambiguous pair falls to the ranked list, where a person decides.
 */
export function deterministicTemplate<T>(ranked: readonly ScoredTemplate<T>[]): ScoredTemplate<T> | null {
  const [best, next] = ranked;
  if (!best || best.band !== 'AUTO') return null;
  if (next && next.band === 'AUTO' && next.score.score === best.score.score) return null;
  return best;
}

/** The middle band's list, capped. */
export function topCandidates<T>(ranked: readonly ScoredTemplate<T>[]): ScoredTemplate<T>[] {
  return ranked.filter((r) => r.band !== 'NONE').slice(0, TEMPLATE_MAX_CANDIDATES);
}

// ---------------------------------------------------------------------------
// The diff
// ---------------------------------------------------------------------------

/**
 * Where a row in the applied list came from — the three columns of Section 8's
 * merge box.
 */
export type TemplateStopOrigin =
  /** On both. Template order and standing fields; import quantities and refs. */
  | 'MATCHED'
  /** On today's document only. Appended at the end, badged New, draggable. */
  | 'IMPORT_ONLY'
  /** On the template only. Included, badged "Not on today's manifest", skipped. */
  | 'TEMPLATE_ONLY';

export interface TemplateDiffRow {
  origin: TemplateStopOrigin;
  facilityId: string | null;
  name: string;
  /** Position on the template, when it has one. */
  templateSequence: number | null;
  /** Index into the CURRENT consignments, when it has one. */
  importIndex: number | null;
}

export interface TemplateDiff {
  rows: TemplateDiffRow[];
  matched: number;
  importOnly: number;
  templateOnly: number;
  /** Stops the ladder has not resolved. They can never match — see `facilitySetForImport`. */
  unresolved: number;
}

/**
 * What applying this template would do, computed without doing it.
 *
 * This is what the middle band renders under each candidate and what the
 * confirmation shows before the mutation fires. It is the same function the
 * mutation uses to build the new list, so the preview cannot describe a merge
 * different from the one that happens.
 *
 * A template stop whose facility appears more than once on today's document
 * matches the FIRST unclaimed one, in document order. Claiming is one-to-one:
 * two template stops at the same warehouse take two of today's stops there, and
 * the third stays `IMPORT_ONLY`. Anything else would either duplicate a stop or
 * silently drop one.
 */
export function buildTemplateDiff(
  importStops: readonly ImportStopRef[],
  templateStops: readonly TemplateStopRef[],
): TemplateDiff {
  const ordered = [...templateStops].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const claimed = new Set<number>();
  const rows: TemplateDiffRow[] = [];

  for (const t of ordered) {
    const hit = importStops.find((s) => s.facilityId === t.facilityId && !claimed.has(s.index));
    if (hit) {
      claimed.add(hit.index);
      rows.push({
        origin: 'MATCHED',
        facilityId: t.facilityId,
        name: hit.name || t.facilityName,
        templateSequence: t.sequenceOrder,
        importIndex: hit.index,
      });
    } else {
      rows.push({
        origin: 'TEMPLATE_ONLY',
        facilityId: t.facilityId,
        name: t.facilityName,
        templateSequence: t.sequenceOrder,
        importIndex: null,
      });
    }
  }

  // Appended at the end, in document order — NOT slotted in near a neighbour.
  // Where a new stop belongs in the day is a routing decision, and Section 8 is
  // explicit that the user makes it ("draggable"). Guessing would be a reorder
  // nobody asked for, which the phase's constraints forbid outright.
  for (const s of importStops) {
    if (claimed.has(s.index)) continue;
    rows.push({
      origin: 'IMPORT_ONLY',
      facilityId: s.facilityId,
      name: s.name,
      templateSequence: null,
      importIndex: s.index,
    });
  }

  return {
    rows,
    matched: rows.filter((r) => r.origin === 'MATCHED').length,
    importOnly: rows.filter((r) => r.origin === 'IMPORT_ONLY').length,
    templateOnly: rows.filter((r) => r.origin === 'TEMPLATE_ONLY').length,
    unresolved: importStops.filter((s) => !s.facilityId).length,
  };
}

/** "6 matched · 2 new · 1 not on today's manifest". Never says "0 anything". */
export function describeDiff(diff: TemplateDiff): string {
  const parts: string[] = [];
  if (diff.matched) parts.push(`${diff.matched} matched`);
  if (diff.importOnly) parts.push(`${diff.importOnly} new`);
  if (diff.templateOnly) parts.push(`${diff.templateOnly} not on today's manifest`);
  return parts.length ? parts.join(' · ') : 'No stops in common';
}

// ---------------------------------------------------------------------------
// Appointment windows — string arithmetic, never a Date
// ---------------------------------------------------------------------------

const HHMM = /^(\d{1,2}):(\d{2})/;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `documentDate` + `scheduledDepartureTime` + an offset in minutes, as
 * `YYYY-MM-DDTHH:mm` — the format the review screen's field already round-trips.
 *
 * Done with integer arithmetic on the parts rather than by constructing a
 * `Date`, because `new Date('2026-07-27T06:00')` is parsed in the *server's*
 * local zone and would land a Milwaukee appointment an hour out whenever Vercel
 * and the carrier disagree. Every date in this module is handled the same way
 * and for the same reason (`isoDate` in `resolution.ts` slices the string).
 *
 * Returns null when either input is missing. **A window is never invented**: a
 * template with no departure time cannot say when its offsets land, and an
 * appointment the customer never agreed to is worse than a blank field.
 *
 * ---------------------------------------------------------------------------
 * THIS IS NOT THE ANCHOR THE OFFSETS ARE FOR (quick-515)
 * ---------------------------------------------------------------------------
 * `route_templates.scheduled_departure_time` is the *seed* the dispatch
 * generator uses to compute a trip's departure on a recurrence date
 * (`dispatch-generator.ts`), not the thing the offsets hang off. Every real
 * consumer — `trips.ts:321`, `:491`, `:760` — anchors to
 * `Trip.scheduledDeparture`, and spec §4.1 draws that as the `Start 06:00`
 * field on the Finish trip screen. On an `on_call` template the column is
 * legitimately NULL, which is why this function returned null for every stop of
 * MKE-NORTH-2 and why no window landed.
 *
 * **Materialisation is therefore deferred to commit (Phase 8)**, where the trip
 * start exists and where that arithmetic already lives. This function is kept
 * because it is still correct for the case it describes, and because
 * `windowsUnavailable` is computed from the same inputs — but nothing in the
 * review path depends on it producing a value any more. See
 * `templateApptOffsetStartMin` on the consignment for what is carried instead.
 */
export function windowFromOffset(
  documentDate: string | null,
  departureTime: string | null,
  offsetMinutes: number | null,
): string | null {
  if (!documentDate || !departureTime || offsetMinutes == null) return null;

  const day = YMD.exec(documentDate);
  const clock = HHMM.exec(departureTime);
  if (!day || !clock) return null;

  const total = Number(clock[1]) * 60 + Number(clock[2]) + offsetMinutes;
  // Offsets can push either side of midnight; carry the day rather than clamp.
  const dayShift = Math.floor(total / (24 * 60));
  const minuteOfDay = ((total % (24 * 60)) + 24 * 60) % (24 * 60);

  const shifted = shiftDate(Number(day[1]), Number(day[2]), Number(day[3]), dayShift);
  const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, '0');
  const mm = String(minuteOfDay % 60).padStart(2, '0');
  return `${shifted}T${hh}:${mm}`;
}

/**
 * The template's offsets as words, for a stop that has no printed window
 * (quick-515). Display only — nothing is derived from this and nothing is
 * stored from it.
 *
 * **Rendered as elapsed time from the route start, not as a clock time**, and
 * that is the whole point: 630 minutes is "10h 30m after the route starts", and
 * turning it into "16:30" would require a start time that has not been chosen
 * yet. An em-dash was the previous answer and it was worse than either — it
 * said the template carried no window when it carries two offsets.
 */
export function formatOffsetWindow(
  startMin: number | null | undefined,
  endMin: number | null | undefined,
): string | null {
  const start = offsetLabel(startMin);
  const end = offsetLabel(endMin);
  if (!start && !end) return null;
  const span = start && end ? `${start} – ${end}` : (start ?? end);
  return `${span} after the route starts`;
}

function offsetLabel(minutes: number | null | undefined): string | null {
  if (minutes == null) return null;
  const sign = minutes < 0 ? '−' : '';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return hours > 0 ? `${sign}${hours}h ${String(mins).padStart(2, '0')}m` : `${sign}${mins}m`;
}

/** Calendar arithmetic at UTC noon, so no local zone can move the day. */
function shiftDate(year: number, month: number, day: number, days: number): string {
  if (days === 0) {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const at = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

/** Everything the merge needs that is not on the two stop lists. */
export interface TemplateApplyContext {
  /** `YYYY-MM-DD` off the import, or null. */
  documentDate: string | null;
  /** `HH:mm` off the template, or null. */
  scheduledDepartureTime: string | null;
}

export interface TemplateApplyResult {
  consignments: CanonicalConsignment[];
  /** Re-keyed by the new positions, fingerprints untouched. See below. */
  stopProvenance: Record<string, StopProvenance>;
  diff: TemplateDiff;
  /**
   * Matched stops carrying template offsets that will become real appointment
   * times at commit (quick-515). Named `deferred` rather than `applied` because
   * nothing was applied — the anchor is the trip's start and it does not exist
   * yet. A count nobody can act on is still worth stating: it is the difference
   * between "this route has no windows" and "its windows are coming".
   */
  windowsDeferred: number;
  /** Stops whose printed window was kept as printed. The import always wins. */
  windowsKept: number;
  /**
   * Semantics unchanged from Phase 6: the template carries offsets and there is
   * no `documentDate` + `scheduled_departure_time` pair to resolve them against.
   * It no longer gates anything — deferral is now unconditional — but it still
   * describes a real property of the template and Phase 7/8 may want it.
   */
  windowsUnavailable: boolean;
}

/**
 * Merge a template into the stop list, per Section 8's box.
 *
 * ```
 *  A B C D E F   merge   template order + import qty
 *  H             append  badged NEW, draggable
 *  G             keep    badged NOT ON MANIFEST, skipped
 * ```
 *
 * ---------------------------------------------------------------------------
 * WHAT EACH SIDE SUPPLIES, AND THE ONE CASE WHERE THEY BOTH HAVE A VALUE
 * ---------------------------------------------------------------------------
 * Template: **order, appointment windows, required documents, standing notes.**
 * Import: **quantities, references, per-stop notes.**
 *
 * Three of the template's four are fields the import cannot have: `stopType`
 * aside, nothing in extraction writes `requiredDocuments`, nothing writes a
 * standing note, and a document has no running order. So for those the split is
 * simply "the template fills them", and no value is at risk.
 *
 * **Appointment is the one field both sides can carry, and it is settled twice
 * over.** A window printed on today's manifest is a fact a customer agreed to
 * and the import keeps it (`windowsKept`). And the template's side is not
 * materialised here at all (quick-515): its offsets hang off the TRIP's start
 * time, which is chosen on the Finish trip screen, so there is no correct value
 * to compute during review. The offsets are carried onto the stop for display
 * (`templateApptOffsetStartMin`) and counted as `windowsDeferred`; Phase 8's
 * commit turns them into appointment times with the arithmetic `trips.ts`
 * already has. See `mergeTemplateStop`.
 *
 * The template's standing note goes to `templateStandingNotes`, a separate key
 * from `notes`, for exactly the same reason: `notes` is the import's per-stop
 * note, the split says so, and one field holding both would make application
 * destructive the moment a dispatcher had typed anything.
 *
 * ---------------------------------------------------------------------------
 * NO STOP IS REORDERED BEYOND THE TEMPLATE'S OWN ORDER
 * ---------------------------------------------------------------------------
 * Matched rows take the template's sequence. New rows go to the end, in document
 * order. Template-only rows hold their template position. Nothing is sorted,
 * optimised or "tidied" — that is Phase 7, it is a suggestion there and never a
 * mutation, and this phase's constraints forbid it outright.
 *
 * ---------------------------------------------------------------------------
 * THE FACILITY LINKS MOVE WITH THEIR STOPS
 * ---------------------------------------------------------------------------
 * Same argument, and the same code shape, as Phase 5's reorder: someone who
 * confirmed Hall Ford on stop 3 must still have it after the merge moves stop 3
 * to position 1. The record is carried to its new key with its `stopFingerprint`
 * **untouched**, so a link that was already stale before the merge is still
 * dropped after it — both properties hold at once. Template-only rows get no
 * link at all; see `templateOnlyConsignment`.
 */
export function applyTemplateToConsignments(
  consignments: readonly CanonicalConsignment[],
  importStops: readonly ImportStopRef[],
  templateStops: readonly TemplateStopRef[],
  links: Readonly<Record<string, StopProvenance>>,
  context: TemplateApplyContext,
): TemplateApplyResult {
  const diff = buildTemplateDiff(importStops, templateStops);
  const bySequence = new Map(templateStops.map((t) => [t.sequenceOrder, t]));

  const next: CanonicalConsignment[] = [];
  const stopProvenance: Record<string, StopProvenance> = {};

  let windowsDeferred = 0;
  let windowsKept = 0;
  const windowsUnavailable = templateStops.some(
    (t) => t.apptWindowStartOffsetMin != null || t.apptWindowEndOffsetMin != null,
  ) && !(context.documentDate && context.scheduledDepartureTime);

  for (const row of diff.rows) {
    const template = row.templateSequence != null ? bySequence.get(row.templateSequence) : undefined;

    if (row.origin === 'TEMPLATE_ONLY' && template) {
      next.push(templateOnlyConsignment(template));
      continue;
    }

    if (row.importIndex == null) continue;
    const source = consignments[row.importIndex];
    if (!source) continue;

    const merged = template ? mergeTemplateStop(source, template, context) : { ...source, templateOrigin: 'IMPORT_ONLY' as const };
    if (template) {
      const printed = Boolean(source.appointment?.earliest || source.appointment?.latest);
      const hasOffsets = template.apptWindowStartOffsetMin != null || template.apptWindowEndOffsetMin != null;
      if (printed) windowsKept++;
      else if (hasOffsets) windowsDeferred++;
    }

    const carried = links[String(row.importIndex)];
    if (carried) stopProvenance[String(next.length)] = carried;
    next.push(merged);
  }

  return { consignments: next, stopProvenance, diff, windowsDeferred, windowsKept, windowsUnavailable };
}

/** One matched stop: template order/windows/docs/standing note, import everything else. */
function mergeTemplateStop(
  source: CanonicalConsignment,
  template: TemplateStopRef,
  _context: TemplateApplyContext,
): CanonicalConsignment {
  // ---------------------------------------------------------------------------
  // THE APPOINTMENT IS NOT MATERIALISED HERE. AT ALL. (quick-515)
  // ---------------------------------------------------------------------------
  // It used to be, anchored to `route_templates.scheduled_departure_time`, and
  // that was wrong in both directions:
  //
  //   - NULL anchor (every `on_call` template, including every template this
  //     module auto-creates) -> no window written, silently.
  //   - NON-null anchor -> a window written against the TEMPLATE's scheduling
  //     default instead of the trip's start time. Quieter, and worse: a
  //     plausible appointment on the wrong clock.
  //
  // The offsets belong to the trip's start (`trips.ts` anchors to
  // `Trip.scheduledDeparture` in all three of its call sites; spec §4.1 draws it
  // as `Start 06:00` on the Finish trip screen). That value does not exist while
  // an import is being reviewed, so there is nothing correct to compute here and
  // the honest move is to carry the offsets and let Phase 8 do the arithmetic it
  // already has.
  //
  // `source.appointment` therefore passes through untouched in every case — a
  // window printed on today's document is still kept, which was always the rule.
  const appointment = source.appointment;

  const required: ('BOL' | 'POD')[] = [];
  if (template.bolRequired) required.push('BOL');
  if (template.podRequired) required.push('POD');

  return {
    ...source,
    templateOrigin: 'MATCHED',
    skipped: false,
    appointment,
    // Untouched by design: totals, lineItems, references, notes. The import owns
    // all four, and the whole value of day two is that today's quantities survive
    // last week's order being reapplied.
    requiredDocuments: source.requiredDocuments?.length ? source.requiredDocuments : required,
    stopType: source.stopType ?? stopTypeForTemplate(template.stopType),
    templateStandingNotes: template.specialInstructions ?? null,
    // Carried for DISPLAY, never materialised here — the anchor is the trip's
    // start time and it does not exist yet (quick-515). Phase 8 turns these into
    // real appointment times at commit.
    templateApptOffsetStartMin: template.apptWindowStartOffsetMin,
    templateApptOffsetEndMin: template.apptWindowEndOffsetMin,
    contact: source.contact ?? contactFrom(template),
  };
}

/**
 * A stop the template has and today's document does not.
 *
 * Included, badged, and **`skipped: true`** — Section 8's "defaulted to skipped,
 * one tap to keep". Skipped rather than absent because a consignee missing from
 * today's manifest is usually a genuine day off and occasionally a page that
 * failed to scan, and the second case is invisible if the row is simply not
 * there.
 *
 * **It carries no facility provenance record**, deliberately. The name and
 * address are copied from the facility itself, so if a dispatcher keeps the row
 * the Phase 4 ladder resolves it at T2 on the next read — "Address match", which
 * is *literally* what happened, since the address on the row came from that
 * building. The alternative was inventing a fifth `StopProvenanceVia`, and a
 * stored via that no earlier build has heard of is exactly what
 * `slotProvenance` treats as absent. One less vocabulary, and the "why" stays
 * true.
 */
function templateOnlyConsignment(template: TemplateStopRef): CanonicalConsignment {
  const required: ('BOL' | 'POD')[] = [];
  if (template.bolRequired) required.push('BOL');
  if (template.podRequired) required.push('POD');

  return {
    pageNumbers: [],
    externalCode: null,
    name: template.facilityName,
    address: template.facilityAddress,
    contact: contactFrom(template),
    groupLabel: null,
    appointment: null,
    references: [],
    totals: {},
    lineItems: [],
    notes: null,
    fieldConfidence: {},
    stopType: stopTypeForTemplate(template.stopType),
    requiredDocuments: required,
    templateOrigin: 'TEMPLATE_ONLY',
    skipped: true,
    templateStandingNotes: template.specialInstructions ?? null,
    templateApptOffsetStartMin: template.apptWindowStartOffsetMin,
    templateApptOffsetEndMin: template.apptWindowEndOffsetMin,
  };
}

function contactFrom(template: TemplateStopRef) {
  if (!template.contactName && !template.contactPhone) return null;
  return { name: template.contactName, phone: template.contactPhone };
}

// ---------------------------------------------------------------------------
// Saving a stop list back out as a template
// ---------------------------------------------------------------------------

/**
 * A consignment's stop type, narrowed to what `route_template_stops` admits.
 *
 * **`relay_handoff` is legal on `stops` and ILLEGAL on `route_template_stops`.**
 * Both CHECKs were read off production; see `template-constants.ts`. Phase 5
 * lets a dispatcher set `relay_handoff` — correctly, because the commit target
 * for a trip stop admits it — and saving that same list as a template without
 * this guard is a 23514 on the one row that carried it, at the end of a
 * multi-statement write, on the success screen.
 *
 * It degrades to the default rather than throwing: refusing to save an entire
 * template because one stop is a relay handoff would be a worse answer than
 * saving it with that stop as a delivery, which is what the template's own
 * vocabulary can express. The caller reports how many were narrowed.
 */
export function stopTypeForTemplate(value: string | null | undefined): RouteTemplateStopType {
  const admitted: readonly string[] = ROUTE_TEMPLATE_STOP_TYPES;
  return value && admitted.includes(value) ? (value as RouteTemplateStopType) : TEMPLATE_DEFAULT_STOP_TYPE;
}

export interface TemplateStopDraft {
  facilityId: string;
  sequenceOrder: number;
  stopType: RouteTemplateStopType;
  contactName: string | null;
  contactPhone: string | null;
  specialInstructions: string | null;
  bolRequired: boolean;
  podRequired: boolean;
}

export interface TemplateDraft {
  stops: TemplateStopDraft[];
  /** Stops that could not become template stops, and why they were left out. */
  skippedUnresolved: number;
  skippedNotToday: number;
  /** Stop types the template's narrower CHECK could not carry verbatim. */
  narrowedStopTypes: number;
}

/**
 * Turn a reviewed stop list into template stops.
 *
 * Two exclusions, both correctness:
 *
 *  - **Unresolved stops.** `route_template_stops.facility_id` is NOT NULL and
 *    references `facilities`. A stop with no building cannot be a template stop,
 *    and there is nothing to invent.
 *  - **Skipped stops.** A row a dispatcher left skipped is one they said is not
 *    part of today's run. Writing it into a template would make it part of every
 *    future run.
 *
 * Both counts are returned so the caller can say what it left out. A template
 * silently shorter than the trip it was saved from is the kind of thing nobody
 * notices until day thirty.
 */
export function templateStopsFrom(
  consignments: readonly CanonicalConsignment[],
  facilityByIndex: Readonly<Record<number, string | null>>,
): TemplateDraft {
  const stops: TemplateStopDraft[] = [];
  let skippedUnresolved = 0;
  let skippedNotToday = 0;
  let narrowedStopTypes = 0;

  consignments.forEach((consignment, index) => {
    if (consignment.skipped) {
      skippedNotToday++;
      return;
    }
    const facilityId = facilityByIndex[index] ?? null;
    if (!facilityId) {
      skippedUnresolved++;
      return;
    }

    const stopType = stopTypeForTemplate(consignment.stopType);
    if (consignment.stopType && consignment.stopType !== stopType) narrowedStopTypes++;

    stops.push({
      facilityId,
      sequenceOrder: stops.length + 1,
      stopType,
      contactName: consignment.contact?.name ?? null,
      contactPhone: consignment.contact?.phone ?? null,
      // The template's standing note is the standing note — never the import's
      // per-stop note, which is about one day's freight and would become a lie
      // on every future trip generated from this template.
      specialInstructions: consignment.templateStandingNotes ?? null,
      bolRequired: consignment.requiredDocuments?.includes('BOL') ?? true,
      podRequired: consignment.requiredDocuments?.includes('POD') ?? true,
    });
  });

  return { stops, skippedUnresolved, skippedNotToday, narrowedStopTypes };
}

/**
 * Whether the committed trip differs from the template it was applied from —
 * the trigger for Section 8's post-commit "update the template?" offer.
 *
 * Compares the ordered facility id sequences, so a reorder counts as a
 * difference and a quantity change does not. That is the right cut: the template
 * stores order and facilities, so those are the only things an update could
 * carry, and offering to "update the template" because today's pallet count
 * differed would be an offer that changes nothing.
 */
export function templateDrifted(
  appliedOrder: readonly string[],
  committedOrder: readonly string[],
): { drifted: boolean; summary: string | null } {
  if (appliedOrder.length === committedOrder.length && appliedOrder.every((id, i) => id === committedOrder[i])) {
    return { drifted: false, summary: null };
  }

  const before = new Set(appliedOrder);
  const after = new Set(committedOrder);
  const added = [...after].filter((id) => !before.has(id)).length;
  const removed = [...before].filter((id) => !after.has(id)).length;

  const parts: string[] = [];
  if (added) parts.push(`${added} stop${added === 1 ? '' : 's'} added`);
  if (removed) parts.push(`${removed} stop${removed === 1 ? '' : 's'} removed`);
  if (!parts.length) parts.push('the order changed');

  return { drifted: true, summary: parts.join(' · ') };
}
