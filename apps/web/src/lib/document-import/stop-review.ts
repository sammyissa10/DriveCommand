/**
 * Stop review — the pure half. Spec Section 10.
 *
 * ```
 *  +--------------------------------------------------+
 *  | <- Stops                                  12     |
 *  +--------------------------------------------------+
 *  | :: 1  Russ Darrow Nissan   ok linked   5 · 2ref  |
 *  | :: 2  Boucher Kia          ok linked   8 · 1ref  |
 *  | :: 3  Hall Ford            ~ proposed  2 · 1ref  | <- tap
 *  | :: 4  Wilde Honda          + new       4 · 1ref  | <- tap
 *  | :: 5  Yard                 ok end stop           |
 *  +--------------------------------------------------+
 *  | [x] 3 selected  Note v  Docs v  Window v  Clear  |
 *  +--------------------------------------------------+
 *        |
 *        +-> [ Create trip ]  disabled
 *            "2 stops need a facility"
 * ```
 *
 * NO PRISMA, NO NETWORK, NO CLOCK. Everything here takes consignments and stop
 * slots and returns rows, verdicts and new consignments. `stop-review-service.ts`
 * is the only file in this phase that writes, exactly as `facility-lookup.ts` /
 * `facility-resolution.ts` split Phase 4 — and for the same reason: the view and
 * the mutation must reach the same answer, and the only way to guarantee that is
 * for both to call one function.
 *
 * ---------------------------------------------------------------------------
 * WHY BULK APPLY TAKES INDEXES AND NOT ROWS
 * ---------------------------------------------------------------------------
 * Phase 5's stated drift risk is "bulk apply hitting only visible rows". That is
 * not defended against here by being careful; it is defended against by shape.
 * `applyBulkToStops` takes `Array<number>` — the selection — and maps over the
 * WHOLE consignment array picking the ones named. There is no list of rendered
 * rows anywhere in this file, no viewport, no page. A client that virtualises
 * its list still sends the same Set of indexes, and a stop scrolled out of view
 * is indistinguishable from one on screen because neither concept exists below
 * the component layer.
 */

import type {
  CanonicalConsignment,
  CanonicalExtraction,
  CanonicalLineItem,
  CanonicalReference,
  CanonicalRequiredDocument,
  CanonicalRollupField,
  CanonicalStopType,
  CanonicalBulkAppliedField,
  CanonicalTemplateOrigin,
} from '@drivecommand/validation';

import { formatOffsetWindow } from './template-matching';
import type { StopProvenance } from './provenance';
import type { StopSlotView, StopFacilityView, StopWhyView } from './facility-lookup';
import type { FacilityProposal, FacilityPrefill, FacilityTier } from './facility-ladder';

// ---------------------------------------------------------------------------
// View types — mirrored verbatim in packages/api-client/src/owner-imports.ts
// ---------------------------------------------------------------------------

export interface StopRollupView {
  /** What the line items add up to. Null when no line item carries the field. */
  computed: number | null;
  /** What the stop actually claims — the typed value, else the computed one. */
  value: number | null;
  /**
   * True when `value` came from a person rather than from `computed`.
   * The visible mark spec Section 10 asks for is rendered off this, not off a
   * comparison a surface makes for itself.
   */
  overridden: boolean;
}

export interface StopRollupsView {
  pieces: StopRollupView;
  weight: StopRollupView;
  /** Hand-entered only — line items carry no pallet marker. Never "overridden". */
  pallets: number | null;
  weightUom: 'LBS' | 'KG' | null;
  /** "5" · "5 · 1,200 lbs" · "—". What the list row shows. */
  label: string;
}

export interface StopAppointmentView {
  earliest: string | null;
  latest: string | null;
  isFirm: boolean;
}

export interface StopContactView {
  name: string | null;
  phone: string | null;
}

/**
 * One row of the stop list, and one screenful of the detail editor.
 *
 * The FACILITY half comes from the Phase 4 ladder, unchanged and re-derived on
 * every read. The CONSIGNMENT half comes from `reviewedExtraction`. They are
 * kept as separate blocks on the same object rather than flattened together
 * because they persist differently — the facility link is provenance, the
 * consignment fields are the document — and blurring that is how a screen ends
 * up claiming a save it did not make.
 */
export interface StopReviewRow {
  /** Index into `consignments`, and the key every mutation uses. */
  index: number;
  /** `index + 1`. What the dispatcher calls it. */
  sequence: number;

  // --- facility (Phase 4, computed on read) --------------------------------
  state: StopSlotView['state'];
  tier: FacilityTier;
  facility: StopFacilityView | null;
  why: StopWhyView | null;
  proposals: FacilityProposal[];
  prefill: FacilityPrefill | null;
  requiresHumanTap: boolean;
  persisted: boolean;
  documentName: string;
  documentAddress: string;
  sourceCode: string | null;

  // --- consignment (reviewedExtraction) ------------------------------------
  /** The stop's own name. Editable; `documentName` is what the page said. */
  name: string;
  stopType: CanonicalStopType | null;
  references: CanonicalReference[];
  referenceCount: number;
  lineItems: CanonicalLineItem[];
  rollups: StopRollupsView;
  appointment: StopAppointmentView | null;
  requiredDocuments: CanonicalRequiredDocument[];
  contact: StopContactView | null;
  notes: string | null;
  pageNumbers: number[];
  bulkAppliedFields: CanonicalBulkAppliedField[];

  // --- route template application (Phase 6, spec Section 8) -----------------
  /**
   * Where this row came from once a template was applied. Null until one is.
   * What the "New" and "Not on today's manifest" badges read off.
   */
  templateOrigin: CanonicalTemplateOrigin | null;
  /**
   * True for a template stop that is not on today's document — kept in the
   * list, badged, and one tap from being back in the trip.
   */
  skipped: boolean;
  /** The template's standing note. Separate from `notes`, which is the import's. */
  templateStandingNotes: string | null;
  /**
   * The template's appointment offsets, already in words, for a stop with no
   * printed window (quick-515).
   *
   * Present ONLY when the stop has no `appointment` of its own — a printed
   * window is the fact, and showing the template's offsets beside it would
   * invite a dispatcher to reconcile two things that are not in conflict.
   * `label` is composed server-side so both surfaces say the same sentence.
   */
  templateAppointment: {
    startOffsetMin: number | null;
    endOffsetMin: number | null;
    label: string;
  } | null;
}

export type StopIssueCode =
  // blocks
  | 'UNRESOLVED_FACILITY'
  | 'MISSING_NAME'
  | 'DUPLICATE_FACILITY'
  // warnings
  | 'REPEATED_FACILITY'
  | 'NO_QUANTITIES'
  | 'NO_REFERENCES'
  | 'NO_STOP_TYPE'
  | 'PARTIAL_APPOINTMENTS'
  | 'HAND_EDITED_ROLLUPS';

export interface StopIssue {
  code: StopIssueCode;
  /** One plain sentence, already counted. Never a template for a client to fill. */
  message: string;
  /** The stops it is about, so a surface can point at them. */
  stopIndexes: number[];
}

export interface StopReviewView {
  stops: StopReviewRow[];
  total: number;
  matched: number;
  created: number;
  needsReview: number;
  note: string;

  /** Hard stops. The primary action is disabled while this is non-empty. */
  blocks: StopIssue[];
  /** One dismissible summary. Never a modal (Section 10). */
  warnings: StopIssue[];
  canProceed: boolean;
  /**
   * The sentence printed next to the disabled action — "2 stops need a
   * facility". Null when nothing blocks. Computed here so both surfaces say the
   * same words and neither has to assemble them.
   */
  blockedReason: string | null;
}

// ---------------------------------------------------------------------------
// Rollups
// ---------------------------------------------------------------------------

/**
 * Sum a line-item field, or null when no item carries it.
 *
 * Null rather than 0 is load-bearing. A manifest whose line items print no
 * weight has an UNKNOWN weight, and rendering "0 lbs" would be a claim about
 * the freight rather than an absence of one — the same distinction Phase 3 drew
 * when it refused to show "0 matched" before facility matching existed.
 */
function sumField(items: CanonicalLineItem[], field: 'quantity' | 'weight'): number | null {
  let total = 0;
  let seen = false;
  for (const item of items) {
    const value = item[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    seen = true;
    total += value;
  }
  // A substitution row with quantity 0 is real and must count (spec 1.2
  // callout 14) — `seen` tracks presence, not truthiness.
  return seen ? total : null;
}

function rollup(
  computed: number | null,
  stored: number | null | undefined,
  overriddenFields: readonly CanonicalRollupField[],
  field: CanonicalRollupField,
): StopRollupView {
  const marked = overriddenFields.includes(field);
  const typed = typeof stored === 'number' && Number.isFinite(stored) ? stored : null;
  return {
    computed,
    // The typed value wins whenever it is marked as an override. When it is not
    // marked, the line items are the source of truth and the extracted total is
    // only a fallback for a document that printed a total but no line items.
    value: marked ? typed : (computed ?? typed),
    overridden: marked && typed !== null,
  };
}

function formatQuantity(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** "5 · 1,200 lbs", "5", or "—". The quantity rollup the list row shows. */
function rollupLabel(pieces: StopRollupView, weight: StopRollupView, uom: string | null): string {
  const parts: string[] = [];
  if (pieces.value !== null) parts.push(formatQuantity(pieces.value));
  if (weight.value !== null) {
    parts.push(`${formatQuantity(weight.value)} ${(uom ?? 'LBS').toLowerCase()}`);
  }
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export function rollupsOf(consignment: CanonicalConsignment): StopRollupsView {
  const items = consignment.lineItems ?? [];
  const totals = consignment.totals ?? {};
  const overridden = consignment.overriddenTotals ?? [];

  const pieces = rollup(sumField(items, 'quantity'), totals.pieces, overridden, 'pieces');
  const weight = rollup(sumField(items, 'weight'), totals.weight, overridden, 'weight');
  const uom = totals.weightUom ?? null;

  return {
    pieces,
    weight,
    pallets: typeof totals.pallets === 'number' ? totals.pallets : null,
    weightUom: uom,
    label: rollupLabel(pieces, weight, uom),
  };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function appointmentOf(consignment: CanonicalConsignment): StopAppointmentView | null {
  const a = consignment.appointment;
  if (!a) return null;
  const earliest = a.earliest?.trim() || null;
  const latest = a.latest?.trim() || null;
  if (!earliest && !latest) return null;
  return { earliest, latest, isFirm: a.isFirm === true };
}

function contactOf(consignment: CanonicalConsignment): StopContactView | null {
  const c = consignment.contact;
  if (!c) return null;
  const name = c.name?.trim() || null;
  const phone = c.phone?.trim() || null;
  return name || phone ? { name, phone } : null;
}

/**
 * One row per consignment, facility half and document half joined by index.
 *
 * `slots` is the Phase 4 view, in the same order and of the same length — both
 * are derived from `consignments`, so a mismatch would mean the two halves were
 * built from different reads. Guarded rather than assumed: a missing slot
 * produces a row that reports itself unresolved, which blocks, rather than a row
 * that quietly claims a facility it has no evidence for.
 */
export function stopRowsFor(
  consignments: CanonicalConsignment[],
  slots: StopSlotView[],
): StopReviewRow[] {
  const byIndex = new Map(slots.map((s) => [s.index, s]));

  return consignments.map((consignment, index) => {
    const slot = byIndex.get(index);
    const references = consignment.references ?? [];

    return {
      index,
      sequence: index + 1,

      state: slot?.state ?? 'NEW',
      tier: slot?.tier ?? 'T4',
      facility: slot?.facility ?? null,
      why: slot?.why ?? null,
      proposals: slot?.proposals ?? [],
      prefill: slot?.prefill ?? null,
      requiresHumanTap: slot ? slot.requiresHumanTap : true,
      persisted: slot?.persisted ?? false,
      documentName: slot?.documentName ?? consignment.name ?? '',
      documentAddress: slot?.documentAddress ?? '',
      sourceCode: slot?.sourceCode ?? consignment.externalCode?.trim() ?? null,

      name: consignment.name ?? '',
      stopType: consignment.stopType ?? null,
      references,
      referenceCount: references.length,
      lineItems: consignment.lineItems ?? [],
      rollups: rollupsOf(consignment),
      appointment: appointmentOf(consignment),
      requiredDocuments: consignment.requiredDocuments ?? [],
      contact: contactOf(consignment),
      notes: consignment.notes?.trim() || null,
      pageNumbers: consignment.pageNumbers ?? [],
      bulkAppliedFields: consignment.bulkAppliedFields ?? [],

      templateOrigin: consignment.templateOrigin ?? null,
      skipped: consignment.skipped ?? false,
      templateStandingNotes: consignment.templateStandingNotes?.trim() || null,
      templateAppointment: templateAppointmentOf(consignment),
    };
  });
}

/**
 * The template's offsets as a sentence, or null.
 *
 * Suppressed entirely when the stop has its own appointment: application keeps a
 * printed window (the import wins), so surfacing the template's offsets beside
 * it would show two answers to one question when only one of them is in play.
 */
function templateAppointmentOf(consignment: CanonicalConsignment): StopReviewRow['templateAppointment'] {
  if (consignment.appointment?.earliest || consignment.appointment?.latest) return null;

  const startOffsetMin = consignment.templateApptOffsetStartMin ?? null;
  const endOffsetMin = consignment.templateApptOffsetEndMin ?? null;
  const label = formatOffsetWindow(startOffsetMin, endOffsetMin);
  if (!label) return null;

  return { startOffsetMin, endOffsetMin, label };
}

// ---------------------------------------------------------------------------
// Validation — spec Section 10
// ---------------------------------------------------------------------------

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function listStops(indexes: number[]): string {
  const labels = indexes.map((i) => String(i + 1));
  if (labels.length === 1) return `Stop ${labels[0]}`;
  if (labels.length === 2) return `Stops ${labels[0]} and ${labels[1]}`;
  return `Stops ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/**
 * The blocks, the warnings, and the sentence next to the disabled button.
 *
 * ---------------------------------------------------------------------------
 * WHAT SECTION 10 LISTS, AND WHICH OF IT THIS PHASE CAN ACTUALLY JUDGE
 * ---------------------------------------------------------------------------
 * Section 10 blocks on: *unresolved facility · missing name · duplicate facility
 * at the same sequence · no driver or truck · hard compliance failure.*
 *
 * The first three are properties of the stop list and are evaluated here, for
 * real. The last two are properties of an ASSIGNMENT that does not exist yet —
 * there is no driver field, no truck field and no compliance read on an import
 * until Phase 8, and this phase may not build them. They are therefore **not**
 * emitted as permanent blocks, because a block nobody can clear is a disabled
 * button with no way forward, which is worse than the check being absent.
 * Phase 8 adds them to this function; the shape is already right for it.
 *
 * That is stated here rather than quietly omitted, per DEC-9.
 */
export function validateStops(allRows: StopReviewRow[]): {
  blocks: StopIssue[];
  warnings: StopIssue[];
  canProceed: boolean;
  blockedReason: string | null;
} {
  const blocks: StopIssue[] = [];
  const warnings: StopIssue[] = [];

  // A skipped stop is one the dispatcher has said is not part of today's run —
  // a template stop that is not on this manifest (spec Section 8). It is not
  // committed, so it cannot block a commit, and validating it would produce a
  // block nobody can clear: the whole point of the row is that it has no
  // freight, no references and often no confirmed facility. It comes back into
  // every check the moment someone taps "keep", which is the one action that
  // makes it part of the trip.
  const rows = allRows.filter((r) => !r.skipped);

  // --- BLOCK: unresolved facility -----------------------------------------
  const unresolved = rows.filter((r) => r.requiresHumanTap).map((r) => r.index);
  if (unresolved.length > 0) {
    blocks.push({
      code: 'UNRESOLVED_FACILITY',
      message: `${unresolved.length} ${plural(unresolved.length, 'stop needs', 'stops need')} a facility`,
      stopIndexes: unresolved,
    });
  }

  // --- BLOCK: missing name -------------------------------------------------
  const unnamed = rows.filter((r) => !r.name.trim()).map((r) => r.index);
  if (unnamed.length > 0) {
    blocks.push({
      code: 'MISSING_NAME',
      message: `${listStops(unnamed)} ${plural(unnamed.length, 'has', 'have')} no name`,
      stopIndexes: unnamed,
    });
  }

  // --- BLOCK: duplicate facility at the same sequence ----------------------
  //
  // Read as ADJACENT: two stops next to each other in the running order that
  // resolve to the same building. That is a routing error a reorder can create
  // and a driver cannot execute — you do not drive to the same dock twice in a
  // row. The same facility appearing twice further apart is legitimate (a
  // pickup and a later delivery at one warehouse) and is a WARNING below, not a
  // block. Stating the reading because "at the same sequence" admits a second
  // one and a silent choice between them would be a guess presented as a rule.
  const adjacent: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const previous = rows[i - 1];
    const current = rows[i];
    if (!previous.facility || !current.facility) continue;
    if (previous.facility.id !== current.facility.id) continue;
    if (!adjacent.includes(previous.index)) adjacent.push(previous.index);
    adjacent.push(current.index);
  }
  if (adjacent.length > 0) {
    blocks.push({
      code: 'DUPLICATE_FACILITY',
      message: `${listStops(adjacent)} are the same facility, one after another`,
      stopIndexes: adjacent,
    });
  }

  // --- WARNING: the same facility twice, not adjacent ----------------------
  const positionsByFacility = new Map<string, number[]>();
  rows.forEach((r) => {
    if (!r.facility) return;
    const list = positionsByFacility.get(r.facility.id) ?? [];
    list.push(r.index);
    positionsByFacility.set(r.facility.id, list);
  });
  const repeated = Array.from(positionsByFacility.values())
    .filter((list) => list.length > 1)
    .flat()
    .filter((index) => !adjacent.includes(index))
    .sort((a, b) => a - b);
  if (repeated.length > 0) {
    warnings.push({
      code: 'REPEATED_FACILITY',
      message: `${listStops(repeated)} visit a facility that appears more than once on this trip.`,
      stopIndexes: repeated,
    });
  }

  // --- WARNING: nothing to deliver ----------------------------------------
  const empty = rows
    .filter((r) => r.lineItems.length === 0 && r.rollups.pieces.value === null && r.rollups.weight.value === null)
    .map((r) => r.index);
  if (empty.length > 0) {
    warnings.push({
      code: 'NO_QUANTITIES',
      message: `${listStops(empty)} ${plural(empty.length, 'has', 'have')} no quantities — nothing was read off the page.`,
      stopIndexes: empty,
    });
  }

  // --- WARNING: no reference to prove delivery ----------------------------
  const noRefs = rows.filter((r) => r.referenceCount === 0).map((r) => r.index);
  if (noRefs.length > 0) {
    warnings.push({
      code: 'NO_REFERENCES',
      message: `${listStops(noRefs)} ${plural(noRefs.length, 'carries', 'carry')} no BOL, PRO or order number.`,
      stopIndexes: noRefs,
    });
  }

  // --- WARNING: no stop type ----------------------------------------------
  const noType = rows.filter((r) => !r.stopType).map((r) => r.index);
  if (noType.length > 0) {
    warnings.push({
      code: 'NO_STOP_TYPE',
      message: `${listStops(noType)} ${plural(noType.length, 'has', 'have')} no stop type set.`,
      stopIndexes: noType,
    });
  }

  // --- WARNING: some stops have windows and some do not -------------------
  // Only worth saying when the document clearly carried windows and some stops
  // missed them. Where nothing has a window there is nothing to be inconsistent
  // about, and saying so would be noise on every manifest.
  const withWindow = rows.filter((r) => r.appointment !== null);
  const withoutWindow = rows.filter((r) => r.appointment === null).map((r) => r.index);
  if (withWindow.length > 0 && withoutWindow.length > 0) {
    warnings.push({
      code: 'PARTIAL_APPOINTMENTS',
      message: `${withWindow.length} of ${rows.length} stops have an appointment window; ${withoutWindow.length} ${plural(withoutWindow.length, 'does', 'do')} not.`,
      stopIndexes: withoutWindow,
    });
  }

  // --- WARNING: rollups typed over the line items -------------------------
  const edited = rows
    .filter((r) => r.rollups.pieces.overridden || r.rollups.weight.overridden)
    .map((r) => r.index);
  if (edited.length > 0) {
    warnings.push({
      code: 'HAND_EDITED_ROLLUPS',
      message: `${listStops(edited)} ${plural(edited.length, 'has', 'have')} a quantity typed over what the line items add up to.`,
      stopIndexes: edited,
    });
  }

  // Zero stops is a block with nothing to point at — a trip with no stops is not
  // a trip, and the empty list has no row to attach the reason to.
  if (rows.length === 0) {
    blocks.push({
      code: 'MISSING_NAME',
      message: 'This document has no stops',
      stopIndexes: [],
    });
  }

  return {
    blocks,
    warnings,
    canProceed: blocks.length === 0,
    // The first block, because Section 10 draws ONE line under the button. The
    // rest are on the rows they belong to.
    blockedReason: blocks[0]?.message ?? null,
  };
}

// ---------------------------------------------------------------------------
// The whole view
// ---------------------------------------------------------------------------

export function buildStopReview(
  consignments: CanonicalConsignment[],
  slots: StopSlotView[],
  counts: { matched: number; created: number; needsReview: number; note: string },
): StopReviewView {
  const stops = stopRowsFor(consignments, slots);
  const validation = validateStops(stops);
  return {
    stops,
    total: stops.length,
    matched: counts.matched,
    created: counts.created,
    needsReview: counts.needsReview,
    note: counts.note,
    ...validation,
  };
}

// ---------------------------------------------------------------------------
// Editing one stop
// ---------------------------------------------------------------------------

export interface StopPatch {
  name?: string;
  stopType?: CanonicalStopType | null;
  references?: CanonicalReference[];
  lineItems?: CanonicalLineItem[];
  /** A number sets an override; null clears it back to the computed total. */
  pieces?: number | null;
  weight?: number | null;
  pallets?: number | null;
  weightUom?: 'LBS' | 'KG' | null;
  appointment?: { earliest: string | null; latest: string | null; isFirm: boolean } | null;
  requiredDocuments?: CanonicalRequiredDocument[];
  contact?: { name: string | null; phone: string | null } | null;
  notes?: string | null;
  /**
   * Section 8's "one tap to keep" — and its opposite.
   *
   * A template stop that is not on today's manifest arrives `skipped: true`;
   * setting this false is the tap that puts it back in the trip. It is an
   * ordinary field on an ordinary patch rather than its own endpoint, because
   * it is one boolean on one consignment and everything else about that row is
   * already edited through here.
   */
  skipped?: boolean;
}

function withoutField(
  fields: readonly CanonicalBulkAppliedField[],
  field: CanonicalBulkAppliedField,
): CanonicalBulkAppliedField[] {
  return fields.filter((f) => f !== field);
}

function setOverride(
  current: readonly CanonicalRollupField[],
  field: CanonicalRollupField,
  on: boolean,
): CanonicalRollupField[] {
  const without = current.filter((f) => f !== field);
  return on ? [...without, field] : without;
}

/**
 * Apply one dispatcher's edit to one consignment.
 *
 * Two behaviours worth naming:
 *
 * 1. **A rollup set to a number becomes an override; set to null it stops being
 *    one.** There is no separate "override" toggle to get out of step with the
 *    value — typing a quantity IS the override, clearing it IS reverting to the
 *    line items. The mark on screen reads off `overriddenTotals`, which this is
 *    the only writer of.
 *
 * 2. **Editing a field by hand removes its bulk-applied mark.** Once a person has
 *    typed a note on stop 4, that note is theirs, and a later "clear the bulk
 *    note" must not take it away. This is the whole reason the mark is stored
 *    per field rather than inferred.
 */
export function applyStopPatch(
  consignment: CanonicalConsignment,
  patch: StopPatch,
): CanonicalConsignment {
  let next: CanonicalConsignment = { ...consignment };
  let bulk = next.bulkAppliedFields ?? [];
  let overridden = next.overriddenTotals ?? [];

  if (patch.name !== undefined) next.name = patch.name;

  if (patch.stopType !== undefined) {
    next.stopType = patch.stopType;
    bulk = withoutField(bulk, 'stopType');
  }

  if (patch.references !== undefined) next.references = patch.references;

  if (patch.lineItems !== undefined) next.lineItems = patch.lineItems;

  if (patch.pieces !== undefined || patch.weight !== undefined || patch.pallets !== undefined || patch.weightUom !== undefined) {
    const totals = { ...(next.totals ?? {}) };
    if (patch.pieces !== undefined) {
      totals.pieces = patch.pieces;
      overridden = setOverride(overridden, 'pieces', patch.pieces !== null);
    }
    if (patch.weight !== undefined) {
      totals.weight = patch.weight;
      overridden = setOverride(overridden, 'weight', patch.weight !== null);
    }
    if (patch.pallets !== undefined) totals.pallets = patch.pallets;
    if (patch.weightUom !== undefined) totals.weightUom = patch.weightUom;
    next.totals = totals;
    bulk = withoutField(bulk, 'totals');
  }

  if (patch.appointment !== undefined) {
    next.appointment = patch.appointment
      ? {
          earliest: patch.appointment.earliest,
          latest: patch.appointment.latest,
          isFirm: patch.appointment.isFirm,
        }
      : null;
    bulk = withoutField(bulk, 'appointment');
  }

  if (patch.requiredDocuments !== undefined) {
    next.requiredDocuments = patch.requiredDocuments;
    bulk = withoutField(bulk, 'requiredDocuments');
  }

  if (patch.contact !== undefined) {
    next.contact = patch.contact ? { name: patch.contact.name, phone: patch.contact.phone } : null;
  }

  if (patch.notes !== undefined) {
    next.notes = patch.notes;
    bulk = withoutField(bulk, 'notes');
  }

  // Keeping a template-only stop does not change where it came from. The badge
  // still says it was not on today's manifest, because that remains true — what
  // changed is whether it is part of the trip, and those are two different
  // facts. Overwriting `templateOrigin` here would erase the reason the row
  // needed a decision in the first place.
  if (patch.skipped !== undefined) next.skipped = patch.skipped;

  next = { ...next, bulkAppliedFields: bulk, overriddenTotals: overridden };
  return next;
}

// ---------------------------------------------------------------------------
// Bulk apply
// ---------------------------------------------------------------------------

export interface BulkApplyInput {
  notes?: string;
  requiredDocuments?: CanonicalRequiredDocument[];
  appointment?: { earliest: string | null; latest: string | null; isFirm: boolean };
  stopType?: CanonicalStopType;
  /** Copy the quantity rollup from the stop immediately above, in the current order. */
  copyQuantitiesFromAbove?: boolean;
  /** Take back off only what the bar put on. Never a hand-typed value. */
  clear?: CanonicalBulkAppliedField[];
}

export interface BulkApplyResult {
  consignments: CanonicalConsignment[];
  /** How many stops actually changed. What the confirmation counts. */
  applied: number;
  /**
   * Stops that were selected and could not take part of the action — the first
   * stop under "copy from above", or a stop whose field was never bulk-applied
   * under "clear". Reported rather than silently dropped, so the confirmation
   * cannot overstate what happened.
   */
  skipped: number[];
  /** Which fields this call touched, for the confirmation sentence. */
  fields: CanonicalBulkAppliedField[];
}

function markBulk(
  fields: readonly CanonicalBulkAppliedField[],
  field: CanonicalBulkAppliedField,
): CanonicalBulkAppliedField[] {
  return fields.includes(field) ? [...fields] : [...fields, field];
}

/**
 * Apply one bar action across a SELECTION of stop indexes.
 *
 * `indexes` is the selection and nothing else. The function walks the whole
 * consignment array and acts on every index named, so a selected stop 40 rows
 * below the fold is written exactly like a selected stop under the cursor —
 * there is no rendered-row list in this file to accidentally intersect with.
 *
 * `copyQuantitiesFromAbove` reads the stop above **in the array being written**,
 * which is the current running order, and it reads the ORIGINAL array rather
 * than the partially-updated one. Selecting stops 3, 4 and 5 therefore copies
 * from 2, 3 and 4 as they were, not from a value that cascaded down from 2.
 * Cascading is a plausible reading and it is the wrong one: it turns one
 * mistake on stop 2 into five.
 */
export function applyBulkToStops(
  consignments: CanonicalConsignment[],
  indexes: number[],
  input: BulkApplyInput,
): BulkApplyResult {
  const selected = new Set(indexes.filter((i) => Number.isInteger(i) && i >= 0 && i < consignments.length));
  const skipped: number[] = [];
  const fields: CanonicalBulkAppliedField[] = [];
  let applied = 0;

  const source = consignments;

  const next = consignments.map((consignment, index) => {
    if (!selected.has(index)) return consignment;

    let updated: CanonicalConsignment = { ...consignment };
    let bulk = updated.bulkAppliedFields ?? [];
    let overridden = updated.overriddenTotals ?? [];
    let changed = false;

    if (input.notes !== undefined) {
      updated.notes = input.notes;
      bulk = markBulk(bulk, 'notes');
      if (!fields.includes('notes')) fields.push('notes');
      changed = true;
    }

    if (input.requiredDocuments !== undefined) {
      updated.requiredDocuments = [...input.requiredDocuments];
      bulk = markBulk(bulk, 'requiredDocuments');
      if (!fields.includes('requiredDocuments')) fields.push('requiredDocuments');
      changed = true;
    }

    if (input.appointment !== undefined) {
      updated.appointment = {
        earliest: input.appointment.earliest,
        latest: input.appointment.latest,
        isFirm: input.appointment.isFirm,
      };
      bulk = markBulk(bulk, 'appointment');
      if (!fields.includes('appointment')) fields.push('appointment');
      changed = true;
    }

    if (input.stopType !== undefined) {
      updated.stopType = input.stopType;
      bulk = markBulk(bulk, 'stopType');
      if (!fields.includes('stopType')) fields.push('stopType');
      changed = true;
    }

    if (input.copyQuantitiesFromAbove) {
      const above = index > 0 ? source[index - 1] : null;
      if (!above) {
        skipped.push(index);
      } else {
        const aboveRollups = rollupsOf(above);
        updated.totals = {
          ...(updated.totals ?? {}),
          pieces: aboveRollups.pieces.value,
          weight: aboveRollups.weight.value,
          pallets: aboveRollups.pallets,
          weightUom: aboveRollups.weightUom,
        };
        // Copied quantities are an assertion by a person, not a sum of THIS
        // stop's line items, so they are marked overridden — otherwise the
        // screen would show a number that its own line items contradict with no
        // sign that anyone put it there.
        overridden = setOverride(overridden, 'pieces', aboveRollups.pieces.value !== null);
        overridden = setOverride(overridden, 'weight', aboveRollups.weight.value !== null);
        bulk = markBulk(bulk, 'totals');
        if (!fields.includes('totals')) fields.push('totals');
        changed = true;
      }
    }

    for (const field of input.clear ?? []) {
      if (!bulk.includes(field)) {
        // Never bulk-applied here, so there is nothing of the bar's to remove
        // and whatever is in the field belongs to a person.
        if (!skipped.includes(index)) skipped.push(index);
        continue;
      }
      if (field === 'notes') updated.notes = null;
      if (field === 'requiredDocuments') updated.requiredDocuments = [];
      if (field === 'appointment') updated.appointment = null;
      if (field === 'stopType') updated.stopType = null;
      if (field === 'totals') {
        updated.totals = { ...(updated.totals ?? {}), pieces: null, weight: null };
        overridden = setOverride(setOverride(overridden, 'pieces', false), 'weight', false);
      }
      bulk = withoutField(bulk, field);
      if (!fields.includes(field)) fields.push(field);
      changed = true;
    }

    if (!changed) return consignment;
    applied++;
    updated = { ...updated, bulkAppliedFields: bulk, overriddenTotals: overridden };
    return updated;
  });

  return { consignments: next, applied, skipped: skipped.sort((a, b) => a - b), fields };
}

// ---------------------------------------------------------------------------
// Reorder
// ---------------------------------------------------------------------------

export class StopOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StopOrderError';
  }
}

/**
 * Validate a requested order as a permutation of the current indexes.
 *
 * Strict on purpose. A client sending a short list, a duplicate or an unknown
 * index is a bug, and the tolerant readings all silently destroy or duplicate a
 * consignee's freight. Throwing here means a broken reorder is a 400 the user
 * sees rather than a stop that vanished.
 */
export function assertPermutation(order: number[], length: number): void {
  if (!Array.isArray(order) || order.length !== length) {
    throw new StopOrderError(`The new order must list all ${length} stops exactly once.`);
  }
  const seen = new Set<number>();
  for (const index of order) {
    if (!Number.isInteger(index) || index < 0 || index >= length) {
      throw new StopOrderError('That order refers to a stop this document does not have.');
    }
    if (seen.has(index)) {
      throw new StopOrderError('That order lists the same stop twice.');
    }
    seen.add(index);
  }
}

export interface ReorderResult {
  consignments: CanonicalConsignment[];
  stopProvenance: Record<string, StopProvenance>;
}

/**
 * Move the consignments into a new order, and move their facility links with
 * them.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PROVENANCE IS PERMUTED AND NOT LEFT TO THE FINGERPRINT
 * ---------------------------------------------------------------------------
 * Phase 4 keys stop links by index and stores a `stopFingerprint` so a stale
 * link is *dropped* rather than re-bound. Its summary says reordering therefore
 * works "for free". That is true for safety and false for the dispatcher: a
 * person who confirmed Hall Ford on stop 3 and then dragged it to position 1
 * would find their confirmation gone, and would have to make it again — and
 * would have to make it again after every drag.
 *
 * So the link travels with the consignment. This is **not** the "re-key on
 * position" that Phase 4 warned against; it is the opposite. Position is exactly
 * what changed, and we know precisely how, because the permutation was handed to
 * us. The fingerprint is carried across UNTOUCHED, so it still validates against
 * the consignment it was always about — a record that would have been dropped
 * before the move is still dropped after it. The safety property is preserved
 * and the human's decision is preserved with it.
 *
 * A record whose fingerprint no longer matches its consignment is dropped here
 * rather than moved, for the same reason: it was already not a link.
 */
export function reorderConsignments(
  consignments: CanonicalConsignment[],
  order: number[],
  stopProvenance: Record<string, StopProvenance>,
  fingerprintOf: (consignment: CanonicalConsignment) => string,
): ReorderResult {
  assertPermutation(order, consignments.length);

  const nextConsignments = order.map((from) => consignments[from]);

  const nextProvenance: Record<string, StopProvenance> = {};
  order.forEach((from, to) => {
    const record = stopProvenance[String(from)];
    if (!record) return;
    // Still about this consignment? If the fingerprint had already gone stale,
    // the record was not a link before the move and must not become one now.
    if (record.stopFingerprint !== fingerprintOf(consignments[from])) return;
    nextProvenance[String(to)] = record;
  });

  return { consignments: nextConsignments, stopProvenance: nextProvenance };
}

/**
 * Carry a stop's link across an edit that changed its identity.
 *
 * Editing a stop's name, code or address changes its fingerprint, which would
 * make Phase 4 treat an existing link as stale and re-run the ladder. For a
 * fixed typo that is wrong: the person corrected THIS stop, they did not replace
 * it with a different consignee, and re-asking them to confirm the facility they
 * just confirmed teaches them to stop reading the question.
 *
 * So an edit re-stamps the fingerprint on the record that is already there —
 * and only that one, and only when it matched before the edit. A record that was
 * already stale stays stale. The `via` and the score are untouched: what the
 * person decided has not changed, only how the stop is spelled.
 */
export function restampStopLink(
  record: StopProvenance | undefined,
  fingerprintBefore: string,
  fingerprintAfter: string,
): StopProvenance | null {
  if (!record) return null;
  if (record.stopFingerprint !== fingerprintBefore) return null;
  if (fingerprintBefore === fingerprintAfter) return null;
  return { ...record, stopFingerprint: fingerprintAfter };
}

// ---------------------------------------------------------------------------

/** The consignments an import is currently reviewing. Reviewed wins over raw. */
export function reviewedConsignmentsOf(
  reviewed: unknown,
  raw: unknown,
): { extraction: CanonicalExtraction | null; consignments: CanonicalConsignment[] } {
  const extraction = (reviewed ?? raw) as CanonicalExtraction | null;
  if (!extraction || !Array.isArray(extraction.consignments)) {
    return { extraction: extraction ?? null, consignments: [] };
  }
  return { extraction, consignments: extraction.consignments };
}
